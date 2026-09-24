import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// The shared structured-page reader and the scripts that read through it, driven
// through their own fetch calls with the network replaced by fixed answers and the clock
// by a fixed date. They are imported inside each test, as ES modules, so each test's
// fetch mock is in place before any of their code runs.
// @ts-expect-error Plain Node import scripts, also run directly by the refresh job.
const wikiPages = () => import('../sync/wiki-pages.mjs');
// @ts-expect-error Plain Node import scripts, also run directly by the refresh job.
const recurringBannerSync = () => import('../sync/sync-recurring-banners.mjs');
// @ts-expect-error Plain Node helper shared by the importers.
const quarantine = () => import('../lib/quarantine.mjs');
// The fixed answers are for the wiki itself. A run that rehearses an outage points the
// readers elsewhere for the whole job, npm test included, and must not fail it here.
delete process.env.ARKPEDIA_WIKI_BASE;
const missing ={ error: { code: 'missingtitle', info: "The page you specified doesn't exist." } };
const doubleRedirect = { parse: { title: 'Headhunting/Banners/2027', wikitext: { '*': '#REDIRECT [[Headhunting/Banners/Former-2027]]' } } };

function answering(t: { mock: { method: Function } }, answer: (url: URL) => unknown) {
  const requested: URL[] = [];
  t.mock.method(globalThis, 'fetch', async (input: string) => {
    const url = new URL(input);
    requested.push(url);
    return new Response(JSON.stringify(answer(url)), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  return requested;
}
function temporary(run: (root: string) => Promise<void>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arkpedia-wiki-'));
  return run(root).finally(() => fs.rmSync(root, { recursive: true, force: true }));
}
const wikiRequests = (requested: URL[]) => requested.filter(url => url.hostname === 'arknights.wiki.gg');

const eventCells = '{{Upcoming events cell\n|name = Test event\n|cnstart = 2027/05/01\n}}\n{{Upcoming events cell\n|name = Other event\n}}';
const cacheOf = (root: string, page: string) => path.join(root, 'data/wiki-cache', `${page.replaceAll('/', '-')}.json`);
const entries = async (root: string) => (await quarantine()).readQuarantine(root).entries;

test('a page is read following redirects, and its parsed rows become the last good copy, with no timestamp', async t => {
  const { readWikiRows } = await wikiPages();
  await temporary(async root => {
    const requested = answering(t, () => ({ parse: { title: 'Event/Upcoming (Global)', redirects: [{ from: 'Event/Upcoming', to: 'Event/Upcoming (Global)' }], wikitext: { '*': eventCells } } }));
    const alerts = (await quarantine()).beginStage(root, 'wiki', new Date('2027-06-01T00:00:00Z'));
    const rows = await readWikiRows(root, 'Event/Upcoming', 'Upcoming events cell', { now: new Date('2027-06-01T00:00:00Z'), alerts });
    assert.deepEqual(rows, [{ name: 'Test event', cnstart: '2027/05/01' }, { name: 'Other event' }]);
    assert.deepEqual(wikiRequests(requested).map(url => [url.searchParams.get('page'), url.searchParams.get('redirects')]), [['Event/Upcoming', '1']]);
    assert.equal(fs.readFileSync(cacheOf(root, 'Event/Upcoming'), 'utf8'), `${JSON.stringify({ page: 'Event/Upcoming', template: 'Upcoming events cell', rows }, null, 2)}\n`);
    assert.deepEqual(alerts.entries, []);
    // A dry run reads but never writes the data file.
    fs.rmSync(cacheOf(root, 'Event/Upcoming'));
    await readWikiRows(root, 'Event/Upcoming', 'Upcoming events cell', { now: new Date('2027-06-01T00:00:00Z'), write: false });
    assert.equal(fs.existsSync(cacheOf(root, 'Event/Upcoming')), false);
  });
});

test('a page the wiki cannot serve is read from its last good copy and reported, never thrown', async t => {
  const { readWikiRows } = await wikiPages();
  const { beginStage } = await quarantine();
  const now = new Date('2027-06-01T00:00:00Z');
  await temporary(async root => {
    const good = { parse: { wikitext: { '*': eventCells } } };
    let answer: unknown = good;
    t.mock.method(globalThis, 'fetch', async () => {
      if (answer instanceof Error) throw answer;
      if (typeof answer === 'number') return new Response('busy', { status: answer });
      return new Response(JSON.stringify(answer), { status: 200 });
    });
    const read = async () => {
      const alerts = beginStage(root, 'wiki', now);
      const rows = await readWikiRows(root, 'Event/Upcoming', 'Upcoming events cell', { now, alerts });
      alerts.commit();
      return rows;
    };
    const lastGood = await read();
    assert.equal(lastGood.length, 2);
    t.mock.method(console, 'warn', () => {});
    const outages: [unknown, RegExp][] = [
      // A transport failure is named by its kind, not its words of the day: the reason is a
      // release input, and an outage that times out one day and answers 502 the next is one problem.
      [Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }), /cannot be used: the wiki could not be reached;/],
      [Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }), /cannot be used: the wiki could not be reached;/],
      [503, /cannot be used: the wiki answered with a server error;/],
      [502, /cannot be used: the wiki answered with a server error;/],
      [403, /cannot be used: the wiki answered HTTP 403;/],
      [missing, /Missing structured wiki page: Event\/Upcoming/],
      [{ parse: { wikitext: { '*': '#REDIRECT [[Event/Somewhere else]]' } } }, /still a redirect/],
      // Reformatted so that no row parses: a template rename, not a quiet day.
      [{ parse: { wikitext: { '*': '{{Upcoming event row|name=Test event}}' } } }, /no "Upcoming events cell" row that parses, where the last good read had 2/],
    ];
    for (const [outage, reason] of outages) {
      answer = outage;
      assert.deepEqual(await read(), lastGood, String(reason));
      const [entry] = await entries(root);
      assert.deepEqual([entry.key, entry.stage, entry.action], ['wiki:Event/Upcoming', 'wiki', 'kept-previous'], String(reason));
      assert.match(entry.reason, reason);
      assert.match(entry.reason, /last good read \(2 rows\) is used instead/);
      assert.equal(JSON.parse(fs.readFileSync(cacheOf(root, 'Event/Upcoming'), 'utf8')).rows.length, 2, 'the last good copy is never overwritten by a bad read');
    }
    // Recovery clears the stage's entry.
    answer = good;
    await read();
    assert.deepEqual(await entries(root), []);
    // With no earlier read to fall back on it reads as no rows, and says so.
    fs.rmSync(cacheOf(root, 'Event/Upcoming'));
    answer = 503;
    assert.deepEqual(await read(), []);
    assert.deepEqual((await entries(root)).map((e: { action: string }) => e.action), ['omitted-new']);
  });
});

