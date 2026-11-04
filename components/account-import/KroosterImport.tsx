import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/router';
import { fetchAsset } from '@/lib/assets/assetRetry';
import { kroosterUser, type KroosterProfile } from '@/lib/account-import/krooster';
import { importKroosterAccount } from '@/lib/account/importAccount';
import { isResettingBrowserData } from '@/lib/account/resetData';
import type { GameAccountMap } from '@/lib/planner/gameAccount';

/** The game-account map from the deployment's own Account page props, for a page that does not carry it
 *  (the Base page): the same load as the header's Import / export (components/account/AccountActions.tsx). */
async function loadAccountMap(basePath: string): Promise<GameAccountMap> {
  const buildId = JSON.parse(document.getElementById('__NEXT_DATA__')?.textContent ?? '{}').buildId;
  const response = await fetchAsset(`${basePath}/_next/data/${encodeURIComponent(buildId)}/account.json`);
  if (!response.ok) throw new Error('load');
  const map = (await response.json()).pageProps?.__contentTables?.['game-account-map'];
  if (!map) throw new Error('load');
  return map as GameAccountMap;
}

/** Preview only: a tester's Krooster profile as the account, for the base optimizer and the planner. The
 * site's own route reads the public page (pages/api/account-import/krooster.ts). The tester pastes the
 * profile link (or its username); `map` is the page's game-account map when it carries one. */
export default function KroosterImport({ map, onNote, idPrefix = 'krooster' }: { map?: GameAccountMap; onNote: (note: string) => void; idPrefix?: string }) {
  const router = useRouter();
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const name = kroosterUser(link);
    if (!name || busy) { onNote('Paste a Krooster profile link, krooster.com/network/lookup/<username>, or the username.'); return; }
    setBusy(true);
    try {
      const response = await fetch(`/api/account-import/krooster?user=${encodeURIComponent(name)}`);
      const body = await response.json().catch(() => null) as (KroosterProfile & { error?: string }) | null;
      if (!response.ok || !body || body.error) { onNote(body?.error ?? `Krooster import failed (${response.status}).`); return; }
      const table = map ?? await loadAccountMap(router.basePath).catch(() => null);
      if (!table) { onNote('Import tools could not load. Please try again.'); return; }
      if (isResettingBrowserData()) return;
      const result = importKroosterAccount(body, table);
      onNote(`Imported ${result.operators.toLocaleString('en-US')} operators from ${body.displayName}'s Krooster profile as a testing account (no base layout, clears or depot).${result.unknown.length ? ` ${result.unknown.length} character ids are not in the site's records yet.` : ''}`);
    } catch {
      onNote('Krooster import failed. Check the connection and try again.');
    } finally {
      setBusy(false);
    }
  }
  return <form className="krooster-import" onSubmit={submit}>
    <label className="visually-hidden" htmlFor={`${idPrefix}-link`}>Krooster profile link</label>
    <input id={`${idPrefix}-link`} type="text" value={link} autoComplete="off" spellCheck={false} maxLength={200} onChange={event => setLink(event.target.value)} placeholder="https://www.krooster.com/network/lookup/username" />
    <button type="submit" className="ghost btn-sm" disabled={busy || !link.trim()}>{busy ? 'Importing…' : 'Import from Krooster'}</button>
  </form>;
}
