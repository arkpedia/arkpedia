/* The front Worker (workers/edge): which requests it answers from the data centre's cache, what
   it keeps and for how long, and that a page from a build no longer deployed is never answered.
   The cache and the site Worker are stand-ins with the Cache API's rules that matter here. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { BUILD_CHECK_SECONDS, KEEP_SECONDS, STATE_HEADER, buildOf, createEdge, fromCache, lifetime, notModified } from '../../workers/edge/edge.mjs';

const ROOT = process.cwd();
const jsonc = (file: string) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/^\s*\/\/.*$/gm, ''));

const SITE = 'https://arkpedia-cf.mocchibird.com';
const BUILD = 'Bld_one-1';
const html = (build = BUILD, text = 'page') => `<html><head><script src="/_next/static/${build}/_buildManifest.js" defer></script></head><body>${text}</body></html>`;
const PAGE_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 's-maxage=60, stale-while-revalidate=2592000',
  vary: 'RSC, Next-Router-State-Tree, Next-Router-Prefetch, Next-Router-Segment-Prefetch, Next-Url',
  'x-robots-tag': 'noindex',
};

/** Cloudflare's Cache API, as far as this Worker relies on it: GET keys by address, entries
 *  gone after their max-age, Set-Cookie never kept, Vary: * refused. */
class StandInCache {
  entries = new Map<string, { status: number; headers: [string, string][]; body: ArrayBuffer; until: number }>();
  constructor(private clock: { now: number }) {}
  async match(request: Request) {
    const entry = this.entries.get(request.url);
    if (!entry || entry.until <= this.clock.now) return undefined;
    return new Response(entry.body.slice(0), { status: entry.status, headers: entry.headers });
  }
  async put(request: Request, response: Response) {
    if (request.method !== 'GET') throw new TypeError('Cache.put: only GET');
    if (response.headers.get('vary') === '*') throw new TypeError('Cache.put: Vary: *');
    const maxAge = Number(/max-age=(\d+)/.exec(response.headers.get('cache-control') ?? '')?.[1] ?? 0);
    if (response.headers.has('set-cookie') || !maxAge) return;
    this.entries.set(request.url, { status: response.status, headers: [...response.headers], body: await response.arrayBuffer(), until: this.clock.now + maxAge * 1000 });
  }
  async delete(request: Request) {
    return this.entries.delete(request.url);
  }
}

type Route = (request: Request) => Response;

/** The site Worker behind the binding. Its static files are the live build's manifest; a page
 *  is whatever `pages` says. It records every call it gets. */
function standInSite(pages: Record<string, Route>, live = { build: BUILD }) {
  const calls: Request[] = [];
  return {
    calls,
    live,
    fetch: async (request: Request) => {
      calls.push(request);
      const { pathname } = new URL(request.url);
      const manifest = /^\/_next\/static\/([^/]+)\/_buildManifest\.js$/.exec(pathname);
      if (manifest) return new Response(request.method === 'HEAD' ? null : 'self.__BUILD_MANIFEST={}', { status: manifest[1] === live.build ? 200 : 404 });
      const route = pages[pathname];
      return route ? route(request) : new Response('Not found', { status: 404, headers: { 'cache-control': 'private, no-cache, no-store, max-age=0, must-revalidate' } });
    },
  };
}

function setUp(pages: Record<string, Route>) {
  const clock = { now: 1_800_000_000_000 };
  const cache = new StandInCache(clock);
  const site = standInSite(pages);
  const answer = createEdge({ now: () => clock.now });
  const pending: Promise<unknown>[] = [];
  const ask = async (pathOrRequest: string | Request, init?: RequestInit) => {
    const request = typeof pathOrRequest === 'string' ? new Request(SITE + pathOrRequest, init) : pathOrRequest;
    const response = await answer(request, { cache, site, waitUntil: (promise) => pending.push(promise) });
    return response;
  };
  const settle = async () => {
    while (pending.length) await pending.shift();
  };
  const pageCalls = () => site.calls.filter((call) => !call.url.includes('/_buildManifest.js'));
  return { clock, cache, site, ask, settle, pageCalls };
}

const page = (headers: Record<string, string> = {}, body = html()): Route => () => new Response(body, { status: 200, headers: { ...PAGE_HEADERS, ...headers } });

