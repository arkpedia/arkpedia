import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { withContentPage } from '../../lib/content/server';
import { pageFilePath } from '../../lib/content/pagePaths.mjs';
import { contentPageClock } from '../../lib/content/pageClock';
import bundledRevisions from '../../data/assets/revisions.json';
import { getOperatorVoiceData } from '../../lib/operators/operatorVoices';
import { contentUrl } from '../../lib/content/urls';
import { CONTENT_SCHEMA, contentRoute, type ContentManifest, type ContentPointer } from '../../lib/content/types';
import { createCraftTools } from '../../lib/planner/craft';

const sha = (value: string) => createHash('sha256').update(value).digest('hex');

test('approved content changes, new routes, rollback, outages and invalid data use one unchanged loader', async () => {
  const documents = new Map<string, string>();
  let pointer: ContentPointer;
  const server = createServer((request, response) => {
    if (request.url === '/live/current.json') { response.end(JSON.stringify(pointer)); return; }
    const body = documents.get(decodeURIComponent(request.url!));
    if (!body) { response.writeHead(404); response.end(); return; }
    response.end(body);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const before = { url: process.env.ARKPEDIA_CONTENT_URL, test: process.env.ARKPEDIA_CONTENT_TEST, disabled: process.env.ARKPEDIA_CONTENT_DISABLED, exporting: process.env.ARKPEDIA_EXPORT_CONTENT };
  process.env.ARKPEDIA_CONTENT_DISABLED = '0';
  process.env.ARKPEDIA_EXPORT_CONTENT = '0';
  process.env.ARKPEDIA_CONTENT_URL = `http://127.0.0.1:${address.port}`;
  process.env.ARKPEDIA_CONTENT_TEST = '1';
  function publish(label: string, rows: Record<string, Record<string, unknown>>) {
    const revision = label.repeat(40), release = label.repeat(64);
    const manifest: ContentManifest = { schema: CONTENT_SCHEMA, release, generatedAt: '2026-09-16T00:00:00Z', generator: revision,
      assets: { 'arkpedia-image-assets': revision, 'arkpedia-skin-assets': revision }, pages: {}, files: {} };
    for (const [route, props] of Object.entries(rows)) {
      const body = JSON.stringify({ props }), path = pageFilePath(route);
      documents.set(`/${revision}/release/${path}`, body);
      manifest.pages[route] = { path, bytes: Buffer.byteLength(body), sha256: sha(body) };
    }
    const body = JSON.stringify(manifest);
    documents.set(`/${revision}/release/manifest.json`, body);
    return { schema: CONTENT_SCHEMA, release, revision, manifestSha256: sha(body) };
  }
  try {
    const first = publish('a', { '/operators/Penance': { value: 'old' } });
    pointer = first;
    const get = withContentPage('/operators/[name]', async () => ({ props: { value: 'bundled' } }));
    const context = { params: { name: 'Penance' }, revalidateReason: 'build' as const };
    const read = async () => { const result = await get(context); assert.ok('props' in result); return await result.props; };
    assert.equal((await read()).value, 'old');
    pointer = publish('b', { '/operators/Penance': { value: 'updated' }, '/operators/New%20Operator': { value: 'new' }, [contentRoute('/operators/[name]', { name: "A/B # Wiš'adel" })]: { value: 'special' } });
    assert.equal((await read()).value, 'updated');
    const added = await get({ ...context, params: { name: 'New Operator' } });
    assert.ok('props' in added);
    assert.equal((await added.props).value, 'new');
    const special = await get({ ...context, params: { name: "A/B # Wiš'adel" } });
    assert.ok('props' in special);
    assert.equal((await special.props).value, 'special');
    assert.deepEqual(await get({ ...context, params: { name: 'Missing' } }), { notFound: true, revalidate: 1 });
    pointer = first;
    assert.equal((await read()).value, 'old');
    pointer = { ...first, schema: 1 };
    assert.equal((await read()).value, 'old');
    pointer = publish('c', { '/operators/Penance': { value: 'corrupt' } });
    documents.set(`/${'c'.repeat(40)}/release/${pageFilePath('/operators/Penance')}`, '{}');
    await assert.rejects(async () => get({ ...context, revalidateReason: 'stale' }), /checksum mismatch/);
  } finally {
    if (before.url === undefined) delete process.env.ARKPEDIA_CONTENT_URL; else process.env.ARKPEDIA_CONTENT_URL = before.url;
    if (before.test === undefined) delete process.env.ARKPEDIA_CONTENT_TEST; else process.env.ARKPEDIA_CONTENT_TEST = before.test;
    if (before.disabled === undefined) delete process.env.ARKPEDIA_CONTENT_DISABLED; else process.env.ARKPEDIA_CONTENT_DISABLED = before.disabled;
    if (before.exporting === undefined) delete process.env.ARKPEDIA_EXPORT_CONTENT; else process.env.ARKPEDIA_EXPORT_CONTENT = before.exporting;
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


test('voice playback resolves stable and old pinned templates against each page release', () => {
  const repositories = Object.keys(bundledRevisions).filter(name => name.startsWith('arkpedia-voice-'));
  const release = (pin: string) => ({ release: pin.repeat(64), baseUrl: 'https://example.com/release', assets: Object.fromEntries(repositories.map(name => [name, pin.repeat(40)])) });
  for (const repository of repositories) {
    for (const ref of ['main', 'd'.repeat(40)]) {
      for (const suffix of ['current/char_123/cn_001.mp3', 'legacy/archive/char_123/CN_001.mp3']) {
        const url = `https://raw.githubusercontent.com/arkpedia/${repository}/${ref}/${suffix}`;
        assert.equal(contentUrl(url, release('a')), `https://raw.githubusercontent.com/arkpedia/${repository}/${'a'.repeat(40)}/${suffix}`);
        assert.equal(contentUrl(url, release('b')), `https://raw.githubusercontent.com/arkpedia/${repository}/${'b'.repeat(40)}/${suffix}`);
        assert.equal(contentUrl(url), `https://raw.githubusercontent.com/arkpedia/${repository}/${bundledRevisions[repository as keyof typeof bundledRevisions]}/${suffix}`);
      }
    }
  }
  const external = 'https://raw.githubusercontent.com/another/voices/main/recording.mp3';
  assert.equal(contentUrl(external, release('a')), external);
  assert.throws(() => contentUrl('https://raw.githubusercontent.com/arkpedia/arkpedia-voice-japanese/main/test.mp3', { ...release('a'), assets: {} }), /lacks/);
  const data = getOperatorVoiceData('char_1039_thorn2');
  assert.ok(data?.packs.every(pack => !pack.audioTemplate || pack.audioTemplate.includes('/main/')));
});

test('content snapshots omit presentation clocks and old or new snapshots get fresh clocks without mutation', () => {
  const time = Date.UTC(2026, 8, 16, 15, 12, 34);
  for (const route of ['/operators', '/skins', '/stages', '/stages/all', '/stages/browse', '/stages/regular']) {
    const old = { value: 'game record', now: 1 };
    const snapshot = contentPageClock(route, old, true, time);
    assert.deepEqual(snapshot, { value: 'game record' });
    assert.deepEqual(contentPageClock(route, old, true, time + 86_400_000), snapshot);
    const current = contentPageClock(route, snapshot, false, time);
    assert.equal(current.now, ['/operators', '/skins'].includes(route) ? Math.floor(time / 60000) * 60000 : Math.floor(time / 1000));
    assert.deepEqual(contentPageClock(route, old, false, time), current);
    assert.deepEqual(old, { value: 'game record', now: 1 });
    assert.deepEqual(snapshot, { value: 'game record' });
  }
  const unrelated = { now: 123 };
  assert.equal(contentPageClock('/events/[slug]', unrelated, true), unrelated);
});
