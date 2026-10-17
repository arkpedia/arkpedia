import { parseNetwork, SERVERS, type ServerId } from './yostar';

/** Only public metadata is cached. No email, code, device id, cookie or token is accepted. */
export function createPublicNetworkReader(fetcher: typeof fetch = fetch, now = Date.now) {
  const cached = new Map<ServerId, { until: number; data: { content: string } }>();
  const pending = new Map<ServerId, Promise<{ content: string }>>();
  return async (server: ServerId): Promise<{ content: string }> => {
    const previous = cached.get(server);
    if (previous && now() < previous.until) return previous.data;
    const running = pending.get(server);
    if (running) return running;
    const loading = (async () => {
      const response = await fetcher(SERVERS[server].networkConfig, {
        headers: { Accept: 'application/json' }, credentials: 'omit', redirect: 'error',
        cache: 'no-store', signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error('Public server list unavailable');
      const answer = await response.json();
      parseNetwork(answer);
      // Keep only the public configuration; never cache arbitrary upstream response fields.
      const data = { content: answer.content as string };
      cached.set(server, { until: now() + 60_000, data });
      return data;
    })();
    pending.set(server, loading);
    try { return await loading; }
    finally { pending.delete(server); }
  };
}
