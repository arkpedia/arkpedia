import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createConnectionDiagnostics } from '../../lib/account-import/connectionDiagnostics';

function fixture() {
  class Connection {
    wisp_url = 'wss://relay.invalid/wisp/';
    connected = false;
    ws = new EventTarget();
    active_streams: Record<string, { hostname: string; port: number }> = {};
    constructor() { this.connect_ws(); }
    connect_ws() {}
    create_stream(hostname: string, port: number) { const stream = { hostname, port }; this.active_streams[Object.keys(this.active_streams).length] = stream; return stream; }
    close_stream(_stream: { hostname: string; port: number }, _reason: number) {}
    on_ws_close() { this.connected = false; }
  }
  const diagnostic = createConnectionDiagnostics();
  const api = { WispConnection: Connection, wisp_connections: {} as Record<string, Connection> };
  diagnostic.install(api, 'wss://relay.invalid/wisp/');
  const finish = diagnostic.begin('https://en-sdk-api.yostarplat.com/yostar/send-code?email=DO-NOT-EXPORT');
  const conn = new Connection();
  api.wisp_connections[conn.wisp_url] = conn;
  const fail = () => finish({ error: new Error('Request failed with error code 7: secret@example.invalid CODE-123 TOKEN-123') });
  return { diagnostic, api, conn, fail, finish, report: () => JSON.parse(diagnostic.snapshot()).attempts.at(-1) };
}
test('a blocked WebSocket or lost relay connection is browser-to-relay, including before handshake', () => {
  for (const lost of ['error', 'close']) {
    const { conn, fail, report } = fixture();
    if (lost === 'error') conn.ws.dispatchEvent(new Event('error')); else conn.on_ws_close();
    fail();
    assert.equal(report().leg, 'browser-to-relay');
    assert.equal(report().relayHandshake, false);
    assert.equal(report().curlCode, 7);
  }
});
test('explicit upstream Wisp failures and relay policy have distinct diagnoses', () => {
  for (const [reason, leg] of [[3, 'relay-to-upstream'], [66, 'relay-to-upstream'], [67, 'relay-to-upstream'], [68, 'relay-to-upstream'], [71, 'relay-to-upstream'], [65, 'relay-policy'], [72, 'relay-policy'], [73, 'relay-policy']] as const) {
    const { conn, fail, report } = fixture();
    conn.connected = true;
    const stream = conn.create_stream('en-sdk-api.yostarplat.com', 443);
    conn.close_stream(stream, reason);
    fail();
    assert.equal(report().leg, leg);
    assert.equal(report().wispReason, reason);
    assert.equal(report().relayHandshake, true);
  }
});
test('handshake alone, unrelated streams, unknown codes and concurrent same-host requests remain unknown', () => {
  for (const kind of ['handshake', 'unrelated', 'unknown', 'concurrent']) {
    const { diagnostic, conn, fail, report } = fixture();
    conn.connected = true;
    const second = kind === 'concurrent' ? diagnostic.begin('https://en-sdk-api.yostarplat.com/user/login') : null;
    const stream = conn.create_stream(kind === 'unrelated' ? 'account.yo-star.com' : 'en-sdk-api.yostarplat.com', 443);
    if (kind !== 'handshake') conn.close_stream(stream, kind === 'unknown' ? 255 : 68);
    fail();
    assert.equal(report().leg, 'unknown', kind);
    second?.({ status: 200 });
  }
});
test('socket loss takes precedence over synthetic upstream close; TLS has its own category', () => {
  const a = fixture();
  a.conn.connected = true;
  const stream = a.conn.create_stream('en-sdk-api.yostarplat.com', 443);
  a.conn.on_ws_close();
  a.conn.close_stream(stream, 3);
  a.fail();
  assert.equal(a.report().leg, 'browser-to-relay');
  const b = fixture();
  b.conn.connected = true;
  b.conn.create_stream('en-sdk-api.yostarplat.com', 443);
  b.finish({ error: new Error('Request failed with error code 60: certificate failed') });
  assert.equal(b.report().leg, 'tls');
});
test('privacy uses an allow-listed bounded schema rather than redacting arbitrary text', () => {
  const { diagnostic, fail } = fixture();
  fail();
  for (let i = 0; i < 20; i++) diagnostic.begin('https://USER:PASS@secret.invalid/private?token=TOKEN')({ error: new Error('secret@example.invalid CODE TOKEN') });
  const raw = diagnostic.snapshot();
  for (const secret of ['secret', 'DO-NOT-EXPORT', '123', 'TOKEN', 'USER', 'PASS', 'https:', 'email', 'headers', 'body']) assert.ok(!raw.includes(secret), secret);
  const data = JSON.parse(raw);
  assert.deepEqual(Object.keys(data), ['version', 'transport', 'attempts']);
  assert.equal(data.attempts.length, 12);
  assert.deepEqual(Object.keys(data.attempts[0]), ['destination', 'outcome', 'leg', 'relayHandshake', 'elapsedMs']);
  diagnostic.clear();
  assert.equal(diagnostic.snapshot(), '');
});
test('HTTP refusals remain upstream responses; finishing twice and duplicate installation do not duplicate reports', () => {
  const { diagnostic, api, finish, report } = fixture();
  diagnostic.install(api, 'wss://relay.invalid/wisp/');
  finish({ status: 429 });
  finish({ error: new Error('Request failed with error code 7: ignored') });
  assert.equal(report().leg, 'none');
  assert.equal(report().httpStatus, 429);
  assert.equal(JSON.parse(diagnostic.snapshot()).attempts.length, 1);
});

test('cached streams are observed conservatively and idle unrelated streams cannot label a request', () => {
  const { diagnostic, conn, api, finish } = fixture();
  finish({ status: 200 });
  conn.connected = true;
  const cached = conn.create_stream('en-sdk-api.yostarplat.com', 443);
  const done = diagnostic.begin('https://en-sdk-api.yostarplat.com/yostar/send-code');
  conn.close_stream(cached, 68);
  done({ error: new Error('Request failed with error code 7: failed') });
  assert.equal(JSON.parse(diagnostic.snapshot()).attempts.at(-1).leg, 'unknown');
  // Two pooled streams cannot be mapped to the current request without HTTP inspection.
  conn.create_stream('en-sdk-api.yostarplat.com', 443);
  const ambiguous = diagnostic.begin('https://en-sdk-api.yostarplat.com/yostar/send-code');
  conn.close_stream(cached, 68);
  ambiguous({ error: new Error('Request failed with error code 7: failed') });
  assert.equal(JSON.parse(diagnostic.snapshot()).attempts.at(-1).leg, 'unknown');
  assert.equal(api.wisp_connections[conn.wisp_url], conn);
});

test('missing dependency hooks leave transport diagnostics unknown without interrupting requests', () => {
  const diagnostic = createConnectionDiagnostics();
  diagnostic.install({} as Parameters<typeof diagnostic.install>[0], 'wss://relay.invalid/wisp/');
  diagnostic.begin('https://en-sdk-api.yostarplat.com/')({ error: new Error('Request failed with error code 7: failed') });
  assert.equal(JSON.parse(diagnostic.snapshot()).attempts[0].leg, 'unknown');
});
