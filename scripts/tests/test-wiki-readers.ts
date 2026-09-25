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
// @ts-expect-error Plain Node import scripts share their pure reconciliation with tests.
const catalogueModel = () => import('../sync/catalogue-model.mjs');
// @ts-expect-error Plain Node script, run directly by the release job.
const quarantineReport = () => import('../content/quarantine-report.mjs');
// @ts-expect-error Plain Node import scripts, also run directly by the refresh job.
const catalogueSync = () => import('../sync/sync-catalogue.mjs');
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
// Where a row that leaves an Upcoming page goes; these tests' rows go nowhere unless they say so.
const nowhere = { name: 'nowhere', has: () => false };

test('a page is read following redirects, and its parsed rows become the last good copy, with no timestamp', async t => {
  const { readWikiRows } = await wikiPages();
  await temporary(async root => {
    const requested = answering(t, () => ({ parse: { title: 'Event/Upcoming (Global)', redirects: [{ from: 'Event/Upcoming', to: 'Event/Upcoming (Global)' }], wikitext: { '*': eventCells } } }));
    const alerts = (await quarantine()).beginStage(root, 'wiki', new Date('2027-06-01T00:00:00Z'));
    const rows = await readWikiRows(root, 'Event/Upcoming', 'Upcoming events cell', { now: new Date('2027-06-01T00:00:00Z'), alerts, movedTo: nowhere });
    assert.deepEqual(rows, [{ name: 'Test event', cnstart: '2027/05/01' }, { name: 'Other event' }]);
    assert.deepEqual(wikiRequests(requested).map(url => [url.searchParams.get('page'), url.searchParams.get('redirects')]), [['Event/Upcoming', '1']]);
    assert.equal(fs.readFileSync(cacheOf(root, 'Event/Upcoming'), 'utf8'), `${JSON.stringify({ page: 'Event/Upcoming', template: 'Upcoming events cell', rows }, null, 2)}\n`);
    assert.deepEqual(alerts.entries, []);
    // A dry run reads but never writes the data file.
    fs.rmSync(cacheOf(root, 'Event/Upcoming'));
    await readWikiRows(root, 'Event/Upcoming', 'Upcoming events cell', { now: new Date('2027-06-01T00:00:00Z'), write: false, movedTo: nowhere });
    assert.equal(fs.existsSync(cacheOf(root, 'Event/Upcoming')), false);
    // A page that loses rows as Global catches up cannot be read without saying where they go.
    for (const movedTo of [undefined, { name: 'nowhere' }]) {
      await assert.rejects(readWikiRows(root, 'Headhunting/Banners/Upcoming', 'Banners cell', { now: new Date('2027-06-01T00:00:00Z'), movedTo }), /needs movedTo/);
    }
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
      if (typeof answer === 'string') return new Response(answer, { status: 200, headers: { 'content-type': 'text/html' } });
      return new Response(JSON.stringify(answer), { status: 200 });
    });
    const read = async () => {
      const alerts = beginStage(root, 'wiki', now);
      const rows = await readWikiRows(root, 'Event/Upcoming', 'Upcoming events cell', { now, alerts, movedTo: nowhere });
      alerts.commit();
      return rows;
    };
    const lastGood = await read();
    assert.equal(lastGood.length, 2);
    t.mock.method(console, 'warn', () => {});
    const outages: [unknown, RegExp][] = [
      // A failed request is named by its kind, not its words of the day: the reason is a
      // release input, and an outage that times out one day and answers 502 the next is one problem.
      [Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }), /cannot be used: the wiki could not be reached;/],
      [Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }), /cannot be used: the wiki could not be reached;/],
      [503, /cannot be used: the wiki could not be reached;/],
      [502, /cannot be used: the wiki could not be reached;/],
      [403, /cannot be used: the wiki could not be reached;/],
      ['<html>Down for maintenance</html>', /cannot be used: the wiki could not be reached;/],
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

