import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { stageSnapshot, readStagingPointer, promoteStagingSnapshot } from '../content/r2-snapshot.mjs';
const sha = value => createHash('sha256').update(value).digest('hex');
function storage() {
  const files = new Map();
  return {
    files,
    async get(key) { const bytes = files.get(key); return bytes ? { etag: sha(bytes), size: bytes.length, arrayBuffer: async () => bytes, text: async () => bytes.toString() } : null; },
    async put(key, value, { onlyIf } = {}) {
      const previous = files.get(key);
      if ((onlyIf?.etagDoesNotMatch === '*' && previous) || (onlyIf?.etagMatches && (!previous || sha(previous) !== onlyIf.etagMatches))) return null;
      const bytes = Buffer.from(value); files.set(key, bytes); return { etag: sha(bytes) };
    },
  };
}
function release(text = 'first') {
  const body = Buffer.from(JSON.stringify({ props: { title: text } }));
  const manifest = { schema: 2, release: sha(text), assets: { 'arkpedia-image-assets': 'a'.repeat(40), 'arkpedia-skin-assets': 'b'.repeat(40) }, pages: { '/': { path: 'pages/index.json', bytes: body.length, sha256: sha(body) } }, files: {} };
  return { manifestBytes: Buffer.from(JSON.stringify(manifest)), revision: 'c'.repeat(40), readFile: async () => body };
}

test('bounded uploads verify every source path but coalesce duplicate destination objects', async () => {
  const source = release();
  const manifest = JSON.parse(source.manifestBytes);
  manifest.files = Object.fromEntries(['a', 'b', 'c'].map(name => [`public/${name}.json`, { ...manifest.pages['/'], path: `public/${name}.json` }]));
  const bucket = storage();
  let active = 0, peak = 0, reads = 0, puts = 0, gets = 0;
  const put = bucket.put;
  const get = bucket.get;
  bucket.get = (...args) => { gets++; return get(...args); };
  bucket.put = (...args) => { puts++; return put(...args); };
  const candidate = await stageSnapshot({ bucket, ...source, manifestBytes: Buffer.from(JSON.stringify(manifest)), concurrency: 2, readFile: async path => {
    reads++; peak = Math.max(peak, ++active);
    await new Promise(resolve => setTimeout(resolve, 5));
    active--; return source.readFile(path);
  } });
  assert.equal(reads, 4);
  assert.equal(peak, 2);
  assert.equal(candidate.objectCount, 4, 'logical delivery paths remain in the original manifest');
  assert.equal(puts, 2, 'one immutable payload and the original manifest');
  assert.equal(gets, 4, 'each unique object is looked up and verified once');
});

test('failed staging drains in-flight work before rejecting and never publishes', async () => {
  const source = release();
  const manifest = JSON.parse(source.manifestBytes);
  manifest.files = { 'public/bad.json': { ...manifest.pages['/'], path: 'public/bad.json' } };
  let releaseRead, rejected = false;
  const gate = new Promise(resolve => { releaseRead = resolve; });
  const bucket = storage();
  const operation = stageSnapshot({ bucket, ...source, manifestBytes: Buffer.from(JSON.stringify(manifest)), concurrency: 2,
    readFile: async path => { if (path.startsWith('public/')) throw new Error('source unavailable'); await gate; return source.readFile(path); } });
  const result = operation.catch(error => { rejected = true; assert.match(error.message, /source unavailable/); });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(rejected, false, 'the other in-flight source read is still pending');
  releaseRead(); await result;
  assert.equal(rejected, true);
  assert.equal((await readStagingPointer(bucket)).value, null);
});