test('a year\'s banner page that loses any row is read from its last good copy and reported; growing is taken', async t => {
  const { readWikiRows } = await wikiPages();
  const { beginStage } = await quarantine();
  const page = (count: number, from = 0) => ({ parse: { wikitext: { '*': Array.from({ length: count }, (_, i) =>
    `{{Banners cell\n|type = special\n|name = Banner ${from + i}\n|cnstart = 2026/01/01\n}}`).join('\n') } } });
  await temporary(async root => {
    let answer: unknown = page(57);
    t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(answer), { status: 200 }));
    t.mock.method(console, 'warn', () => {});
    const read = async (day: string) => {
      const now = new Date(`${day}T20:00:00Z`), alerts = beginStage(root, 'wiki', now);
      const rows = await readWikiRows(root, 'Headhunting/Banners/2026', 'Banners cell', { now, alerts });
      alerts.commit();
      return rows;
    };
    const cached = () => JSON.parse(fs.readFileSync(cacheOf(root, 'Headhunting/Banners/2026'), 'utf8')).rows.length;
    assert.equal((await read('2026-09-20')).length, 57);
    // 55 cells moved to another template: 2 rows still parse.
    answer = { parse: { wikitext: { '*': page(2).parse.wikitext['*'] + '\n{{Headhunting row\n|name = Moved\n}}'.repeat(55) } } };
    assert.equal((await read('2026-09-21')).length, 57);
    const [entry] = await entries(root);
    assert.deepEqual([entry.key, entry.stage, entry.action], ['wiki:Headhunting/Banners/2026', 'wiki', 'kept-previous']);
    assert.match(entry.reason, /fewer "Banners cell" rows parse than its last good read had, and a year's banner page only grows; .*delete source\/data\/wiki-cache\/Headhunting-Banners-2026\.json in arkpedia-data/);
    assert.equal(cached(), 57, 'the good copy survives');
    // The next day's outage still falls back to all 57, not to the gutted read.
    answer = 503;
    assert.equal((await read('2026-09-22')).length, 57);
    // A page cut short part-way loses less than half, and is still not taken: the year only grows.
    for (const [day, count] of [['2026-09-23', 29], ['2026-09-24', 56]] as const) {
      answer = page(count);
      assert.equal((await read(day)).length, 57, `${count} of 57`);
      assert.deepEqual((await entries(root)).map((e: { action: string }) => e.action), ['kept-previous'], `${count} of 57`);
      assert.equal(cached(), 57);
    }
    const reported = fs.readFileSync(path.join(root, 'data/quarantine.json'), 'utf8');
    answer = page(40);
    await read('2026-09-25');
    assert.equal(fs.readFileSync(path.join(root, 'data/quarantine.json'), 'utf8'), reported, 'a different shrink the next day is the same entry, byte for byte');
    // The page grows: taken, and the entry clears.
    answer = page(60);
    assert.equal((await read('2026-09-26')).length, 60);
    assert.deepEqual(await entries(root), []);
  });
});

