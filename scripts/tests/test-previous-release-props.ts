import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createElement, type ComponentType } from 'react';
import type { AppProps } from 'next/app';
import type { GetStaticProps } from 'next';
import './css-modules';
import { renderOnHost } from './host-clock';
import { pageFilePath } from '../../lib/content/pagePaths.mjs';
import { CONTENT_SCHEMA, type ContentManifest, type ContentPointer } from '../../lib/content/types';
import App from '../../pages/_app';
import { getSeasonalChallenge, seasonalFromRelease } from '../../lib/stages/terminal';
import { discoverFromRelease, getDiscoverPageData, type DiscoverPageData } from '../../lib/music/albumsDataServer';
import CONTENT_ROUTES from '../content/pages.json';

/*
 * A deploy renders against the live content release, and right after one that release is
 * still the one the PREVIOUS code compiled: the release gate (scripts/content/deploy-gate.mjs)
 * holds the next release until production runs the new code. So every page has to render
 * the previous release's props as well as its own.
 *
 * feat/stages-parity-pipeline moved /stages/seasonal to `challenges` (from `vector` and
 * `trials`) and gave /stages/content/[id] a server-side `scene`. Run against the live
 * release (7f8a8a8d, compiled by fa2bdc22), Deploy's build failed prerendering
 * /stages/seasonal and all 151 content pages -- and with production left on the old code,
 * the gate would have held every release after it, so neither side could move. Found
 * 2026-09-26 by building the branch the way deploy.yml does. The same branch gave
 * /music/discover `pendingSongs` and `recentAlbums[].playable`; that release has neither,
 * and there the build passed while the deployed page crashed in the browser as soon as a
 * reader searched (`pendingSongs.filter` of undefined), and every recent album said "Not
 * on YouTube yet". No error is thrown on the server for that one, so rendering is not
 * enough of a guard.
 *
 * fixtures/previous-release/ holds the live release's copy of every content route whose
 * page that branch changed (release.json lists them; refresh.mjs there fetches them, and a
 * branch that changes a page's props should refresh it first). For each route this serves
 * that copy as a release, runs the page's real getStaticProps against it (as the Deploy
 * build does), renders the page inside the site's App from what comes back, and then
 * compares the props' shape with what this code builds from its own data: a field this
 * code emits that the release's props still lack after finalize is exactly what a
 * component reads as undefined. Fill it in the page's withContentPage finalize, or, when
 * only the data differs (a field the old data never had anywhere), list it in DATA_ONLY
 * with the reason. This code's own props come from each page's builder on this checkout's
 * data, as `next dev` gets them, so /planner's writes public/planner-data (ignored) here
 * as it does there; none needs prebuild's generated files.
 *
 * A content route the release does not publish at all (release.json lists every route it
 * does) renders from this checkout's data at build time, and the deploy ships that page.
 * Its ISR regeneration on Vercel is another matter: there the function has no data/
 * (Vercel's traces leave it out) and lib/content/server.ts throws "Published content is
 * missing <route>", so Next keeps the build's page until a release compiled by this code
 * goes live. The same branch made /community a content route, and on the live release its
 * feeds and LIVE badges froze at build time for up to a day (found 2026-09-26 by serving
 * the Deploy build with VERCEL=1 and a clock past the revalidate window). So each such
 * route runs here the way a stale regeneration on Vercel runs it, from a directory with no
 * data/ in it and with the feeds it fetches stubbed, and must come back with props:
 * withContentPage's bundledWhenUnpublished, for a builder that reads no data file.
 */
const ROOT = path.resolve(__dirname, '../..');
const FIXTURES = path.join(__dirname, 'fixtures/previous-release');
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');

interface PreviousRelease {
  release: string; revision: string; generator: string; generatedAt: string; manifestSha256: string;
  pages: Record<string, { file: string; bytes: number; sha256: string }>;
  /** Every route the release's manifest publishes. */
  routes: string[];
}
const PREVIOUS = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'release.json'), 'utf8')) as PreviousRelease;

/** The page exactly as the release published it: release.json holds the manifest's digest. */
const bodies = new Map<string, string>();
function previousPage(route: string): string {
  const cached = bodies.get(route);
  if (cached) return cached;
  const entry = PREVIOUS.pages[route];
  assert.ok(entry, `fixtures/previous-release has no ${route}`);
  const body = fs.readFileSync(path.join(FIXTURES, entry.file));
  assert.equal(body.length, entry.bytes, `${entry.file} is the release's ${route}, byte for byte`);
  assert.equal(sha(body), entry.sha256, `${entry.file} is the release's ${route}, byte for byte`);
  bodies.set(route, body.toString());
  return body.toString();
}

/** A template's params, when a route is one of its pages. */
function matchTemplate(template: string, route: string): Record<string, string> | null {
  if (template === route) return {};
  const names: string[] = [];
  const pattern = new RegExp(`^${template.replace(/[.*+?^${}()|\\]/g, '\\$&').replace(/\\?\[([^\]]+)\\?\]/g, (_, name: string) => { names.push(name); return '([^/]+)'; })}$`);
  const match = pattern.exec(route);
  return match ? Object.fromEntries(names.map((name, i) => [name, decodeURIComponent(match[i + 1])])) : null;
}

