import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { contentUrl } from '../../lib/content/urls';
import {
  SITE_SEARCH_FEEDS_PATH, SITE_SEARCH_KIND_LABEL, SITE_SEARCH_PATH, loadSiteSearch, loadSiteSearchFeeds, searchSite, siteSearchHref,
  siteSearchIcon, siteSearchJump, siteSearchLabel, siteSearchOffSite, type SiteSearchEntry,
} from '../../lib/search/siteSearch';
import { buildSiteSearchEntries, buildSiteSearchFeedEntries, type SiteSearchFeeds, type SiteSearchSources } from '../../lib/search/siteSearchIndex';
import { channels as YOUTUBE_CHANNELS } from '../../data/youtube-creators.json';

const release = { release: 'a'.repeat(64), baseUrl: 'https://example.test/rev/release', assets: {} };

const op = (title: string, terms?: string[]): SiteSearchEntry => ({ kind: 'operator', title, href: `/operators/${encodeURIComponent(title)}`, rarity: 6, ...(terms ? { terms } : {}) });
const ENTRIES: SiteSearchEntry[] = [
  op('Amiya', ['Amiya (Guard)']),
  op('Amiya (Guard)', ['Amiya']),
  op('Ch\'en'),
  op('Ch\'en the Holungday', ['Ch\'en']),
  op('W', ['Wiš\'adel']),
  op('Wiš\'adel', ['W']),
  op('Kal\'tsit Esperanta', ['Kal\'tsit']),
  op('Franka'),
  { kind: 'page', title: 'Skins', href: '/skins' },
  { kind: 'event', title: 'Act or Die', href: '/events/Act%20or%20Die' },
  { kind: 'content', title: 'Act or Die', href: '/stages/content/act43side', sub: 'AD', terms: ['AD'] },
  { kind: 'stage', title: '1-7', href: '/stages/browse?s=1-7', sub: 'Episode 01', terms: ['The Dawn Will Come'] },
  { kind: 'stage', title: '1-7', href: '/stages/browse?s=tough_1-7', sub: 'Tough', terms: ['The Dawn Will Come'] },
  { kind: 'enemy', title: 'Originium Slug', href: '/enemies?e=slug', sub: 'B1' },
  { kind: 'stage', title: '6-17', href: '/stages/browse?s=6-17', sub: 'Partial Necrosis', terms: ['Winter\'s End'] },
  { kind: 'stage', title: '11-7', href: '/stages/browse?s=11-7', sub: 'Return To Mist', terms: ['Unto the Flood'] },
  { kind: 'song', title: '阿米娅', href: '/music/discover?q=%E9%98%BF%E7%B1%B3%E5%A8%85', terms: ['Amiya'] },
];
const titles = (query: string) => searchSite(ENTRIES, query).map((r) => `${r.entry.kind}:${r.entry.title}`);

test('an exact name outranks a prefix, a prefix outranks the middle of a name, and a title outranks another name', () => {
  // The song is exactly "Amiya" only by its English title, so it ranks under a title that
  // merely starts with the query.
  assert.deepEqual(titles('amiya'), ['operator:Amiya', 'operator:Amiya (Guard)', 'song:阿米娅']);
  assert.deepEqual(titles('w').slice(0, 2), ['operator:W', 'operator:Wiš\'adel']);
  // "an" starts no title or word here and sits inside two names: the shorter first.
  assert.deepEqual(titles('an'), ['operator:Franka', 'operator:Kal\'tsit Esperanta']);
  assert.deepEqual(titles('chen'), ['operator:Ch\'en', 'operator:Ch\'en the Holungday']);
});

test('accents, apostrophes and every word of a query in any order find the name', () => {
  assert.deepEqual(titles('wisadel').slice(0, 1), ['operator:Wiš\'adel']);
  assert.deepEqual(titles('esperanta kal'), ['operator:Kal\'tsit Esperanta']);
  assert.deepEqual(titles('dawn will'), ['stage:1-7', 'stage:1-7']);
  assert.deepEqual(titles('   '), []);
});

test('a stage code keeps its hyphen: "1-7" is not "17"', () => {
  assert.deepEqual(titles('1-7'), ['stage:1-7', 'stage:1-7', 'stage:11-7'], '6-17 holds "17" but not "1-7"');
  assert.deepEqual(titles('6-17'), ['stage:6-17']);
});