test('pages and their data come from the cache; API routes, images, static files and the account pages never do', () => {
  const ask = (url: string, init?: RequestInit) => fromCache(new Request(SITE + url, init));
  for (const url of ['/', '/operators', '/operators/Closure', "/operators/Ch'en", '/operators/Mr.%20Nothing', '/schedule?view=list', `/_next/data/${BUILD}/operators.json`, `/_next/data/${BUILD}/operators/Closure.json?name=Closure`]) {
    assert.equal(ask(url), true, url);
  }
  assert.equal(ask('/operators', { method: 'HEAD' }), true);
  for (const url of ['/api/gacha-operator/Closure', '/api/release-refresh', '/api/account-import/network', '/_next/image?url=%2Fx.png&w=64&q=75', '/_next/static/chunks/main.js', '/cdn-cgi/rum', '/account', '/account/settings', '/build-info.json', '/stages-index.json', '/images/operators/Closure.png', '/robots.txt', '/sitemap.xml']) {
    assert.equal(ask(url), false, url);
  }
  assert.equal(ask('/accounts-guide'), true, 'only /account and below');
  assert.equal(ask('/operators', { method: 'POST', body: '{}' }), false);
  assert.equal(ask('/operators', { headers: { authorization: 'Bearer x' } }), false);
  assert.equal(ask('/operators', { headers: { range: 'bytes=0-10' } }), false);
  assert.equal(ask('/operators', { headers: { upgrade: 'websocket' } }), false);
  assert.equal(ask('/operators', { headers: { cookie: 'theme=dark; __prerender_bypass=1' } }), false, 'Next preview mode');
  assert.equal(ask('/operators', { headers: { cookie: '__cf_bm=abc' } }), true, "Cloudflare's own cookies change nothing");
});

test("a response is kept only as the site's Cache-Control allows, and for at most a day", () => {
  const life = (value: string | null) => lifetime(new Headers(value === null ? {} : { 'cache-control': value }));
  assert.deepEqual(life('s-maxage=60, stale-while-revalidate=2592000'), { fresh: 60, keep: KEEP_SECONDS });
  assert.deepEqual(life('s-maxage=1, stale-while-revalidate=2592000'), { fresh: 1, keep: KEEP_SECONDS }, 'a stale page is refreshed on its next visit');
  assert.deepEqual(life('public, max-age=300, stale-while-revalidate=86400'), { fresh: 300, keep: KEEP_SECONDS }, 'page data, under the .json header rule');
  assert.deepEqual(life('public, max-age=0, s-maxage=31536000, must-revalidate'), { fresh: KEEP_SECONDS, keep: KEEP_SECONDS }, 'a page with no revalidate');
  assert.deepEqual(life('public, max-age=300'), { fresh: 300, keep: 300 }, 'no stale-while-revalidate: gone when stale');
  for (const value of [null, 'private, no-cache, no-store, max-age=0, must-revalidate', 'no-store', 'public, no-cache, max-age=60', 'private, max-age=60', 'public', 'max-age=0', 's-maxage=0, must-revalidate']) {
    assert.equal(life(value), null, String(value));
  }
});

test("a page's build is read from the manifest its HTML loads; a data file's from its address", () => {
  assert.equal(buildOf(`${SITE}/operators`, html('abc_DEF-123')), 'abc_DEF-123');
  assert.equal(buildOf(`${SITE}/operators`, '<html>no scripts</html>'), null);
  assert.equal(buildOf(`${SITE}/operators`), null);
  assert.equal(buildOf(`${SITE}/_next/data/abc_DEF-123/operators/Closure.json`), 'abc_DEF-123');
  assert.equal(buildOf(`${SITE}/_next/data/a%2Fb/operators.json`), null);
});