test('one outage writes the same quarantine file every day, whatever each day\'s failed request said; the log gets the words', async t => {
  const { readWikiRows } = await wikiPages();
  const { beginStage } = await quarantine();
  await temporary(async root => {
    let answer: unknown = { parse: { wikitext: { '*': eventCells } } };
    const warnings: string[] = [];
    t.mock.method(console, 'warn', (message: string) => { warnings.push(message); });
    t.mock.method(globalThis, 'fetch', async () => {
      if (answer instanceof Error) throw answer;
      if (typeof answer === 'number') return new Response('busy', { status: answer });
      if (typeof answer === 'string') return new Response(answer, { status: 200, headers: { 'content-type': 'text/html' } });
      return new Response(JSON.stringify(answer), { status: 200 });
    });
    const read = async (day: string) => {
      const now = new Date(`${day}T20:00:00Z`), alerts = beginStage(root, 'wiki', now);
      await readWikiRows(root, 'Event/Upcoming', 'Upcoming events cell', { now, alerts, movedTo: nowhere });
      alerts.commit();
      const file = path.join(root, 'data/quarantine.json');
      return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    };
    await read('2027-06-01');
    const days: [string, unknown, RegExp][] = [
      ['2027-06-02', 502, /Reading Event\/Upcoming failed: HTTP 502/],
      ['2027-06-03', Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }), /failed: fetch failed \(ECONNREFUSED\)/],
      ['2027-06-04', 403, /failed: HTTP 403/],
      ['2027-06-05', '<html>Down for maintenance</html>', /failed: .*JSON/],
      ['2027-06-06', Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }), /failed: The operation was aborted due to timeout/],
      ['2027-06-07', 503, /failed: HTTP 503/],
    ];
    const files = new Set<string>();
    for (const [day, outage, logged] of days) {
      answer = outage;
      warnings.length = 0;
      files.add(await read(day));
      assert.match(warnings.join('\n'), logged, day);
    }
    assert.equal(files.size, 1, 'six days of one outage, one set of bytes');
    const [entry] = await entries(root);
    assert.deepEqual([entry.firstSeen, entry.reason], ['2027-06-02', 'Wiki page Event/Upcoming cannot be used: the wiki could not be reached; its last good read (2 rows) is used instead.']);
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
      const rows = await readWikiRows(root, wikiPage, 'Banners cell', { now, alerts, movedTo: nowhere });
      alerts.commit();
      return rows.length;
    };
    const cache = () => fs.readFileSync(cacheOf(root, upcoming), 'utf8');
    assert.equal(await read('2026-09-01'), 20);
    assert.equal(JSON.parse(cache()).peak, undefined, 'a page that never shrank keeps no peak');
    // Nine rows leave (for nowhere these tests know of): fewer than half, taken, and the 20 it held is kept for a week.
    answer = page(11, 9);
    assert.equal(await read('2026-09-02'), 11);
    assert.deepEqual(JSON.parse(cache()).peak, { rows: 20, since: '2026-09-02' });
    assert.deepEqual(await entries(root), []);
    const before = cache();
    // Half of yesterday's 11, but not half of the 20 held this week: kept, and reported, and the
    // hold is marked in the cache with its words, so it holds past the peak's week, whatever the count.
    answer = page(6, 14);
    assert.equal(await read('2026-09-03'), 11);
    const [entry] = await entries(root);
    assert.deepEqual([entry.key, entry.action], [`wiki:${upcoming}`, 'kept-previous']);
    assert.match(entry.reason, /fewer than half the "Banners cell" rows it recently held parse, not counting rows that moved nowhere; most of the page has probably been reformatted/);
    assert.deepEqual(JSON.parse(cache()).peak, { rows: 20, since: '2026-09-02' });
    assert.equal(JSON.parse(cache()).held, entry.reason.match(/cannot be used: (.*?)\. If it really lost them/)?.[1]);
    assert.equal(JSON.parse(cache()).rows.length, 11, 'the good copy survives');
    assert.equal(PEAK_DAYS, 7);
    // The page comes back: the hold ends and its mark comes off. From then on an unchanged page
    // leaves the file alone, even once the week is over.
    answer = page(11, 9);
    assert.equal(await read('2026-09-04'), 11);
    assert.equal(cache(), before);
    assert.deepEqual(await entries(root), []);
    assert.equal(await read('2026-09-12'), 11);
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

