import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createR2Delivery, deliveryBaseUrl, DELIVERY_PREFIX } from '../../lib/content/r2Delivery.mjs';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const revision = 'a'.repeat(40);
const key = hash => `pilot-v1/objects/${hash}`;
function snapshot(title = 'first') {
  const page = Buffer.from(JSON.stringify({ props: { title } })), data = Buffer.from(JSON.stringify({ title }));
  const manifest = Buffer.from(JSON.stringify({ schema: 2, release: sha(title),
    assets: { 'arkpedia-image-assets': 'b'.repeat(40), 'arkpedia-skin-assets': 'c'.repeat(40) },
    pages: { '/': { path: 'pages/index.json', bytes: page.length, sha256: sha(page) } },
    files: { data: { path: 'public/data.json', bytes: data.length, sha256: sha(data) } } }));
  return { page, data, manifest, reference: { revision, manifestSha256: sha(manifest) } };
}
function bucket(...snapshots) {
  const objects = new Map(), reads = [];
  for (const source of snapshots) for (const bytes of [source.manifest, source.page, source.data]) objects.set(key(sha(bytes)), bytes);
  return { objects, reads, async get(name) {
    reads.push(name);
    assert.match(name, /^pilot-v1\/objects\/[a-f0-9]{64}$/, 'delivery never consults a mutable channel pointer');
    const bytes = objects.get(name);
    return bytes ? { size: bytes.length, body: new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } }) } : null;
  } };
}
const url = (source, path = 'public/data.json') => `${deliveryBaseUrl('https://pilot.example', source.reference)}/${path}`;

