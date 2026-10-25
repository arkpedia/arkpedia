import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { S3Client } from '@aws-sdk/client-s3';
import { r2S3Bucket, createR2PilotClient } from '../content/r2-s3.mjs';
import { stageSnapshot, readStagingPointer, promoteStagingSnapshot } from '../content/r2-snapshot.mjs';
const sha = value => createHash('sha256').update(value).digest('hex');
const md5 = value => createHash('md5').update(value).digest('hex');
const POINTER = 'pilot-v1/channels/staging.json';
const KEY = `pilot-v1/objects/${'a'.repeat(64)}`;

test('actual S3 wire requests preserve immutable writes and atomic pointer conditions', async () => {
  const objects = new Map(), calls = [];
  const server = createServer(async (request, response) => {
    const key = decodeURIComponent(new URL(request.url, 'http://local').pathname).replace(/^\/pilot-bucket\//, '');
    calls.push({ method: request.method, key, match: request.headers['if-match'], none: request.headers['if-none-match'] });
    const current = objects.get(key);
    const failure = (status, code) => { response.writeHead(status, { 'content-type': 'application/xml' }); response.end(`<Error><Code>${code}</Code><Message>fixture</Message></Error>`); };
    if (request.method === 'GET') {
      if (!current) { failure(404, 'NoSuchKey'); return; }
      response.writeHead(200, { ETag: `"${md5(current)}"`, 'content-length': current.length }); response.end(current); return;
    }
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    if (request.headers['if-none-match'] === '*' && current || request.headers['if-match'] && request.headers['if-match'] !== (current && `"${md5(current)}"`)) { failure(412, 'PreconditionFailed'); return; }
    const bytes = Buffer.concat(chunks); objects.set(key, bytes);
    response.writeHead(200, { ETag: `"${md5(bytes)}"` }); response.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const client = new S3Client({ region: 'auto', endpoint: `http://127.0.0.1:${server.address().port}`, forcePathStyle: true,
    credentials: { accessKeyId: 'fixture-only', secretAccessKey: 'fixture-only-not-a-real-key' }, maxAttempts: 1,
    requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' });
  try {
    const bucket = r2S3Bucket({ client, bucketName: 'pilot-bucket' });
    const body = Buffer.from('{"props":{"title":"fixture"}}');
    const manifest = Buffer.from(JSON.stringify({ schema: 2, release: sha(body), assets: { 'arkpedia-image-assets': 'b'.repeat(40), 'arkpedia-skin-assets': 'c'.repeat(40) }, pages: { '/': { path: 'pages/index.json', bytes: body.length, sha256: sha(body) } }, files: {} }));
    const candidate = await stageSnapshot({ bucket, manifestBytes: manifest, revision: 'd'.repeat(40), readFile: async () => body });
    assert.equal((await readStagingPointer(bucket)).value, null);
    const first = await promoteStagingSnapshot({ bucket, candidate, expected: await readStagingPointer(bucket) });
    const second = await promoteStagingSnapshot({ bucket, candidate, expected: first });
    assert.equal(second.generation, 2);
    assert.deepEqual(JSON.parse(objects.get(POINTER)), second.value);
    assert.equal(await bucket.put(POINTER, Buffer.from('{}'), { onlyIf: { etagMatches: first.etag } }), null);
    assert.equal(await bucket.put(KEY, Buffer.from('one'), { onlyIf: { etagDoesNotMatch: '*' } }) !== null, true);
    assert.equal(await bucket.put(KEY, Buffer.from('two'), { onlyIf: { etagDoesNotMatch: '*' } }), null);
    const writes = calls.filter(call => call.method === 'PUT');
    assert.ok(writes.every(call => call.none === '*' || /^"[a-f0-9]{32}"$/.test(call.match ?? '')));
    assert.equal(writes.find(call => call.key === POINTER).none, '*');
    assert.equal(writes.filter(call => call.key === POINTER)[1].match, `"${first.etag}"`);
  } finally { client.destroy(); await new Promise(resolve => server.close(resolve)); }
});

test('missing buckets, auth failures and unexpected responses cannot masquerade as absent objects', async () => {
  for (const error of [Object.assign(new Error('must not echo credentials'), { name: 'NoSuchBucket', $metadata: { httpStatusCode: 404 } }), Object.assign(new Error('must not echo credentials'), { $metadata: { httpStatusCode: 403 } })]) {
    const bucket = r2S3Bucket({ client: { send: async () => { throw error; } }, bucketName: 'pilot-bucket' });
    await assert.rejects(bucket.get(KEY), failure => /R2 read failed/.test(failure.message) && !failure.message.includes('credentials'));
    await assert.rejects(bucket.put(KEY, Buffer.from('x'), { onlyIf: { etagDoesNotMatch: '*' } }), /R2 write failed/);
  }
});

test('invalid keys, unconditional writes and overlarge pointer bodies fail before network I/O', async () => {
  let calls = 0;
  const bucket = r2S3Bucket({ client: { send: async () => { calls++; } }, bucketName: 'pilot-bucket' });
  for (const key of ['live/current.json', 'pilot-v1/objects/../x', 'pilot-v1/channels/live.json']) {
    await assert.rejects(bucket.get(key), /Only staging/);
    await assert.rejects(bucket.put(key, Buffer.from('x'), { onlyIf: { etagDoesNotMatch: '*' } }), /Only staging/);
  }
  await assert.rejects(bucket.put(POINTER, Buffer.from('x')), /precondition/);
  await assert.rejects(bucket.put(KEY, Buffer.from('x'), { onlyIf: { etagMatches: 'old-etag' } }), /never replaced/);
  await assert.rejects(bucket.put(POINTER, Buffer.from('x'), { onlyIf: { etagMatches: 'etag\r\nInjected: x' } }), /ETag/);
  await assert.rejects(bucket.put(POINTER, Buffer.alloc(2049), { onlyIf: { etagDoesNotMatch: '*' } }), /limit/);
  assert.equal(calls, 0);
});

test('download bounds enforce actual streamed bytes as well as declared lengths', async () => {
  for (const ContentLength of [2049, undefined]) {
    const body = Readable.from([Buffer.alloc(1024), Buffer.alloc(1025)]);
    const bucket = r2S3Bucket({ client: { send: async () => ({ ETag: '"fixture"', ContentLength, Body: body }) }, bucketName: 'pilot-bucket' });
    await assert.rejects(bucket.get(POINTER), /body|limit/);
    assert.equal(body.destroyed, true);
  }
});

test('production client requires explicit R2 identity and bounded, single-attempt requests', async () => {
  assert.throws(() => createR2PilotClient({}), /Explicit R2/);
  const client = createR2PilotClient({ accountId: 'a'.repeat(32), accessKeyId: 'b'.repeat(32), secretAccessKey: 'c'.repeat(64) });
  try {
    assert.equal(await client.config.region(), 'auto');
    assert.equal(await client.config.maxAttempts(), 1);
    assert.equal((await client.config.endpoint()).hostname, `${'a'.repeat(32)}.r2.cloudflarestorage.com`);
  } finally { client.destroy(); }
});