test("a reader's own copy is answered with a 304 when its ETag or date still matches", () => {
  const request = (headers: Record<string, string>) => new Request(SITE + '/x', { headers });
  const tagged = new Headers({ etag: '"abc"' });
  assert.equal(notModified(request({ 'if-none-match': '"abc"' }), tagged), true);
  assert.equal(notModified(request({ 'if-none-match': 'W/"abc"' }), tagged), true);
  assert.equal(notModified(request({ 'if-none-match': '"old", "abc"' }), tagged), true);
  assert.equal(notModified(request({ 'if-none-match': '*' }), tagged), true);
  assert.equal(notModified(request({ 'if-none-match': '"old"' }), tagged), false);
  assert.equal(notModified(request({ 'if-none-match': '"abc"' }), new Headers()), false, 'HTML has no ETag');
  assert.equal(notModified(request({}), tagged), false);
  const dated = new Headers({ 'last-modified': 'Fri, 23 Oct 2026 10:00:00 GMT' });
  assert.equal(notModified(request({ 'if-modified-since': 'Fri, 23 Oct 2026 10:00:00 GMT' }), dated), true);
  assert.equal(notModified(request({ 'if-modified-since': 'Fri, 23 Oct 2026 09:00:00 GMT' }), dated), false);
});

test('a miss asks the site Worker once and keeps the page; the next reader gets it from the cache', async () => {
  const { ask, settle, pageCalls } = setUp({ '/operators': page() });
  const first = await ask('/operators');
  assert.equal(first.status, 200);
  assert.equal(first.headers.get(STATE_HEADER), 'MISS');
  assert.equal(await first.text(), html());
  await settle();
  const second = await ask('/operators');
  assert.equal(second.headers.get(STATE_HEADER), 'HIT');
  assert.equal(await second.text(), html());
  assert.equal(pageCalls().length, 1);
  assert.equal(pageCalls()[0].headers.get(STATE_HEADER), 'miss', 'wrangler tail can tell the call apart');
  // The site's own headers come back as it sent them, with no trace of what the cache keeps.
  assert.equal(second.headers.get('cache-control'), PAGE_HEADERS['cache-control']);
  assert.equal(second.headers.get('vary'), PAGE_HEADERS.vary);
  assert.equal(second.headers.get('x-robots-tag'), 'noindex');
  assert.equal(second.headers.get('age'), '0');
  assert.deepEqual([...second.headers.keys()].filter((name) => name.startsWith('x-arkpedia-edge-')), []);
});

test('the cache key is the address with its query; the Cache API never sees Vary', async () => {
  const { ask, settle, cache, pageCalls } = setUp({ '/operators': page() });
  await ask('/operators');
  await settle();
  await ask('/operators?owned=missing');
  await settle();
  assert.equal(pageCalls().length, 2);
  for (const entry of cache.entries.values()) assert.equal(new Headers(entry.headers).has('vary'), false);
  assert.deepEqual([...cache.entries.keys()].sort(), [`${SITE}/operators`, `${SITE}/operators?owned=missing`]);
});

test('a stale page is answered at once and refreshed in the background, once for concurrent readers', async () => {
  let version = 1;
  const { ask, settle, clock, pageCalls } = setUp({ '/schedule': () => new Response(html(BUILD, `v${version}`), { status: 200, headers: PAGE_HEADERS }) });
  await ask('/schedule');
  await settle();
  clock.now += 61_000;
  version = 2;
  const [a, b] = await Promise.all([ask('/schedule'), ask('/schedule')]);
  assert.equal(a.headers.get(STATE_HEADER), 'STALE');
  assert.equal(b.headers.get(STATE_HEADER), 'STALE');
  assert.equal(await a.text(), html(BUILD, 'v1'), 'the reader never waits for the refresh');
  assert.equal(a.headers.get('age'), '61');
  await settle();
  assert.equal(pageCalls().length, 2, 'one refresh for both readers');
  assert.equal(pageCalls()[1].headers.get(STATE_HEADER), 'refresh');
  const after = await ask('/schedule');
  assert.equal(after.headers.get(STATE_HEADER), 'HIT');
  assert.equal(await after.text(), html(BUILD, 'v2'));
});

test('a refresh that fails keeps the stale copy', async () => {
  let failing = false;
  const { ask, settle, clock } = setUp({ '/enemies': () => (failing ? new Response('Error', { status: 500 }) : page()(new Request(SITE))) });
  await ask('/enemies');
  await settle();
  clock.now += 61_000;
  failing = true;
  await ask('/enemies');
  await settle();
  const again = await ask('/enemies');
  assert.equal(again.headers.get(STATE_HEADER), 'STALE');
  assert.equal(await again.text(), html());
});

