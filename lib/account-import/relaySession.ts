/** A tab-local connection pool. Activity owners span a complete import/download,
 * while each request remains active until its response body has been consumed. */
export function createRelaySessionPool<T>(
  create: () => Promise<T>,
  dispose: (resource: T) => Promise<void>,
  { idleMs = 15_000, hidden = () => false }: { idleMs?: number; hidden?: () => boolean } = {},
) {
  let resource: Promise<T> | undefined;
  let closing = Promise.resolve();
  let requests = 0, owners = 0, releaseWhenIdle = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clearTimer = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined; };

  function closeIdle(expired = false): Promise<void> {
    if (requests || (owners && !expired)) return closing;
    clearTimer();
    releaseWhenIdle = false;
    const previous = resource;
    resource = undefined;
    if (previous) closing = closing.then(async () => {
      try { await dispose(await previous); } catch { /* Cleanup must not replace a completed import's result. */ }
    });
    return closing;
  }
  function idle() {
    if (requests) return;
    if (!owners && (releaseWhenIdle || hidden())) { void closeIdle(); return; }
    clearTimer();
    // A replay job can spend minutes waiting for cloud work or admission. Owning
    // the flow protects short gaps/visibility changes, not an unused socket forever.
    if (resource) timer = setTimeout(() => { timer = undefined; void closeIdle(true); }, idleMs);
  }
  return {
    /** Retaining does not open a connection. Release is safe to call more than once. */
    retain() {
      clearTimer(); owners++; releaseWhenIdle = false;
      idle();
      let released = false;
      return () => {
        if (released) return;
        released = true;
        if (--owners === 0) { releaseWhenIdle = true; idle(); }
      };
    },
    async run<R>(perform: (value: T) => Promise<R>): Promise<R> {
      clearTimer(); requests++;
      try {
        // libcurl's old Wisp close handler deletes the URL's registry entry. Let it
        // finish before a new request creates a connection under that same URL.
        await closing;
        if (!resource) {
          const pending = Promise.resolve().then(create);
          resource = pending;
          void pending.catch(() => { if (resource === pending) resource = undefined; });
        }
        return await perform(await resource);
      } finally { requests--; idle(); }
    },
    closeIdle: () => closeIdle(),
  };
}

export interface RelayWispConnection {
  wisp_url: string;
  active_streams: Record<string, unknown>;
  ws: Pick<WebSocket, 'readyState' | 'close' | 'addEventListener' | 'removeEventListener'>;
}

/** libcurl.js 0.7.4 defers HTTPSession.close() by one millisecond to leave its
 * WASM callback stack. Let that scheduled cleanup remove the session's streams
 * before checking whether the shared physical WebSocket is unused. */
export async function closeRelaySession(session: { close(): void }, connections: Record<string, RelayWispConnection>, url: string): Promise<void> {
  try { session.close(); }
  finally {
    await new Promise<void>(resolve => setTimeout(resolve, 1));
    await closeIdleWisp(connections, url);
  }
}

/** HTTPSession.close() closes its TCP streams, not the shared Wisp WebSocket.
 * Never close a socket with streams still owned by another session. */
export function closeIdleWisp(connections: Record<string, RelayWispConnection>, url: string): Promise<void> {
  const connection = connections[url];
  if (!connection || connection.wisp_url !== url || Object.keys(connection.active_streams).length) return Promise.resolve();
  const ws = connection.ws;
  const forget = () => { if (connections[url] === connection) delete connections[url]; };
  if (ws.readyState === 3) { forget(); return Promise.resolve(); }
  return new Promise((resolve, reject) => {
    const closed = () => { forget(); resolve(); };
    ws.addEventListener('close', closed, { once: true });
    try { ws.close(1000); }
    catch (error) { ws.removeEventListener('close', closed); reject(error); }
  });
}