// Banner rows with CN windows of their own, as the Upcoming and yearly pages list them.
const bannerCell = (i: number, name = `Banner ${i}`) => {
  const day = String(i + 1).padStart(2, '0');
  return `{{Banners cell\n|type = special\n|name = ${name}\n|cnstart = 2027/01/${day} 16:00:00\n|cnend = 2027/02/${day}\n}}`;
};
const bannerPage = (indices: number[], name?: (i: number) => string) => ({ parse: { wikitext: { '*': indices.map(i => bannerCell(i, name?.(i))).join('\n') } } });
const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => from + i);

test('an Upcoming page whose lost rows turned up where the wiki moves them is taken, with no alert', async t => {
  const { readWikiRows } = await wikiPages();
  const { beginStage } = await quarantine();
  const { onYearlyPage, parseWikiRows } = await catalogueModel();
  const upcoming = 'Headhunting/Banners/Upcoming';
  await temporary(async root => {
    let answer: unknown = bannerPage(range(0, 20));
    let yearly: object[] = [];
    t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(answer), { status: 200 }));
    t.mock.method(console, 'warn', () => {});
    const read = async (day: string) => {
      const now = new Date(`${day}T20:00:00Z`), alerts = beginStage(root, 'wiki', now);
      const rows = await readWikiRows(root, upcoming, 'Banners cell', { now, alerts, movedTo: { name: 'to Headhunting/Banners/2027', has: onYearlyPage(yearly) } });
      alerts.commit();
      return rows.length;
    };
    const cached = () => JSON.parse(fs.readFileSync(cacheOf(root, upcoming), 'utf8'));
    // The yearly page lists a moved banner under its Global title, and its days without a time.
    const yearlyWith = (indices: number[]) => parseWikiRows(bannerPage(indices, i => `Global title ${i}`).parse.wikitext['*'].replaceAll(' 16:00:00', ''), 'Banners cell');
    assert.equal(await read('2027-03-01'), 20);
    // Twelve rows leave and eight of them are on the yearly page: judged by the twelve it should
    // still hold, the eight left are not too few, so it is taken, and the peak remembers twelve.
    answer = bannerPage(range(12, 20));
    yearly = yearlyWith(range(0, 8));
    assert.equal(await read('2027-03-02'), 8);
    assert.deepEqual(await entries(root), []);
    assert.deepEqual(cached().peak, { rows: 12, since: '2027-03-02' });
    // Five more leave, all five for the yearly page: taken, whatever the week's peak says.
    answer = bannerPage(range(17, 20));
    yearly = yearlyWith([...range(0, 8), ...range(12, 17)]);
    assert.equal(await read('2027-03-03'), 3);
    assert.deepEqual(await entries(root), []);
    assert.deepEqual(cached().peak, { rows: 7, since: '2027-03-02' }, 'the rows that moved are not missed');
  });
});