test('/search jumps only to the one best exact answer', () => {
  const jump = (query: string) => siteSearchJump(searchSite(ENTRIES, query))?.href ?? null;
  assert.equal(jump('Amiya'), '/operators/Amiya', 'her alters answer to "Amiya" on another name, so they rank under her');
  assert.equal(jump('w'), '/operators/W');
  assert.equal(jump('kal\'tsit'), '/operators/Kal\'tsit%20Esperanta', 'an exact other name, with no exact title, still jumps');
  assert.equal(jump('skins'), '/skins');
  assert.equal(jump('Act or Die'), '/events/Act%20or%20Die', 'an event outranks the stage content of the same name');
  assert.equal(jump('1-7'), null, 'two stages with the same code are a question for the reader');
  assert.equal(jump('ami'), null, 'a prefix is not a request');
  assert.equal(jump('nothing like this'), null);
});

test('the query URL is /search?s=, the shape the OpenSearch description advertises', () => {
  assert.equal(siteSearchHref('  Ch\'en & co '), '/search?s=Ch\'en%20%26%20co');
  const opensearch = fs.readFileSync('public/opensearch.xml', 'utf8');
  assert.match(opensearch, /template="https:\/\/www\.arkpedia\.net\/search\?s=\{searchTerms\}"/);
  assert.match(fs.readFileSync('pages/_document.tsx', 'utf8'), /rel="search"[^>]*application\/opensearchdescription\+xml/);
  assert.match(fs.readFileSync('next.config.js', 'utf8'), /source: '\/',\s*has: \[\{ type: 'query', key: 's' \}\],\s*destination: '\/search'/, 'arkpedia.net/?s= reaches the search page too');
});

const SOURCES: SiteSearchSources = {
  pages: [{ href: '/operators', label: 'Operators', icon: 'roster' }],
  operators: [{ name: 'Kal\'tsit', rarity: 6 }, { name: 'Ambriel', rarity: 4, portraitPending: true }],
  operatorAliases: { 'Kal\'tsit': ['Kal\'tsit Esperanta'] },
  events: [{ name: 'Act or Die' }],
  contents: [{ id: 'act43side', name: 'Act or Die', label: 'AD' }, { id: 'camp_r_01', name: 'Annihilation', label: null }],
  stages: [
    { slug: 'ad-ex-1', code: 'AD-EX-1', name: 'Dusty Prop Room', variantOf: null, contentName: 'Act or Die' },
    { slug: 'ad-ex-1_challenge_mode', code: 'AD-EX-1', name: 'Dusty Prop Room', variantOf: 'ad-ex-1', contentName: 'Act or Die' },
    { slug: 'level_rogue4_b-9', code: null, name: null, variantOf: null, contentName: 'Sarkaz\'s Furnaceside Fables' },
  ],
  enemies: [
    { slug: 'originium_slug', name: 'Originium Slug', index: 'B1', icon: '/enemies-icons/Originium Slug.webp' },
    { slug: 'odd', name: 'Odd One', index: null, icon: '/enemies-icons/Odd One (alt).webp' },
    { slug: 'blank', name: 'Blank', index: null, icon: null },
  ],
  albums: [{ albumId: '4527', albumName: '明日方舟OST1', albumAltName: 'Arknights OST 1' }],
  songs: [{ title: 'Synthetech', altTitle: 'Synthetech', artist: 'BaoUner' }, { title: 'Synthetech', altTitle: null, artist: 'Again' }],
  creators: [{ id: 'UCaaaaaaaaaaaaaaaaaaaaaa', label: 'Test Creator' }],
  people: [
    { kind: 'artist', name: 'm9nokuro', operators: 4 },
    { kind: 'voice-actor', name: '赵爽', operators: 1, languages: ['Mandarin'], aliases: ['zhao shuang', 'zhaoshuang'] },
  ],
};