/** The route template (scripts/content/pages.json) a route is served by, and its params. */
function templateOf(route: string): { template: string; params?: Record<string, string> } {
  if ((CONTENT_ROUTES as string[]).includes(route)) return { template: route };
  for (const template of CONTENT_ROUTES as string[]) {
    const params = matchTemplate(template, route);
    if (params) return { template, params };
  }
  throw new Error(`${route} is not a content route (scripts/content/pages.json)`);
}

/** This checkout's content routes that the previous release publishes no page of. */
const UNPUBLISHED = (CONTENT_ROUTES as string[]).filter((template) => !PREVIOUS.routes.some((route) => matchTemplate(template, route)));

type PageModule = { default: ComponentType<object>; getStaticProps: GetStaticProps<object> };
async function pageModule(template: string): Promise<PageModule> {
  const rel = template === '/' ? 'index' : template.slice(1);
  const file = [`${rel}.tsx`, `${rel}/index.tsx`].map((name) => path.join(ROOT, 'pages', name)).find((name) => fs.existsSync(name));
  assert.ok(file, `a page file for ${template}`);
  // Loaded as CommonJS, the module's exports can arrive as the namespace's default.
  const loaded = await import(file) as Partial<PageModule> & { default: PageModule | ComponentType<object> };
  return typeof loaded.getStaticProps === 'function' ? loaded as PageModule : loaded.default as PageModule;
}

/** A release per call, each with its own id: the loader keeps the release it read last
 *  (lib/content/server.ts) and answers from it again under the same id, at the old
 *  server's address. */
