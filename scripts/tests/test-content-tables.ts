import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { withContentPage } from '../../lib/content/server';
import { pageFilePath } from '../../lib/content/pagePaths.mjs';
import { missingPageTables, PAGE_TABLES, pageTables } from '../../lib/content/tables.mjs';
import { CONTENT_SCHEMA, type ContentManifest, type ContentPointer } from '../../lib/content/types';

/*
 * A game table the browser reads travels in the page's props (__contentTables), never in
 * its bundle. These pin the three paths withContentPage attaches it on -- the export, an
 * older release, no release -- with made-up tables, so nothing here moves with the data.
 */
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const ROUTE = '/planner';
const NAMES = pageTables(ROUTE);
const bundledCopy = (name: string) => ({ from: 'deployment', name });
function loaders(calls: string[]) {
  return Object.fromEntries(NAMES.map(name => [name, async () => { calls.push(name); return bundledCopy(name); }]));
}

async function withRelease(run: (publish: (props: Record<string, unknown>) => void) => Promise<void>) {
  const documents = new Map<string, string>();
  let pointer: ContentPointer | undefined;
  const server = createServer((request, response) => {
    if (request.url === '/live/current.json' && pointer) { response.end(JSON.stringify(pointer)); return; }
    const body = documents.get(decodeURIComponent(request.url!));
    if (!body) { response.writeHead(404); response.end(); return; }
    response.end(body);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const before = { url: process.env.ARKPEDIA_CONTENT_URL, test: process.env.ARKPEDIA_CONTENT_TEST, disabled: process.env.ARKPEDIA_CONTENT_DISABLED, exporting: process.env.ARKPEDIA_EXPORT_CONTENT };
  Object.assign(process.env, { ARKPEDIA_CONTENT_DISABLED: '0', ARKPEDIA_EXPORT_CONTENT: '0', ARKPEDIA_CONTENT_URL: `http://127.0.0.1:${address.port}`, ARKPEDIA_CONTENT_TEST: '1' });
  let label = 0;
  const publish = (props: Record<string, unknown>) => {
    const mark = 'abcdef'[label++];
    const revision = mark.repeat(40), release = mark.repeat(64);
    const body = JSON.stringify({ props }), file = pageFilePath(ROUTE);
    documents.set(`/${revision}/release/${file}`, body);
    const manifest: ContentManifest = { schema: CONTENT_SCHEMA, release, generatedAt: '2026-09-25T00:00:00Z', generator: revision,
      assets: { 'arkpedia-image-assets': revision, 'arkpedia-skin-assets': revision },
      pages: { [ROUTE]: { path: file, bytes: Buffer.byteLength(body), sha256: sha(body) } }, files: {} };
    const manifestBody = JSON.stringify(manifest);
    documents.set(`/${revision}/release/manifest.json`, manifestBody);
    pointer = { schema: CONTENT_SCHEMA, release, revision, manifestSha256: sha(manifestBody) };
  };
  try { await run(publish); } finally {
    for (const [key, value] of Object.entries({ ARKPEDIA_CONTENT_URL: before.url, ARKPEDIA_CONTENT_TEST: before.test, ARKPEDIA_CONTENT_DISABLED: before.disabled, ARKPEDIA_EXPORT_CONTENT: before.exporting })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

test('a page and lib/content/tables.mjs must name the same tables, or the page fails to load', () => {
  assert.ok(NAMES.length > 0);
  assert.throws(() => withContentPage(ROUTE, async () => ({ props: {} })), /\/planner must pass a table loader for exactly/);
  assert.throws(() => withContentPage(ROUTE, async () => ({ props: {} }), { tables: { ...loaders([]), extra: async () => ({}) } }), /exactly/);
  assert.throws(() => withContentPage('/operators', async () => ({ props: {} }), { tables: { stray: async () => ({}) } }), /\(none\)/);
  assert.doesNotThrow(() => withContentPage(ROUTE, async () => ({ props: {} }), { tables: loaders([]) }));
});

test('the release\'s copy of a table wins; an older release without it gets this deployment\'s', async () => {
  await withRelease(async publish => {
    const calls: string[] = [];
    const get = withContentPage(ROUTE, async () => ({ props: { value: 'bundled' } }), { tables: loaders(calls) });
    const read = async () => { const result = await get({ params: {}, revalidateReason: 'stale' }); assert.ok('props' in result); return await result.props as Record<string, any>; };

    const releaseTables = Object.fromEntries(NAMES.map(name => [name, { from: 'release', name }]));
    publish({ value: 'current', __contentTables: releaseTables });
    const current = await read();
    assert.deepEqual(current.__contentTables, releaseTables);
    assert.deepEqual(calls, [], 'a table the release carries is never replaced');

    // Exported before the tables joined this page: served, and completed from the bundle.
    const warnings: string[] = [];
    const warn = console.warn;
    console.warn = (...args: unknown[]) => { warnings.push(args.join(' ')); };
    try {
      publish({ value: 'older' });
      const older = await read();
      assert.equal(older.value, 'older');
      assert.deepEqual(older.__contentTables, Object.fromEntries(NAMES.map(name => [name, bundledCopy(name)])));
      assert.deepEqual(calls, [...NAMES]);
      // Part of the tables: only the missing ones are loaded.
      const [first, ...rest] = NAMES;
      publish({ value: 'partial', __contentTables: { [first]: releaseTables[first] } });
      const partial = await read();
      assert.deepEqual(partial.__contentTables[first], releaseTables[first]);
      for (const name of rest) assert.deepEqual(partial.__contentTables[name], bundledCopy(name));
    } finally { console.warn = warn; }
    assert.ok(warnings.some(line => line.includes('predates') && line.includes(ROUTE)), warnings.join('\n'));
  });
});

test('the export and a page with no release both attach the tables from data/', async () => {
  const before = { disabled: process.env.ARKPEDIA_CONTENT_DISABLED, exporting: process.env.ARKPEDIA_EXPORT_CONTENT };
  try {
    for (const env of [{ ARKPEDIA_EXPORT_CONTENT: '1', ARKPEDIA_CONTENT_DISABLED: '0' }, { ARKPEDIA_EXPORT_CONTENT: '0', ARKPEDIA_CONTENT_DISABLED: '1' }]) {
      Object.assign(process.env, env);
      const calls: string[] = [];
      const result = await withContentPage(ROUTE, async () => ({ props: { value: 'bundled' } }), { tables: loaders(calls) })({ params: {}, revalidateReason: 'build' });
      assert.ok('props' in result);
      const props = await result.props as Record<string, any>;
      assert.equal(props.value, 'bundled');
      assert.deepEqual(missingPageTables(ROUTE, props), [], JSON.stringify(env));
      assert.deepEqual(calls, [...NAMES]);
    }
  } finally {
    for (const [key, value] of Object.entries({ ARKPEDIA_CONTENT_DISABLED: before.disabled, ARKPEDIA_EXPORT_CONTENT: before.exporting })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('the release validator refuses a page without its declared tables', () => {
  assert.deepEqual(missingPageTables(ROUTE, { __contentTables: Object.fromEntries(NAMES.map(name => [name, []])) }), []);
  assert.deepEqual(missingPageTables(ROUTE, {}), [...NAMES]);
  assert.deepEqual(missingPageTables(ROUTE, { __contentTables: { [NAMES[0]]: null } }), [...NAMES]);
  assert.deepEqual(missingPageTables('/operators', {}), []);
  const validator = fs.readFileSync('scripts/content/validate-release.mjs', 'utf8');
  assert.match(validator, /for \(const route of Object\.keys\(PAGE_TABLES\)\)/);
  assert.match(validator, /missingPageTables\(route, /);
  // Every route that declares tables is one the export publishes.
  const exported = JSON.parse(fs.readFileSync('scripts/content/pages.json', 'utf8')) as string[];
  for (const route of Object.keys(PAGE_TABLES)) assert.ok(exported.includes(route), route);
});