test('every row links to the URL its page reads', () => {
  const rows = buildSiteSearchEntries(SOURCES);
  const href = (kind: string, title: string) => rows.find((r) => r.kind === kind && r.title === title)?.href;
  assert.equal(href('page', 'Home'), '/');
  assert.equal(href('page', 'Operators'), '/operators');
  assert.equal(href('operator', 'Kal\'tsit'), '/operators/Kal\'tsit');
  assert.equal(href('event', 'Act or Die'), '/events/Act%20or%20Die');
  assert.equal(href('content', 'Act or Die'), '/stages/content/act43side');
  assert.equal(href('stage', 'AD-EX-1'), '/stages/browse?s=ad-ex-1');
  assert.equal(href('enemy', 'Originium Slug'), '/enemies?e=originium_slug');
  assert.equal(href('album', 'Arknights OST 1'), '/music/discover?facet=album%3A4527');
  assert.equal(href('song', 'Synthetech'), '/music/discover?q=Synthetech');
  assert.equal(href('artist', 'm9nokuro'), '/artists?q=m9nokuro');
  assert.equal(href('voice-actor', '赵爽'), '/voice-actors?q=%E8%B5%B5%E7%88%BD', 'the name the page shows, never an alias');
  assert.equal(href('creator', 'Test Creator'), 'https://www.youtube.com/channel/UCaaaaaaaaaaaaaaaaaaaaaa', 'the channel, where the community page links it');
});

test('the index lists every curated YouTube channel, and no video', () => {
  const rows = buildSiteSearchEntries({ ...SOURCES, creators: YOUTUBE_CHANNELS });
  const creators = rows.filter((r) => r.kind === 'creator');
  assert.deepEqual(creators.map((r) => r.title), YOUTUBE_CHANNELS.map((c) => c.label));
  assert.ok(creators.every((r) => r.href.startsWith('https://www.youtube.com/channel/UC') && siteSearchOffSite(r)));
  assert.ok(!rows.some((r) => r.kind === 'video' || r.kind === 'stream' || r.kind === 'streamer'),
    'a feed baked into the release would change it every export and outlive a stream');
  assert.match(fs.readFileSync('scripts/build/build-site-search.ts', 'utf8'), /creators: creators.channels/);
});

const FEEDS: SiteSearchFeeds = {
  videos: [
    { videoId: 'v1', title: 'Arknights Amiya guide', channelLabel: 'Test Creator', thumbnail: 'https://i.ytimg.com/vi/v1/hqdefault.jpg', url: 'https://www.youtube.com/watch?v=v1' },
    { videoId: 'v1', title: 'Arknights Amiya guide', channelLabel: 'Test Creator', thumbnail: 'https://i.ytimg.com/vi/v1/hqdefault.jpg', url: 'https://www.youtube.com/watch?v=v1' },
    { videoId: 'v2', title: '', channelLabel: 'Test Creator', thumbnail: '', url: 'https://www.youtube.com/watch?v=v2' },
  ],
  streams: [
    { userLogin: 'teststreamer', displayName: 'TestStreamer', title: 'Arknights IS6 blind run', thumbnailUrl: 'https://static-cdn.jtvnw.net/previews-ttv/live_user_teststreamer-440x248.jpg', url: 'https://www.twitch.tv/teststreamer' },
    { userLogin: 'quiet', displayName: '', title: '  ', thumbnailUrl: '', url: 'https://www.twitch.tv/quiet' },
  ],
};

