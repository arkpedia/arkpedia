import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { closeIdleWisp, closeRelaySession, createRelaySessionPool, type RelayWispConnection } from '../../lib/account-import/relaySession';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
const turns = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

test('completed flows release the pool; a later email-code verification opens a fresh session', async () => {
  let created = 0;
  const closed: number[] = [];
  const pool = createRelaySessionPool(async () => ++created, async value => { closed.push(value); });
  const sendCode = pool.retain();
  assert.equal(created, 0, 'ownership alone never opens the relay');
  assert.equal(await pool.run(async value => value), 1);
  assert.equal(await pool.run(async value => value), 1, 'a flow reuses its TLS connections');
  sendCode(); sendCode();
  await pool.closeIdle();
  assert.deepEqual(closed, [1]);
  const verifyCode = pool.retain();
  assert.equal(await pool.run(async value => value), 2);
  verifyCode(); await pool.closeIdle();
  assert.deepEqual(closed, [1, 2]);
});

test('overlapping owners and pending response bodies prevent cancellation/visibility cleanup', async () => {
  const body = deferred<string>();
  let closed = 0;
  const pool = createRelaySessionPool(async () => ({}), async () => { closed++; });
  const importDone = pool.retain(), downloadDone = pool.retain();
  const request = pool.run(async () => body.promise);
  await turns();
  importDone();
  await pool.closeIdle(); assert.equal(closed, 0);
  downloadDone();
  await pool.closeIdle(); assert.equal(closed, 0, 'the final owner cannot cut an in-flight body');
  body.resolve('complete account body');
  assert.equal(await request, 'complete account body');
  await pool.closeIdle(); assert.equal(closed, 1);
});

test('idle deadlines release unused pools even while a replay job waits for cloud work', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const closed: number[] = [];
  let count = 0;
  const pool = createRelaySessionPool(async () => ++count, async value => { closed.push(value); }, { idleMs: 15_000 });
  const done = pool.retain();
  await pool.run(async () => {});
  t.mock.timers.tick(14_999); await turns(); assert.deepEqual(closed, []);
  await pool.closeIdle(); // A hidden tab must preserve ownership without cancelling its deadline.
  t.mock.timers.tick(1); await turns(); assert.deepEqual(closed, [1]);
  assert.equal(await pool.run(async value => value), 2, 'the same game capability can reconnect after a long pause');
  done(); await pool.closeIdle(); assert.deepEqual(closed, [1, 2]);
});

test('new work resets idle expiry and unowned hidden work drains without a throttled timer', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let hidden = false, closed = 0;
  const pool = createRelaySessionPool(async () => ({}), async () => { closed++; }, { idleMs: 100, hidden: () => hidden });
  await pool.run(async () => {});
  t.mock.timers.tick(90);
  await pool.run(async () => {});
  t.mock.timers.tick(90); await turns(); assert.equal(closed, 0);
  t.mock.timers.tick(10); await turns(); assert.equal(closed, 1);
  hidden = true;
  await pool.run(async () => {}); await pool.closeIdle(); assert.equal(closed, 2);
});

test('initialization and request failures are not retried or replaced by cleanup failures', async () => {
  let created = 0, sent = 0;
  const pool = createRelaySessionPool(async () => { if (++created === 1) throw new Error('initialization'); return {}; }, async () => { throw new Error('cleanup'); });
  await assert.rejects(pool.run(async () => { sent++; }), /initialization/);
  assert.equal(sent, 0);
  const done = pool.retain();
  const refusal = new Error('upstream refusal');
  await assert.rejects(pool.run(async () => { sent++; throw refusal; }), error => error === refusal);
  done(); await pool.closeIdle();
  assert.equal(sent, 1);
  const again = pool.retain();
  assert.equal(await pool.run(async () => 'success'), 'success');
  again(); await pool.closeIdle();
  assert.equal(created, 3);
});

/** Execute the pinned, unmodified Wisp implementation without its browser-only
 * WASM loader. Only the network WebSocket is simulated; no TLS or account data. */
