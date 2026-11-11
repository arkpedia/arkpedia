// One-time additive migration of generated JSON only. The source is read-only.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PREFIX, descriptor, indexKey, objectKey, publicFile, shardFor } from '../../workers/assets/contract.mjs';
import { boundedMap, publisherClient, verifyGitBlob } from './mirror-github-assets.mjs';
import { NATIVE_BUCKET, SOURCE_BUCKET, acquireNativeLease, nativePublisherClient, nativeStore } from './native-assets.mjs';

const hash = (kind, bytes) => createHash(kind).update(bytes).digest('hex');
const same = (a, b) => a.bytes === b.bytes && a.md5 === b.md5;
export async function planDedupData(source, destination) {
  const [receipts, blobs, existing] = await Promise.all([source.list(`${PREFIX}/ready/arkpedia-data/`), source.list(`${PREFIX}/objects/`), destination.list('')]);
  assert.ok(receipts.size, 'No completed generated-data revisions');
  const objects = new Map(), indexes = new Map(), ready = new Map(), samples = [], cache = new Map();
  let cachedBytes = 0;
  async function indexBody(key, digest) {
    if (cache.has(digest)) return cache.get(digest).promise;
    const entry = { bytes: 0 };
    entry.promise = source.get(key, 5_000_000).then(body => {
      assert.equal(hash('sha256', body), digest, 'Corrupt generated-data index');
      entry.bytes = body.length; cachedBytes += body.length;
      for (const [digest, saved] of cache) {
        if (cachedBytes <= 64_000_000) break;
        if (saved.bytes) { cache.delete(digest); cachedBytes -= saved.bytes; }
      }
      return body;
    });
    cache.set(digest, entry);
    return entry.promise;
  }
  for (const [key, listed] of [...receipts].sort(([a], [b]) => a.localeCompare(b))) {
    const match = /^github-v1\/ready\/arkpedia-data\/([a-f0-9]{40})\.json$/.exec(key);
    assert.ok(match, 'Unexpected data readiness key');
    const revision = match[1], body = await source.get(key, 1_000_000), receipt = JSON.parse(body);
    assert.ok(same(listed, { bytes: body.length, md5: hash('md5', body) }), 'Data readiness changed during inventory');
    assert.ok(receipt.version === 1 && receipt.repository === 'arkpedia-data' && receipt.revision === revision && receipt.shards, 'Invalid data readiness');
    for (const ref of receipt.references || []) assert.ok(ref.repository !== 'arkpedia-data'
      && existing.has(`__ready/${ref.repository}/${ref.revision}`), 'Referenced media must finish native backfill before data migration');
    let count = 0, bytes = 0, sample;
    const paths = new Set();
    await boundedMap(Object.entries(receipt.shards), 8, async ([shard, digest]) => {
      assert.ok(/^[a-f0-9]{64}$/.test(shard) && /^[a-f0-9]{64}$/.test(digest), 'Invalid data shard');
      const key = indexKey('arkpedia-data', revision, shard), body = await indexBody(key, digest);
      indexes.set(key, { body, bytes: body.length, md5: hash('md5', body) });
      for (const [path, file] of Object.entries(JSON.parse(body))) {
        assert.ok(publicFile('arkpedia-data', path) && descriptor(file) && await shardFor(path) === shard && !paths.has(path), 'Invalid generated JSON descriptor');
        paths.add(path); count++; bytes += file.bytes;
        const blob = blobs.get(objectKey(file.sha));
        assert.ok(blob && blob.bytes === file.bytes, 'Missing generated JSON blob');
        objects.set(objectKey(file.sha), { ...blob, ...file, path });
        if (!sample || path === 'release/manifest.json') sample = { repository: 'arkpedia-data', revision, path, ...file };
      }
    });
    assert.ok(count === receipt.files && bytes === receipt.bytes && count > 0, 'Generated JSON receipt count mismatch');
    ready.set(key, { body, bytes: body.length, md5: hash('md5', body) }); samples.push(sample);
  }
  let newBytes = 0, newObjects = 0, existingBytes = 0;
  for (const file of existing.values()) { assert.ok(Number.isSafeInteger(file.bytes) && file.bytes >= 0); existingBytes += file.bytes; }
  for (const [key, file] of [...objects, ...indexes, ...ready]) {
    if (existing.has(key)) assert.ok(same(existing.get(key), file), 'Immutable unified data conflict');
    else { newBytes += file.bytes; newObjects++; }
  }
  assert.ok(Number.isSafeInteger(existingBytes + newBytes), 'Unsafe data inventory size');
  return { objects, indexes, ready, existing, summary: { revisions: ready.size, uniqueDataBlobs: objects.size,
    deduplicatedDataBytes: [...objects.values()].reduce((n, file) => n + file.bytes, 0), existingBytes, newBytes, newObjects, totalBytes: existingBytes + newBytes, samples } };
}