test('a video links out to YouTube under its title and creator; a stream and its streamer to the Twitch channel', () => {
  const rows = buildSiteSearchFeedEntries(FEEDS);
  const video = rows.filter((r) => r.kind === 'video');
  assert.equal(video.length, 1, 'a repeated video is one row, and a nameless one is left out');
  assert.deepEqual(video[0], {
    kind: 'video', title: 'Arknights Amiya guide', href: 'https://www.youtube.com/watch?v=v1', sub: 'Test Creator',
    terms: ['Test Creator'], icon: 'https://i.ytimg.com/vi/v1/hqdefault.jpg',
  });
  assert.equal(siteSearchIcon(video[0]), 'https://i.ytimg.com/vi/v1/hqdefault.jpg', 'the thumbnail the community card draws');
  const streamer = rows.find((r) => r.kind === 'streamer' && r.title === 'TestStreamer')!;
  const stream = rows.find((r) => r.kind === 'stream' && r.title === 'Arknights IS6 blind run')!;
  assert.equal(streamer.href, 'https://www.twitch.tv/teststreamer');
  assert.equal(stream.href, 'https://www.twitch.tv/teststreamer');
  assert.equal(stream.sub, 'TestStreamer');
  assert.equal(siteSearchIcon(streamer), null, 'Twitch gives no avatar');
  assert.match(siteSearchIcon(stream) ?? '', /static-cdn\.jtvnw\.net/);
  // A stream with no name and no title reads its login rather than taking the route down.
  assert.deepEqual(rows.filter((r) => r.href === 'https://www.twitch.tv/quiet').map((r) => `${r.kind}:${r.title}`), ['streamer:quiet', 'stream:quiet']);
  assert.ok(rows.every(siteSearchOffSite));
  assert.deepEqual([...new Set(rows.map((r) => SITE_SEARCH_KIND_LABEL[r.kind]))].sort(), ['Twitch', 'YouTube']);
  assert.equal(SITE_SEARCH_KIND_LABEL.creator, 'YouTube');
});

test('YouTube and Twitch rank under every row of the site\'s own, and /search never jumps to one', () => {
  const rows = [...ENTRIES, ...buildSiteSearchEntries(SOURCES).filter((r) => r.kind === 'creator'), ...buildSiteSearchFeedEntries(FEEDS)];
  // The video's title starts with "arknights amiya", a better tier than the song's other name.
  const amiya = searchSite(rows, 'amiya').map((r) => `${r.entry.kind}:${r.entry.title}`);
  assert.deepEqual(amiya, ['operator:Amiya', 'operator:Amiya (Guard)', 'song:阿米娅', 'video:Arknights Amiya guide']);
  assert.deepEqual(searchSite(rows, 'test creator').map((r) => r.entry.kind), ['creator', 'video'], 'the channel, then its videos');
  assert.deepEqual(searchSite(rows, 'teststreamer').map((r) => r.entry.kind), ['streamer', 'stream']);
  const jump = (query: string) => siteSearchJump(searchSite(rows, query))?.href ?? null;
  assert.equal(jump('Test Creator'), null, 'Enter is not a request to leave the site');
  assert.equal(jump('TestStreamer'), null);
  assert.equal(jump('Amiya'), '/operators/Amiya');
});

test('the feeds are the deployment\'s route, read from the pages\' own feeds and cached as long', async () => {
  const requests: string[] = [];
  const fetcher = async (url: string) => { requests.push(url); return { ok: true, status: 200, json: async () => ({ entries: buildSiteSearchFeedEntries(FEEDS) }) }; };
  assert.equal((await loadSiteSearchFeeds(undefined, fetcher)).length, 5);
  assert.deepEqual(requests, [SITE_SEARCH_FEEDS_PATH]);
  await assert.rejects(() => loadSiteSearchFeeds(undefined, async () => ({ ok: false, status: 500, json: async () => ({}) })), /500/);
  const route = fs.readFileSync('pages/api/search-feeds.ts', 'utf8');
  assert.match(route, /rankDiscoveryVideos\(filterDiscoveryVideos\(\[\.\.\.enriched, \.\.\.archive\]\.filter\(video => !video\.isLivestream\)\), context, now\)/, 'the shared discovery filter keeps current Global relevance ranking');
  assert.match(route, /s-maxage=1500/, 'as old as the pages\' revalidate: 1500, and no older');
  const community = fs.readFileSync('pages/community.tsx', 'utf8');
  assert.match(community, /revalidate: 1500/);
  assert.match(community, /filterDiscoveryVideos\(\[\.\.\.enriched, \.\.\.archive\]\.filter\(\(v\) => !v\.isLivestream\)\)/);
  const gallery = fs.readFileSync('components/community/YouTubeVideoGallery.tsx', 'utf8');
  assert.match(gallery, /rankDiscoveryVideos\(videos, context, now\)/, 'the visible gallery uses the same relevance rules');
});