test("a page is gone from the cache once the site's stale-while-revalidate (or a day) is over", async () => {
  const { ask, settle, clock, pageCalls } = setUp({ '/skins': page({ 'cache-control': 'public, max-age=300' }) });
  await ask('/skins');
  await settle();
  clock.now += 301_000;
  assert.equal((await ask('/skins')).headers.get(STATE_HEADER), 'MISS');
  await settle();
  clock.now += KEEP_SECONDS * 1000;
  assert.equal((await ask('/skins')).headers.get(STATE_HEADER), 'MISS');
  assert.equal(pageCalls().length, 3);
});

test('nothing is kept that the site marks private or no-store, sets a cookie on, or answers with anything but 200', async () => {
  const { ask, settle, cache } = setUp({
    '/private': page({ 'cache-control': 'private, no-cache, no-store, max-age=0, must-revalidate' }),
    '/none': page({ 'cache-control': '' }),
    '/cookie': page({ 'set-cookie': 'session=1; Path=/; HttpOnly' }),
    '/any': page({ vary: '*' }),
    '/moved': () => new Response(null, { status: 308, headers: { location: '/operators', 'cache-control': 's-maxage=60' } }),
    '/broken': () => new Response('Error', { status: 500, headers: { 'cache-control': 's-maxage=60' } }),
    '/text': () => new Response('plain', { status: 200, headers: { 'content-type': 'text/plain', 'cache-control': 's-maxage=60' } }),
    '/nobuild': page({}, '<html>no manifest</html>'),
  });
  for (const url of ['/private', '/none', '/cookie', '/any', '/moved', '/broken', '/text', '/nobuild', '/missing']) {
    const response = await ask(url);
    assert.equal(response.headers.get(STATE_HEADER), 'PASS', url);
  }
  const moved = await ask('/moved');
  assert.equal(moved.status, 308, 'a redirect goes back to the reader, not followed');
  assert.equal(moved.headers.get('location'), '/operators');
  assert.equal((await ask('/cookie')).headers.get('set-cookie'), 'session=1; Path=/; HttpOnly');
  await settle();
  assert.equal(cache.entries.size, 0);
});

test('requests that never use the cache reach the site Worker as they came', async () => {
  const { ask, site, cache } = setUp({ '/api/release-refresh': (request) => new Response(request.method, { status: 200, headers: { 'cache-control': 's-maxage=60' } }) });
  const request = new Request(SITE + '/api/release-refresh', { method: 'POST', body: 'x', headers: { authorization: 'Bearer t' } });
  const response = await ask(request);
  assert.equal(await response.text(), 'POST');
  assert.equal(response.headers.has(STATE_HEADER), false);
  assert.equal(site.calls[0], request, 'the very request, body and all');
  assert.equal(cache.entries.size, 0);
});

test('a HEAD reads the kept copy without a body, and never fills the cache itself', async () => {
  const { ask, settle, cache, pageCalls } = setUp({ '/operators': page() });
  const missed = await ask('/operators', { method: 'HEAD' });
  assert.equal(missed.headers.get(STATE_HEADER), 'PASS');
  assert.equal(pageCalls()[0].method, 'HEAD');
  await settle();
  assert.equal(cache.entries.size, 0);
  await ask('/operators');
  await settle();
  const hit = await ask('/operators', { method: 'HEAD' });
  assert.equal(hit.status, 200);
  assert.equal(hit.headers.get(STATE_HEADER), 'HIT');
  assert.equal(hit.body, null);
  assert.equal(pageCalls().length, 2);
});