test('immutable URL references require HTTPS, a bare origin, full hashes and no embedded credentials', () => {
  const source = snapshot();
  assert.equal(url(source), `https://pilot.example${DELIVERY_PREFIX}${source.reference.manifestSha256}/${revision}/release/public/data.json`);
  for (const origin of ['http://pilot.example', 'https://user:secret@pilot.example', 'https://pilot.example/subpath', 'https://pilot.example/?q=1']) assert.throws(() => deliveryBaseUrl(origin, source.reference));
  assert.throws(() => deliveryBaseUrl('https://pilot.example', { ...source.reference, revision: 'main' }));
  assert.match(deliveryBaseUrl('http://127.0.0.1:9191', source.reference, { allowLocalHttp: true }), /^http:\/\/127\.0\.0\.1:9191\//);
  assert.throws(() => deliveryBaseUrl('http://pilot.example', source.reference, { allowLocalHttp: true }));
});

test('opt-in current pointer is verified, never cached, and leaves immutable reads pinned', async () => {
  const source = snapshot(), storage = bucket(source);
  const pointer = { format: 1, ...source.reference, manifestBytes: source.manifest.length, release: JSON.parse(source.manifest).release, generation: 1 };
  const originalGet = storage.get;
  let pointerBody = Buffer.from(JSON.stringify(pointer));
  storage.get = async name => name === 'pilot-v1/channels/staging.json'
    ? { size: pointerBody.length, arrayBuffer: async () => pointerBody }
    : originalGet(name);
  const request = () => new Request(`https://pilot.example${DELIVERY_PREFIX}current.json`);
  assert.equal((await createR2Delivery({ bucket: storage })(request())).status, 400, 'pointer endpoint is inactive by default');
  const handle = createR2Delivery({ bucket: storage, serveStagingPointer: true });
  const response = await handle(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.deepEqual(await response.json(), { schema: 2, release: pointer.release, revision, manifestSha256: pointer.manifestSha256 });
  pointerBody = Buffer.from(JSON.stringify({ ...pointer, release: 'f'.repeat(64) }));
  assert.equal((await handle(request())).status, 502, 'pointer must agree with its verified manifest');
  pointerBody = Buffer.from(JSON.stringify({ ...pointer, generation: 0 }));
  assert.equal((await handle(request())).status, 502);
  assert.deepEqual(await (await handle(new Request(url(source)))).json(), JSON.parse(source.data), 'old immutable URL ignores mutable pointer');
});

test('HTTP reader serves only verified requested bytes, immutable headers, HEAD and matching conditions', async () => {
  const source = snapshot(), storage = bucket(source), handle = createR2Delivery({ bucket: storage });
  const response = await handle(new Request(url(source)));
  assert.equal(response.status, 200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), source.data, 'the browser receives this file, not the full manifest');
  assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assert.match(response.headers.get('cache-control'), /immutable/);
  assert.equal(response.headers.get('x-arkpedia-content'), 'r2');
  assert.equal(response.headers.get('set-cookie'), null);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  const etag = response.headers.get('etag');
  assert.equal((await handle(new Request(url(source), { headers: { 'if-none-match': `"other", W/${etag}` } }))).status, 304);
  const head = await handle(new Request(url(source), { method: 'HEAD' }));
  assert.equal(head.status, 200); assert.equal(await head.text(), '');
  assert.equal(Number(head.headers.get('content-length')), source.data.length);
  assert.equal(storage.reads.filter(name => name === key(sha(source.manifest))).length, 1, 'manifest cache is shared across requests');
});

test('old page and public-file URLs remain on their snapshot through publication and rollback', async () => {
  const first = snapshot('old'), second = snapshot('new'), storage = bucket(first, second);
  const handle = createR2Delivery({ bucket: storage });
  for (const source of [first, second, first, second, first]) {
    assert.deepEqual(await (await handle(new Request(url(source)))).json(), JSON.parse(source.data));
    assert.deepEqual(await (await handle(new Request(url(source, 'pages/index.json')))).json(), JSON.parse(source.page));
  }
  assert.equal(storage.reads.filter(name => name === key(sha(first.manifest))).length, 1);
  assert.equal(storage.reads.filter(name => name === key(sha(second.manifest))).length, 1);
});

test('unsafe/missing paths and unsupported methods never become a fetch proxy or mutate storage', async () => {
  const source = snapshot(), storage = bucket(source), handle = createR2Delivery({ bucket: storage });
  assert.equal(await handle(new Request('https://pilot.example/account')), null, 'unrelated requests belong to existing edge logic');
  assert.equal((await handle(new Request(url(source), { method: 'POST' }))).status, 405);
  assert.equal(storage.reads.length, 0);
  for (const path of ['public/%2Fsecret.json', 'public/%5Csecret.json', 'public/%zz', 'source/private.json']) {
    const response = await handle(new Request(url(source, path)));
    assert.equal(response.status, 400); assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  assert.equal(storage.reads.length, 0);
  const absent = await handle(new Request(url(source, 'public/not-listed.json')));
  assert.equal(absent.status, 404); assert.equal(absent.headers.get('cache-control'), 'no-store');
});

test('missing/corrupt manifest and payload data never yield a cacheable success', async () => {
  const source = snapshot();
  for (const corruptKey of [key(sha(source.manifest)), key(sha(source.data))]) {
    const storage = bucket(source);
    storage.objects.set(corruptKey, Buffer.from('corrupt'));
    const response = await createR2Delivery({ bucket: storage })(new Request(url(source)));
    assert.equal(response.status, 502); assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('etag'), null);
  }
  const storage = bucket(source); storage.objects.delete(key(sha(source.data)));
  assert.equal((await createR2Delivery({ bucket: storage })(new Request(url(source)))).status, 502);
});

test('optional fallback is fixed to the requested Git revision, verifies bytes and omits user credentials', async () => {
  const source = snapshot('old'), storage = bucket(), calls = [];
  const handle = createR2Delivery({ bucket: storage, fallbackToGithub: true, fetchImpl: async (address, options) => {
    calls.push(address); assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error'); assert.equal(options.headers, undefined);
    assert.match(address, new RegExp(`^https://raw\\.githubusercontent\\.com/arkpedia/arkpedia-data/${revision}/release/`));
    return new Response(address.endsWith('/manifest.json') ? source.manifest : source.data);
  } });
  const response = await handle(new Request(url(source), { headers: { cookie: 'private=not-forwarded', authorization: 'Bearer not-forwarded' } }));
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { title: 'old' });
  assert.equal(response.headers.get('x-arkpedia-content'), 'github-fallback');
  assert.equal(calls.length, 2);
  const wrong = createR2Delivery({ bucket: bucket(), fallbackToGithub: true, fetchImpl: async () => new Response(snapshot('new').manifest) });
  assert.equal((await wrong(new Request(url(source)))).status, 502, 'current release cannot stand in for the pinned old snapshot');
});