test('an Upcoming shrink nothing accounts for is held back and reported every day, overdue after three, until a maintainer accepts it', async t => {
  const { readWikiRows, PEAK_DAYS } = await wikiPages();
  const { beginStage, readQuarantine } = await quarantine();
  const { onYearlyPage } = await catalogueModel();
  const { renderQuarantineReport, OVERDUE_DAYS } = await quarantineReport();
  const upcoming = 'Headhunting/Banners/Upcoming';
  await temporary(async root => {
    let answer: unknown = bannerPage(range(0, 20));
    t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(answer), { status: 200 }));
    t.mock.method(console, 'warn', () => {});
    const day = (n: number) => new Date(Date.UTC(2027, 2, 1 + n, 20));
    const read = async (n: number) => {
      const alerts = beginStage(root, 'wiki', day(n));
      const rows = await readWikiRows(root, upcoming, 'Banners cell', { now: day(n), alerts, movedTo: { name: 'to Headhunting/Banners/2027', has: onYearlyPage([]) } });
      alerts.commit();
      return rows.length;
    };
    const file = () => fs.readFileSync(path.join(root, 'data/quarantine.json'), 'utf8');
    const cache = () => fs.readFileSync(cacheOf(root, upcoming), 'utf8');
    assert.equal(await read(0), 20);
    answer = bannerPage(range(9, 20));
    assert.equal(await read(1), 11);
    // Five of the eleven leave for nowhere: fewer than half the 20 it held this week.
    answer = bannerPage(range(14, 20));
    assert.equal(await read(2), 11);
    const [entry] = await entries(root);
    assert.deepEqual([entry.key, entry.action, entry.firstSeen], [`wiki:${upcoming}`, 'kept-previous', '2027-03-03']);
    assert.match(entry.reason, /If it really lost them, delete source\/data\/wiki-cache\/Headhunting-Banners-Upcoming\.json in arkpedia-data \(a correction branch\) and the next run takes the page as it is/);
    const reported = file(), held = cache();
    // Past the week the peak would have run out and the six been taken without a word. Held
    // back, it stays held back, byte for byte: no day of it is a new release.
    assert.ok(14 > PEAK_DAYS + 2);
    for (let n = 3; n <= 14; n++) {
      assert.equal(await read(n), 11, `day ${n}`);
      assert.equal(file(), reported, `day ${n}: the same entry, byte for byte`);
      assert.equal(cache(), held, `day ${n}: the good copy and its held peak`);
      const report = renderQuarantineReport({ quarantine: readQuarantine(root), stageReport: { version: 1, stages: [] }, now: day(n) });
      assert.equal(report.state, 'alert', `day ${n}`);
      const row = report.body.split('\n').find((line: string) => line.includes(`\`wiki:${upcoming}\``));
      assert.equal(row?.startsWith('| **overdue** |'), n - 2 > OVERDUE_DAYS, `day ${n}: ${row}`);
    }
    // The maintainer checks the page and accepts it: the cache file goes, and the page is taken as it is.
    fs.rmSync(cacheOf(root, upcoming));
    assert.equal(await read(15), 6);
    assert.deepEqual(await entries(root), []);
    assert.deepEqual(JSON.parse(cache()), { page: upcoming, template: 'Banners cell', rows: JSON.parse(cache()).rows });
  });
});

test('a held-back Upcoming shrink is taken once its lost rows turn up on the yearly page, and the hold mark comes off', async t => {
  const { readWikiRows } = await wikiPages();
  const { beginStage } = await quarantine();
  const { onYearlyPage, parseWikiRows } = await catalogueModel();
  const upcoming = 'Headhunting/Banners/Upcoming';
  await temporary(async root => {
    let answer: unknown = bannerPage(range(0, 20));
    let yearly: object[] = [];
    t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(answer), { status: 200 }));
    t.mock.method(console, 'warn', () => {});
    const day = (n: number) => new Date(Date.UTC(2027, 2, 1 + n, 20));
    const read = async (n: number) => {
      const alerts = beginStage(root, 'wiki', day(n));
      const rows = await readWikiRows(root, upcoming, 'Banners cell', { now: day(n), alerts, movedTo: { name: 'to Headhunting/Banners/2027', has: onYearlyPage(yearly) } });
      alerts.commit();
      return rows.length;
    };
    assert.equal(await read(0), 20);
    answer = bannerPage(range(9, 20));
    assert.equal(await read(1), 11);
    answer = bannerPage(range(14, 20));
    assert.equal(await read(2), 11);
    assert.equal((await entries(root)).length, 1);
    assert.equal(await read(12), 11, 'still held back ten days on');
    // The wiki editors were slow: the five rows land on the yearly page now.
    yearly = parseWikiRows(bannerPage(range(9, 14)).parse.wikitext['*'], 'Banners cell');
    assert.equal(await read(13), 6);
    assert.deepEqual(await entries(root), []);
    const cache = JSON.parse(fs.readFileSync(cacheOf(root, upcoming), 'utf8'));
    assert.equal(cache.rows.length, 6);
    assert.equal(cache.peak, undefined, 'the week of the peak it was held by is long over');
  });
});

