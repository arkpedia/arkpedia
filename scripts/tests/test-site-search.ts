import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { contentUrl } from '../../lib/content/urls';
import {
  SITE_SEARCH_PATH, loadSiteSearch, searchSite, siteSearchHref, siteSearchIcon, siteSearchJump, siteSearchLabel,
  type SiteSearchEntry,
} from '../../lib/search/siteSearch';
import { buildSiteSearchEntries, type SiteSearchSources } from '../../lib/search/siteSearchIndex';

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