test('an Upcoming page is judged by half the most rows it held within a week, so it cannot lose half again every day', async t => {
  const { readWikiRows, PEAK_DAYS } = await wikiPages();
  const { beginStage } = await quarantine();
  const upcoming = 'Headhunting/Banners/Upcoming';
  const page = (count: number, from = 0) => ({ parse: { wikitext: { '*': Array.from({ length: count }, (_, i) =>
    `{{Banners cell\n|type = special\n|name = Banner ${from + i}\n|cnstart = 2027/01/01\n}}`).join('\n') } } });
  await temporary(async root => {
    let answer: unknown = page(20);
    t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(answer), { status: 200 }));
    t.mock.method(console, 'warn', () => {});
    const read = async (day: string, wikiPage = upcoming) => {
      const now = new Date(`${day}T20:00:00Z`), alerts = beginStage(root, 'wiki', now);
      const rows = await readWikiRows(root, wikiPage, 'Banners cell', { now, alerts });
      alerts.commit();
      return rows.length;
    };
    const cache = () => fs.readFileSync(cacheOf(root, upcoming), 'utf8');
    assert.equal(await read('2026-09-01'), 20);
    assert.equal(JSON.parse(cache()).peak, undefined, 'a page that never shrank keeps no peak');
    // Global catches up on nine: taken, and the 20 it held is kept for a week.
    answer = page(11, 9);
    assert.equal(await read('2026-09-02'), 11);
    assert.deepEqual(JSON.parse(cache()).peak, { rows: 20, since: '2026-09-02' });
    assert.deepEqual(await entries(root), []);
    // Half of yesterday's 11, but not half of the 20 held this week: kept, and reported.
    answer = page(6, 14);
    assert.equal(await read('2026-09-03'), 11);
    const [entry] = await entries(root);
    assert.deepEqual([entry.key, entry.action], [`wiki:${upcoming}`, 'kept-previous']);
    assert.match(entry.reason, /fewer than half the "Banners cell" rows it held within the last 7 days parse/);
    assert.equal(PEAK_DAYS, 7);
    // An unchanged page leaves the file alone, even once the week is over.
    answer = page(11, 9);
    const before = cache();
    for (const day of ['2026-09-04', '2026-09-12']) assert.equal(await read(day), 11);
    assert.equal(cache(), before);
    // A week on, the 11 it holds is the yardstick again.
    answer = page(6, 14);
    assert.equal(await read('2026-09-12'), 6);
    assert.deepEqual(JSON.parse(cache()).peak, { rows: 11, since: '2026-09-12' });
    // Growing back past the peak drops it.
    answer = page(12, 20);
    assert.equal(await read('2026-09-13'), 12);
    assert.equal(JSON.parse(cache()).peak, undefined);
    assert.deepEqual(await entries(root), []);
    // A page too small to judge takes whatever parses (three rows to one).
    answer = page(3);
    assert.equal(await read('2026-09-14', 'Event/Upcoming'), 3);
    answer = page(1, 2);
    assert.equal(await read('2026-09-15', 'Event/Upcoming'), 1);
    assert.deepEqual(await entries(root), []);
  });
});

