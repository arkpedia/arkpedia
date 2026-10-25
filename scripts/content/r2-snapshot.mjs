// Staging-only delivery pilot. Does not change any website reader or production pointer.
import { createHash } from 'node:crypto';
import { releaseManifest, stagingPointer } from '../../lib/content/deliveryManifest.mjs';
export { releaseManifest } from '../../lib/content/deliveryManifest.mjs';

const REVISION = /^[a-f0-9]{40}$/;
const PREFIX = 'pilot-v1/';
const POINTER = `${PREFIX}channels/staging.json`;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const encode = value => Buffer.from(JSON.stringify(value));
const objectKey = sha => `${PREFIX}objects/${sha}`;
const record = value => value && typeof value === 'object' && !Array.isArray(value);

function parallelism(value) {
  if (!Number.isInteger(value) || value < 1 || value > 8) throw new Error('Pilot concurrency must be an integer from 1 to 8');
  return value;
}
async function each(values, concurrency, visit) {
  let next = 0, failed = false, failure;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (!failed && next < values.length) {
      const value = values[next++];
      try { await visit(value); }
      catch (error) { if (!failed) { failed = true; failure = error; } }
    }
  }));
  // Do not report failure while an in-flight immutable write can still finish.
  if (failed) throw failure;
}

async function verified(bucket, key, sha, size) {
  const value = await bucket.get(key);
  if (!value) throw new Error(`Missing delivery object: ${key}`);
  const bytes = Buffer.from(await value.arrayBuffer());
  if (bytes.length !== size || digest(bytes) !== sha) throw new Error(`Delivery checksum mismatch: ${key}`);
  return bytes;
}

async function immutable(bucket, key, bytes) {
  const existing = await bucket.get(key);
  if (existing) {
    const stored = Buffer.from(await existing.arrayBuffer());
    if (stored.length !== bytes.length || digest(stored) !== digest(bytes)) throw new Error(`Delivery checksum mismatch: ${key}`);
    return;
  }
  // R2's conditional PUT returns null on a failed precondition. Existing content
  // is verified rather than overwritten, including after a competing upload.
  await bucket.put(key, bytes, { onlyIf: { etagDoesNotMatch: '*' } });
  await verified(bucket, key, digest(bytes), bytes.length);
}

/** Mirror an already validated release. Its original manifest is the snapshot index. */
export async function stageSnapshot({ bucket, manifestBytes, revision, readFile, concurrency = 4 }) {
  const limit = parallelism(concurrency);
  if (!REVISION.test(revision)) throw new Error('A pinned source revision is required');
  const bytes = Buffer.from(manifestBytes);
  const { manifest, objects } = releaseManifest(bytes);
  const uploads = new Map();
  await each([...objects], limit, async ([path, value]) => {
    const body = Buffer.from(await readFile(path));
    if (body.length !== value.bytes || digest(body) !== value.sha256) throw new Error(`Source checksum mismatch: ${path}`);
    if (!uploads.has(value.key)) uploads.set(value.key, immutable(bucket, value.key, body));
    await uploads.get(value.key);
  });
  const manifestSha256 = digest(bytes);
  await immutable(bucket, objectKey(manifestSha256), bytes);
  return { manifestSha256, manifestBytes: bytes.length, revision, release: manifest.release, objectCount: objects.size };
}

export async function readStagingPointer(bucket) {
  const object = await bucket.get(POINTER);
  if (!object) return { etag: null, generation: 0, value: null };
  if (object.size > 2048) throw new Error('Staging pointer too large');
  const text = await object.text();
  if (Buffer.byteLength(text) > 2048) throw new Error('Staging pointer too large');
  const value = stagingPointer(JSON.parse(text));
  return { etag: object.etag, generation: value.generation, value };
}

/** Promote or roll back to a previously staged, fully verified immutable snapshot. */
export async function promoteStagingSnapshot({ bucket, candidate, expected, concurrency = 4 }) {
  const limit = parallelism(concurrency);
  if (!expected || !(expected.etag === null || typeof expected.etag === 'string') || !Number.isSafeInteger(expected.generation) || expected.generation < 0
    || (expected.etag === null) !== (expected.generation === 0)) throw new Error('Explicit pointer precondition required');
  if (!record(candidate)) throw new Error('Invalid staging candidate');
  const value = stagingPointer({ format: 1, manifestSha256: candidate.manifestSha256, manifestBytes: candidate.manifestBytes,
    revision: candidate.revision, release: candidate.release, generation: expected.generation + 1 });
  // Avoid an entire snapshot scan for an already stale caller. This is only an
  // optimization: the final conditional PUT still protects a race after this read.
  const current = await readStagingPointer(bucket);
  if (current.etag !== expected.etag || current.generation !== expected.generation) throw new Error('Stale staging publisher: pointer changed');
  const bytes = await verified(bucket, objectKey(value.manifestSha256), value.manifestSha256, value.manifestBytes);
  const { manifest, objects } = releaseManifest(bytes);
  if (manifest.release !== value.release) throw new Error('Candidate release and manifest disagree');
  const unique = new Map([...objects.values()].map(value => [value.key, value]));
  await each([...unique.values()], limit, async object => {
    await verified(bucket, object.key, object.sha256, object.bytes);
  });
  const onlyIf = expected.etag === null ? { etagDoesNotMatch: '*' } : { etagMatches: expected.etag };
  const result = await bucket.put(POINTER, encode(value), { onlyIf });
  if (!result) throw new Error('Stale staging publisher: pointer changed');
  return { etag: result.etag, generation: value.generation, value };
}
