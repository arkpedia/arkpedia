import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';
import queueCache from '@opennextjs/cloudflare/overrides/queue/queue-cache';
import { patchQueueSource } from '../build/patch-opennext-queue.mjs';

// Exercise the installed queue that OpenNext compiles, replacing only the runtime
// base class. This catches an install/build that silently drops the timeout fix.
const require = createRequire(import.meta.url);
const file = require.resolve('@opennextjs/cloudflare/durable-objects/queue');
const source = readFileSync(file, 'utf8');
const bundle = await build({
  stdin: { contents: source, resolveDir: dirname(file), sourcefile: file },
  bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{ name: 'durable-object-test-runtime', setup(builder) {
    builder.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: 'base', namespace: 'test' }));
    builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }' }));
  } }],
});
const { DOQueueHandler } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const message = (id = 'version-a') => ({ MessageGroupId: 'revalidate-0', MessageDeduplicationId: id, MessageBody: { host: 'www.arkpedia.net', url: '/operators/Closure', lastModified: 0 } });

function fixture(t, fetch) {
  const timers = new Map(), work = [], alarms = [];
  t.mock.method(globalThis, 'setTimeout', (callback, delay) => {
    const handle = {};
    timers.set(handle, { callback, delay });
    return handle;
  });
  t.mock.method(globalThis, 'clearTimeout', handle => timers.delete(handle));
  t.mock.method(console, 'error', () => {});
  const ctx = { storage: { getAlarm: async () => null, setAlarm: async at => alarms.push(at) }, waitUntil: promise => work.push(promise), blockConcurrencyWhile: fn => fn() };
  const queue = new DOQueueHandler(ctx, { WORKER_SELF_REFERENCE: { fetch }, NEXT_CACHE_DO_QUEUE_DISABLE_SQLITE: 'true' });
  return { queue, timers, alarms, work };
}

test('the installed queue has the idempotent patch and rejects upstream drift', () => {
  assert.match(source, /clearTimeout\(timeout\)/);
  assert.doesNotMatch(source, /AbortSignal\.timeout/);
  assert.equal(patchQueueSource(source), source);
  assert.throws(() => patchQueueSource('different upstream implementation'), /no longer matches/);
});

test('successful refresh leaves no timer keeping the object awake', async t => {
  let signal;
  const { queue, timers, work } = fixture(t, async (_url, options) => {
    assert.equal(timers.size, 1, 'the timeout protects the pending fetch');
    signal = options.signal;
    return new Response(null, { headers: { 'x-nextjs-cache': 'REVALIDATED' } });
  });
  await queue.revalidate(message());
  await Promise.all(work);
  assert.equal(signal.aborted, false);
  assert.equal(timers.size, 0);
  assert.equal(queue.ongoingRevalidations.size, 0);
  assert.equal(queue.routeInFailedState.size, 0);
});

test('network failure clears the timer and retains the retry alarm', async t => {
  const { queue, timers, work, alarms } = fixture(t, async () => { throw new Error('network failure'); });
  await queue.revalidate(message());
  await Promise.all(work);
  assert.equal(timers.size, 0);
  assert.equal(queue.ongoingRevalidations.size, 0);
  assert.equal(queue.routeInFailedState.size, 1);
  assert.equal(alarms.length, 1);
});

test('a stalled refresh still aborts at ten seconds and schedules a retry', async t => {
  let signal;
  const { queue, timers, work, alarms } = fixture(t, (_url, options) => {
    signal = options.signal;
    return new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  });
  await queue.revalidate(message());
  assert.equal(timers.size, 1);
  const [{ callback, delay }] = timers.values();
  assert.equal(delay, 10_000);
  callback();
  await Promise.all(work);
  assert.equal(signal.reason.name, 'TimeoutError');
  assert.equal(timers.size, 0);
  assert.equal(queue.routeInFailedState.size, 1);
  assert.equal(alarms.length, 1);
});

test('completing one refresh preserves another refresh timeout', async t => {
  const pending = [];
  const { queue, timers, work } = fixture(t, () => new Promise(resolve => pending.push(resolve)));
  await queue.revalidate(message('a'));
  await queue.revalidate(message('b'));
  assert.equal(timers.size, 2);
  pending[0](new Response(null, { headers: { 'x-nextjs-cache': 'REVALIDATED' } }));
  await work[0];
  assert.equal(timers.size, 1);
  pending[1](new Response(null, { headers: { 'x-nextjs-cache': 'REVALIDATED' } }));
  await work[1];
  assert.equal(timers.size, 0);
});

test('regional deduplication skips duplicates, allows new versions and retries failed acknowledgements', async t => {
  const entries = new Map(), sent = [];
  const cache = { match: async key => entries.get(key), put: async (key, value) => { entries.set(key, value); } };
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'caches');
  Object.defineProperty(globalThis, 'caches', { configurable: true, value: { open: async () => cache } });
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'caches', previous); else delete globalThis.caches; });
  let fail = false;
  const queue = queueCache({ name: 'test-queue', send: async msg => { sent.push(msg.MessageDeduplicationId); if (fail) throw new Error('queue unavailable'); } }, { regionalCacheTtlSec: 5, waitForQueueAck: true });
  t.mock.method(console, 'error', () => {});
  await queue.send(message());
  // Use a second isolate's local cache to exercise the shared regional cache.
  queue.localCache.clear();
  await queue.send(message());
  await queue.send(message('version-b'));
  assert.deepEqual(sent, ['version-a', 'version-b']);
  assert.ok([...entries.values()].every(response => response.headers.get('cache-control') === 'max-age=5'));
  fail = true;
  await queue.send(message('version-c'));
  fail = false;
  await queue.send(message('version-c'));
  assert.deepEqual(sent, ['version-a', 'version-b', 'version-c', 'version-c']);
});