test('manifest cache eviction and concurrent reader admission stay bounded', async () => {
  const first = snapshot('first'), second = snapshot('second'), storage = bucket(first, second);
  const handle = createR2Delivery({ bucket: storage, manifestCacheSize: 1 });
  for (const source of [first, second, first]) assert.equal((await handle(new Request(url(source)))).status, 200);
  assert.equal(storage.reads.filter(name => name === key(sha(first.manifest))).length, 2);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let manifestReads = 0;
  const originalGet = storage.get.bind(storage);
  const pendingHandle = createR2Delivery({ maxQueuedReads: 0, bucket: { async get(name) {
    if (name === key(sha(first.manifest))) { manifestReads++; await gate; }
    return originalGet(name);
  } } });
  const a = pendingHandle(new Request(url(first))), b = pendingHandle(new Request(url(first)));
  const busy = await pendingHandle(new Request(url(first)));
  assert.equal(busy.status, 503); assert.equal(busy.headers.get('retry-after'), '1');
  release();
  assert.ok((await Promise.all([a, b])).every(response => response.status === 200));
  assert.equal(manifestReads, 1, 'concurrent readers share the same manifest load');
});

test('normal request bursts queue, and disconnected queued readers release their place', async () => {
  const source = snapshot(), storage = bucket(source);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const original = storage.get.bind(storage);
  const handle = createR2Delivery({ maxActiveReads: 1, maxQueuedReads: 1, bucket: { async get(name) { await gate; return original(name); } } });
  const first = handle(new Request(url(source)));
  const abort = new AbortController();
  const second = handle(new Request(url(source), { signal: abort.signal }));
  abort.abort();
  assert.equal((await second).status, 503);
  const third = handle(new Request(url(source)));
  assert.equal((await handle(new Request(url(source)))).status, 503, 'queue is bounded');
  release();
  assert.ok((await Promise.all([first, third])).every(response => response.status === 200));
  const burstHandle = createR2Delivery({ bucket: storage });
  const burst = await Promise.all(Array.from({ length: 12 }, () => burstHandle(new Request(url(source)))));
  assert.ok(burst.every(response => response.status === 200));
});

test('streamed R2 payloads cannot exceed declared or contract sizes', async () => {
  const source = snapshot(), storage = bucket(source), original = storage.get.bind(storage);
  const oversized = { async get(name) {
    const value = await original(name);
    if (name !== key(sha(source.data))) return value;
    return { size: source.data.length, body: new ReadableStream({ start(controller) {
      controller.enqueue(source.data); controller.enqueue(new Uint8Array([0])); controller.close();
    } }) };
  } };
  const response = await createR2Delivery({ bucket: oversized })(new Request(url(source)));
  assert.equal(response.status, 502); assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('optional edge cache stores only verified immutable successes and bypasses storage on hits', async () => {
  const source = snapshot(), storage = bucket(source), responses = new Map();
  const cache = { async match(request) { return responses.get(request.url)?.clone(); }, async put(request, response) {
    assert.equal(request.headers.get('authorization'), null); assert.equal(request.headers.get('cookie'), null);
    assert.equal(request.url.includes('?'), false); assert.equal(response.status, 200);
    responses.set(request.url, new Response(await response.arrayBuffer(), response));
  } };
  const handle = createR2Delivery({ bucket: storage, cache });
  const first = await handle(new Request(`${url(source)}?first=1`, { headers: { authorization: 'Bearer not-a-cache-key' } }));
  assert.equal(first.headers.get('x-arkpedia-content-cache'), 'MISS');
  const reads = storage.reads.length;
  storage.objects.clear();
  const cached = await handle(new Request(`${url(source)}?other=2`));
  assert.equal(cached.headers.get('x-arkpedia-content-cache'), 'HIT');
  assert.deepEqual(Buffer.from(await cached.arrayBuffer()), source.data);
  assert.equal(storage.reads.length, reads);
  assert.equal((await handle(new Request(url(source), { headers: { 'if-none-match': first.headers.get('etag') } }))).status, 304);
  const head = await handle(new Request(url(source), { method: 'HEAD' }));
  assert.equal(await head.text(), ''); assert.equal(storage.reads.length, reads);
  const missing = await handle(new Request(url(source, 'public/not-listed.json')));
  assert.equal(missing.status, 404); assert.equal(responses.size, 1);
});

test('failed edge-cache reads/writes cannot turn valid data into an error', async () => {
  const source = snapshot();
  const handle = createR2Delivery({ bucket: bucket(source), cache: {
    async match() { throw new Error('cache unavailable'); }, async put() { throw new Error('cache unavailable'); },
  } });
  const response = await handle(new Request(url(source)));
  assert.equal(response.status, 200); assert.equal(response.headers.get('x-arkpedia-content-cache'), 'BYPASS');
  assert.deepEqual(await response.json(), JSON.parse(source.data));
});