let releases = 0;
async function withRelease<T>(routes: string[], run: (release: string) => Promise<T>, env: Partial<Record<typeof ENV_KEYS[number], string>> = {}): Promise<T> {
  const documents = new Map<string, string>();
  const id = sha(`previous-release-props ${process.pid} ${releases++}`);
  const revision = id.slice(0, 40), release = sha(id);
  const manifest: ContentManifest = { schema: CONTENT_SCHEMA, release, generatedAt: PREVIOUS.generatedAt, generator: PREVIOUS.generator,
    assets: { 'arkpedia-image-assets': revision, 'arkpedia-skin-assets': revision }, pages: {}, files: {} };
  for (const route of routes) {
    const body = previousPage(route), at = pageFilePath(route);
    documents.set(`/${revision}/release/${at}`, body);
    manifest.pages[route] = { path: at, bytes: Buffer.byteLength(body), sha256: sha(body) };
  }
  const body = JSON.stringify(manifest);
  documents.set(`/${revision}/release/manifest.json`, body);
  const pointer: ContentPointer = { schema: CONTENT_SCHEMA, release, revision, manifestSha256: sha(body) };
  const server = createServer((request, response) => {
    if (request.url === '/live/current.json') { response.end(JSON.stringify(pointer)); return; }
    const found = documents.get(decodeURIComponent(request.url!));
    if (!found) { response.writeHead(404); response.end(); return; }
    response.end(found);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  try {
    return await withEnv({ ...env, ARKPEDIA_CONTENT_URL: `http://127.0.0.1:${address.port}`, ARKPEDIA_CONTENT_TEST: '1', ARKPEDIA_CONTENT_DISABLED: '0', ARKPEDIA_EXPORT_CONTENT: '0' }, () => run(release));
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

// VERCEL makes lib/content/server.ts refuse this checkout's data on a regeneration; the
// feed credentials make /community's finalize take every fetch it takes in production.
const ENV_KEYS = ['ARKPEDIA_CONTENT_URL', 'ARKPEDIA_CONTENT_TEST', 'ARKPEDIA_CONTENT_DISABLED', 'ARKPEDIA_EXPORT_CONTENT',
  'VERCEL', 'TWITCH_CLIENT_ID', 'TWITCH_CLIENT_SECRET', 'YOUTUBE_API_KEY'] as const;
async function withEnv<T>(values: Partial<Record<typeof ENV_KEYS[number], string>>, run: () => Promise<T>): Promise<T> {
  const before = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) { if (values[key] === undefined) delete process.env[key]; else process.env[key] = values[key]; }
  try {
    return await run();
  } finally {
    for (const key of ENV_KEYS) { if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key]; }
  }
}

async function propsOf(getStaticProps: GetStaticProps<object>, params?: Record<string, string>, revalidateReason: 'build' | 'stale' = 'build'): Promise<Record<string, unknown>> {
  const result = await getStaticProps({ params, revalidateReason });
  assert.ok('props' in result, 'getStaticProps returned props');
  return await result.props as Record<string, unknown>;
}

/** The page inside the site's App, as the build prerenders it: App supplies the content
 *  release, the tables and the music player every page may read. */
function renderPage(Page: ComponentType<object>, props: object): string {
  const app = createElement(App as ComponentType<AppProps>, { Component: Page, pageProps: props, router: undefined as never });
  return renderOnHost('UTC', Date.parse('2026-09-26T12:00:00Z'), app);
}

/** The previous release's props, through this code's getStaticProps and finalize. */
async function fromPreviousRelease(route: string) {
  const { template, params } = templateOf(route);
  const page = await pageModule(template);
  return withRelease(Object.keys(PREVIOUS.pages), async (release) => {
    const props = await propsOf(page.getStaticProps, params);
    assert.equal((props.__contentRelease as { release?: string } | undefined)?.release, release, `${route}: the props came from the release, not the bundled data`);
    return { page, params, props };
  });
}

// --- the shape of a page's props -------------------------------------------------------

/** Where each kind of value sits in a page's props: '.songs[].albumId' -> {'string'}. */
type Shape = Map<string, Set<string>>;
const FIELD = /^[A-Za-z_$][\w$]*$/;
const MAX_DEPTH = 4;
function shapeOf(value: unknown, at = '', shape: Shape = new Map(), depth = 0): Shape {
  if (value === null || value === undefined) return shape;
  const kind = Array.isArray(value) ? 'array' : typeof value;
  if (!shape.has(at)) shape.set(at, new Set());
  shape.get(at)!.add(kind);
  if (depth >= MAX_DEPTH) return shape;
  if (Array.isArray(value)) {
    for (const item of value) shapeOf(item, `${at}[]`, shape, depth + 1);
  } else if (kind === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    // A record keyed by the data (names, ids, series) rather than a set of fields: its
    // keys come and go with the data, so only the shape of its values counts.
    const record = entries.length > 20 || entries.some(([key]) => !FIELD.test(key));
    for (const [key, item] of entries) shapeOf(item, record ? `${at}.*` : `${at}.${key}`, shape, depth + 1);
  }
  return shape;
}
const parentOf = (at: string) => at.replace(/(\[\]|\.\*|\.[A-Za-z_$][\w$]*)$/, '');

/**
 * What this code's props carry that the release's props (after finalize) do not: a field
 * missing where the release has the object that should hold it, or an object or list where
 * the release has only a plain value. A field of something the release has none of (an
 * empty list, say) is not reported on its own; its container is, if that is missing.
 */
function missingFromRelease(current: Shape, previous: Shape): string[] {
  const populated = new Set([...previous.keys()].filter((at) => at !== '').map(parentOf));
  const missing: string[] = [];
  for (const [at, kinds] of current) {
    if (at === '' || at.startsWith('.__content')) continue;
    const had = previous.get(at);
    if (!had) { if (populated.has(parentOf(at))) missing.push(at); continue; }
    for (const kind of ['object', 'array']) {
      if (kinds.has(kind) && !had.has(kind)) missing.push(`${at} (${kind}; the release has ${[...had].join(' or ')})`);
    }
  }
  return missing;
}

/**
 * Fields this code's props carry that the previous release lacks only because its DATA
 * never had them anywhere, not because a page expects them. Each needs the reason a
 * component cannot read it as undefined; anything else belongs in the page's finalize.
 */
const DATA_ONLY: Record<string, Record<string, string>> = {
  // Endfield's music (data/endfield-albums.json, 2026-10-22) marks only its own records; a release
  // compiled before it carries no Endfield record, and the page reads an absent game as Arknights.
  '/music/discover': {
    '.songs[].game': "'endfield' on Arknights: Endfield's songs only; absent on every Arknights song, so a release from before Endfield's music has none, and lib/music/discoverFilter.ts reads absent as Arknights",
    '.recentAlbums[].game': "the same mark, on Endfield's albums in Recently added",
    '.albums[].game': "the same mark, on Endfield's albums in Browse by album",
  },
  '/': {
    '.ongoingEvents[].shopEndAt': "the event store's close (sync-event-windows.mjs, from activity_table rewardEndTime), which the data first carried on 2026-09-30; GameWindowTimes has it optional, and eventShopEnd reads its absence as a store that closes with the stages, as the page did before",
    // loadGameEvents spreads each event's `global` onto it, note included. The note is null on
    // most events, '' on some and a sentence on others ("ESTIMATED Global date"), and the shape
    // skips nulls, so whether the field shows depends on which events run on the day: the
    // ongoing ones on 2026-10-01 had '' where the release's had null, and the content release
    // runs this test on that day's data. The page reads it only as optional text (isPredicted).
    '.ongoingEvents[].note': "each event's global.note, spread onto it (loadGameEvents): null, '' or a sentence depending on the event, so present or not by which events run that day",
    '.upcomingEvent.note': "the same global.note, on the next event to open",
    // The same spread carries an event's exact window, which only events whose times the client
    // tables or an announcement gave have (sync-event-windows.mjs); a date-only one has none. So
    // whether the fields show depends on which events run that day: on 2026-10-14 the release's
    // running event was a date-only estimate and the refresh's had the client's times. finalizeHome
    // reparses every event with parseGameWindow(dateRange, event), which falls back to the date
    // range when they are absent, and EventsPanel reads only start/end.
    '.ongoingEvents[].startAt': "an event's exact opening (GameWindowTimes, optional), present only on events the client or an announcement timed; finalizeHome falls back to the date range without it",
    '.ongoingEvents[].endAt': "an event's exact close, optional the same way, with the same fallback",
    '.ongoingEvents[].timingSource': "where the exact window came from, optional with it; nothing on / reads it",
    // Which outfits are on sale depends on the day's windows, and two optional outfit fields come
    // with only some outfits: on 2026-10-20 Global's own Outfit Store windows (#585) listed the
    // anniversary's 28, some with these, where the release's 3 had neither. SkinsCarousel reads
    // neither field (name, art, price and window only).
    '.ongoingSkins[].searchAliases': "an outfit's other search names (Skin, optional), on some outfits only; SkinsCarousel does not read it",
    '.ongoingSkins[].fashionReviewDate': "an outfit's Fashion Review date (Skin, optional), on some outfits only; SkinsCarousel does not read it",
    '.upcomingEvent.startAt': "the same exact opening, on the next event to open",
    '.upcomingEvent.endAt': "the same exact close, on the next event to open",
    '.upcomingEvent.timingSource': "the same window source, on the next event to open",
    '.upcomingEvent.shopEndAt': "the event store's close (as on .ongoingEvents[]), on the next event to open; eventShopEnd reads its absence as a store that closes with the stages",
    // The finalize fetches the channels' live feeds at each request, and they answer nothing
    // for hours at a time (YouTube's returned 404 on 2026-09-27): the release's copy was made
    // while they did, and on 2026-10-02 they answered, so the field showed here and not there.
    '.featuredVideo': "the newest video from the channels' live YouTube feeds, fetched at the request; null whenever the feeds answer nothing",
    '.featuredStream': "the live Twitch stream, fetched at the request the same way; null whenever none is live or the API answers nothing",
    // getHomeGachaBanners spreads whole banner records, and a banner an official CN post announced
    // keeps the post's name for good: it reaches this list once Global dates the banner.
    '.ongoingBanners[].global_date_estimated': 'optional timing confidence on imported Global banners; absent older records retain their existing date handling',
    '.ongoingBanners[].global_window': 'optional exact game-table window; parseBannerWindow falls back to the legacy global_date range when absent',
    '.ongoingBanners[].globalPoolId': 'optional game pool identity for account pull-history matching; the homepage does not read it',
    '.ongoingBanners[].globalScheduleStatus': 'optional source confidence on banner data; the homepage does not read it, and the simulator timing label uses its legacy date label when absent',
    '.ongoingBanners[].announcedName': "the name an official CN announcement gave a banner (applyAnnouncements, new on 2026-10-04), on the banners an announcement created; HeadhuntingBanner has it optional and nothing on the page reads it",
    // Which outfits are on sale is worked out at the day's clock from each release's own outfit
    // records, and on 2026-10-15 one in the fixture's older records came on sale: those records
    // predate the release-time fields, so the release's ongoingSkins lacked them that day.
    '.ongoingSkins[].cnReleaseAt': "an outfit's CN release time (catalogue-model.mjs), absent from older outfit records; Skin has it optional and the carousel never reads it",
    '.ongoingSkins[].globalReleaseAt': "the same outfit's Global release time, absent from older records the same way",
  },
  '/schedule': {
    '.events[].linkedSkinNames': 'optional run-specific inventory; older releases safely use strict edition-aware matching until their content refresh',
    '.operators[].portraitPending': 'optional publication status while a new portrait is pending; older releases retain their existing portrait rendering',
    '.events[].aliases': 'optional historic names on renamed source records; Schedule does not read this field',
    '.events[].bannerName': 'optional metadata on new headhunting calendar entries; older releases contain only event entries and keep their event navigation',
    '.eventRows[].bannerName': 'optional metadata on new headhunting rows; older releases contain only events and keep their existing behavior',
    '.events[].modeId': 'permanent RA launch metadata is optional; releases without it contain only timed events and retain their existing behavior',
    '.events[].cn.releaseDate': 'permanent RA launch metadata is optional; releases without it contain only timed events and retain their existing behavior',
    '.events[].global.releaseDate': 'permanent RA launch metadata is optional; releases without it contain only timed events and retain their existing behavior',
    '.eventRows[].modeId': 'permanent RA launch metadata is optional; releases without it contain only timed events and retain their existing behavior',
    '.events[].global.shopEndAt': "the event store's close (sync-event-windows.mjs, from activity_table rewardEndTime), which the data first carried on 2026-09-30; GameWindowTimes has it optional, and eventShopEnd reads its absence as a store that closes with the stages, as the page did before; nothing on /schedule reads it yet",
  },
  '/skins': {
    '.events[].linkedSkinNames': 'optional run-specific inventory; older releases safely use strict edition-aware matching until their content refresh',
    '.events[].aliases': 'optional historic names on renamed source records; the skin page does not read this field',
    '.events[].modeId': 'permanent RA launch metadata is optional; releases without it contain only timed events and retain their existing behavior',
    '.events[].cn.releaseDate': 'permanent RA launch metadata is optional; releases without it contain only timed events and retain their existing behavior',
    '.events[].global.releaseDate': 'permanent RA launch metadata is optional; releases without it contain only timed events and retain their existing behavior',
    '.availabilityWindows[].inventoryComplete': 'source metadata spread by confirmedWindow from the refreshed acquisition-window records; SkinWindow does not require it, and no skin component reads it, so the previous release can omit it',
    '.events[].global.shopEndAt': "the event store's close (sync-event-windows.mjs, from activity_table rewardEndTime), which the data first carried on 2026-09-30; GameWindowTimes has it optional, and eventShopEnd reads its absence as a store that closes with the stages, as the page did before; nothing on /skins reads it yet",
  },
  '/gacha': {
    '.banners[].globalForecastWithdrawn': 'optional status for withdrawn estimates; older releases retain their existing provisional label until source publication',
    '.banners[].globalScheduleStatus': 'optional imported timing confidence; bannerTimingLabel compares it safely and retains the legacy label when absent',
    '.banners[].aliases': 'optional former banner names used by historical links; the deep-link resolver uses optional chaining when absent',
    '.banners[].globalLineupPending': 'optional metadata on newly restored special banner forecasts; older releases omitted these banners altogether, so existing Global banners remain confirmed',
    '.banners[].announcedLineup': "the rate-ups an official CN announcement names (applyAnnouncements, new on 2026-10-04), on a banner only while an operator it names has no record yet; HeadhuntingBanner has it optional, and lineupPendingNote reads its absence as 'Lineup to be confirmed.', as the page said before",
  },
  '/operators': {
    '.operators[].portraitPending': 'optional publication status while a new portrait is pending; older releases retain their existing portrait rendering',
    '.operators[].availableUntil': 'the debut\'s end (getScheduledOperatorDebut), new on 2026-09-30; RosterOperator has it optional, and isDebutAvailable counts two weeks from the release without it, as the roster did before',
    '.operators[].obtain': "how an operator is obtained (obtainMethodsOf), for the Obtain filter, new on 2026-10-29; RosterOperator has it optional, and the filter is drawn only once some operator carries it, so a release from before it shows the roster as it did",
    '.limitedBannerInfo': "the Limited operators' banner appearances, for the Obtain filter's Limited notes, new with it; optional on Props, read as none until a release carries it",
    '.celebrationBannerDates': "the Celebration banner dates the same notes estimate a rerun from, new with the filter; optional on Props, read as none until a release carries it",
  },
  '/stages/content/sandbox_1': {
    '.ra.contentId': 'data/ra-nodes.json names its season now; RaNodeData has it optional, and only raMapData reads it, on the server, to pick the file -- RaMap never does',
  },
};

// --- a regeneration on Vercel, for a route the release lacks ----------------------------

/**
 * The feeds a page's finalize fetches, answered here: every request that is not to the
 * test's own release server gets its answer from this list, and one it does not cover is
 * reported, never sent. The stub video and stream mention Arknights, as the feed filter
 * (lib/music/contentFilter.ts) requires.
 */
const FEEDS: { host: string; answer: (url: URL) => unknown }[] = [
  { host: 'www.youtube.com', answer: (url) => {
    const channel = url.searchParams.get('channel_id');
    assert.ok(url.pathname === '/feeds/videos.xml' && channel, `a YouTube channel feed, not ${url.href}`);
    return `<feed><entry><yt:videoId>stub-${channel}</yt:videoId><title>Arknights stub upload</title><published>2026-09-26T10:00:00+00:00</published><media:thumbnail url="https://i.ytimg.com/vi/stub-${channel}/hqdefault.jpg" width="480" height="360"/></entry></feed>`;
  } },
  { host: 'www.googleapis.com', answer: (url) => ({ items: (url.searchParams.get('id') ?? '').split(',').filter(Boolean).map((id) => ({ id, snippet: { liveBroadcastContent: 'none' } })) }) },
  { host: 'id.twitch.tv', answer: () => ({ access_token: 'stub-token', expires_in: 3600 }) },
  { host: 'api.twitch.tv', answer: (url) => url.pathname === '/helix/games'
    ? { data: [{ id: '1', name: 'Arknights' }] }
    : { data: [{ user_login: 'stub_streamer', user_name: 'Stub Streamer', title: 'Arknights stub stream', type: 'live', game_id: '1', game_name: 'Arknights', viewer_count: 42, thumbnail_url: 'https://static-cdn.jtvnw.net/previews-ttv/live_user_stub_streamer-{width}x{height}.jpg', started_at: '2026-09-26T09:00:00Z' }] } },
];

async function withStubbedFeeds<T>(run: () => Promise<T>): Promise<{ result: T; unexpected: string[] }> {
  const real = globalThis.fetch;
  const unexpected: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (url.hostname === '127.0.0.1') return real(input, init);
    const feed = FEEDS.find((entry) => entry.host === url.hostname);
    if (!feed) { unexpected.push(url.href); throw new Error(`The test does not reach the network: ${url.href}`); }
    const body = feed.answer(url);
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: 200 });
  }) as typeof fetch;
  try {
    return { result: await run(), unexpected };
  } finally {
    globalThis.fetch = real;
  }
}

