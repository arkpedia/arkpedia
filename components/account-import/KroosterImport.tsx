import { useState, type FormEvent } from 'react';
import { KROOSTER_USER, type KroosterProfile } from '@/lib/account-import/krooster';
import { importKroosterAccount } from '@/lib/account/importAccount';
import { isResettingBrowserData } from '@/lib/account/resetData';
import type { GameAccountMap } from '@/lib/planner/gameAccount';

/** Preview only: a tester's Krooster profile as the account, for the base optimizer and the planner. The
 * site's own route reads the public page (pages/api/account-import/krooster.ts). */
export default function KroosterImport({ map, onNote }: { map: GameAccountMap; onNote: (note: string) => void }) {
  const [user, setUser] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const name = user.trim();
    if (!KROOSTER_USER.test(name) || busy) { onNote('A Krooster username is letters, digits, dots, dashes and underscores.'); return; }
    setBusy(true);
    try {
      const response = await fetch(`/api/account-import/krooster?user=${encodeURIComponent(name)}`);
      const body = await response.json().catch(() => null) as (KroosterProfile & { error?: string }) | null;
      if (!response.ok || !body || body.error) { onNote(body?.error ?? `Krooster import failed (${response.status}).`); return; }
      if (isResettingBrowserData()) return;
      const result = importKroosterAccount(body, map);
      onNote(`Imported ${result.operators.toLocaleString('en-US')} operators from ${body.displayName}'s Krooster profile as a testing account (no base layout, clears or depot).${result.unknown.length ? ` ${result.unknown.length} character ids are not in the site's records yet.` : ''}`);
    } catch {
      onNote('Krooster import failed. Check the connection and try again.');
    } finally {
      setBusy(false);
    }
  }
  return <form className="data-dialog-acts" onSubmit={submit}>
    <label>Krooster username <input type="text" value={user} autoComplete="off" spellCheck={false} maxLength={32} onChange={event => setUser(event.target.value)} placeholder="krooster.com/network/lookup/…" /></label>
    <button type="submit" className="ghost btn-sm" disabled={busy || !user.trim()}>{busy ? 'Importing…' : 'Import from Krooster'}</button>
  </form>;
}