test('a held-back Upcoming shrink ends when the page serves the rows it kept again, and the hold mark comes off', async t => {
  const { readWikiRows, PEAK_DAYS } = await wikiPages();
  const { beginStage } = await quarantine();
  const upcoming = 'Headhunting/Banners/Upcoming';
  await temporary(async root => {
    let answer: unknown = bannerPage(range(0, 20));
    t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(answer), { status: 200 }));
    t.mock.method(console, 'warn', () => {});
    const day = (n: number) => new Date(Date.UTC(2027, 2, 1 + n, 20));
    const read = async (n: number) => {
      const alerts = beginStage(root, 'wiki', day(n));
      const rows = await readWikiRows(root, upcoming, 'Banners cell', { now: day(n), alerts, movedTo: nowhere });
      alerts.commit();
      return rows.length;
    };
    const cache = () => JSON.parse(fs.readFileSync(cacheOf(root, upcoming), 'utf8'));
    assert.equal(await read(0), 20);
    answer = bannerPage(range(9, 20));
    assert.equal(await read(1), 11);
    answer = bannerPage(range(14, 20));
    assert.equal(await read(2), 11);
    assert.match(cache().held, /fewer than half/);
    // The wiki reverts the edit: the page serves exactly the rows the good copy kept. Nothing
    // about the rows changes, but the hold is over and its mark must come off, or any later row
    // that leaves without turning up where the wiki moves it would be held back, however few.
    answer = bannerPage(range(9, 20));
    assert.equal(await read(3), 11);
    assert.deepEqual(await entries(root), []);
    assert.deepEqual(cache().peak, { rows: 20, since: '2027-03-02' }, 'the running peak stays, unmarked');
    // A week on, that peak has run out like any other: five of the eleven leaving is taken.
    assert.ok(10 - 1 > PEAK_DAYS);
    answer = bannerPage(range(14, 20));
    assert.equal(await read(10), 6);
    assert.deepEqual(await entries(root), []);
  });
});

/* A hold ends only when the rows it lost are accounted for -- served again, or found where the
   wiki moves them -- or a maintainer deletes the cache file. Never because the count recovered:
   CN announces a banner or an event every week or two, and the new rows would hide the lost ones. */
test('an Upcoming shrink held back from a steady page stays held while new rows bring the count back, until the rows it lost turn up', async t => {
  const { readWikiRows } = await wikiPages();
  const { beginStage } = await quarantine();
  const { onYearlyPage, parseWikiRows } = await catalogueModel();
  const upcoming = 'Headhunting/Banners/Upcoming';
  await temporary(async root => {
    let answer: unknown = bannerPage(range(0, 20));
    let yearly: object[] = [];
    t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(answer), { status: 200 }));
    t.mock.method(console, 'warn', () => {});
    const day = (n: number) => new Date(Date.UTC(2027, 2, 1 + n, 20));
    const read = async (n: number) => {
      const alerts = beginStage(root, 'wiki', day(n));
      const rows = await readWikiRows(root, upcoming, 'Banners cell', { now: day(n), alerts, movedTo: { name: 'to Headhunting/Banners/2027', has: onYearlyPage(yearly) } });
      alerts.commit();
      return rows.length;
    };
    const file = () => fs.readFileSync(path.join(root, 'data/quarantine.json'), 'utf8');
    const cache = () => fs.readFileSync(cacheOf(root, upcoming), 'utf8');
    assert.equal(await read(0), 20);
    assert.equal(JSON.parse(cache()).peak, undefined, 'a steady page keeps no peak: only the hold itself can keep it held');
    // Just over half the rows stop parsing: held back and reported, and the hold is marked in the cache.
    answer = bannerPage(range(11, 20));
    assert.equal(await read(1), 20);
    assert.equal((await entries(root)).length, 1);
    const reported = file(), held = cache();
    assert.match(JSON.parse(held).held, /fewer than half the "Banners cell" rows it recently held parse/);
    // CN announces a banner: the nine and the new row are half the 20 again, and later more than
    // 20. None of the eleven turned up anywhere, so the page stays held back, with the same entry
    // and the same cache, byte for byte: no day of it is a new release.
    const days: [number, number[]][] = [[2, [...range(11, 20), 25]], [3, [...range(11, 20), 25]], [4, [...range(11, 20), ...range(25, 40)]]];
    for (const [n, indices] of days) {
      answer = bannerPage(indices);
      assert.equal(await read(n), 20, `day ${n}: ${indices.length} rows parse`);
      assert.equal(file(), reported, `day ${n}: the same entry`);
      assert.equal(cache(), held, `day ${n}: the same good copy and mark`);
    }
    // Six of the eleven land on the yearly page; five are still nowhere: held.
    yearly = parseWikiRows(bannerPage(range(0, 6)).parse.wikitext['*'], 'Banners cell');
    assert.equal(await read(5), 20);
    assert.equal(file(), reported);
    // The other five parse again: every row of the good copy is on the page or where it moved.
    // Taken, the alert gone, the mark off.
    answer = bannerPage([...range(6, 20), ...range(25, 40)]);
    assert.equal(await read(6), 29);
    assert.deepEqual(await entries(root), []);
    assert.deepEqual(Object.keys(JSON.parse(cache())), ['page', 'template', 'rows']);
  });
});