/**
 * How the props of each route the release lacks show that this regeneration built them:
 * its finalize ran (the stubbed feeds are in them) and the clock is the server's. A route
 * the release lacks that regenerates needs an entry, so a finalize that silently stopped
 * running cannot pass.
 */
const REGENERATED: Record<string, (props: Record<string, unknown>, clock: { from: number; to: number }) => void> = {
  '/selector-tickets': props => {
    assert.equal((props.cards as unknown[]).length, 5);
    assert.deepEqual(Object.values(props.tickets as Record<string, { operators: unknown[] }>).map(ticket => ticket.operators.length), [6, 8, 35, 48, 9]);
    assert.ok((props.candidates as { id: string }[]).every(op => op.id));
  },
  '/artists': props => {
    const people = props.people as {name:string;operators:{name:string;credits:string[]}[]}[];
    assert.ok(people.length > 50 && people.every(person => person.name && person.operators.every(op => op.name && op.credits.length)));
    assert.ok(people.some(person => person.operators.some(op => op.name === 'Thorns')));
  },
  // No props of its own: the page is a content route only for the release withContentPage attaches.
  '/search': props => {
    assert.deepEqual(Object.keys(props).filter(key => !key.startsWith('__')), []);
  },
  '/voice-actors': props => {
    const people = props.people as {name:string;operators:{name:string;credits:string[]}[]}[];
    assert.ok(people.length > 100 && people.every(person => person.name && person.operators.every(op => op.name && op.credits.length)));
    assert.ok(people.some(person => person.operators.some(op => op.name === 'Thorns')));
    // The source's "-" is not a person: its operators are listed under Uncredited.
    assert.ok(!people.some(person => person.name.trim() === '-'));
    assert.ok((props.uncredited as {name:string}[]).some(op => op.name === 'Miss.Christine'));
  },
  '/friends': props => {
    const operators = props.operators as {name:string;rarity:number;icon:string;skills:number}[];
    assert.ok(operators.length > 400 && operators.every(op => op.name && op.icon.startsWith('/') && op.rarity >= 1 && op.rarity <= 6), 'the owned-operator catalogue survives without source files');
    assert.equal(operators.find(op => op.name === 'Angelina')?.skills, 3);
    assert.equal(operators.find(op => op.name === 'Lancet-2')?.rarity, 1);
    const skins = props.skins as {id:string;image:string|null}[];
    assert.ok(skins.length > 400 && skins.filter(skin => skin.image?.startsWith('/')).length > 400, 'owned skins retain official artwork');
    const tables = props.__contentTables as Record<string, {chars?:Record<string,unknown>}>;
    assert.ok(Object.keys(tables['game-account-map'].chars ?? {}).length > 400, 'the profile id map is attached');
  },
  '/community': (props, { from, to }) => {
    const campaigns = (props.directory as { webEvents: { url: string; name: string; expiresAt: string }[] }).webEvents;
    assert.ok((require('../../config/community-web-events.json') as { url: string }[]).every(seed => campaigns.some(event => event.url === seed.url)), 'seeded campaigns survive an older published Community directory');
    assert.ok(campaigns.every(event => event.name && Number.isFinite(Date.parse(event.expiresAt))), 'discovered campaign records keep verified deadlines');
    const videos = props.videos as { videoId: string }[];
    assert.ok(videos.length > 0 && videos.every((video) => video.videoId.startsWith('stub-')), 'the videos are the feeds finalize fetched');
    assert.deepEqual((props.twitchStreams as { userLogin: string }[]).map((stream) => stream.userLogin), ['stub_streamer'], 'the Twitch streams are the ones finalize fetched');
    assert.equal(props.hasTwitchCreds, true);
    const now = props.now as number;
    assert.ok(now >= Math.floor(from / 60_000) * 60_000 && now <= to, `now (${new Date(now).toISOString()}) is the server's clock at the regeneration`);
  },
  // From the skins, events and shop rotations compiled into the bundle: the outfits sold for OP
  // and the shops that sell them.
  '/skin-planner': (props) => {
    const catalogue = props.catalogue as { id: string; op: number }[];
    assert.ok(catalogue.length > 100 && catalogue.every((skin) => / \/ /.test(skin.id) && skin.op > 0), 'the outfits sold for OP, by "Operator / Outfit"');
    assert.ok((props.collections as { skinIds: string[] }[]).length > 0, 'the shops');
  },
  // The story map compiled into the bundle (a JSON import, nothing read from data/): the board
  // with every picture, each linked to its story or titled.
  '/story': (props) => {
    const map = props.map as { elements: { type: string; image?: string | null; link?: { title: string } }[] };
    const pictures = map.elements.filter((element) => element.type === 'picture');
    assert.ok(pictures.length > 50, 'the board\'s pictures');
    assert.ok(pictures.every((picture) => picture.link?.title), 'every picture titled, by its link');
    assert.ok(map.elements.some((element) => element.type === 'line') && map.elements.some((element) => element.type === 'text'), 'the lines and the labels');
  },
  // The official comics compiled into the bundle, each with its link and the latest first.
  '/manga': (props) => {
    const manga = props.manga as { url: string; updated?: string }[];
    assert.ok(manga.length > 10 && manga.every((comic) => comic.url.startsWith('https://www.arknights.global/comic?name=')), 'every comic, linked to its page');
    assert.deepEqual(manga.map((comic) => comic.updated ?? ''), manga.map((comic) => comic.updated ?? '').sort().reverse(), 'the latest first');
  },
  // The back catalogue compiled into the bundle, filled by finalize.
  '/free-op': (props) => {
    const backlog = props.backlogSources as { chapters: { stages?: string[]; stageCodes?: string[] }[]; playable: { start?: string }[]; annihilation: { id: string }[] };
    assert.ok(backlog.chapters.length > 10 && backlog.chapters.every((chapter) => chapter.stages?.length === chapter.stageCodes?.length), 'every chapter with its stages and their codes');
    assert.ok(backlog.playable.length > 10 && backlog.playable.every((event) => event.start), 'every playable event with its start date');
    assert.ok(backlog.annihilation.some((map) => map.id === 'annihilation:camp_03'), 'the permanent Annihilations');
  },
  // Built from the skins compiled into the bundle, with the id map and the planner's depot
  // tables from their module imports: nothing read from data/.
  '/account': (props) => {
    const skins = props.skins as { id: string; image: string | null }[];
    assert.ok(skins.length > 400 && skins.every((skin) => /^char_\w+[@#]/.test(skin.id)), 'every outfit, by skin id');
    assert.ok(skins.filter((skin) => skin.image?.startsWith('/')).length > 400, 'with its art, for the card\'s assistant');
    const tables = props.__contentTables as Record<string, { chars?: Record<string, unknown> }>;
    assert.ok(Object.keys(tables['game-account-map'].chars ?? {}).length > 400, 'the id map is attached');
    assert.ok(tables['import-aliases'] && tables['material-catalogue'], 'the depot tables are attached');
  },
};


// --- the tests -------------------------------------------------------------------------

test('the fixtures are the live release\'s own pages, and name content routes', () => {
  assert.match(PREVIOUS.release, /^[a-f0-9]{64}$/);
  assert.match(PREVIOUS.revision, /^[a-f0-9]{40}$/);
  for (const route of Object.keys(PREVIOUS.pages)) {
    templateOf(route);
    previousPage(route);
  }
  assert.match(PREVIOUS.manifestSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(PREVIOUS.routes, [...new Set(PREVIOUS.routes)].sort(), 'routes is the manifest\'s route list, sorted');
  for (const route of Object.keys(PREVIOUS.pages)) assert.ok(PREVIOUS.routes.includes(route), `${route} is one of the release's routes`);
  // A route the release does not publish renders from this checkout's data, which only a
  // static route may do: a dynamic one would be a 404 until the next release.
  for (const template of UNPUBLISHED) {
    assert.ok(!template.includes('['), `${template}: only a static content route may be absent from the release`);
  }
  const files = new Set(Object.values(PREVIOUS.pages).map((page) => page.file));
  for (const name of fs.readdirSync(FIXTURES).filter((name) => name.endsWith('.json') && name !== 'release.json')) {
    assert.ok(files.has(name), `${name} is listed in release.json`);
  }
});

for (const route of Object.keys(PREVIOUS.pages)) {
  test(`${route} renders the previous release's props, and they carry every field this code's do`, async () => {
    const { page, params, props } = await fromPreviousRelease(route);
    const html = renderPage(page.default, props);
    assert.ok(html.length > 1000, `${route}: the page rendered`);

    // A stale regeneration on Vercel reads the same page, and may not use this checkout's data.
    await withRelease(Object.keys(PREVIOUS.pages), async (release) => {
      const regenerated = await propsOf(page.getStaticProps, params, 'stale');
      assert.equal((regenerated.__contentRelease as { release?: string } | undefined)?.release, release, `${route}: a regeneration on Vercel reads the release`);
    }, { VERCEL: '1' });

    const bundled = await withEnv({ ARKPEDIA_CONTENT_DISABLED: '1' }, () => propsOf(page.getStaticProps, params));
    assert.ok(!bundled.__contentRelease, `${route}: this code's own props, from its own data`);
    const allowed = DATA_ONLY[route] ?? {};
    const missing = missingFromRelease(shapeOf(bundled), shapeOf(props)).filter((at) => !(at in allowed));
    assert.deepEqual(missing, [], `${route}: the previous release's props lack ${missing.join(', ')} -- fill them in the page's withContentPage finalize (or list a field only the data lacks in DATA_ONLY)`);
  });
}

for (const template of UNPUBLISHED) {
  if (template === '/artists' || template === '/voice-actors') {
    test(`${template} retains its populated build snapshot until a release publishes it`, async () => {
      const page = await pageModule(template);
      await withRelease(Object.keys(PREVIOUS.pages), async () => {
        const props = await propsOf(page.getStaticProps);
        REGENERATED[template](props, { from: Date.now(), to: Date.now() });
        // Refuse the disk-reading builder even if another test warmed its operator cache.
        // Throwing during ISR tells Next to retain the last populated prerender.
        await assert.rejects(() => propsOf(page.getStaticProps, undefined, 'stale'),
          new RegExp(`Published content is missing ${template}`));
      }, { VERCEL: '1' });
    });
    continue;
  }
  test(`${template}, which the previous release does not publish, regenerates on Vercel from its own builder`, async () => {
    const page = await pageModule(template);
    // Vercel's function for a content route has no data/ or public/ (next.config.js), and
    // the site's data readers resolve them from the working directory.
    const noData = fs.mkdtempSync(path.join(os.tmpdir(), 'previous-release-no-data-'));
    const cwd = process.cwd();
    try {
      const { result: { props, clock }, unexpected } = await withRelease(Object.keys(PREVIOUS.pages), () => withStubbedFeeds(async () => {
        const from = Date.now();
        let result: Awaited<ReturnType<GetStaticProps<object>>>;
        process.chdir(noData);
        try {
          result = await page.getStaticProps({ revalidateReason: 'stale' });
        } catch (error) {
          assert.fail(`${template} is a content route the previous release lacks, and its regeneration on Vercel threw "${error instanceof Error ? error.message : error}", so production would serve the deploy's build of it until the next release. Pass bundledWhenUnpublished to its withContentPage, with a builder that reads no data file (this ran from a directory with no data/).`);
        } finally {
          process.chdir(cwd);
        }
        assert.ok('props' in result, `${template}: the regeneration returned props`);
        return { props: await result.props as Record<string, unknown>, clock: { from, to: Date.now() } };
      }), { VERCEL: '1', TWITCH_CLIENT_ID: 'stub-client', TWITCH_CLIENT_SECRET: 'stub-secret', YOUTUBE_API_KEY: 'stub-key' });
      assert.deepEqual(unexpected, [], `${template}: its finalize asked only for the feeds FEEDS answers`);
      assert.ok(!props.__contentRelease, `${template}: its own builder's page, not a release's`);
      const regenerated = REGENERATED[template];
      assert.ok(regenerated, `${template}: say in REGENERATED how its props show this regeneration built them (its finalize ran, the server's clock)`);
      regenerated(props, clock);
      assert.ok(renderPage(page.default, props).length > 1000, `${template}: the page rendered`);
    } finally {
      process.chdir(cwd);
      fs.rmSync(noData, { recursive: true, force: true });
    }
  });
}

test('/stages/seasonal takes the previous release\'s vector and trials as challenges', async () => {
  const { page, props } = await fromPreviousRelease('/stages/seasonal');
  const challenges = props.challenges as { label: string; cards: unknown[] }[];
  assert.deepEqual(challenges.map((mode) => [mode.label, mode.cards.length]), [['VEC', 3], ['TN', 6]]);
  assert.ok(!('vector' in props) && !('trials' in props), 'the old keys do not travel on to the browser');
  const html = renderPage(page.default, props);
  for (const heading of ['Contingency Contract', 'Vector Breakthrough', 'Trials for Navigator']) {
    assert.match(html, new RegExp(`<h2>${heading}</h2>`), `the ${heading} panel`);
  }
  assert.match(html, /Trial from Misery/, 'the newest Vector Breakthrough season');
});

test('/stages/content/[id] works out the scene the previous release does not carry', async () => {
  for (const [id, key] of [['act51side', 'score'], ['act1bossrush', 'seasonal'], ['act1vecb', 'seasonal']] as const) {
    const { page, props } = await fromPreviousRelease(`/stages/content/${id}`);
    assert.equal((props.scene as { key: string }).key, key, `${id} sits in ${key}`);
    assert.match(renderPage(page.default, props), new RegExp(`class="tab" aria-current="page" href="/stages/${key}"`), `${id}: the Terminal bar marks ${key}`);
  }
});

test('/music/discover gives the previous release\'s props pendingSongs, a playable flag per album and Browse by album\'s list', async () => {
  const { page, props } = await fromPreviousRelease('/music/discover');
  const raw = (JSON.parse(previousPage('/music/discover')) as { props: Record<string, unknown> }).props;
  assert.ok(!('pendingSongs' in raw), 'the fixture is a release from before pendingSongs');
  assert.ok(Array.isArray(props.pendingSongs), 'pendingSongs is a list, so searching and the facets can filter it');
  assert.deepEqual(props.pendingSongs, [], 'that release listed no song without a YouTube upload');
  const albums = props.recentAlbums as { albumId: string; playable: unknown }[];
  assert.ok(albums.length > 0);
  for (const album of albums) assert.equal(typeof album.playable, 'boolean', `album ${album.albumId} says whether it is playable`);
  // It listed only albums with a song on YouTube, and each of them is in its songs.
  assert.ok(albums.every((album) => album.playable === true), 'every recent album of that release is playable');
  assert.doesNotMatch(renderPage(page.default, props), /Not on YouTube yet/, 'no recent album says it is not on YouTube');
  // Browse by album (2026-10-14): that release has no list of albums; its songs give one.
  assert.ok(!('albums' in raw), 'the fixture is a release from before Browse by album');
  const browse = props.albums as { albumId: string; songCount: number }[];
  assert.equal(browse.length, new Set((props.songs as { albumId: string }[]).map((s) => s.albumId)).size, 'one entry per album its songs name');
  assert.deepEqual(browse.slice(0, albums.length).map((a) => a.albumId), albums.map((a) => a.albumId), 'Recently added\'s albums lead, in its order');
  assert.match(renderPage(page.default, props), /Browse by album/);
});

test('a release this code compiled passes through unchanged', () => {
  const seasonal = getSeasonalChallenge();
  assert.equal(seasonalFromRelease(seasonal), seasonal);
  const discover: DiscoverPageData = getDiscoverPageData();
  assert.equal(discoverFromRelease(discover), discover);
});
