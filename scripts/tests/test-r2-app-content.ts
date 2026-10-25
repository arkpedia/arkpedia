import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import test from 'node:test';
import { withContentPage } from '../../lib/content/server';
import { contentUrl } from '../../lib/content/urls';
import type { ContentRelease } from '../../lib/content/types';
import { createR2Delivery } from '../../lib/content/r2Delivery.mjs';
import { stageSnapshot, readStagingPointer, promoteStagingSnapshot } from '../../scripts/content/r2-snapshot.mjs';

const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');

test('actual app loader and browser-file URLs follow isolated publication, held pages and rollback', async () => {
  const objects = new Map<string, Buffer>();
  let reads = 0;
  const bucket = {
    async get(key: string) {
      reads++;
      const bytes = objects.get(key);
      return bytes ? { size: bytes.length, etag: hash(bytes), text: async () => bytes.toString(), arrayBuffer: async () => Uint8Array.from(bytes).buffer } : null;
    },
    async put(key: string, bytes: Uint8Array, options: { onlyIf: { etagMatches?: string; etagDoesNotMatch?: string } }) {
      const current = objects.get(key);
      if (options.onlyIf.etagDoesNotMatch === '*' && current || options.onlyIf.etagMatches && (!current || hash(current) !== options.onlyIf.etagMatches)) return null;
      objects.set(key, Buffer.from(bytes));
      return { etag: hash(bytes) };
    },
  };
  async function snapshot(label: string) {
    const page = Buffer.from(JSON.stringify({ props: { value: label } }));
    const data = Buffer.from(JSON.stringify({ value: label }));
    const manifest = Buffer.from(JSON.stringify({ schema: 2, release: hash(label), generatedAt: '2026-10-25T00:00:00Z', generator: 'a'.repeat(40),
      assets: { 'arkpedia-image-assets': 'b'.repeat(40), 'arkpedia-skin-assets': 'c'.repeat(40) },
      pages: { '/operators/Penance': { path: 'pages/operators/Penance.json', bytes: page.length, sha256: hash(page) } },
      files: { search: { path: 'public/operator-search.json', bytes: data.length, sha256: hash(data) } } }));
    return stageSnapshot({ bucket, manifestBytes: manifest, revision: (label === 'first' ? 'd' : 'e').repeat(40),
      readFile: async (path: string) => path.startsWith('pages/') ? page : data });
  }
  const first = await snapshot('first'), second = await snapshot('second');
  const handle = createR2Delivery({ bucket, serveStagingPointer: true });
  const requests: string[] = [];
  const server = createServer(async (request, response) => {
    requests.push(request.url!);
    try {
      const result = await handle(new Request(`http://127.0.0.1${request.url}`, { method: request.method }));
      assert.ok(result);
      response.writeHead(result.status, Object.fromEntries(result.headers));
      response.end(Buffer.from(await result.arrayBuffer()));
    } catch { response.writeHead(500).end(); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  const keys = ['ARKPEDIA_CONTENT_PILOT_ORIGIN', 'ARKPEDIA_DEPLOYMENT_ROLE', 'ARKPEDIA_CONTENT_TEST', 'ARKPEDIA_CONTENT_DISABLED', 'ARKPEDIA_EXPORT_CONTENT'] as const;
  const before = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  Object.assign(process.env, { ARKPEDIA_CONTENT_PILOT_ORIGIN: origin, ARKPEDIA_DEPLOYMENT_ROLE: 'staging', ARKPEDIA_CONTENT_TEST: '1', ARKPEDIA_CONTENT_DISABLED: '0', ARKPEDIA_EXPORT_CONTENT: '0' });
  type Props = { value: string; __contentRelease?: ContentRelease };
  const get = withContentPage<Props>('/operators/[name]', async () => ({ props: { value: 'bundled' } }));
  const page = async () => {
    const result = await get({ params: { name: 'Penance' }, revalidateReason: 'stale' });
    assert.ok('props' in result);
    return await result.props;
  };
  try {
    await promoteStagingSnapshot({ bucket, candidate: first, expected: await readStagingPointer(bucket) });
    const heldPage = await page();
    assert.equal(heldPage.value, 'first');
    const heldUrl = contentUrl('/operator-search.json', heldPage.__contentRelease);
    assert.ok(heldUrl.includes(first.manifestSha256));
    assert.deepEqual(await (await fetch(heldUrl)).json(), { value: 'first' });
    await promoteStagingSnapshot({ bucket, candidate: second, expected: await readStagingPointer(bucket) });
    const current = await page();
    assert.equal(current.value, 'second');
    assert.deepEqual(await (await fetch(contentUrl('/operator-search.json', current.__contentRelease))).json(), { value: 'second' });
    assert.deepEqual(await (await fetch(heldUrl)).json(), { value: 'first' }, 'held page keeps its original snapshot');
    await promoteStagingSnapshot({ bucket, candidate: first, expected: await readStagingPointer(bucket) });
    assert.equal((await page()).value, 'first');
    const pointerKey = 'pilot-v1/channels/staging.json';
    const savedPointer = objects.get(pointerKey)!;
    objects.set(pointerKey, Buffer.from('{}'));
    assert.equal((await page()).value, 'first', 'bad pointer retains last verified release');
    objects.set(pointerKey, savedPointer);
    const beforeProduction = reads;
    process.env.ARKPEDIA_DEPLOYMENT_ROLE = 'production';
    assert.equal((await page()).value, 'first');
    assert.equal(reads, beforeProduction, 'production role refuses pilot before any storage request');
    assert.ok(requests.every(path => path.startsWith('/__content/pilot/')), 'app never requested a live GitHub-style pointer');
  } finally {
    for (const key of keys) { if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key]; }
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
