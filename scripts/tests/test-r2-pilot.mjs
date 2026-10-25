import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pinnedSnapshotSource } from '../content/r2-source.mjs';
import { parsePilotArguments, runPilot } from '../content/r2-pilot.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const revision = 'a'.repeat(40);
function fixture() {
  const body = Buffer.from('{"props":{"title":"pilot"}}');
  const file = { path: 'pages/index.json', sha256: sha(body), bytes: body.length };
  const manifestBytes = Buffer.from(JSON.stringify({ schema: 2, release: sha('release'),
    assets: { 'arkpedia-image-assets': 'b'.repeat(40), 'arkpedia-skin-assets': 'c'.repeat(40) },
    pages: { '/': file }, files: { alias: { ...file, path: 'public/alias.json' } } }));
  return { body, file, manifestBytes };
}
async function temporary(run) {
  const directory = await mkdtemp(join(tmpdir(), 'arkpedia-r2-cli-'));
  try { await run(directory); } finally { await rm(directory, { recursive: true, force: true }); }
}
function memoryBucket() {
  const objects = new Map();
  return { objects, async get(key) { const bytes = objects.get(key); return bytes ? {
    etag: sha(bytes), size: bytes.length, text: async () => bytes.toString(), arrayBuffer: async () => bytes,
  } : null; }, async put(key, value, { onlyIf }) {
    const old = objects.get(key);
    if (onlyIf.etagDoesNotMatch === '*' && old || onlyIf.etagMatches && (!old || sha(old) !== onlyIf.etagMatches)) return null;
    const bytes = Buffer.from(value); objects.set(key, bytes); return { etag: sha(bytes) };
  } };
}

test('CLI rejects ambiguous commands, missing pins, credentials on argv and unsafe concurrency', () => {
  assert.deepEqual(parsePilotArguments(['--help']), { command: 'help' });
  assert.equal(parsePilotArguments(['inspect', '--bucket', 'pilot-bucket']).command, 'inspect');
  for (const args of [[], ['deploy'], ['inspect'], ['inspect', '--bucket', 'pilot-bucket', '--bucket', 'other'],
    ['inspect', '--bucket', 'pilot-bucket', '--secret', 'never-print'],
    ['stage', '--bucket', 'pilot-bucket', '--revision', 'main', '--cache', 'cache'],
    ['stage', '--bucket', 'pilot-bucket', '--revision', revision, '--cache', 'cache', '--concurrency', '9'],
    ['promote', '--bucket', 'pilot-bucket', '--candidate', 'candidate.json']]) assert.throws(() => parsePilotArguments(args));
});

test('source uses exact public revision, verifies cached bodies, and never fetches missing data by default', async () => temporary(async directory => {
  const { body, file, manifestBytes } = fixture(), calls = [];
  const fetchImpl = async (url, options) => { calls.push(url); assert.equal(options.redirect, 'error'); assert.equal(options.credentials, 'omit'); return new Response(manifestBytes); };
  const source = await pinnedSnapshotSource({ revision, cacheDirectory: directory, fetchImpl });
  assert.deepEqual(calls, [`https://raw.githubusercontent.com/arkpedia/arkpedia-data/${revision}/release/manifest.json`]);
  await assert.rejects(source.readFile(file.path), /Missing cached/);
  assert.equal(calls.length, 1);
  await writeFile(join(directory, file.sha256), body);
  assert.deepEqual(await source.readFile(file.path), body);
  await writeFile(join(directory, file.sha256), Buffer.alloc(body.length, 0));
  await assert.rejects(source.readFile(file.path), /checksum mismatch/);
  await assert.rejects(source.readFile('../secret'), /absent/);
}));

test('explicit acquisition shares concurrent duplicate hashes and publishes complete cache files only', async () => temporary(async directory => {
  const { body, file, manifestBytes } = fixture();
  const cache = join(directory, 'objects');
  let payloadReads = 0;
  const source = await pinnedSnapshotSource({ revision, cacheDirectory: cache, fetchMissing: true,
    fetchImpl: async url => {
      if (url.endsWith('/manifest.json')) return new Response(manifestBytes);
      payloadReads++; await new Promise(resolve => setImmediate(resolve)); return new Response(body);
    } });
  const bodies = await Promise.all([source.readFile(file.path), source.readFile('public/alias.json')]);
  assert.ok(bodies.every(value => value.equals(body)));
  assert.equal(payloadReads, 1);
  assert.deepEqual(await readdir(cache), [file.sha256]);
  assert.deepEqual(await readFile(join(cache, file.sha256)), body);
}));

test('bad cache or oversized/download-corrupt sources cannot be silently repaired or cached', async () => temporary(async directory => {
  const { body, file, manifestBytes } = fixture();
  await mkdir(join(directory, 'bad-cache'));
  await writeFile(join(directory, 'bad-cache', file.sha256), Buffer.alloc(body.length + 1));
  let payloadReads = 0;
  const fetchImpl = async url => {
    if (url.endsWith('/manifest.json')) return new Response(manifestBytes);
    payloadReads++; return new Response(Buffer.alloc(body.length, 0));
  };
  const cached = await pinnedSnapshotSource({ revision, cacheDirectory: join(directory, 'bad-cache'), fetchMissing: true, fetchImpl });
  await assert.rejects(cached.readFile(file.path), /size limit/);
  assert.equal(payloadReads, 0);
  const missing = await pinnedSnapshotSource({ revision, cacheDirectory: join(directory, 'new-cache'), fetchMissing: true, fetchImpl });
  await assert.rejects(missing.readFile(file.path), /checksum mismatch/);
  await assert.rejects(readdir(join(directory, 'new-cache')), { code: 'ENOENT' });
  await assert.rejects(pinnedSnapshotSource({ revision, cacheDirectory: directory,
    fetchImpl: async () => new Response('x', { headers: { 'content-length': '5000001' } }) }), /size limit/);
  await assert.rejects(pinnedSnapshotSource({ revision, cacheDirectory: directory,
    fetchImpl: async () => new Response('missing', { status: 404 }) }), /HTTP 404/);
}));