test('an Upcoming shrink held back by its week\'s peak stays held when new rows bring the count back to half, past the week too', async t => {
  const { readWikiRows, PEAK_DAYS } = await wikiPages();
  const { beginStage } = await quarantine();
  const upcoming = 'Headhunting/Banners/Upcoming';
  await temporary(async root => {
    let answer: unknown = bannerPage(range(0, 20));
    t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(answer), { status: 200 }));
    t.mock.method(console, 'warn', () => {});
    const day = (n: number) => new Date(Date.UTC(2027, 2, 1 + n, 20));
    const read = async (n: number) => {
      const alerts = beginStage(root, 'wiki', day(n));
      const rows = await readWikiRows(root, upcoming, 'Banners cell', { now: day(n), alerts, movedTo: nowhere });
      alerts.commit();
      return rows.length;
    };
    const file = () => fs.readFileSync(path.join(root, 'data/quarantine.json'), 'utf8');
    const cache = () => fs.readFileSync(cacheOf(root, upcoming), 'utf8');
    assert.equal(await read(0), 20);
    answer = bannerPage(range(9, 20));
    assert.equal(await read(1), 11);
    answer = bannerPage(range(14, 20));
    assert.equal(await read(2), 11);
    const reported = file(), held = cache();
    assert.equal(await read(3), 11);
    // The same six and four new rows: half the peak of 20 again, but five rows the good copy
    // kept are still missing. Held, byte for byte, and still once the peak's week is over.
    answer = bannerPage([...range(14, 20), ...range(30, 34)]);
    assert.ok(12 - 1 > PEAK_DAYS);
    for (const n of [4, 5, 12]) {
      assert.equal(await read(n), 11, `day ${n}`);
      assert.equal(file(), reported, `day ${n}: the same entry`);
      assert.equal(cache(), held, `day ${n}: the same good copy and mark`);
    }
    // Three of the five parse again; two are still missing: held.
    answer = bannerPage([...range(12, 20), ...range(30, 34)]);
    assert.equal(await read(13), 11);
    assert.equal(file(), reported);
    // All eleven are served again, with the four new rows: taken.
    answer = bannerPage([...range(9, 20), ...range(30, 34)]);
    assert.equal(await read(14), 15);
    assert.deepEqual(await entries(root), []);
    assert.equal(JSON.parse(cache()).held, undefined);
  });
});

