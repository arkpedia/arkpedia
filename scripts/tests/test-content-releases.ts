import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { withContentPage } from '../../lib/content/server';
import { contentUrl } from '../../lib/content/urls';
import { contentRoute, type ContentManifest, type ContentPointer } from '../../lib/content/types';
import { createCraftTools } from '../../lib/planner/craft';

const sha = (value: string) => createHash('sha256').update(value).digest('hex');

test('approved content changes, new routes, rollback, outages and invalid data use one unchanged loader', async () => {
  const documents = new Map<string, string>();
  let pointer: ContentPointer;
  const server = createServer((request, response) => {
    if (request.url === '/live/current.json') { response.end(JSON.stringify(pointer)); return; }
    const body = documents.get(request.url!);
    if (!body) { response.writeHead(404); response.end(); return; }
    response.end(body);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const before = { url: process.env.ARKPEDIA_CONTENT_URL, test: process.env.ARKPEDIA_CONTENT_TEST };
  process.env.ARKPEDIA_CONTENT_URL = `http://127.0.0.1:${address.port}`;
  process.env.ARKPEDIA_CONTENT_TEST = '1';
  function publish(label: string, rows: Record<string, Record<string, unknown>>) {
    const revision = label.repeat(40), release = label.repeat(64);
    const manifest: ContentManifest = { schema: 1, release, generatedAt: '2026-09-16T00:00:00Z', generator: revision,
      assets: { 'arkpedia-image-assets': revision, 'arkpedia-skin-assets': revision }, pages: {}, files: {} };
    for (const [route, props] of Object.entries(rows)) {
      const body = JSON.stringify({ props }), path = `pages/${sha(route)}.json`;
      documents.set(`/${revision}/release/${path}`, body);
      manifest.pages[route] = { path, bytes: Buffer.byteLength(body), sha256: sha(body) };
    }
    const body = JSON.stringify(manifest);
    documents.set(`/${revision}/release/manifest.json`, body);
    return { schema: 1, release, revision, manifestSha256: sha(body) };
  }
  try {
    const first = publish('a', { '/operators/Penance': { value: 'old' } });
    pointer = first;
    const get = withContentPage('/operators/[name]', async () => ({ props: { value: 'bundled' } }));
    const context = { params: { name: 'Penance' }, revalidateReason: 'build' as const };
    const read = async () => { const result = await get(context); assert.ok('props' in result); return await result.props; };
    assert.equal((await read()).value, 'old');
    pointer = publish('b', { '/operators/Penance': { value: 'updated' }, '/operators/New%20Operator': { value: 'new' } });
    assert.equal((await read()).value, 'updated');
    const added = await get({ ...context, params: { name: 'New Operator' } });
    assert.ok('props' in added);
    assert.equal((await added.props).value, 'new');
    assert.deepEqual(await get({ ...context, params: { name: 'Missing' } }), { notFound: true, revalidate: 1 });
    pointer = first;
    assert.equal((await read()).value, 'old');
    pointer = { ...first, schema: 99 };
    assert.equal((await read()).value, 'old');
    pointer = publish('c', { '/operators/Penance': { value: 'corrupt' } });
    documents.set(`/${'c'.repeat(40)}/release/pages/${sha('/operators/Penance')}.json`, '{}');
    await assert.rejects(async () => get({ ...context, revalidateReason: 'stale' }), /checksum mismatch/);
  } finally {
    if (before.url === undefined) delete process.env.ARKPEDIA_CONTENT_URL; else process.env.ARKPEDIA_CONTENT_URL = before.url;
    if (before.test === undefined) delete process.env.ARKPEDIA_CONTENT_TEST; else process.env.ARKPEDIA_CONTENT_TEST = before.test;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('release URLs cover artwork sizes and lazy game data without redirecting application routes', () => {
  const release = { release: 'a'.repeat(64), baseUrl: 'https://example.org/commit/release', assets: { 'arkpedia-image-assets': 'b'.repeat(40), 'arkpedia-skin-assets': 'c'.repeat(40) } };
  assert.equal(contentRoute('/operators/[name]', { name: 'Thorns the Lodestar' }), '/operators/Thorns%20the%20Lodestar');
  assert.match(contentUrl('/six-star-icons/Test%20-%20Base.webp', release), /arkpedia-image-assets\/b{40}\/six-star-icons\//);
  assert.match(contentUrl('/skin-variants/avif/w768/six-star-skins/Test.avif', release), /arkpedia-skin-assets\/c{40}\/variants\/avif/);
  assert.match(contentUrl('/skin-originals/six-star-skins/Test.png', release), /\/originals\/six-star-skins\/Test.png$/);
  assert.equal(contentUrl('/planner-data/Test%2520Name.json', release), 'https://example.org/commit/release/public/planner-data/Test%2520Name.json');
  assert.equal(contentUrl('/operators/Penance', release), '/operators/Penance');
  assert.equal(contentUrl('https://other.example/image.png', release), 'https://other.example/image.png');
});

test('new crafting recipes are isolated to their content release', () => {
  const tools = createCraftTools({ 'New material': { type: 'F_EVOLVE', room: 'WORKSHOP', count: 1, lmd: 0, costs: [{ name: 'Orirock', count: 2 }], byproducts: [], byproductRate: 0, alternatives: [] } });
  const result = tools.resolveNeeds([{ name: 'New material', quantity: 1 }], { Orirock: 2 }, { autoCraft: true });
  assert.equal(result.rows.find(row => row.name === 'New material')?.short, 0);
  assert.ok(tools.formulaFor('New material'));
  assert.equal(createCraftTools().formulaFor('New material'), null);
});