test("a conditional request gets a 304 from the kept copy, and the site Worker is asked for the whole page", async () => {
  const etag = '"3e06aba6"';
  const data = `/_next/data/${BUILD}/operators.json`;
  const { ask, settle, pageCalls } = setUp({
    [data]: (request) =>
      request.headers.get('if-none-match') === etag
        ? new Response(null, { status: 304, headers: { etag } })
        : new Response('{"pageProps":{}}', { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=300, stale-while-revalidate=86400', etag } }),
  });
  const conditional = { headers: { 'if-none-match': etag } };
  const missed = await ask(data, conditional);
  assert.equal(missed.status, 304);
  assert.equal(missed.headers.get(STATE_HEADER), 'MISS');
  assert.equal(pageCalls()[0].headers.has('if-none-match'), false, 'the cache needs the whole 200');
  await settle();
  const hit = await ask(data, conditional);
  assert.equal(hit.status, 304);
  assert.equal(hit.headers.get(STATE_HEADER), 'HIT');
  assert.equal(hit.headers.get('etag'), etag);
  assert.equal(hit.body, null);
  const changed = await ask(data, { headers: { 'if-none-match': '"old"' } });
  assert.equal(changed.status, 200);
  assert.equal(await changed.text(), '{"pageProps":{}}');
  assert.equal(pageCalls().length, 1);
});

test('a page from a build no longer deployed is never answered: it is fetched again', async () => {
  const { ask, settle, site, clock, pageCalls } = setUp({ '/': () => new Response(html(site.live.build), { status: 200, headers: PAGE_HEADERS }) });
  await ask('/');
  await settle();
  // A deploy: the old build's manifest is gone from the site Worker's static files.
  site.live.build = 'Bld_two-2';
  clock.now += BUILD_CHECK_SECONDS * 1000;
  const after = await ask('/');
  assert.equal(after.headers.get(STATE_HEADER), 'MISS');
  assert.equal(await after.text(), html('Bld_two-2'));
  await settle();
  assert.equal((await ask('/')).headers.get(STATE_HEADER), 'HIT');
  assert.equal(pageCalls().length, 2);
});

test('the live build is checked at most once per interval per isolate, and a gone one only once', async () => {
  let current = BUILD;
  const live: Route = () => new Response(html(current), { status: 200, headers: PAGE_HEADERS });
  const { ask, settle, site, clock } = setUp({ '/': live, '/operators': live });
  const manifestChecks = () => site.calls.filter((call) => call.url.endsWith('/_buildManifest.js')).length;
  await ask('/');
  await ask('/operators');
  await settle();
  await Promise.all([ask('/'), ask('/operators'), ask('/')]);
  assert.equal(manifestChecks(), 0, 'a page the site Worker just served is from the live build');
  clock.now += BUILD_CHECK_SECONDS * 1000;
  await Promise.all([ask('/'), ask('/operators'), ask('/')]);
  assert.equal(manifestChecks(), 1, 'one check for concurrent readers');
  const check = site.calls.find((call) => call.url.endsWith('/_buildManifest.js'))!;
  assert.equal(check.method, 'HEAD');
  assert.equal(new URL(check.url).pathname, `/_next/static/${BUILD}/_buildManifest.js`);
  // A deploy: the first page of the old build finds it gone, the next one already knows.
  site.live.build = current = 'Bld_two-2';
  clock.now += BUILD_CHECK_SECONDS * 1000;
  assert.equal((await ask('/')).headers.get(STATE_HEADER), 'MISS');
  assert.equal((await ask('/operators')).headers.get(STATE_HEADER), 'MISS');
  assert.equal(manifestChecks(), 2);
});

test('the front Worker is set up as the README says: in front of the site Worker, bound to it by name', () => {
  const edge = jsonc('workers/edge/wrangler.jsonc');
  assert.equal(edge.main, 'worker.mjs');
  assert.deepEqual(edge.services, [{ binding: 'SITE', service: jsonc('wrangler.jsonc').name }]);
  assert.deepEqual(edge.routes, [{ pattern: 'arkpedia-cf.mocchibird.com/*', zone_name: 'mocchibird.com' }]);
  assert.equal(edge.workers_dev, false);
  assert.equal(edge.compatibility_date, jsonc('wrangler.jsonc').compatibility_date);
  // Dependabot bumps only the site's wrangler, so the front Worker's own pin may lag behind it,
  // but not by a major version.
  const major = (version: string) => version.replace(/^\D*/, '').split('.')[0];
  const pinned = JSON.parse(fs.readFileSync(path.join(ROOT, 'workers/edge/package.json'), 'utf8')).devDependencies.wrangler;
  const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8')).packages['node_modules/wrangler'].version;
  assert.equal(major(pinned), major(site), `workers/edge pins wrangler ${pinned}, the site runs ${site}: bump workers/edge/package.json and its lockfile`);
});