export async function publishDedupData(plan, source, destination, { maxNewBytes, maxTotalBytes, log = console.log }) {
  assert.ok(Number.isSafeInteger(maxNewBytes) && maxNewBytes >= 0 && Number.isSafeInteger(maxTotalBytes) && maxTotalBytes > 0, 'Explicit integer data migration budgets required');
  assert.ok(plan.summary.newBytes <= maxNewBytes && plan.summary.totalBytes <= maxTotalBytes, 'Data migration storage budget exceeded');
  let copied = 0;
  await boundedMap([...plan.objects].filter(([key]) => !plan.existing.has(key)), 8, async ([key, file]) => {
    const body = await source.get(key, file.bytes); verifyGitBlob(body, file);
    assert.equal(hash('md5', body), file.md5, 'Generated JSON blob changed during migration');
    await destination.put(key, body, 'application/octet-stream');
    if (++copied % 1000 === 0) log(JSON.stringify({ generatedDataBlobsCopied: copied }));
  });
  await boundedMap([...plan.indexes].filter(([key]) => !plan.existing.has(key)), 8, async ([key, file]) => destination.put(key, file.body, 'application/json'));
  // All bodies and indexes succeed before any newly migrated revision is ready.
  for (const [key, file] of plan.ready) if (!plan.existing.has(key)) await destination.put(key, file.body, 'application/json');
}

export async function main(args = process.argv.slice(2)) {
  const options = {};
  for (const arg of args) {
    const [key, ...value] = arg.split('=');
    assert.ok(['--apply', '--report', '--max-new-bytes', '--max-total-bytes'].includes(key) && !(key in options), 'Invalid data-migration option');
    assert.ok(key === '--apply' ? !value.length : value.join('='), 'Invalid data-migration value'); options[key] = value.join('=');
  }
  const client = publisherClient(), target = nativePublisherClient();
  let lease, heartbeat;
  try {
    if ('--apply' in options) {
      lease = await acquireNativeLease(target);
      heartbeat = setInterval(() => { lease.renew().catch(() => {}); }, 60_000); heartbeat.unref();
    }
    const source = nativeStore(client, SOURCE_BUCKET), destination = lease?.destination || nativeStore(target, NATIVE_BUCKET);
    const plan = await planDedupData(source, destination);
    console.log(JSON.stringify(plan.summary, null, 2));
    if (lease) {
      lease.assertValid();
      await publishDedupData(plan, source, destination, { maxNewBytes: Number(options['--max-new-bytes']), maxTotalBytes: Number(options['--max-total-bytes']) });
      lease.assertValid();
    }
    if (options['--report']) await writeFile(options['--report'], JSON.stringify({ observedAt: new Date().toISOString(), applied: !!lease, ...plan.summary }, null, 2));
  } finally {
    clearInterval(heartbeat);
    try { await lease?.release(); } finally { client.destroy(); target.destroy(); }
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