test('bad concurrency and contradictory lengths for one digest fail before object writes', async () => {
  const bucket = storage();
  for (const concurrency of [0, 9, 1.5, '4']) await assert.rejects(stageSnapshot({ bucket, ...release(), concurrency }), /concurrency/);
  const source = release(), manifest = JSON.parse(source.manifestBytes);
  manifest.files = { 'public/wrong.json': { ...manifest.pages['/'], path: 'public/wrong.json', bytes: manifest.pages['/'].bytes + 1 } };
  await assert.rejects(stageSnapshot({ bucket, ...source, manifestBytes: Buffer.from(JSON.stringify(manifest)) }), /Conflicting delivery object sizes/);
  assert.equal(bucket.files.size, 0);
});
test('staging alone never publishes; complete snapshots can be promoted and rolled back', async () => {
  const bucket = storage();
  const first = await stageSnapshot({ bucket, ...release() });
  assert.equal((await readStagingPointer(bucket)).value, null);
  const initial = await promoteStagingSnapshot({ bucket, candidate: first, expected: await readStagingPointer(bucket) });
  const second = await stageSnapshot({ bucket, ...release('second') });
  const next = await promoteStagingSnapshot({ bucket, candidate: second, expected: initial });
  const rollback = await promoteStagingSnapshot({ bucket, candidate: first, expected: next });
  assert.equal(rollback.value.manifestSha256, first.manifestSha256);
  assert.equal(rollback.generation, 3);
  const reads = [], writes = [];
  const get = bucket.get, put = bucket.put;
  bucket.get = key => { reads.push(key); return get(key); };
  bucket.put = (...args) => { writes.push(args[0]); return put(...args); };
  await assert.rejects(promoteStagingSnapshot({ bucket, candidate: second, expected: initial }), /Stale/);
  assert.deepEqual(reads, ['pilot-v1/channels/staging.json'], 'an already stale caller does not scan the snapshot');
  assert.deepEqual(writes, []);
});
test('concurrent publishers cannot replace the winner', async () => {
  const bucket = storage();
  const a = await stageSnapshot({ bucket, ...release() });
  const b = await stageSnapshot({ bucket, ...release('second') });
  const expected = await readStagingPointer(bucket);
  let attempts = 0;
  const put = bucket.put;
  bucket.put = (...args) => { if (args[0] === 'pilot-v1/channels/staging.json') attempts++; return put(...args); };
  const results = await Promise.allSettled([a, b].map(candidate => promoteStagingSnapshot({ bucket, candidate, expected })));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.match(results.find(result => result.status === 'rejected').reason.message, /Stale/);
  assert.equal(attempts, 2, 'both pass preflight; the final conditional write rejects the loser');
});
test('missing or corrupt data blocks promotion and leaves the previous pointer intact', async () => {
  for (const corrupt of [false, true]) {
    const bucket = storage();
    const first = await stageSnapshot({ bucket, ...release() });
    const before = await promoteStagingSnapshot({ bucket, candidate: first, expected: await readStagingPointer(bucket) });
    const second = await stageSnapshot({ bucket, ...release('second') });
    const manifest = JSON.parse(bucket.files.get(`pilot-v1/objects/${second.manifestSha256}`));
    const key = `pilot-v1/objects/${manifest.pages['/'].sha256}`;
    if (corrupt) bucket.files.set(key, Buffer.from('corrupt')); else bucket.files.delete(key);
    await assert.rejects(promoteStagingSnapshot({ bucket, candidate: second, expected: before }), /Missing|checksum/);
    assert.deepEqual(await readStagingPointer(bucket), before);
  }
});
test('bad source bytes and unsafe paths cannot create a published candidate', async () => {
  const bucket = storage();
  await assert.rejects(stageSnapshot({ bucket, ...release(), readFile: async () => Buffer.from('wrong') }), /checksum/);
  const input = release();
  const manifest = JSON.parse(input.manifestBytes);
  manifest.pages['/'].path = 'pages/../bad.json';
  await assert.rejects(stageSnapshot({ bucket, ...input, manifestBytes: JSON.stringify(manifest) }), /path/);
  assert.equal((await readStagingPointer(bucket)).value, null);
});
test('identical snapshots reuse objects; conflicting stored bytes are never overwritten', async () => {
  const bucket = storage();
  const first = await stageSnapshot({ bucket, ...release() });
  const count = bucket.files.size;
  assert.deepEqual(await stageSnapshot({ bucket, ...release() }), first);
  assert.equal(bucket.files.size, count);
  const key = [...bucket.files.keys()].find(key => key.includes('/objects/'));
  bucket.files.set(key, Buffer.from('damaged'));
  await assert.rejects(stageSnapshot({ bucket, ...release() }), /checksum/);
  assert.equal(bucket.files.get(key).toString(), 'damaged');
});

test('the original byte-identical manifest is the only index and keeps asset provenance', async () => {
  const bucket = storage(), input = release();
  const candidate = await stageSnapshot({ bucket, ...input });
  const manifest = JSON.parse(input.manifestBytes);
  assert.deepEqual([...bucket.files.keys()].sort(), [manifest.pages['/'].sha256, candidate.manifestSha256].map(hash => `pilot-v1/objects/${hash}`).sort());
  assert.deepEqual(bucket.files.get(`pilot-v1/objects/${candidate.manifestSha256}`), input.manifestBytes);
  const pointer = await promoteStagingSnapshot({ bucket, candidate, expected: await readStagingPointer(bucket) });
  assert.equal(pointer.value.revision, input.revision);
  assert.equal(pointer.value.release, manifest.release);
  assert.equal(pointer.value.manifestBytes, input.manifestBytes.length);
});

test('candidate metadata cannot disagree with its manifest and no bad pointer is published', async () => {
  const bucket = storage();
  const candidate = await stageSnapshot({ bucket, ...release() });
  await assert.rejects(promoteStagingSnapshot({ bucket, candidate: { ...candidate, release: sha('wrong release') }, expected: await readStagingPointer(bucket) }), /disagree/);
  assert.equal((await readStagingPointer(bucket)).value, null);
  bucket.files.set(`pilot-v1/objects/${candidate.manifestSha256}`, Buffer.from('damaged manifest'));
  await assert.rejects(promoteStagingSnapshot({ bucket, candidate, expected: await readStagingPointer(bucket) }), /checksum/);
  assert.equal((await readStagingPointer(bucket)).value, null);
});

test('malformed collections are rejected before any delivery object is written', async () => {
  for (const mutate of [manifest => { manifest.pages = []; }, manifest => { manifest.files = []; }, manifest => { manifest.files.bad = null; }]) {
    const bucket = storage(), input = release(), manifest = JSON.parse(input.manifestBytes);
    mutate(manifest);
    await assert.rejects(stageSnapshot({ bucket, ...input, manifestBytes: JSON.stringify(manifest) }), /manifest|delivery object/);
    assert.equal(bucket.files.size, 0);
  }
});

test('invalid or oversized pointer bodies fail closed', async () => {
  const bucket = storage();
  const candidate = await stageSnapshot({ bucket, ...release() });
  for (const value of [null, { format: 1, ...candidate, generation: 0 }, { format: 1, ...candidate, generation: 1, manifestSha256: 'bad' }]) {
    bucket.files.set('pilot-v1/channels/staging.json', Buffer.from(JSON.stringify(value)));
    await assert.rejects(readStagingPointer(bucket), /Invalid staging pointer/);
  }
  bucket.files.set('pilot-v1/channels/staging.json', Buffer.from('x'.repeat(2049)));
  await assert.rejects(readStagingPointer(bucket), /too large/);
});
