// Inactive portable adapter for the existing front Worker. No routes/bindings enabled here.
import { releaseManifest, stagingPointer } from './deliveryManifest.mjs';
import { contentFileUrlPath } from './pagePaths.mjs';

export const DELIVERY_PREFIX = '/__content/pilot/';
const HASH = /^[a-f0-9]{64}$/;
const REVISION = /^[a-f0-9]{40}$/;
const objectKey = hash => `pilot-v1/objects/${hash}`;
const digest = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');

export function deliveryBaseUrl(origin, reference, { allowLocalHttp = false } = {}) {
  const url = new URL(origin);
  const localTest = allowLocalHttp && url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname);
  if (url.protocol !== 'https:' && !localTest || url.username || url.password || url.pathname !== '/' || url.search || url.hash
    || !HASH.test(reference?.manifestSha256 ?? '') || !REVISION.test(reference?.revision ?? '')) throw new Error('Invalid immutable delivery reference');
  return `${url.origin}${DELIVERY_PREFIX}${reference.manifestSha256}/${reference.revision}/release`;
}

async function boundedBody(body, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of body) {
    const bytes = new Uint8Array(chunk);
    size += bytes.byteLength;
    if (size > limit) throw new Error('Delivery response exceeds size limit');
    chunks.push(bytes);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

async function bucketBytes(bucket, key, maxBytes) {
  const value = await bucket.get(key);
  if (!value) throw new Error('Missing delivery object');
  if (!Number.isSafeInteger(value.size) || value.size < 1 || value.size > maxBytes) throw new Error('Delivery object exceeds size limit');
  const bytes = value.body ? await boundedBody(value.body, maxBytes) : new Uint8Array(await value.arrayBuffer());
  if (bytes.byteLength > maxBytes || bytes.byteLength !== value.size) throw new Error('Invalid delivery object length');
  return bytes;
}

/** Reuse one handler per isolate. All reads stay pinned; no request reads a channel pointer. */
export function createR2Delivery({ bucket, cache, fallbackToGithub = false, serveStagingPointer = false, fetchImpl = fetch, manifestCacheSize = 2, maxActiveReads = 2, maxQueuedReads = 16 }) {
  if (!bucket?.get || !Number.isInteger(manifestCacheSize) || manifestCacheSize < 1 || manifestCacheSize > 4
    || !Number.isInteger(maxActiveReads) || maxActiveReads < 1 || maxActiveReads > 4
    || !Number.isInteger(maxQueuedReads) || maxQueuedReads < 0 || maxQueuedReads > 32) throw new Error('Invalid delivery reader configuration');
  const manifests = new Map(), pending = new Map();
  let active = 0;
  const waiting = [];
  function admit(request) {
    if (request.signal.aborted) return Promise.resolve(false);
    if (active < maxActiveReads) { active++; return Promise.resolve(true); }
    if (waiting.length >= maxQueuedReads) return Promise.resolve(false);
    return new Promise(resolve => {
      const entry = { request, resolve, abort: () => {
        const index = waiting.indexOf(entry);
        if (index !== -1) waiting.splice(index, 1);
        resolve(false);
      } };
      waiting.push(entry);
      request.signal.addEventListener('abort', entry.abort, { once: true });
    });
  }
  function release() {
    active--;
    while (waiting.length && active < maxActiveReads) {
      const entry = waiting.shift();
      entry.request.signal.removeEventListener('abort', entry.abort);
      if (entry.request.signal.aborted) { entry.resolve(false); continue; }
      active++; entry.resolve(true);
    }
  }
  async function load(reference, path, sha256, limit) {
    const check = async bytes => {
      if (await digest(bytes) !== sha256) throw new Error('Delivery checksum mismatch');
      return bytes;
    };
    try { return { bytes: await check(await bucketBytes(bucket, objectKey(sha256), limit)), source: 'r2' }; }
    catch {
      if (!fallbackToGithub) throw new Error('Verified delivery object unavailable');
      // Fixed public repository and exact revision only; never forward reader credentials.
      const url = `https://raw.githubusercontent.com/arkpedia/arkpedia-data/${reference.revision}/release/${contentFileUrlPath(path)}`;
      const response = await fetchImpl(url, { redirect: 'error', credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(10_000) });
      if (!response.ok || !response.body || !response.headers.get('content-encoding') && Number(response.headers.get('content-length')) > limit) {
        await response.body?.cancel(); throw new Error('Pinned fallback unavailable');
      }
      return { bytes: await check(await boundedBody(response.body, limit)), source: 'github-fallback' };
    }
  }
  async function manifest(reference) {
    // Hash alone identifies manifest bytes; revision stays in the key for truthful fallback provenance.
    const key = `${reference.manifestSha256}:${reference.revision}`;
    if (manifests.has(key)) return manifests.get(key);
    if (pending.has(key)) return pending.get(key);
    const operation = (async () => {
      const result = await load(reference, 'manifest.json', reference.manifestSha256, 5_000_000);
      const parsed = { ...releaseManifest(result.bytes), ...result };
      if (manifests.size >= manifestCacheSize) manifests.delete(manifests.keys().next().value);
      manifests.set(key, parsed);
      return parsed;
    })();
    pending.set(key, operation);
    try { return await operation; } finally { pending.delete(key); }
  }
  const headers = () => new Headers({ 'access-control-allow-origin': '*', 'x-content-type-options': 'nosniff',
    'x-robots-tag': 'noindex, nofollow', 'cache-control': 'no-store' });
  const failure = (status, message, extra = {}) => new Response(message, { status, headers: { ...Object.fromEntries(headers()), ...extra } });
  function respond(request, response, cacheState) {
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set('x-arkpedia-content-cache', cacheState);
    const conditions = (request.headers.get('if-none-match') ?? '').split(',').map(value => value.trim().replace(/^W\//, ''));
    if (conditions.includes(responseHeaders.get('etag')) || conditions.includes('*')) {
      responseHeaders.delete('content-length');
      return new Response(null, { status: 304, headers: responseHeaders });
    }
    return new Response(request.method === 'HEAD' ? null : response.body, { status: 200, headers: responseHeaders });
  }
  return async function handle(request) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith(DELIVERY_PREFIX)) return null;
    if (request.method !== 'GET' && request.method !== 'HEAD') return failure(405, 'Method not allowed', { allow: 'GET, HEAD' });
    if (serveStagingPointer && url.pathname === `${DELIVERY_PREFIX}current.json`) {
      if (!await admit(request)) return failure(503, 'Delivery reader busy', { 'retry-after': '1' });
      try {
        const bytes = await bucketBytes(bucket, 'pilot-v1/channels/staging.json', 2048);
        const pointer = stagingPointer(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
        const index = await manifest(pointer);
        if (index.manifest.release !== pointer.release || index.bytes.length !== pointer.manifestBytes) return failure(502, 'Pointer and snapshot disagree');
        // Existing app contract, without publisher ETag/generation or storage keys.
        const body = JSON.stringify({ schema: 2, release: pointer.release, revision: pointer.revision, manifestSha256: pointer.manifestSha256 });
        const responseHeaders = headers();
        responseHeaders.set('content-type', 'application/json; charset=utf-8');
        responseHeaders.set('content-length', String(new TextEncoder().encode(body).byteLength));
        responseHeaders.set('x-arkpedia-content', 'r2-pilot-pointer');
        return new Response(request.method === 'HEAD' ? null : body, { status: 200, headers: responseHeaders });
      } catch { return failure(502, 'Verified staging pointer unavailable'); }
      finally { release(); }
    }
    const match = url.pathname.slice(DELIVERY_PREFIX.length).match(/^([a-f0-9]{64})\/([a-f0-9]{40})\/release\/(.+)$/);
    if (!match) return failure(400, 'Invalid immutable delivery path');
    let path;
    try { path = match[3].split('/').map(decodeURIComponent).join('/'); }
    catch { return failure(400, 'Invalid delivery encoding'); }
    if (contentFileUrlPath(path) !== match[3] || path !== 'manifest.json' && (!/^(pages|public)\//.test(path)
      // eslint-disable-next-line no-control-regex -- Storage paths must reject ASCII control bytes.
      || /[\\?#\x00-\x1f\x7f]/.test(path) || path.split('/').some(part => !part || part === '.' || part === '..'))) return failure(400, 'Invalid delivery path');
    // Immutable content ignores query strings; private request headers are never cache keys.
    const cacheUrl = new URL(url); cacheUrl.search = ''; cacheUrl.hash = '';
    const cacheKey = new Request(cacheUrl, { method: 'GET' });
    if (cache) {
      try {
        const hit = await cache.match(cacheKey);
        if (hit?.status === 200 && /^"[a-f0-9]{64}"$/.test(hit.headers.get('etag') ?? '') && !hit.headers.has('set-cookie')) return respond(request, hit, 'HIT');
      } catch { /* A cache failure must not take down verified origin delivery. */ }
    }
    if (!await admit(request)) return failure(503, 'Delivery reader busy', { 'retry-after': '1' });
    try {
      const reference = { manifestSha256: match[1], revision: match[2] };
      const index = await manifest(reference);
      const file = path === 'manifest.json' ? { sha256: reference.manifestSha256, bytes: index.bytes.length } : index.objects.get(path);
      if (!file) return failure(404, 'File absent from snapshot');
      const result = path === 'manifest.json' ? index : await load(reference, path, file.sha256, file.bytes);
      if (result.bytes.byteLength !== file.bytes) return failure(502, 'Invalid delivery length');
      const responseHeaders = headers();
      const etag = `"${file.sha256}"`;
      responseHeaders.set('etag', etag);
      responseHeaders.set('cache-control', 'public, max-age=31536000, immutable');
      responseHeaders.set('content-type', path.endsWith('.json') ? 'application/json; charset=utf-8' : 'application/octet-stream');
      responseHeaders.set('x-arkpedia-content', index.source === 'github-fallback' ? 'github-fallback' : result.source);
      responseHeaders.set('content-length', String(result.bytes.byteLength));
      const response = new Response(result.bytes, { status: 200, headers: responseHeaders });
      let cacheState = 'BYPASS';
      if (cache) {
        try { await cache.put(cacheKey, response.clone()); cacheState = 'MISS'; }
        catch { /* Keep a verified response usable when the local cache is unavailable. */ }
      }
      return respond(request, response, cacheState);
    } catch { return failure(502, 'Verified snapshot unavailable'); }
    finally { release(); }
  };
}