test('ARKPEDIA_WIKI_BASE points the readers elsewhere, so an unreachable wiki can be rehearsed', async t => {
  const { readWikiRows } = await wikiPages();
  const { beginStage } = await quarantine();
  await temporary(async root => {
    fs.mkdirSync(path.join(root, 'data/wiki-cache'), { recursive: true });
    fs.writeFileSync(cacheOf(root, 'Event/Upcoming'), JSON.stringify({ page: 'Event/Upcoming', template: 'Upcoming events cell', rows: [{ name: 'Cached event' }] }));
    t.mock.method(console, 'warn', () => {});
    const previous = process.env.ARKPEDIA_WIKI_BASE;
    process.env.ARKPEDIA_WIKI_BASE = 'http://127.0.0.1:65534/';
    try {
      const alerts = beginStage(root, 'wiki', new Date('2027-06-01T00:00:00Z'));
      // A real request to a closed local port (not one fetch blocks outright): refused at once.
      assert.deepEqual(await readWikiRows(root, 'Event/Upcoming', 'Upcoming events cell', { now: new Date('2027-06-01T00:00:00Z'), alerts }), [{ name: 'Cached event' }]);
      assert.equal(alerts.entries[0].sourceRef, 'http://127.0.0.1:65534/wiki/Event/Upcoming');
      assert.match(alerts.entries[0].reason, /the wiki could not be reached/);
    } finally {
      if (previous === undefined) delete process.env.ARKPEDIA_WIKI_BASE; else process.env.ARKPEDIA_WIKI_BASE = previous;
    }
  });
});

// A made-up roster and client table with one Standard banner the wiki page lists.
function bannerRepository(root: string) {
  const roster = [['Six A', 6], ['Six B', 6], ['Five A', 5], ['Five B', 5], ['Five C', 5]] as const;
  for (const [name, rarity] of roster) {
    fs.mkdirSync(path.join(root, `data/operators-${rarity}star`), { recursive: true });
    fs.writeFileSync(path.join(root, `data/operators-${rarity}star/${name}.json`), JSON.stringify({ name, rarity }));
  }
  fs.writeFileSync(path.join(root, 'data/headhunting_banners.json'), '[]\n');
  return {
    banners: () => JSON.parse(fs.readFileSync(path.join(root, 'data/headhunting_banners.json'), 'utf8')),
    answer(page: (title: string) => unknown) {
      return (url: URL) => {
        if (url.hostname === 'arknights.wiki.gg') return page(url.searchParams.get('page') ?? '');
        if (url.pathname.endsWith('/gacha_table.json')) {
          return { gachaPoolClient: [{ gachaPoolId: 'standard', gachaRuleType: 'DOUBLE', openTime: 1789124400, endTime: 1790333999 }] };
        }
        if (url.pathname.endsWith('/character_table.json')) return {};
        throw new Error(`Unexpected request: ${url}`);
      };
    },
  };
}
const standardRow = '{{Banners cell\n|type = standard\n|no = 175\n|start = 2026/09/11 04:00:00\n|end = 2026/09/25 03:59:59\n|operators = Five A, Six A, Five B, Six B, Five C}}';