test('a year\'s banner page held back stays held when a new row brings the count back, in the words it was held back with', async t => {
  const { readWikiRows } = await wikiPages();
  const { beginStage } = await quarantine();
  const page = 'Headhunting/Banners/2026';
  const cells = (indices: number[]) => ({ parse: { wikitext: { '*': indices.map(i => `{{Banners cell\n|type = special\n|name = Banner ${i}\n|cnstart = 2026/01/01\n}}`).join('\n') } } });
  await temporary(async root => {
    let answer: unknown = cells(range(0, 57));
    t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(answer), { status: 200 }));
    t.mock.method(console, 'warn', () => {});
    const day = (n: number) => new Date(Date.UTC(2026, 8, 20 + n, 20));
    const read = async (n: number) => {
      const alerts = beginStage(root, 'wiki', day(n));
      const rows = await readWikiRows(root, page, 'Banners cell', { now: day(n), alerts });
      alerts.commit();
      return rows.map((row: { name: string }) => row.name);
    };
    const file = () => fs.readFileSync(path.join(root, 'data/quarantine.json'), 'utf8');
    const cache = () => fs.readFileSync(cacheOf(root, page), 'utf8');
    assert.equal((await read(0)).length, 57);
    // The template is renamed: no row parses. Held back.
    answer = { parse: { wikitext: { '*': '{{Headhunting row\n|name = Banner 0\n}}' } } };
    assert.equal((await read(1)).length, 57);
    const reported = file(), held = cache();
    assert.match(JSON.parse(reported).entries[0].reason, /no "Banners cell" row that parses, where the last good read had 57/);
    // Rows parse again, all but one, and a new banner makes it 57 again. The row it lost is
    // still lost: held, and in the same words, so the day is no new release.
    answer = cells([...range(0, 56), 57]);
    const rows = await read(2);
    assert.ok(rows.includes('Banner 56') && !rows.includes('Banner 57'), 'the good copy is read');
    assert.equal(file(), reported);
    assert.equal(cache(), held);
    answer = cells([...range(1, 57), 57, 58]);
    assert.equal((await read(3)).length, 57, 'another row lost, two new: still the good copy');
    assert.equal(file(), reported);
    // Every row the good copy had is served again: taken.
    answer = cells(range(0, 59));
    assert.equal((await read(4)).length, 59);
    assert.deepEqual(await entries(root), []);
    assert.deepEqual(Object.keys(JSON.parse(cache())), ['page', 'template', 'rows']);
  });
});

