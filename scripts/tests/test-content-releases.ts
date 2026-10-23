import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { withContentPage } from '../../lib/content/server';
import { pageFilePath } from '../../lib/content/pagePaths.mjs';
import { contentPageClock } from '../../lib/content/pageClock';
import bundledRevisions from '../../data/assets/revisions.json';
import cdn from '../../config/asset-delivery.json';
import { getOperatorVoiceData } from '../../lib/operators/operatorVoices';
import { contentUrl } from '../../lib/content/urls';
import { CONTENT_SCHEMA, contentRoute, type ContentManifest, type ContentPointer } from '../../lib/content/types';
import { createCraftTools } from '../../lib/planner/craft';

const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const delivered = (repository: string, revision: string, path: string) => cdn.template
  .replace('{repository}', repository)
  .replace('{revision}', revision)
  .replace('{path}', path);

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

test('a static route the release lacks regenerates on Vercel only when its page opts in', async () => {
  const revision = 'e'.repeat(40), release = 'e'.repeat(64);
  const body = JSON.stringify({ schema: CONTENT_SCHEMA, release, generatedAt: '2026-09-26T00:00:00Z', generator: revision,
    assets: { 'arkpedia-image-assets': revision, 'arkpedia-skin-assets': revision }, pages: {}, files: {} } satisfies ContentManifest);
  const pointer: ContentPointer = { schema: CONTENT_SCHEMA, release, revision, manifestSha256: sha(body) };
  const server = createServer((request, response) => {
    if (request.url === '/live/current.json') response.end(JSON.stringify(pointer));
    else if (request.url === `/${revision}/release/manifest.json`) response.end(body);
    else { response.writeHead(404); response.end(); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const keys = ['ARKPEDIA_CONTENT_URL', 'ARKPEDIA_CONTENT_TEST', 'ARKPEDIA_CONTENT_DISABLED', 'ARKPEDIA_EXPORT_CONTENT', 'VERCEL'] as const;
  const before = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  Object.assign(process.env, { ARKPEDIA_CONTENT_URL: `http://127.0.0.1:${address.port}`, ARKPEDIA_CONTENT_TEST: '1', ARKPEDIA_CONTENT_DISABLED: '0', ARKPEDIA_EXPORT_CONTENT: '0', VERCEL: '1' });
  try {
    type Props = { value: string; now?: number };
    const finalize = async (props: Props) => ({ ...props, value: `${props.value}+finalized` });
    const builder = async () => ({ props: { value: 'bundled' } as Props });
    await assert.rejects(async () => withContentPage('/community-hub', builder, { finalize })({ revalidateReason: 'stale' }), /Published content is missing \/community/);
    const result = await withContentPage('/community-hub', builder, { finalize, bundledWhenUnpublished: true })({ revalidateReason: 'stale' });
    assert.ok('props' in result);
    const props = await result.props;
    assert.equal(props.value, 'bundled+finalized');
    assert.equal(typeof props.now, 'number', 'the regeneration gets its own clock');
    assert.throws(() => withContentPage('/operators/[name]', builder, { bundledWhenUnpublished: true }), /static routes only/);
  } finally {
    for (const key of keys) { if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key]; }
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

/* GitHub's raw origin gzips, and its Content-Length is the gzip's: bigger than the file for a
   tiny one. /search's {"props":{}} (12 bytes, 32 gzipped) failed every regeneration on Vercel
   as "Content response too large", and the deploy's build stayed up. */
/* As the origin sends it. CompressionStream, not zlib: test-payload-budgets keeps zlib, the tool
   of size budgets, out of npm test, and this measures no size. */
const gzip = async (text: string) => Buffer.from(await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());

test('a gzipped page smaller than its own gzip still loads, and the decoded size is still capped', async () => {
  const revision = 'f'.repeat(40), release = 'f'.repeat(64);
  const pages: Record<string, string> = { '/search': JSON.stringify({ props: {} }), '/community-hub': JSON.stringify({ props: { value: 'x'.repeat(5000) } }) };
  const manifest: ContentManifest = { schema: CONTENT_SCHEMA, release, generatedAt: '2026-10-18T00:00:00Z', generator: revision,
    assets: { 'arkpedia-image-assets': revision, 'arkpedia-skin-assets': revision }, pages: {}, files: {} };
  const gzipped = Object.fromEntries(await Promise.all(Object.entries(pages).map(async ([route, body]) => [route, await gzip(body)] as const)));
  for (const [route, body] of Object.entries(pages)) manifest.pages[route] = { path: pageFilePath(route), bytes: Buffer.byteLength(body), sha256: sha(body) };
  // Understated, so the decoded body runs past the limit the manifest sets.
  manifest.pages['/community-hub'].bytes = 100;
  const body = JSON.stringify(manifest);
  const pointer: ContentPointer = { schema: CONTENT_SCHEMA, release, revision, manifestSha256: sha(body) };
  const server = createServer((request, response) => {
    if (request.url === '/live/current.json') { response.end(JSON.stringify(pointer)); return; }
    if (request.url === `/${revision}/release/manifest.json`) { response.end(body); return; }
    const route = Object.keys(pages).find(key => request.url === `/${revision}/release/${pageFilePath(key)}`);
    if (!route) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'content-encoding': 'gzip', 'content-length': gzipped[route].length });
    response.end(gzipped[route]);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const keys = ['ARKPEDIA_CONTENT_URL', 'ARKPEDIA_CONTENT_TEST', 'ARKPEDIA_CONTENT_DISABLED', 'ARKPEDIA_EXPORT_CONTENT', 'VERCEL'] as const;
  const before = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  Object.assign(process.env, { ARKPEDIA_CONTENT_URL: `http://127.0.0.1:${address.port}`, ARKPEDIA_CONTENT_TEST: '1', ARKPEDIA_CONTENT_DISABLED: '0', ARKPEDIA_EXPORT_CONTENT: '0', VERCEL: '1' });
  try {
    assert.ok(gzipped['/search'].length > Buffer.byteLength(pages['/search']), 'the fixture is smaller than its gzip');
    const result = await withContentPage('/search', async () => ({ props: {} }), { bundledWhenUnpublished: true })({ revalidateReason: 'stale' });
    assert.ok('props' in result);
    assert.ok((await result.props as { __contentRelease?: unknown }).__contentRelease, 'the release page, not the builder');
    await assert.rejects(async () => withContentPage('/community-hub', async () => ({ props: {} }), { bundledWhenUnpublished: true })({ revalidateReason: 'stale' }), /too large/);
  } finally {
    for (const key of keys) { if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key]; }
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('release URLs cover artwork sizes and lazy game data without redirecting application routes', () => {
  const release = { release: 'a'.repeat(64), baseUrl: 'https://example.org/commit/release', assets: { 'arkpedia-image-assets': 'b'.repeat(40), 'arkpedia-skin-assets': 'c'.repeat(40) } };
  assert.equal(contentRoute('/operators/[name]', { name: 'Thorns the Lodestar' }), '/operators/Thorns%20the%20Lodestar');
  assert.equal(contentUrl('/six-star-icons/Test%20-%20Base.webp', release), delivered('arkpedia-image-assets', 'b'.repeat(40), 'six-star-icons/Test%20-%20Base.webp'));
  assert.equal(contentUrl('/enemies-icons/New Enemy.webp', release), delivered('arkpedia-image-assets', 'b'.repeat(40), 'enemies-icons/New%20Enemy.webp'));
  assert.equal(contentUrl('/skin-variants/avif/w768/six-star-skins/Test.avif', release), delivered('arkpedia-skin-assets', 'c'.repeat(40), 'variants/avif/w768/six-star-skins/Test.avif'));
  assert.equal(contentUrl('/skin-originals/six-star-skins/Test.png', release), delivered('arkpedia-skin-assets', 'c'.repeat(40), 'originals/six-star-skins/Test.png'));
  assert.equal(contentUrl('/six-star-icons/Test%20-%20Base.webp'), delivered('arkpedia-image-assets', bundledRevisions['arkpedia-image-assets'], 'six-star-icons/Test%20-%20Base.webp'));
  assert.equal(contentUrl('/skin-variants/avif/w768/six-star-skins/Test.avif'), delivered('arkpedia-skin-assets', bundledRevisions['arkpedia-skin-assets'], 'variants/avif/w768/six-star-skins/Test.avif'));
  assert.equal(contentUrl('/planner-data/Test%2520Name.json', release), 'https://example.org/commit/release/public/planner-data/Test%2520Name.json');
  assert.equal(contentUrl('/operators/Penance', release), '/operators/Penance');
  assert.equal(contentUrl('https://other.example/image.png', release), 'https://other.example/image.png');
});

test('new crafting recipes are isolated to their content release', () => {
  const tools = createCraftTools({ 'New material': { type: 'F_EVOLVE', room: 'WORKSHOP', count: 1, lmd: 0, costs: [{ name: 'Orirock', count: 2 }], byproducts: [], byproductRate: 0, alternatives: [] } }, [], ['EXP', 'New material', 'Orirock']);
  const result = tools.resolveNeeds([{ name: 'New material', quantity: 1 }], { Orirock: 2 }, { autoCraft: true });
  assert.equal(result.rows.find(row => row.name === 'New material')?.short, 0);
  assert.ok(tools.formulaFor('New material'));
  assert.equal(createCraftTools({}, [], ['EXP']).formulaFor('New material'), null);
});


test('voice playback resolves stable and old pinned templates against each page release', () => {
  const repositories = Object.keys(bundledRevisions).filter(name => name.startsWith('arkpedia-voice-'));
  const release = (pin: string) => ({ release: pin.repeat(64), baseUrl: 'https://example.com/release', assets: Object.fromEntries(repositories.map(name => [name, pin.repeat(40)])) });
  for (const repository of repositories) {
    for (const ref of ['main', 'd'.repeat(40)]) {
      for (const suffix of ['current/char_123/cn_001.mp3', 'legacy/archive/char_123/CN_001.mp3']) {
        const url = `https://raw.githubusercontent.com/arkpedia/${repository}/${ref}/${suffix}`;
        assert.equal(contentUrl(url, release('a')), delivered(repository, 'a'.repeat(40), suffix));
        assert.equal(contentUrl(url, release('b')), delivered(repository, 'b'.repeat(40), suffix));
        assert.equal(contentUrl(url), delivered(repository, bundledRevisions[repository as keyof typeof bundledRevisions], suffix));
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
  const seconds = ['/stages', '/stages/all', '/stages/browse', '/stages/regular'];
  for (const route of ['/operators', '/skins', ...seconds, '/schedule', '/farming', '/obtain-method', '/enemies', '/games/color-palette', '/games/music-guesser']) {
    const old = { value: 'game record', now: 1 };
    const snapshot = contentPageClock(route, old, { exporting: true });
    assert.deepEqual(snapshot, { value: 'game record' });
    const current = contentPageClock(route, snapshot, { now: time });
    assert.equal(current.now, seconds.includes(route) ? Math.floor(time / 1000) : Math.floor(time / 60000) * 60000, route);
    assert.deepEqual(contentPageClock(route, old, { now: time }), current);
    assert.deepEqual(old, { value: 'game record', now: 1 });
    assert.deepEqual(snapshot, { value: 'game record' });
  }
  const supplies = { cards: [], buildDay: 'Friday' };
  const supplySnapshot = contentPageClock('/stages/supplies', supplies, { exporting: true });
  assert.deepEqual(supplySnapshot, { cards: [] });
  assert.deepEqual(contentPageClock('/stages/supplies', supplySnapshot, { now: time }), { cards: [], now: Math.floor(time / 60000) * 60000, buildDay: 'Wednesday' });
  assert.deepEqual(supplies, { cards: [], buildDay: 'Friday' });
  const unrelated = { now: 123 };
  assert.equal(contentPageClock('/events/[slug]', unrelated, { exporting: true }), unrelated);
});


test('clock pages cache for five minutes while detail discovery and explicit intervals stay intact', async () => {
  const keys = ['ARKPEDIA_CONTENT_DISABLED', 'ARKPEDIA_CONTENT_TEST'] as const;
  const before = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  Object.assign(process.env, { ARKPEDIA_CONTENT_DISABLED: '1', ARKPEDIA_CONTENT_TEST: '0' });
  try {
    const read = (route: string, revalidate?: number) => withContentPage(route, async () => ({ props: { value: 'bundled' } }), { revalidate })({ revalidateReason: 'build' });
    // Routes with no declared tables isolate the cache contract from data attachment.
    assert.equal((await read('/enemies')).revalidate, 300);
    assert.equal((await read('/operators/[name]')).revalidate, 60);
    assert.equal((await read('/enemies', 1500)).revalidate, 1500);
    process.env.ARKPEDIA_CONTENT_TEST = '1';
    assert.equal((await read('/enemies')).revalidate, 1, 'runtime update/rollback fixtures keep their short interval');
  } finally {
    for (const key of keys) { if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key]; }
  }
});
