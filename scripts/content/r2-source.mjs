// Public, commit-pinned source acquisition for the inactive R2 pilot.
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, writeFile, link, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { releaseManifest } from './r2-snapshot.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');

export async function readPilotFile(path, maxBytes) {
  const handle = await open(path, 'r');
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile() || metadata.size > maxBytes) throw new Error('Pilot input file exceeds size limit');
    const bytes = Buffer.alloc(Math.min(metadata.size + 1, maxBytes + 1));
    let size = 0;
    while (size < bytes.length) {
      const { bytesRead } = await handle.read(bytes, size, bytes.length - size, null);
      if (!bytesRead) break;
      size += bytesRead;
    }
    if (size > metadata.size) throw new Error('Pilot input file changed while reading');
    return bytes.subarray(0, size);
  } finally { await handle.close(); }
}

async function download(url, maxBytes, fetchImpl) {
  const response = await fetchImpl(url, {
    redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new Error(`Pinned source unavailable (HTTP ${response.status})`);
  }
  // Fetch decodes compressed bodies; Content-Length may describe their wire size.
  if (!response.headers.get('content-encoding') && Number(response.headers.get('content-length')) > maxBytes) {
    await response.body.cancel();
    throw new Error('Pinned source exceeds size limit');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > maxBytes) throw new Error('Pinned source exceeds size limit');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/** Re-fetch the original manifest at an explicit commit; never trust a cached index. */
export async function pinnedSnapshotSource({ revision, cacheDirectory, sourceDirectory, fetchMissing = false, fetchImpl = fetch }) {
  if (!/^[a-f0-9]{40}$/.test(revision ?? '')) throw new Error('A full pinned source revision is required');
  if (typeof cacheDirectory !== 'string' || !cacheDirectory) throw new Error('An explicit object cache directory is required');
  if (sourceDirectory !== undefined && (typeof sourceDirectory !== 'string' || !sourceDirectory)) throw new Error('Invalid source release directory');
  const base = `https://raw.githubusercontent.com/arkpedia/arkpedia-data/${revision}/release/`;
  const manifestBytes = await download(`${base}manifest.json`, 5_000_000, fetchImpl);
  const { objects } = releaseManifest(manifestBytes);
  const directory = resolve(cacheDirectory);
  const localSource = sourceDirectory === undefined ? undefined : resolve(sourceDirectory);
  const pending = new Map();
  const valid = (bytes, file) => {
    if (bytes.length !== file.bytes || digest(bytes) !== file.sha256) throw new Error(`Source checksum mismatch: ${file.key}`);
    return bytes;
  };
  async function load(path, file) {
    const target = join(directory, file.sha256);
    try { return valid(await readPilotFile(target, file.bytes), file); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    let bytes;
    if (localSource) {
      try { bytes = valid(await readPilotFile(join(localSource, path), file.bytes), file); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    if (!bytes) {
      if (!fetchMissing) throw new Error(`Missing cached source object: ${file.sha256}; provide --source or enable --fetch-missing to acquire it`);
      bytes = valid(await download(`${base}${path.split('/').map(encodeURIComponent).join('/')}`, file.bytes, fetchImpl), file);
    }
    await mkdir(directory, { recursive: true });
    const temporary = join(directory, `.${file.sha256}-${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, bytes, { flag: 'wx' });
      // Create-only publication: interruption cannot leave a partial hash object.
      try { await link(temporary, target); }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
      return valid(await readPilotFile(target, file.bytes), file);
    } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  }
  return { manifestBytes, revision, readFile: async path => {
    const file = objects.get(path);
    if (!file) throw new Error('Path absent from pinned manifest');
    // Only concurrent reads share a body; do not retain the entire snapshot in RAM.
    if (!pending.has(file.key)) {
      const operation = load(path, file);
      pending.set(file.key, operation);
      operation.then(() => pending.delete(file.key), () => pending.delete(file.key));
    }
    return pending.get(file.key);
  } };
}
