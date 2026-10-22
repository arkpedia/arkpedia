/**
 * TEST ONLY (2026-10-22), with pages/api/account-verify-test.ts: remove both before the next
 * release to main. Shown after an import only on the Cloudflare Worker (*.workers.dev) with
 * ?verify-test in the address, never to a reader of www or arkpedia-dev. Each button sends this
 * import's Yostar uid and access token to the Worker once, for one check; nothing else is sent.
 */
import { useState } from 'react';
import type { ServerId } from '@/lib/account-import/yostar';

export interface VerifyTestInput {
  server: ServerId;
  uid: string;
  token: string;
  deviceId: string;
  /** The game uid the imported save names (status.uid). */
  saveUid: string;
}

export function verifyTestEnabled(): boolean {
  return typeof window !== 'undefined' && window.location.hostname.endsWith('.workers.dev')
    && new URLSearchParams(window.location.search).has('verify-test');
}

export default function VerifyTestPanel({ input }: { input: VerifyTestInput }) {
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Record<string, unknown>[]>([]);

  async function run(wrongUid: boolean) {
    setBusy(true);
    try {
      const response = await fetch('/api/account-verify-test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, wrongUid }),
      });
      const result: Record<string, unknown> = response.ok ? await response.json() : { check: wrongUid ? 'wrong-uid' : 'own-uid', error: `HTTP ${response.status}` };
      setResults(previous => [...previous, result]);
    } catch (error) {
      setResults(previous => [...previous, { check: wrongUid ? 'wrong-uid' : 'own-uid', error: error instanceof Error ? error.message : String(error) }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="import-note" aria-label="Server verification test">
      <p className="hint">
        <strong>Server verification test.</strong> Each button sends this import&apos;s Yostar uid and access token to this
        Worker once. It asks the game&apos;s token exchange about them and answers only yes or no; nothing is stored. Run 1 first,
        then check your email and the game before running 2.
      </p>
      <p>
        <button type="button" className="primary btn-sm" disabled={busy} onClick={() => run(false)}>1. Check my sign-in on the server</button>{' '}
        <button type="button" className="ghost btn-sm" disabled={busy} onClick={() => run(true)}>2. Check with a wrong uid (should be refused)</button>
      </p>
      {results.length > 0 && <pre className="hint">{results.map(result => JSON.stringify(result)).join('\n')}</pre>}
    </section>
  );
}
