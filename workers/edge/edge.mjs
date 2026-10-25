// The front cache in front of the site Worker (README.md). It answers a page from the data
// centre's cache, so a reader doesn't wait for the site Worker to start, and calls the site
// Worker only on a miss or, in the background, to refresh a stale copy.
//
// No Cloudflare imports: the site's tests run it in Node with a stand-in cache and site
// (scripts/tests/test-edge-worker.ts). worker.mjs hands it caches.default and the binding.

/** The longest a data centre keeps a page: the site Worker's own regional copies last a day
 *  too (lib/cloudflare/regionalPageCache.ts). Past its fresh time a copy is answered stale and
 *  refreshed in the background, for as long as the site's stale-while-revalidate allows. */
export const KEEP_SECONDS = 24 * 60 * 60;

/** How long a build found live is trusted before it is checked again. A page from a build no
 *  longer deployed names script and style files the new deploy doesn't have, so after a deploy
 *  an isolate answers the old build's pages for at most this long. */
export const BUILD_CHECK_SECONDS = 10;

/** Response header saying where a page came from: HIT, STALE (answered, refresh started), MISS
 *  (the site Worker answered and the copy was kept) or PASS (the site Worker answered, nothing
 *  kept). */
export const STATE_HEADER = 'x-arkpedia-edge';

// What the kept copy carries for the front cache alone; a reader never sees these.
const KEPT = 'x-arkpedia-edge-';
const KEPT_CACHE_CONTROL = `${KEPT}cache-control`;
const KEPT_VARY = `${KEPT}vary`;
const KEPT_AT = `${KEPT}stored`;
const KEPT_FRESH = `${KEPT}fresh`;
const KEPT_BUILD = `${KEPT}build`;

// Never answered from the cache: API routes (the account routes among them), the image
// optimiser, Cloudflare's own paths and the static files the site Worker's assets serve.
const PASS_PREFIXES = ['/api/', '/_next/image', '/_next/static/', '/cdn-cgi/'];
const ACCOUNT = /^\/account(\/|$)/;
// Next's preview mode renders a page per request for whoever holds these cookies.
const BYPASS_COOKIES = /(?:^|;\s*)(__prerender_bypass|__next_preview_data)=/;
const DATA = /^\/_next\/data\/([^/]+)\/.+\.json$/;
const FILE = /\.[A-Za-z0-9]{1,8}$/;
const BUILD_ID = /^[A-Za-z0-9_-]{1,64}$/;
const MANIFEST = /\/_next\/static\/([A-Za-z0-9_-]{1,64})\/_buildManifest\.js/;
// Stripped from the site Worker's request on a miss or refresh, so it answers a whole 200
// the cache can keep; the reader's own condition is then answered here.
const CONDITIONS = ['if-none-match', 'if-modified-since', 'if-match', 'if-unmodified-since', 'if-range', 'range'];

/** Whether a request is for a page or its data, which the front cache answers. Everything
 *  else goes straight to the site Worker. */
export function fromCache(request) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false;
  const { pathname } = new URL(request.url);
  if (PASS_PREFIXES.some((prefix) => pathname.startsWith(prefix)) || ACCOUNT.test(pathname)) return false;
  const { headers } = request;
  if (headers.has('authorization') || headers.has('range') || headers.has('upgrade')) return false;
  if (BYPASS_COOKIES.test(headers.get('cookie') ?? '')) return false;
  if (DATA.test(pathname)) return true;
  return !FILE.test(pathname.slice(pathname.lastIndexOf('/') + 1));
}

function directives(value) {
  const found = new Map();
  for (const part of (value ?? '').split(',')) {
    const [name, argument] = part.trim().split('=');
    if (name) found.set(name.toLowerCase(), argument === undefined ? true : argument.replace(/^"|"$/g, ''));
  }
  return found;
}

function seconds(value) {
  return typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : undefined;
}

/** How long the site's Cache-Control lets a response be kept, in seconds: `fresh` (answered
 *  as it is), `keep` (answered stale meanwhile, refreshed in the background). Null when it may
 *  not be kept: private, no-store, no-cache, or no lifetime at all. */