test('rows carry the other names, and no duplicate or variant rows', () => {
  const rows = buildSiteSearchEntries(SOURCES);
  assert.deepEqual(rows.find((r) => r.title === 'Kal\'tsit')?.terms, ['Kal\'tsit Esperanta']);
  assert.equal(rows.find((r) => r.title === 'Ambriel')?.portraitPending, true);
  assert.equal(rows.filter((r) => r.kind === 'stage').length, 1, 'Challenge Mode is a tab on its parent stage, not a second row');
  assert.equal(rows.filter((r) => r.kind === 'song').length, 1, 'a song listed on two albums is one row');
  assert.equal(rows.find((r) => r.kind === 'song')?.terms, undefined, 'an alt title equal to the title is not another name');
  assert.equal(rows.find((r) => r.title === 'Annihilation')?.terms, undefined);
  const stage = rows.find((r) => r.kind === 'stage')!;
  assert.equal(siteSearchLabel(stage), 'AD-EX-1 Dusty Prop Room');
  assert.equal(stage.sub, 'Act or Die');
});

test('a row with no name is never written: one null took the whole search box down', () => {
  assert.ok(buildSiteSearchEntries(SOURCES).every((r) => typeof r.title === 'string' && r.title), 'a nameless stage is left out');
  assert.throws(() => buildSiteSearchEntries({ ...SOURCES, events: [{ name: null as unknown as string }] }), /no name/);
});

test('an enemy row names its icon only when it is not the usual file, and says when there is none', () => {
  const rows = buildSiteSearchEntries(SOURCES);
  const enemy = (title: string) => rows.find((r) => r.kind === 'enemy' && r.title === title)!;
  assert.equal(enemy('Originium Slug').icon, undefined);
  assert.equal(siteSearchIcon(enemy('Originium Slug')), '/enemies-icons/Originium Slug.webp');
  assert.equal(siteSearchIcon(enemy('Odd One')), '/enemies-icons/Odd One (alt).webp');
  assert.equal(siteSearchIcon(enemy('Blank')), null);
  assert.equal(siteSearchIcon(rows.find((r) => r.kind === 'operator')!), null);
});

test('the index is read from the content release, falling back to the deployment copy', async () => {
  assert.equal(contentUrl(SITE_SEARCH_PATH, release), `${release.baseUrl}/public/site-search.json`);
  const requests: string[] = [];
  const fetcher = async (url: string) => {
    requests.push(url);
    return url.startsWith('https://')
      ? { ok: false, status: 404, json: async () => ({}) }
      : { ok: true, status: 200, json: async () => ({ entries: ENTRIES }) };
  };
  assert.equal((await loadSiteSearch(`${release.baseUrl}/public/site-search.json`, undefined, fetcher)).length, ENTRIES.length);
  assert.deepEqual(requests, [`${release.baseUrl}/public/site-search.json`, SITE_SEARCH_PATH]);
  await assert.rejects(() => loadSiteSearch(SITE_SEARCH_PATH, undefined, async () => ({ ok: true, status: 200, json: async () => ({ rows: [] }) })), /invalid/);
});

/* /search shipped without a data function, so it carried no release and read the deployment's
   copy of the index -- 70 rows behind dev's release within the hour. It is where ?s= and a
   browser's search engine land, so it has to be a release page. */
test('/search is a content page, so its rows come from the release rather than the deployment', () => {
  const routes = JSON.parse(fs.readFileSync('scripts/content/pages.json', 'utf8')) as string[];
  assert.ok(routes.includes('/search'), 'scripts/content/pages.json lists /search');
  assert.match(fs.readFileSync('pages/search.tsx', 'utf8'), /withContentPage\s*(?:<[^>]*>)?\s*\(\s*'\/search'/);
});

test('the export writes the index after the stage and enemy builders whose files it reads', () => {
  const exporter = fs.readFileSync('scripts/content/export.mjs', 'utf8');
  const at = (script: string) => exporter.indexOf(`'scripts/build/${script}'`);
  assert.ok(at('build-site-search.ts') > 0, 'export.mjs runs build-site-search.ts');
  assert.ok(at('build-site-search.ts') > at('build-stage-details.ts') && at('build-site-search.ts') > at('build-enemy-details.mjs'));
  const generate = JSON.parse(fs.readFileSync('package.json', 'utf8')).scripts['generate:public'] as string;
  assert.ok(generate.indexOf('build-site-search.ts') > generate.indexOf('build-stage-details.ts'), 'prebuild and predev write the deployment copy');
});
