import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { byteRange, createAssetDelivery } from '../../workers/assets/delivery.mjs';
import { assetReferences, indexKey, objectKey, readyKey, shardFor, sha256 } from '../../workers/assets/contract.mjs';
import { mirrorRevision, s3Store, treeFiles } from '../content/mirror-github-assets.mjs';

const repository = 'arkpedia-image-assets', revision = 'a'.repeat(40), path = "six-star-icons/Kal'tsit - Base.webp";
const body = Buffer.from('example-image-bytes');
const sha = createHash('sha1').update(`blob ${body.length}\0`).update(body).digest('hex');
const file = { path, sha, bytes: body.length };
test('compiled animation references discover only approved immutable public repositories', () => {
  const url = repo => `https://raw.githubusercontent.com/arkpedia/${repo}/${revision}/models/skin/model.json`;
  assert.deepEqual(assetReferences(JSON.stringify([url('arkpedia-l2d-assets'), url('arkpedia-sd-assets'), url('private-repo'), url('arkpedia-l2d-assets'), url('arkpedia-data')])), [
    { repository: 'arkpedia-l2d-assets', revision }, { repository: 'arkpedia-sd-assets', revision },
  ]);
  assert.deepEqual(assetReferences(url('arkpedia-l2d-assets').replace(revision, 'main')), []);
});
const request = (headers = {}, method = 'GET') => new Request(`https://assets.arkpedia.net/arkpedia/${repository}/${revision}/${path.split('/').map(encodeURIComponent).join('/')}`, { headers, method });
async function fixture() {
  const data = new Map(), puts = [];
  const store = { put: async (key, bytes) => { puts.push(key); data.set(key, Buffer.from(bytes)); } };
  await mirrorRevision({ repository, revision, files: [file], read: async () => body, store, known: new Map(), log: () => {} });
  const bucket = { get: async (key, options) => {
    const bytes = data.get(key); if (!bytes) return null;
    return { size: bytes.length, arrayBuffer: async () => bytes, body: options?.range ? bytes.subarray(options.range.offset, options.range.offset + options.range.length) : bytes };
  } };
  return { data, puts, store, bucket };
}