test('sync-catalogue reads the yearly page first and tells the Upcoming pages where their rows go', async t => {
  const { readCalendarPages } = await catalogueSync();
  const { beginStage } = await quarantine();
  const eventCell = (i: number) => { const day = String(i + 1).padStart(2, '0'); return `{{Upcoming events cell\n|name = Event ${i}\n|cnstart = 2027/01/${day}\n|cnend = 2027/02/${day}}}`; };
  const cnDay = (month: string, i: number, time: string) => Date.parse(`2027-${month}-${String(i + 1).padStart(2, '0')}T${time}+08:00`) / 1000;
  const cn = { activity: { basicInfo: Object.fromEntries(range(0, 10).map(i => [`act${i}`, { id: `act${i}`, startTime: cnDay('01', i, '04:00:00'), endTime: cnDay('02', i, '03:59:59') }])) } };
  for (const moved of [true, false]) {
    await temporary(async root => {
      // The yearly page already lists a banner of its own.
      const dated = bannerCell(20, 'Dated long ago');
      let pages: Record<string, string> = { 'Headhunting/Banners/Upcoming': range(0, 10).map(i => bannerCell(i)).join('\n'), 'Headhunting/Banners/2027': dated, 'Event/Upcoming': range(0, 10).map(eventCell).join('\n') };
      const requested: string[] = [];
      t.mock.method(globalThis, 'fetch', async (input: string) => {
        const page = new URL(input).searchParams.get('page') ?? '';
        requested.push(page);
        return new Response(JSON.stringify({ parse: { wikitext: { '*': pages[page] } } }), { status: 200 });
      });
      t.mock.method(console, 'warn', () => {});
      let en = { activity: { basicInfo: {} } };
      const read = async (day: string) => {
        const now = new Date(`${day}T20:00:00Z`), alerts = beginStage(root, 'wiki', now);
        const rows = await readCalendarPages(root, { now, cn, en, alerts, write: true });
        alerts.commit();
        return rows;
      };
      await read('2027-03-01');
      assert.equal(requested[0], 'Headhunting/Banners/2027', 'the yearly page is read before the Upcoming pages');
      // Global dates banners 0-6 and schedules events 0-6: they leave the Upcoming pages.
      pages = { 'Headhunting/Banners/Upcoming': range(7, 10).map(i => bannerCell(i)).join('\n'),
        'Headhunting/Banners/2027': [dated, ...(moved ? range(0, 7).map(i => bannerCell(i, `Global title ${i}`)) : [])].join('\n'),
        'Event/Upcoming': range(7, 10).map(eventCell).join('\n') };
      if (moved) en = { activity: { basicInfo: Object.fromEntries(range(0, 7).map(i => [`act${i}`, { id: `act${i}` }])) } };
      const rows = await read('2027-03-02');
      if (moved) {
        assert.deepEqual([rows.upcoming.length, rows.yearly.length, rows.events.length], [3, 8, 3]);
        assert.deepEqual(await entries(root), []);
      } else {
        assert.deepEqual([rows.upcoming.length, rows.events.length], [10, 10], 'nothing accounts for the rows that left: the last good copies stand');
        assert.deepEqual((await entries(root)).map((e: { key: string; reason: string }) => [e.key, /not counting rows that moved (.*?);/.exec(e.reason)?.[1]]),
          [['wiki:Event/Upcoming', 'into the Global client\'s activity table'], ['wiki:Headhunting/Banners/Upcoming', 'to Headhunting/Banners/2027']]);
      }
    });
    t.mock.restoreAll();
  }
});

test('a row is accounted for where the wiki moves it: on the yearly page by its CN days, in the Global client by its CN activity', async () => {
  const { onYearlyPage, inGlobalClient } = await catalogueModel();
  const row = { type: 'limited', name: 'Fan title', cnstart: '2026/05/01 12:00:00', cnend: '2026/05/15 03:59:00' };
  // The yearly page names it by its Global title, and writes its days without a time.
  assert.equal(onYearlyPage([{ name: 'Official title', cnstart: '2026/05/01', cnend: '2026/05/15', globalstart: '2026/10/01' }])(row), true);
  assert.equal(onYearlyPage([{ name: 'Fan title', cnstart: '2026/05/02', cnend: '2026/05/15' }])(row), false, 'another window is another banner');
  assert.equal(onYearlyPage([{ name: 'Fan title', cnstart: '2026/05/01', cnend: '2026/05/29' }])(row), false);
  assert.equal(onYearlyPage([{}])({ name: 'Undated' }), false, 'a row with no CN day is never accounted for');
  // CN day boundaries are UTC+8: 2026-06-01 04:00 CN is 2026-05-31 20:00 UTC.
  const at = (day: string) => Date.parse(`${day}T20:00:00Z`) / 1000;
  const cn = { activity: { basicInfo: { act50side: { id: 'act50side', startTime: at('2026-05-31'), endTime: at('2026-06-14') } } } };
  const event = { name: 'Thunder in the Azure Dream', cnstart: '2026/06/01', cnend: '2026/06/15' };
  assert.equal(inGlobalClient(cn, { activity: { basicInfo: {} } })(event), false, 'not scheduled on Global yet');
  assert.equal(inGlobalClient(cn, { activity: { basicInfo: { act50side: { id: 'act50side' } } } })(event), true);
  assert.equal(inGlobalClient(cn, { activity: { basicInfo: { act50side: { id: 'act50side' } } } })({ ...event, cnend: '2026/06/22' }), false);
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
      assert.deepEqual(await readWikiRows(root, 'Event/Upcoming', 'Upcoming events cell', { now: new Date('2027-06-01T00:00:00Z'), alerts, movedTo: nowhere }), [{ name: 'Cached event' }]);
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
