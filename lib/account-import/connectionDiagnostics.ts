/** Passive observations of libcurl.js 0.7.4's exported Wisp API. No HTTP payloads,
 * headers, error strings, URLs, identifiers or browser storage enter a report. */
interface Stream { hostname: string; port: number }
interface Connection {
  wisp_url: string;
  connected: boolean;
  ws: EventTarget;
  active_streams: Record<string, Stream>;
  connect_ws(): void;
  create_stream(host: string, port: number, type?: string): Stream;
  close_stream(stream: Stream, reason: number): void;
  on_ws_close(): void;
}
export interface WispDiagnosticsAPI {
  WispConnection: { prototype: Connection };
  wisp_connections: Record<string, Connection>;
}
type Leg = 'browser-to-relay' | 'relay-to-upstream' | 'relay-policy' | 'tls' | 'unknown' | 'none';
type Destination = 'global-yostar' | 'jp-kr-yostar' | 'account-center' | 'game-server' | 'token-exchange' | 'settings' | 'other';
interface Attempt {
  destination: Destination;
  outcome: 'response' | 'failure';
  leg: Leg;
  relayHandshake: boolean;
  elapsedMs: number;
  curlCode?: number;
  wispReason?: number;
  httpStatus?: number;
}
interface Pending {
  host: string;
  port: number;
  started: number;
  handshake: boolean;
  relayLost: boolean;
  ambiguous: boolean;
  reason?: number;
  connections: Set<Connection>;
  streams: Set<Stream>;
}
const destination = (host: string): Destination => {
  if (host === 'en-sdk-api.yostarplat.com') return 'global-yostar';
  if (host === 'jp-sdk-api.yostarplat.com') return 'jp-kr-yostar';
  if (['account.yo-star.com', 'account.yostar.co.jp', 'account.yostar.kr'].includes(host)) return 'account-center';
  if (/^gs\.arknights\.(global|jp|kr)$/.test(host)) return 'game-server';
  if (/^as\.arknights\.(global|jp|kr)$/.test(host)) return 'token-exchange';
  if (/^ak-conf\.arknights\.(global|jp|kr)$/.test(host)) return 'settings';
  return 'other';
};

/** A bounded page-memory report, copied only by the reader. No telemetry endpoint. */
export function createConnectionDiagnostics() {
  const pending = new Set<Pending>();
  const installed = new WeakSet<object>();
  const listeners = new Set<() => void>();
  let attempts: Attempt[] = [];
  let snapshot = '';
  let api: WispDiagnosticsAPI | undefined;
  let relay = '';
  const publish = () => {
    snapshot = attempts.length ? JSON.stringify({ version: 1, transport: 'libcurl.js/0.7.4', attempts }, null, 2) : '';
    for (const listener of listeners) listener();
  };
  function install(wisp: WispDiagnosticsAPI, relayURL: string) {
    const proto = wisp?.WispConnection?.prototype;
    // A dependency upgrade without these hooks must leave authentication working.
    if (!proto || !['connect_ws', 'create_stream', 'close_stream', 'on_ws_close'].every(key => typeof proto[key as keyof Connection] === 'function')) return;
    api = wisp;
    relay = relayURL;
    if (installed.has(proto)) return;
    installed.add(proto);
    const connect = proto.connect_ws;
    const create = proto.create_stream;
    const close = proto.close_stream;
    const lost = proto.on_ws_close;
    proto.connect_ws = function () {
      try { connect.call(this); } catch (error) {
        if (this.wisp_url === relay) for (const entry of pending) entry.relayLost = true;
        throw error;
      }
      if (this.wisp_url !== relay) return;
      const connection = this;
      // Observe only lifecycle events. Never subscribe to message/data packets.
      for (const entry of pending) entry.connections.add(connection);
      this.ws.addEventListener('error', () => {
        for (const entry of pending) if (entry.connections.has(connection)) entry.relayLost = true;
      });
    };
    proto.create_stream = function (host, port, type) {
      const matches = [...pending].filter(entry => entry.host === host && entry.port === port);
      const stream = create.call(this, host, port, type);
      for (const entry of matches) {
        entry.connections.add(this);
        entry.handshake = this.connected;
        // Concurrent requests to the same destination cannot be assigned to one stream.
        if (matches.length > 1 || entry.streams.size > 0) entry.ambiguous = true;
        entry.streams.add(stream);
      }
      return stream;
    };
    proto.close_stream = function (stream, reason) {
      for (const entry of pending) {
        if (!entry.relayLost && !entry.ambiguous && entry.connections.has(this)
          && entry.streams.has(stream)) entry.reason = reason;
      }
      return close.call(this, stream, reason);
    };
    proto.on_ws_close = function () {
      for (const entry of pending) if (entry.connections.has(this)) entry.relayLost = true;
      return lost.call(this);
    };
  }
  function begin(url: string) {
    const target = new URL(url);
    const entry: Pending = { host: target.hostname, port: Number(target.port || 443), started: performance.now(),
      handshake: false, relayLost: false, ambiguous: false, connections: new Set(), streams: new Set() };
    const existing = api?.wisp_connections[relay];
    if (existing) {
      entry.connections.add(existing);
      entry.handshake = existing.connected;
      const cached = Object.values(existing.active_streams).filter(stream => stream.hostname === entry.host && stream.port === entry.port);
      // A cached stream may be idle or assigned to a different queued request.
      // Without inspecting HTTP we cannot use its closure to diagnose this attempt.
      if (cached.length) entry.ambiguous = true;
    }
    pending.add(entry);
    let finished = false;
    return (result: { status: number } | { error: unknown }) => {
      if (finished) return;
      finished = true;
      pending.delete(entry);
      const response = 'status' in result;
      // Parse only curl's numeric prefix. Never retain or copy arbitrary error text.
      const code = !response && result.error instanceof Error
        ? /^Request failed with error code (\d+):/.exec(result.error.message) : null;
      const curlCode = code && Number(code[1]) <= 999 ? Number(code[1]) : undefined;
      const reason = entry.reason;
      const knownReason = reason !== undefined && [1, 2, 3, 65, 66, 67, 68, 71, 72, 73].includes(reason) ? reason : undefined;
      let leg: Leg = response ? 'none' : 'unknown';
      if (!response) {
        if (entry.relayLost) leg = 'browser-to-relay';
        else if (knownReason !== undefined && [65, 72, 73].includes(knownReason)) leg = 'relay-policy';
        else if (knownReason !== undefined && [3, 66, 67, 68, 71].includes(knownReason)) leg = 'relay-to-upstream';
        else if (entry.handshake && curlCode !== undefined && [35, 51, 58, 60, 77, 80, 82, 83, 90, 91].includes(curlCode)) leg = 'tls';
      }
      attempts = [...attempts.slice(-11), { destination: destination(entry.host), outcome: response ? 'response' : 'failure', leg,
        relayHandshake: entry.handshake, elapsedMs: Math.min(600000, Math.max(0, Math.round((performance.now() - entry.started) / 100) * 100)),
        ...(curlCode !== undefined ? { curlCode } : {}), ...(knownReason !== undefined ? { wispReason: knownReason } : {}),
        ...(response && Number.isInteger(result.status) && result.status >= 100 && result.status <= 599 ? { httpStatus: result.status } : {}) }];
      publish();
    };
  }
  return { install, begin, snapshot: () => snapshot, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    clear: () => { attempts = []; publish(); } };
}
export const connectionDiagnostics = createConnectionDiagnostics();