test('publisher verifies bytes, deduplicates and publishes readiness only after indexes', async () => {
  const f = await fixture();
  assert.deepEqual(f.puts, [objectKey(sha), indexKey(repository, revision, await shardFor(path)), readyKey(repository, revision)]);
  const puts = [];
  await mirrorRevision({ repository, revision, files: [file, { ...file, path: 'other/same.webp' }], read: async () => { throw new Error('existing blob should be reused'); }, store: { put: async key => puts.push(key) }, known: new Map([[objectKey(sha), body.length]]), log: () => {} });
  assert.ok(!puts.includes(objectKey(sha)));
});
test('partial or corrupt uploads never publish readiness', async () => {
  for (const broken of ['source', 'upload']) {
    const puts = [];
    await assert.rejects(mirrorRevision({ repository, revision, files: [file], read: async () => broken === 'source' ? Buffer.from('corrupt') : body,
      store: { put: async key => { puts.push(key); throw new Error('upload failed'); } }, known: new Map(), log: () => {} }));
    assert.ok(!puts.includes(readyKey(repository, revision)));
  }
});
test('parallel reference discovery produces byte-identical immutable readiness receipts', async () => {
  const references = ['arkpedia-sd-assets', 'arkpedia-l2d-assets'].map(repository => ({ repository, revision }));
  const receipts = [];
  for (const ordered of [references, [...references].reverse()]) {
    await mirrorRevision({ repository, revision, files: [file], references: ordered, read: async () => body,
      store: { put: async (key, bytes) => { if (key === readyKey(repository, revision)) receipts.push(bytes); } }, known: new Map(), log: () => {} });
  }
  assert.deepEqual(receipts[0], receipts[1]);
});
test('Git source selection keeps public media and excludes code, symlinks and traversal', () => {
  const row = (mode, name) => `${mode} blob ${sha} ${body.length}\t${name}\0`;
  assert.deepEqual(treeFiles(repository, row('100644', path) + row('100644', 'scripts/run.js')), [file]);
  assert.deepEqual(treeFiles(repository, row('100644', '../secret.png')), []);
  assert.throws(() => treeFiles(repository, row('120000', 'symlink.png')), /Unsupported/);
});
test('R2 reader serves identical bytes, CORS, immutable cache headers and conditional HEAD/GET', async () => {
  const f = await fixture(), serve = createAssetDelivery();
  const response = await serve(request(), f);
  assert.equal(await response.text(), body.toString());
  assert.equal(response.headers.get('x-arkpedia-assets'), 'R2');
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assert.match(response.headers.get('cache-control'), /immutable/);
  assert.equal((await serve(request({ 'if-none-match': `"${sha}"` }), f)).status, 304);
  assert.equal(await (await serve(request({}, 'HEAD'), f)).text(), '');
});
test('audio range and suffix requests return correct partial bytes and lengths', async () => {
  const f = await fixture(), serve = createAssetDelivery();
  const response = await serve(request({ range: 'bytes=2-6' }), f);
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-length'), '5');
  assert.equal(await response.text(), body.subarray(2, 7).toString());
  assert.equal(await (await serve(request({ range: 'bytes=-4' }), f)).text(), body.subarray(-4).toString());
  assert.equal((await serve(request({ range: 'bytes=999-1000' }), f)).status, 416);
  assert.equal((await serve(request({ range: 'bytes=0-1,4-5' }), f)).status, 416);
  assert.equal(byteRange('bytes=0-', 10).length, 10);
});
test('cache hits avoid blob reads and ignore commit-irrelevant query strings', async () => {
  const f = await fixture(), serve = createAssetDelivery(), copies = new Map(), pending = [];
  const cache = { match: async key => copies.get(key.url)?.clone(), put: async (key, response) => copies.set(key.url, response) };
  await serve(request(), { ...f, cache, waitUntil: promise => pending.push(promise) }); await Promise.all(pending);
  f.data.delete(objectKey(sha));
  const hit = await serve(new Request(request().url + '?v=old-cache-buster'), { ...f, cache });
  assert.equal(hit.headers.get('x-arkpedia-assets'), 'R2-HIT');
  assert.equal(await hit.text(), body.toString());
});
test('missing revisions and invalid indexes fail closed without GitHub redirects or cached errors', async () => {
  const f = await fixture();
  f.data.delete(readyKey(repository, revision));
  assert.equal((await createAssetDelivery()(request(), f)).status, 503);
  const fresh = await fixture();
  fresh.data.set(indexKey(repository, revision, await shardFor(path)), Buffer.from('{}'));
  const failure = await createAssetDelivery()(request(), fresh);
  assert.equal(failure.status, 502); assert.equal(failure.headers.get('cache-control'), 'no-store');
  assert.equal(failure.headers.get('location'), null);
});
test('reader rejects unknown repos, moving refs, malformed escapes and writes', async () => {
  const f = await fixture(), serve = createAssetDelivery();
  for (const url of [request().url.replace(repository, 'private-repo'), request().url.replace(revision, 'main'), 'https://assets.arkpedia.net/%xx']) {
    assert.ok([400, 404].includes((await serve(new Request(url), f)).status));
  }
  assert.equal((await serve(request({}, 'POST'), f)).status, 405);
});
test('S3 uploads require the dedicated bucket, create-only writes and verified checksums', async () => {
  assert.throws(() => s3Store({}, 'arkpedia-opennext-cache'), /dedicated/);
  const calls = [];
  const md5 = createHash('md5').update(body).digest('hex');
  const store = s3Store({ send: async command => { calls.push(command.input); return { ETag: `"${md5}"` }; } }, 'arkpedia-public-assets');
  await store.put(objectKey(sha), body);
  assert.equal(calls[0].IfNoneMatch, '*');
  assert.equal(calls[0].ContentMD5, createHash('md5').update(body).digest('base64'));
  assert.equal(calls[0].Metadata.sha256, await sha256(body));
  await assert.rejects(s3Store({ send: async () => ({ ETag: 'wrong' }) }, 'arkpedia-public-assets').put(objectKey(sha), body), /checksum mismatch/);
});
test('racing conditional uploads accept identical bytes and reject immutable conflicts', async () => {
  const client = saved => ({ send: async command => {
    if (command.constructor.name === 'PutObjectCommand') throw { $metadata: { httpStatusCode: 412 } };
    return saved;
  } });
  const valid = { ContentLength: body.length, ETag: createHash('md5').update(body).digest('hex'), Metadata: { sha256: await sha256(body) } };
  await s3Store(client(valid), 'arkpedia-public-assets').put(objectKey(sha), body);
  await assert.rejects(s3Store(client({ ...valid, ContentLength: 1 }), 'arkpedia-public-assets').put(objectKey(sha), body), /conflict/);
});