function realWisp() {
  const require = createRequire(import.meta.url);
  assert.equal(JSON.parse(readFileSync('node_modules/libcurl.js/package.json', 'utf8')).version, '0.7.4');
  const source = readFileSync(require.resolve('libcurl.js'), 'utf8');
  const start = source.indexOf('const packet_types ='), end = source.indexOf('function logger(type, text)');
  assert.ok(start > 0 && end > start, 'Review Wisp lifecycle tests after a dependency change');
  const closeStart = source.indexOf('  close() {', source.indexOf('class CurlSession'));
  const closeEnd = source.indexOf('  //wrap request callbacks', closeStart);
  assert.ok(closeStart > 0 && closeEnd > closeStart);
  const closeSession = runInNewContext('({' + source.slice(closeStart, closeEnd) + '})', { setTimeout }).close as (this: { assert_ready(): void; close_now(): void }) => void;
  class Close extends Event { code: number; constructor(type: string, init = { code: 1000 }) { super(type); this.code = init.code; } }
  const sockets: Socket[] = [];
  class Socket extends EventTarget {
    readyState = 0;
    constructor(_url: string) { super(); sockets.push(this); }
    send(_data: unknown) {}
    close() { this.readyState = 2; }
    opened() {
      this.readyState = 1;
      this.dispatchEvent(new MessageEvent('message', { data: Uint8Array.from([3, 0, 0, 0, 0, 0, 1, 0, 0]).buffer }));
    }
    closed() { this.readyState = 3; this.dispatchEvent(new Close('close')); }
  }
  const context = { EventTarget, Event, CloseEvent: Close, MessageEvent, WebSocket: Socket, TextEncoder, Uint8Array, Uint16Array, Uint32Array, ArrayBuffer, DataView, Blob, warn_msg() {} };
  const api = runInNewContext(source.slice(start, end) + '\n({ connections: _wisp_connections, Stream: WispWebSocket })', context) as {
    connections: Record<string, RelayWispConnection>;
    Stream: new (url: string) => { close(): void };
  };
  const url = 'wss://relay.example.invalid/wisp/';
  const stream = () => new api.Stream(url + 'public.example.invalid:443');
  return { ...api, sockets, url, stream, closeSession };
}

test('the real deferred libcurl session close finishes before the shared Wisp socket is checked', async () => {
  const w = realWisp(), stream = w.stream(); w.sockets[0].opened();
  const session = { assert_ready() {}, close_now() { stream.close(); }, close: w.closeSession };
  const closing = closeRelaySession(session, w.connections, w.url);
  assert.equal(w.sockets[0].readyState, 1, 'the library has not closed its TCP stream yet');
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(w.sockets[0].readyState, 2, 'cleanup waited for the library before closing the physical socket');
  w.sockets[0].closed(); await closing;
  assert.equal(w.connections[w.url], undefined);
});

test('real Wisp stream cleanup alone leaves its shared socket open; teardown closes and recreates it', async () => {
  const w = realWisp(), first = w.stream();
  w.sockets[0].opened();
  assert.equal(Object.keys(w.connections[w.url].active_streams).length, 1);
  first.close();
  assert.equal(Object.keys(w.connections[w.url].active_streams).length, 0);
  assert.equal(w.sockets[0].readyState, 1, 'libcurl leaves the physical WebSocket alive');
  const closing = closeIdleWisp(w.connections, w.url);
  assert.equal(w.sockets[0].readyState, 2);
  w.sockets[0].closed(); await closing;
  assert.equal(w.connections[w.url], undefined);
  const second = w.stream(); w.sockets[1].opened();
  assert.equal(w.sockets.length, 2);
  second.close(); const cleanup = closeIdleWisp(w.connections, w.url); w.sockets[1].closed(); await cleanup;
});

test('a reconnect waits for the real old Wisp close handler, which otherwise deletes its new registry entry', async () => {
  const w = realWisp();
  const pool = createRelaySessionPool(async () => { const stream = w.stream(); w.sockets.at(-1)!.opened(); return stream; }, async stream => { stream.close(); await closeIdleWisp(w.connections, w.url); });
  const done = pool.retain();
  await pool.run(async () => {}); done(); await turns();
  assert.equal(w.sockets[0].readyState, 2);
  const nextDone = pool.retain();
  const next = pool.run(async () => 'verified');
  await turns(); assert.equal(w.sockets.length, 1);
  w.sockets[0].closed();
  assert.equal(await next, 'verified'); assert.equal(w.sockets.length, 2);
  assert.ok(w.connections[w.url], 'the old close event did not erase the new connection');
  nextDone(); await turns(); w.sockets[1].closed(); await pool.closeIdle();
});

test('a Wisp stream belonging to another session is never cut by pool cleanup', async () => {
  const w = realWisp(), first = w.stream(); w.sockets[0].opened();
  const other = w.stream(); first.close();
  await closeIdleWisp(w.connections, w.url);
  assert.equal(w.sockets[0].readyState, 1);
  other.close(); const closing = closeIdleWisp(w.connections, w.url); w.sockets[0].closed(); await closing;
});