test('source limits count decoded streamed bytes, including compressed tiny files', async () => temporary(async directory => {
  const { body, file, manifestBytes } = fixture();
  const source = await pinnedSnapshotSource({ revision, cacheDirectory: directory, fetchMissing: true,
    fetchImpl: async url => url.endsWith('/manifest.json') ? new Response(manifestBytes) :
      new Response(body, { headers: { 'content-encoding': 'gzip', 'content-length': String(body.length + 20) } }) });
  assert.deepEqual(await source.readFile(file.path), body, 'declared wire size may exceed decoded size');
  const overflow = await pinnedSnapshotSource({ revision, cacheDirectory: join(directory, 'overflow'), fetchMissing: true,
    fetchImpl: async url => url.endsWith('/manifest.json') ? new Response(manifestBytes) :
      new Response(new ReadableStream({ start(controller) { controller.enqueue(body); controller.enqueue(new Uint8Array([0])); controller.close(); } })) });
  await assert.rejects(overflow.readFile(file.path), /size limit/);
  await assert.rejects(readdir(join(directory, 'overflow')), { code: 'ENOENT' });
}));

test('existing compiled release output seeds the cache without per-file network requests', async () => temporary(async directory => {
  const { body, file, manifestBytes } = fixture();
  const sourceDirectory = join(directory, 'release'), cache = join(directory, 'objects');
  await mkdir(join(sourceDirectory, 'pages'), { recursive: true });
  await writeFile(join(sourceDirectory, file.path), body);
  let manifestRequests = 0;
  const source = await pinnedSnapshotSource({ revision, cacheDirectory: cache, sourceDirectory, fetchImpl: async url => {
    assert.ok(url.endsWith('/manifest.json'), 'bulk handoff makes no per-payload GitHub request');
    manifestRequests++; return new Response(manifestBytes);
  } });
  assert.deepEqual(await source.readFile(file.path), body);
  assert.deepEqual(await readFile(join(cache, file.sha256)), body);
  assert.deepEqual(await source.readFile('public/alias.json'), body, 'later logical paths reuse the verified hash cache');
  assert.equal(manifestRequests, 1);
  const options = parsePilotArguments(['stage', '--bucket', 'pilot-bucket', '--revision', revision, '--cache', cache, '--source', sourceDirectory]);
  assert.equal(options.source, sourceDirectory);
  let observed;
  await runPilot(options, { bucket: memoryBucket(), source: async input => {
    observed = input; return { revision, manifestBytes, readFile: async () => body };
  } });
  assert.equal(observed.sourceDirectory, sourceDirectory);
}));

test('dirty or missing compiled release files cannot replace the pinned canonical bytes', async () => temporary(async directory => {
  const { body, file, manifestBytes } = fixture(), sourceDirectory = join(directory, 'release');
  await mkdir(join(sourceDirectory, 'pages'), { recursive: true });
  await writeFile(join(sourceDirectory, file.path), Buffer.alloc(body.length, 0));
  const source = await pinnedSnapshotSource({ revision, sourceDirectory, cacheDirectory: join(directory, 'cache'),
    fetchMissing: true, fetchImpl: async url => { assert.ok(url.endsWith('/manifest.json')); return new Response(manifestBytes); } });
  await assert.rejects(source.readFile(file.path), /checksum mismatch/, 'dirty local files fail even when network acquisition is enabled');
  await assert.rejects(readdir(join(directory, 'cache')), { code: 'ENOENT' });
  const missing = await pinnedSnapshotSource({ revision, sourceDirectory: join(directory, 'absent'), cacheDirectory: join(directory, 'cache'),
    fetchImpl: async () => new Response(manifestBytes) });
  await assert.rejects(missing.readFile(file.path), /Missing cached/);
}));

test('CLI stages without promotion, promotes with saved precondition, and rejects stale rollback', async () => temporary(async directory => {
  const fixtureSource = fixture(), bucket = memoryBucket();
  const source = async () => ({ ...fixtureSource, revision, readFile: async () => fixtureSource.body });
  const expected = await runPilot({ command: 'inspect' }, { bucket });
  const candidate = await runPilot({ command: 'stage', concurrency: 2, revision, cache: directory }, { bucket, source });
  assert.deepEqual(await runPilot({ command: 'inspect' }, { bucket }), expected);
  const candidatePath = join(directory, 'candidate.json'), expectedPath = join(directory, 'expected.json');
  await writeFile(candidatePath, JSON.stringify(candidate)); await writeFile(expectedPath, JSON.stringify(expected));
  const options = { command: 'promote', candidate: candidatePath, expected: expectedPath, concurrency: 2 };
  const first = await runPilot(options, { bucket });
  assert.equal(first.generation, 1);
  await assert.rejects(runPilot(options, { bucket }), /Stale/);
  assert.deepEqual(await runPilot({ command: 'inspect' }, { bucket }), first);
  await writeFile(expectedPath, '{not-json');
  await assert.rejects(runPilot(options, { bucket }), /valid JSON/);
  await writeFile(expectedPath, ' '.repeat(8193));
  await assert.rejects(runPilot(options, { bucket }), /size limit/);
}));
