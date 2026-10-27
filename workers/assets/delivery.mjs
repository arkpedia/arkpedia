import { COMMIT, MAX_BYTES, REPOSITORIES, descriptor, indexKey, objectKey, publicFile, readyKey, sha256, shardFor } from './contract.mjs';

const TYPES = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', avif: 'image/avif', svg: 'image/svg+xml', ico: 'image/x-icon', json: 'application/json; charset=utf-8', mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', atlas: 'text/plain; charset=utf-8', skel: 'application/octet-stream' };
const fail = (status, text) => new Response(text, { status, headers: { 'cache-control': 'no-store', 'access-control-allow-origin': '*' } });

export function byteRange(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || !match[1] && !match[2]) throw new Error('Invalid range');
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) throw new Error('Unsatisfiable range');
  return { offset: start, length: end - start + 1 };
}

export function createAssetDelivery() {
  // Bounded, immutable metadata only. Never retain image/audio bodies in isolate memory.
  const metadata = new Map();
  let metadataBytes = 0;
  async function json(bucket, key, limit, expected) {
    if (metadata.has(key)) return metadata.get(key).value;
    const object = await bucket.get(key);
    if (!object) return null;
    if (object.size > limit) throw new Error('Oversized asset index');
    const bytes = await object.arrayBuffer();
    if (bytes.byteLength > limit || expected && await sha256(bytes) !== expected) throw new Error('Invalid asset index');
    const value = JSON.parse(new TextDecoder().decode(bytes));
    metadata.set(key, { value, bytes: bytes.byteLength });
    metadataBytes += bytes.byteLength;
    while (metadata.size > 32 || metadataBytes > 8_000_000) {
      const oldest = metadata.keys().next().value;
      metadataBytes -= metadata.get(oldest).bytes;
      metadata.delete(oldest);
    }
    return value;
  }
  return async (request, { bucket, cache, waitUntil = () => {} }) => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, HEAD, OPTIONS', 'access-control-allow-headers': 'Range, If-None-Match, If-Range', 'access-control-max-age': '86400' } });
    if (!['GET', 'HEAD'].includes(request.method)) return fail(405, 'Read-only assets');
    const url = new URL(request.url);
    let path;
    try { path = decodeURIComponent(url.pathname); } catch { return fail(400, 'Invalid asset path'); }
    const match = /^\/arkpedia\/([^/]+)\/([a-f0-9]{40})\/(.+)$/.exec(path);
    const ready = /^\/__ready\/([^/]+)\/([a-f0-9]{40})$/.exec(path);
    const repository = (match || ready)?.[1], revision = (match || ready)?.[2];
    if (!REPOSITORIES.has(repository) || !COMMIT.test(revision || '') || match && !publicFile(repository, match[3])) return fail(404, 'Unknown asset');
    try {
      const receipt = await json(bucket, readyKey(repository, revision), 1_000_000);
      if (!receipt) return fail(503, 'This GitHub revision has not finished mirroring');
      if (receipt.version !== 1 || receipt.repository !== repository || receipt.revision !== revision || !receipt.shards) throw new Error('Invalid readiness receipt');
      if (ready) return new Response(request.method === 'HEAD' ? null : JSON.stringify(receipt), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=31536000, immutable', 'access-control-allow-origin': '*' } });
      const file = match[3];
      const shard = await shardFor(file);
      if (!/^[a-f0-9]{64}$/.test(receipt.shards[shard] || '')) return fail(404, 'Unknown asset');
      const index = await json(bucket, indexKey(repository, revision, shard), 5_000_000, receipt.shards[shard]);
      const item = index?.[file];
      if (!item) return fail(404, 'Unknown asset');
      if (!descriptor(item)) throw new Error('Invalid asset descriptor');
      const headers = new Headers({
        'content-type': TYPES[file.split('.').pop()] || 'application/octet-stream',
        'content-length': String(item.bytes), 'etag': `"${item.sha}"`, 'accept-ranges': 'bytes',
        'cache-control': 'public, max-age=31536000, immutable', 'access-control-allow-origin': '*',
        'access-control-expose-headers': 'Content-Length, Content-Range, ETag, X-Arkpedia-Assets',
        'timing-allow-origin': '*', 'x-content-type-options': 'nosniff', 'x-arkpedia-assets': 'R2',
        'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      });
      if (request.headers.get('if-none-match')?.split(',').map(tag => tag.trim()).includes(headers.get('etag'))) return new Response(null, { status: 304, headers });
      let range;
      try { range = byteRange(request.headers.get('if-range') && request.headers.get('if-range') !== headers.get('etag') ? null : request.headers.get('range'), item.bytes); }
      catch { return new Response(null, { status: 416, headers: { 'content-range': `bytes */${item.bytes}`, 'cache-control': 'no-store', 'access-control-allow-origin': '*' } }); }
      if (range) {
        headers.set('content-length', String(range.length));
        headers.set('content-range', `bytes ${range.offset}-${range.offset + range.length - 1}/${item.bytes}`);
      }
      if (request.method === 'HEAD') return new Response(null, { status: range ? 206 : 200, headers });
      url.search = ''; // Source cache-busters do not change a commit-pinned file.
      const key = new Request(url.toString());
      if (!range && cache) {
        const cached = await cache.match(key);
        if (cached) { const hit = new Response(cached.body, cached); hit.headers.set('x-arkpedia-assets', 'R2-HIT'); return hit; }
      }
      const object = await bucket.get(objectKey(item.sha), range ? { range } : undefined);
      if (!object || object.size !== item.bytes || object.size > MAX_BYTES) throw new Error('Missing or invalid mirrored bytes');
      const response = new Response(object.body, { status: range ? 206 : 200, headers });
      if (!range && cache) waitUntil(cache.put(key, response.clone()).catch(() => {}));
      return response;
    } catch { return fail(502, 'Mirrored asset unavailable'); }
  };
}