test('sync-recurring-banners reads the page for its own year, following a move to the new title', async t => {
  const { syncRecurringBanners } = await recurringBannerSync();
  await temporary(async root => {
    const repository = bannerRepository(root);
    const requested = answering(t, repository.answer(title => ({
      parse: { title: 'Headhunting/Banners/2026 (Global)', redirects: [{ from: title, to: 'Headhunting/Banners/2026 (Global)' }], wikitext: { '*': standardRow } },
    })));
    assert.deepEqual(await syncRecurringBanners(root, new Date('2026-09-15T12:00:00Z')), ['Standard Pool #175 (Global)']);
    assert.deepEqual(repository.banners().map((banner: { name: string }) => banner.name), ['Standard Pool #175 (Global)']);
    const [page] = wikiRequests(requested);
    assert.equal(page.searchParams.get('page'), 'Headhunting/Banners/2026');
    assert.equal(page.searchParams.get('redirects'), '1');
  });
});

test('sync-recurring-banners excuses a missing yearly page only in January; later, and for a page that still redirects, it reports and reads the last good copy', async t => {
  const { syncRecurringBanners } = await recurringBannerSync();
  await temporary(async root => {
    const repository = bannerRepository(root);
    const warnings: string[] = [];
    t.mock.method(console, 'warn', (message: string) => { warnings.push(message); });
    answering(t, repository.answer(() => missing));
    assert.deepEqual(await syncRecurringBanners(root, new Date('2027-01-31T23:59:59Z')), []);
    assert.match(warnings.join('\n'), /Headhunting\/Banners\/2027 does not exist on the wiki yet/);
    assert.deepEqual(await entries(root), []);
    for (const late of ['2027-02-01T00:00:00Z', '2027-06-01T00:00:00Z']) {
      assert.deepEqual(await syncRecurringBanners(root, new Date(late)), [], late);
      assert.deepEqual((await entries(root)).map((e: { key: string; stage: string; action: string }) => [e.key, e.stage, e.action]),
        [['wiki:Headhunting/Banners/2027', 'recurring-banners', 'omitted-new']], late);
    }
    t.mock.restoreAll();
    // The last good read of the page still names the Standard banner the client shipped.
    fs.mkdirSync(path.join(root, 'data/wiki-cache'), { recursive: true });
    fs.writeFileSync(cacheOf(root, 'Headhunting/Banners/2026'), JSON.stringify({ page: 'Headhunting/Banners/2026', template: 'Banners cell',
      rows: [{ type: 'standard', no: '175', start: '2026/09/11 04:00:00', end: '2026/09/25 03:59:59', operators: 'Five A, Six A, Five B, Six B, Five C' }] }));
    t.mock.method(console, 'warn', () => {});
    answering(t, repository.answer(() => doubleRedirect));
    assert.deepEqual(await syncRecurringBanners(root, new Date('2026-09-15T12:00:00Z')), ['Standard Pool #175 (Global)']);
    assert.deepEqual(repository.banners().map((banner: { name: string }) => banner.name), ['Standard Pool #175 (Global)']);
    const reported = (await entries(root)).filter((e: { stage: string }) => e.stage === 'recurring-banners');
    assert.deepEqual(reported.map((e: { key: string; action: string }) => [e.key, e.action]), [['wiki:Headhunting/Banners/2026', 'kept-previous']]);
    assert.match(reported[0].reason, /still a redirect/);
  });
});