export function lifetime(headers) {
  const cc = directives(headers.get('cache-control'));
  if (cc.has('private') || cc.has('no-store') || cc.has('no-cache')) return null;
  const fresh = seconds(cc.get('s-maxage')) ?? seconds(cc.get('max-age'));
  if (fresh === undefined) return null;
  const stale = cc.has('must-revalidate') || cc.has('proxy-revalidate') ? 0 : (seconds(cc.get('stale-while-revalidate')) ?? 0);
  const keep = Math.min(fresh + stale, KEEP_SECONDS);
  return keep > 0 ? { fresh: Math.min(fresh, keep), keep } : null;
}

/** The build a page belongs to: a data file's from its address, a page's from the build
 *  manifest its HTML loads. Null when it can't be told, and such a page isn't kept. */
export function buildOf(url, html) {
  const data = DATA.exec(new URL(url).pathname);
  if (data) return BUILD_ID.test(data[1]) ? data[1] : null;
  return html === undefined ? null : (MANIFEST.exec(html)?.[1] ?? null);
}

/** Whether the reader's own copy is still current (If-None-Match, else If-Modified-Since). */
export function notModified(request, headers) {
  const tags = request.headers.get('if-none-match');
  if (tags !== null) {
    const etag = headers.get('etag');
    const opaque = (tag) => tag.trim().replace(/^W\//, '');
    return Boolean(etag) && (tags.trim() === '*' || tags.split(',').some((tag) => opaque(tag) === opaque(etag)));
  }
  const since = Date.parse(request.headers.get('if-modified-since') ?? '');
  const modified = Date.parse(headers.get('last-modified') ?? '');
  return !Number.isNaN(since) && !Number.isNaN(modified) && modified <= since;
}

/** The copy the Cache API keeps. Its Cache-Control becomes the time to keep it, because the
 *  Cache API honours neither s-maxage's meaning here nor stale-while-revalidate; the site's own
 *  header, Vary and the time kept ride along for the answer. Vary goes: the Cache API can't
 *  ignore it, and the pages router never varies on the RSC headers Next lists. */
export function keptCopy(response, body, { fresh, keep }, build, now) {
  const headers = new Headers(response.headers);
  headers.set(KEPT_CACHE_CONTROL, headers.get('cache-control') ?? '');
  if (headers.has('vary')) headers.set(KEPT_VARY, headers.get('vary'));
  headers.delete('vary');
  headers.delete('age');
  headers.set('cache-control', `max-age=${keep}`);
  headers.set(KEPT_AT, String(now));
  headers.set(KEPT_FRESH, String(fresh));
  headers.set(KEPT_BUILD, build);
  return new Response(body, { status: 200, headers });
}

/** Whether a kept copy is still within its fresh time. */
export function isFresh(kept, now) {
  return (now - Number(kept.headers.get(KEPT_AT))) / 1000 < Number(kept.headers.get(KEPT_FRESH));
}

/** A kept copy as the reader gets it: the site's own headers back, its age, and where it came
 *  from. A HEAD gets the headers alone; a reader whose copy is current gets a 304. */
export function answerFrom(kept, request, state, now) {
  const headers = new Headers(kept.headers);
  headers.set('cache-control', headers.get(KEPT_CACHE_CONTROL) ?? '');
  if (headers.has(KEPT_VARY)) headers.set('vary', headers.get(KEPT_VARY));
  headers.set('age', String(Math.max(0, Math.floor((now - Number(headers.get(KEPT_AT))) / 1000))));
  for (const name of [...headers.keys()].filter((name) => name.startsWith(KEPT))) headers.delete(name);
  headers.set(STATE_HEADER, state);
  if (notModified(request, headers)) {
    headers.delete('content-length');
    return new Response(null, { status: 304, headers });
  }
  return new Response(request.method === 'HEAD' ? null : kept.body, { status: 200, headers });
}

function marked(response, state) {
  const headers = new Headers(response.headers);
  headers.set(STATE_HEADER, state);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/** The request the site Worker gets on a miss or refresh: a GET without the reader's
 *  conditions, redirects handed back rather than followed. */
function siteRequest(request, purpose) {
  const headers = new Headers(request.headers);
  for (const name of CONDITIONS) headers.delete(name);
  // Lets wrangler tail tell the front cache's calls apart.
  headers.set(STATE_HEADER, purpose);
  return new Request(request.url, { method: 'GET', headers, redirect: 'manual' });
}

/**
 * The front cache's request handler. `now` is injectable for the tests. Per isolate it
 * remembers which builds are live and which refreshes are running, so concurrent readers of a
 * stale page start one refresh, not one each.
 */
export function createEdge({ now = Date.now } = {}) {
  const builds = new Map();
  const refreshing = new Map();

  /** Whether `build` is the deployed one: its build manifest is one of the site Worker's
   *  static files, which its assets answer without starting the Worker. A build gone stays
   *  gone; a failed check counts as not live, and is tried again on the next request. */
  function isLive(build, origin, site) {
    if (!build || !BUILD_ID.test(build)) return Promise.resolve(false);
    const known = builds.get(build);
    if (known && known.until > now()) return known.live;
    const entry = { until: Number.POSITIVE_INFINITY, live: undefined };
    entry.live = site
      .fetch(new Request(`${origin}/_next/static/${build}/_buildManifest.js`, { method: 'HEAD', redirect: 'manual' }))
      .then(
        (response) => {
          if (response.status !== 404) entry.until = response.status === 200 ? now() + BUILD_CHECK_SECONDS * 1000 : 0;
          return response.status === 200;
        },
        () => {
          entry.until = 0;
          return false;
        },
      );
    builds.set(build, entry);
    return entry.live;
  }

  /** Asks the site Worker for `key`'s page and keeps the answer if it may be kept. Returns the
   *  response for the reader and the pending put, or null when nothing is kept. */
  async function fetchAndKeep(key, request, purpose, { cache, site }) {
    const response = await site.fetch(siteRequest(request, purpose));
    const plan = response.status === 200 && !response.headers.has('set-cookie') && !/\*/.test(response.headers.get('vary') ?? '') && lifetime(response.headers);
    if (!plan) return { response, put: null };
    const body = await response.arrayBuffer();
    const html = /text\/html/i.test(response.headers.get('content-type') ?? '') ? new TextDecoder().decode(body) : undefined;
    const build = buildOf(key.url, html);
    const answer = new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
    if (!build) return { response: answer, put: null };
    // A page the site Worker just served is from the live build.
    builds.set(build, { until: now() + BUILD_CHECK_SECONDS * 1000, live: Promise.resolve(true) });
    return { response: answer, put: cache.put(key, keptCopy(response, body.slice(0), plan, build, now())) };
  }

  function refresh(key, request, bindings) {
    if (!refreshing.has(key.url)) {
      const job = fetchAndKeep(key, request, 'refresh', bindings)
        .then(({ put }) => put)
        .catch(() => {})
        .finally(() => refreshing.delete(key.url));
      refreshing.set(key.url, job);
    }
    return refreshing.get(key.url);
  }

  return async function answer(request, { cache, site, waitUntil }) {
    if (!fromCache(request)) return site.fetch(request);
    // The address alone, query included, whatever the method: a HEAD reads the GET's copy.
    const key = new Request(request.url);
    const bindings = { cache, site };

    const kept = await cache.match(key).catch(() => undefined);
    if (kept) {
      if (await isLive(kept.headers.get(KEPT_BUILD), new URL(request.url).origin, site)) {
        const at = now();
        const fresh = isFresh(kept, at);
        if (!fresh) waitUntil(refresh(key, request, bindings));
        return answerFrom(kept, request, fresh ? 'HIT' : 'STALE', at);
      }
      waitUntil(cache.delete(key).catch(() => {}));
    }

    // A HEAD doesn't fill the cache: the site Worker answers it as it would without one.
    if (request.method === 'HEAD') return marked(await site.fetch(request), 'PASS');
    const { response, put } = await fetchAndKeep(key, request, 'miss', bindings);
    if (!put) return marked(response, 'PASS');
    waitUntil(put.catch(() => {}));
    const headers = new Headers(response.headers);
    headers.set(STATE_HEADER, 'MISS');
    if (notModified(request, headers)) {
      headers.delete('content-length');
      return new Response(null, { status: 304, headers });
    }
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  };
}
