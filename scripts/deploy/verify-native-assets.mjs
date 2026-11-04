// Read-only canary parity/transport checks. A HIT does not alone prove Worker bypass:
// separately verify the provider's R2 custom domain and absence of Worker routes.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { nativeKey } from '../content/native-assets.mjs';
import { descriptor } from '../../workers/assets/contract.mjs';

const HEADERS = { Origin: 'https://www.arkpedia.net', 'Accept-Encoding': 'identity' };
const sha = (bytes, size) => createHash('sha1').update(`blob ${size}\0`).update(bytes).digest('hex');
async function body(response, limit) {
  assert.ok(response.body, 'Expected asset body');
  const parts = []; let size = 0;
  for await (const part of response.body) {
    size += part.length;
    assert.ok(size <= limit, 'Oversized asset response');
    parts.push(Buffer.from(part));
  }
  return Buffer.concat(parts);
}
function publicHeaders(response) {
  assert.equal(response.headers.get('access-control-allow-origin'), '*', 'Wildcard public CORS is required');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('timing-allow-origin'), '*');
  assert.equal(response.headers.get('content-security-policy'), "default-src 'none'; style-src 'unsafe-inline'; sandbox");
  assert.equal(response.headers.get('x-arkpedia-assets'), 'R2-NATIVE');
  assert.match(response.headers.get('cache-control') || '', /immutable/);
}
export async function verifyNativeAssets(plan, { origin, fetcher = fetch }) {
  assert.ok(['https://assets-native.arkpedia.net', 'https://assets.arkpedia.net'].includes(origin), 'Expected an explicit Arkpedia asset origin');
  assert.ok(plan.samples?.length && (plan.identities?.length || plan.canaryOnly), 'An inventory report with samples is required');
  if (plan.canaryOnly) assert.equal(origin, 'https://assets-native.arkpedia.net', 'Partial canaries must never verify a production cutover');
  const request = (url, init = {}) => fetcher(url, { ...init, redirect: 'error', headers: { ...HEADERS, ...init.headers }, signal: AbortSignal.timeout(30_000) });
  const verified = [];
  for (const file of plan.samples) {
    assert.ok(descriptor(file), 'Invalid canary descriptor');
    const path = `/${nativeKey(file.repository, file.revision, file.path).split('/').map(encodeURIComponent).join('/')}`;
    const previous = await request(`https://assets.arkpedia.net${path}`);
    assert.equal(previous.status, 200, 'Existing asset must remain readable');
    const expected = await body(previous, file.bytes);
    assert.equal(expected.length, file.bytes);
    assert.equal(sha(expected, file.bytes), file.sha, 'Source bytes differ from inventory');
    const response = await request(`${origin}${path}`);
    assert.equal(response.status, 200);
    publicHeaders(response);
    assert.equal(response.headers.get('content-type'), file.contentType);
    const bytes = await body(response, file.bytes);
    assert.deepEqual(bytes, expected, `Native bytes differ: ${path}`);
    const etag = response.headers.get('etag');
    assert.ok(etag && !etag.startsWith('W/'), 'A strong native ETag is required');
    const warm = await request(`${origin}${path}`);
    assert.equal(warm.status, 200);
    assert.equal(warm.headers.get('cf-cache-status'), 'HIT', 'Native CDN must serve a warm response');
    assert.deepEqual(await body(warm, file.bytes), expected);
    const query = await request(`${origin}${path}?native-canary=1`);
    assert.equal(query.status, 200);
    assert.equal(query.headers.get('cf-cache-status'), 'HIT', 'Commit-irrelevant queries must share the cache');
    assert.deepEqual(await body(query, file.bytes), expected);
    const head = await request(`${origin}${path}`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(Number(head.headers.get('content-length')), file.bytes);
    assert.equal(head.headers.get('etag'), etag);
    const conditional = await request(`${origin}${path}`, { headers: { 'If-None-Match': etag } });
    assert.equal(conditional.status, 304);
    const end = Math.min(31, file.bytes - 1);
    const range = await request(`${origin}${path}`, { headers: { Range: `bytes=0-${end}`, 'If-Range': etag } });
    assert.equal(range.status, 206);
    assert.equal(range.headers.get('content-range'), `bytes 0-${end}/${file.bytes}`);
    assert.deepEqual(await body(range, end + 1), expected.subarray(0, end + 1));
    const options = await request(`${origin}${path}`, { method: 'OPTIONS', headers: { 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'range,if-none-match,if-range' } });
    assert.ok(options.status === 200 || options.status === 204, 'CORS preflight must succeed');
    assert.equal(options.headers.get('access-control-allow-origin'), '*');
    verified.push({ path, bytes: file.bytes, sha: file.sha, cache: 'HIT', head: head.status, conditional: conditional.status, range: range.status });
  }
  for (const { repository, revision } of plan.canaryOnly ? [] : plan.identities) {
    nativeKey(repository, revision, repository === 'arkpedia-data' ? 'release/probe.json' : repository.startsWith('arkpedia-voice-') ? 'current/probe.mp3' : 'probe.png');
    const response = await request(`${origin}/__ready/${repository}/${revision}`);
    assert.equal(response.status, 200);
    const receipt = JSON.parse((await body(response, 1_000_000)).toString('utf8'));
    assert.equal(receipt.repository, repository);
    assert.equal(receipt.revision, revision);
    assert.equal(receipt.version, 1);
    assert.ok(Number.isSafeInteger(receipt.files) && receipt.files > 0);
  }
  const missing = await request(`${origin}/arkpedia/arkpedia-image-assets/${'0'.repeat(40)}/native-canary-missing.png`);
  assert.equal(missing.status, 404);
  assert.match(missing.headers.get('cache-control') || '', /no-store/);
  assert.notEqual(missing.headers.get('cf-cache-status'), 'HIT', 'Errors must not be retained');
  await missing.body?.cancel();
  return { origin, observedAt: new Date().toISOString(), scope: plan.canaryOnly ? 'sample-only; no revision readiness advertised' : 'complete publication', samples: verified, readyRevisions: plan.canaryOnly ? 0 : plan.identities.length };
}

async function main(args) {
  assert.ok(args.length === 3, 'Usage: verify-native-assets.mjs INVENTORY.json https://assets-native.arkpedia.net REPORT.json');
  const plan = JSON.parse(await readFile(args[0], 'utf8'));
  const result = await verifyNativeAssets(plan, { origin: args[1] });
  await writeFile(args[2], JSON.stringify(result, null, 2));
  console.log(`Verified ${result.samples.length} native samples and ${result.readyRevisions} completed revisions.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
