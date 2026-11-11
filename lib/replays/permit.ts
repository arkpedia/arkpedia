import { waitForReplay } from './queue';

/** Only an anonymous browser identifier reaches the coordinator. Game credentials
 * and replay contents stay out of admission requests. */
export async function requestReplayPermit(signal: AbortSignal, waiting: (position?: number) => void = () => {}) {
  const key = 'arkpedia:replay-client';
  let client = localStorage.getItem(key);
  if (!client || !/^[0-9a-f-]{36}$/.test(client)) { client = crypto.randomUUID(); localStorage.setItem(key, client); }
  const body = JSON.stringify({ client });
  const init = { credentials: 'omit', redirect: 'error', cache: 'no-store',
    headers: { 'Content-Type': 'application/json' }, body } as const;
  let queued = false;
  try {
    while (!signal.aborted) {
      const start = performance.now();
      let response: Response;
      queued = true;
      try { response = await fetch('/api/account-import/replay-permit', { ...init, method: 'POST', signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) }); }
      catch (error) { if (signal.aborted) throw error; throw new Error('Could not check download availability. Downloads paused; try again later.'); }
      if (response.status === 429) {
        waiting();
        const delay = Number(response.headers.get('Retry-After'));
        await waitForReplay((Number.isFinite(delay) && delay > 0 ? Math.min(3600, Math.max(60, delay)) : 60) * 1000, signal);
        continue;
      }
      if (!response.ok) throw new Error('Downloads are temporarily unavailable. Try again later; your saved auto-deploys are unchanged.');
      const data = await response.json();
      if (typeof data?.granted !== 'boolean') throw new Error('Could not check download availability. Downloads paused.');
      // A sleeping tab or delayed response must acquire a fresh admission on wake.
      if (data.granted && performance.now() - start < 1000) { queued = false; return; }
      const position = Number.isSafeInteger(data.position) && data.position > 0 ? data.position : undefined;
      waiting(position);
      // Follow the coordinator instead of exponentially giving up our turn. The
      // short bound also renews waiting leases; old servers remain compatible.
      const delay = Number.isFinite(data.retryAfterMs) ? Math.max(500, Math.min(2000, data.retryAfterMs)) : 2000;
      await waitForReplay(delay + Math.random() * 100, signal);
    }
    throw new DOMException('Paused', 'AbortError');
  } finally {
    // Best-effort release; a closing/sleeping tab is also removed by lease expiry.
    // Never await this cleanup or reuse an already-aborted signal.
    if (queued) void fetch('/api/account-import/replay-permit', { ...init, method: 'DELETE', keepalive: true,
      signal: AbortSignal.timeout(5000) }).catch(() => {});
  }
}
