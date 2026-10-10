import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
// @ts-expect-error Node scripts are plain JavaScript.
import { FULL_WALK_DAY, NEWS_DIR, syncOfficialNews } from '../sync/sync-official-news.mjs';
// @ts-expect-error Node scripts are plain JavaScript.
import { CN_NEWS_DIR, syncCnNews, unreadPost } from '../sync/sync-cn-news.mjs';
// @ts-expect-error Node scripts are plain JavaScript.
import { cnBanners } from '../build/cn-news.mjs';

/*
 * The two official-news syncs (sync-official-news.mjs, sync-cn-news.mjs), driven through their
 * injected fetchers: the sites are tables of answers here, and nothing leaves the machine. What
 * they must never do is leave a post unread for good, or let one bad post stop the rest.
 */
function temporary(run: (root: string) => Promise<void>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arkpedia-news-'));
  return run(root).finally(() => fs.rmSync(root, { recursive: true, force: true }));
}
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const NOW = Date.parse('2026-10-05T12:00:00Z');
const cachedIds = (root: string, dir: string) => fs.readdirSync(path.join(root, dir)).map(file => file.slice(0, -5)).sort((a, b) => Number(a) - Number(b));

/* The Global site: 40 event posts (or `count`), ids 1 (oldest) to 40 (newest), listed newest
   first, 30 a page. `pages` records each list page asked for. */
function globalSite({ failing = new Set<number>(), count = 40 } = {}) {
  const ids = Array.from({ length: count }, (_, i) => count - i);
  const details: number[] = [];
  const pages: number[] = [];
  const fetcher = async (input: string) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/list')) {
      const index = Number(url.searchParams.get('index')), size = Number(url.searchParams.get('size'));
      pages.push(index);
      return json({ code: 0, data: { rows: ids.slice((index - 1) * size, index * size).map(id => ({ id, type: 'event', title: `Post ${id}`, publishTime: id })) } });
    }
    const id = Number(url.searchParams.get('id'));
    details.push(id);
    if (failing.has(id)) return json({ code: 500 }, 500);
    return json({ code: 0, data: { id, title: `Post ${id}`, publishTime: id, content: `<p>DETAILS: post ${id}</p>` } });
  };
  return { fetcher, details, pages };
}
const cachePosts = (root: string, ids: number[]) => {
  fs.mkdirSync(path.join(root, NEWS_DIR), { recursive: true });
  for (const id of ids) fs.writeFileSync(path.join(root, NEWS_DIR, `${id}.json`), JSON.stringify({ id, title: `Post ${id}`, lines: [] }));
};

test('Global posts are fetched oldest first, so a run that stops part-way leaves its gap where the next run finds it', () => temporary(async root => {
  const site = globalSite();
  // The run dies after its 25th post (a timeout, a crash): the pause after it throws. Counted by
  // the posts asked for, not the pauses, since the run also pauses between list pages.
  const dying = async () => { if (site.details.length === 25) throw new Error('the job was cancelled'); };
  await assert.rejects(syncOfficialNews(root, { fetcher: site.fetcher, pause: dying }), /cancelled/);
  assert.deepEqual(site.details, Array.from({ length: 25 }, (_, i) => i + 1), 'oldest first');
  // The next run's first page holds the newest fifteen, uncached, and reads them.
  site.details.length = 0;
  const rerun = await syncOfficialNews(root, { fetcher: site.fetcher, pause: async () => {} });
  assert.deepEqual(rerun, { fresh: 15, unreadable: [] });
  assert.deepEqual(site.details, Array.from({ length: 15 }, (_, i) => i + 26));
  assert.deepEqual(cachedIds(root, NEWS_DIR), Array.from({ length: 40 }, (_, i) => String(i + 1)));
  // A quiet day: nothing new, no post asked for.
  site.details.length = 0;
  assert.deepEqual(await syncOfficialNews(root, { fetcher: site.fetcher, pause: async () => {} }), { fresh: 0, unreadable: [] });
  assert.deepEqual(site.details, []);
}));

test('one Global post that cannot be read is reported, the rest are read, and the next run asks for it again', () => temporary(async root => {
  const site = globalSite({ failing: new Set([3]) });
  const first = await syncOfficialNews(root, { fetcher: site.fetcher, pause: async () => {} });
  assert.deepEqual(first, { fresh: 39, unreadable: [{ id: 3, title: 'Post 3', url: 'https://www.arknights.global/news/3' }] });
  assert.equal(cachedIds(root, NEWS_DIR).length, 39);
  // Post 3 sits on the list's second page, which a quiet day never reaches: the stage's entry for
  // it (written by the command line, stage official-news) is what brings it back.
  fs.writeFileSync(path.join(root, 'data/quarantine.json'), JSON.stringify({ version: 1, entries: [
    { key: 'official-news:3', stage: 'official-news', action: 'omitted-new', reason: 'x', firstSeen: '2026-10-05' },
    { key: 'official-news:3', stage: 'some-other-stage', action: 'omitted-new', reason: 'x', firstSeen: '2026-10-05' },
  ] }));
  site.details.length = 0;
  const fixed = globalSite();
  const second = await syncOfficialNews(root, { now: NOW, fetcher: async (input: string) => { site.details.push(Number(new URL(input).searchParams.get('id')) || 0); return fixed.fetcher(input); }, pause: async () => {} });
  assert.deepEqual(second, { fresh: 1, unreadable: [] });
  assert.deepEqual(site.details.filter(Boolean), [3], 'only the post the last run could not read');
  assert.equal(cachedIds(root, NEWS_DIR).length, 40);
}));

test('a Global post the site deleted is not asked for, or reported, for good', () => temporary(async root => {
  // Everything listed is cached; posts 41 and 42 were reported by earlier runs and no page lists them.
  const site = globalSite();
  await syncOfficialNews(root, { now: NOW, fetcher: site.fetcher, pause: async () => {} });
  const entry = (id: number, firstSeen: string) => ({ key: `official-news:${id}`, stage: 'official-news', action: 'omitted-new', reason: 'x', firstSeen });
  const quarantine = (...entries: object[]) => fs.writeFileSync(path.join(root, 'data/quarantine.json'), JSON.stringify({ version: 1, entries }));
  const answering = (status: number) => async (input: string) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/detail')) { site.details.push(Number(url.searchParams.get('id'))); return json({ code: status }, status); }
    return site.fetcher(input);
  };
  // Not found, and unlisted: deleted. Any other failure is still the post's problem.
  quarantine(entry(41, '2026-10-04'), entry(42, '2026-10-04'));
  site.details.length = 0;
  assert.deepEqual(await syncOfficialNews(root, { now: NOW, fetcher: answering(404), pause: async () => {} }), { fresh: 0, unreadable: [] });
  assert.deepEqual(site.details, [41, 42]);
  site.details.length = 0;
  assert.deepEqual((await syncOfficialNews(root, { now: NOW, fetcher: answering(500), pause: async () => {} })).unreadable.map((post: { id: number }) => post.id), [41, 42]);
  // Thirty days after it was first reported, an unlisted post is no longer asked for: one the
  // site deleted without a 404 drops off too, instead of standing on the daily issue for good.
  quarantine(entry(41, '2026-09-06'), entry(42, '2026-09-05'));
  site.details.length = 0;
  assert.deepEqual(await syncOfficialNews(root, { now: NOW, fetcher: answering(500), pause: async () => {} }), { fresh: 0, unreadable: [{ id: 41, title: null, url: 'https://www.arknights.global/news/41' }] });
  assert.deepEqual(site.details, [41], 'post 42, first reported thirty days ago, is given up');
}));

test('a gap the newest-first code left at the older end is healed by the weekly walk of every page', () => temporary(async root => {
  // 100 posts, four list pages. The old code, fetching newest first, cached 100 to 11 and died: the
  // gap, 10 to 1, sits behind two pages with nothing new, where the daily paging stops.
  const site = globalSite({ count: 100 });
  cachePosts(root, Array.from({ length: 90 }, (_, i) => 100 - i));
  const monday = Date.parse('2026-10-05T12:00:00Z'), sunday = Date.parse('2026-10-11T12:00:00Z');
  assert.equal([new Date(monday).getUTCDay(), new Date(sunday).getUTCDay()].join(), `1,${FULL_WALK_DAY}`);
  assert.deepEqual(await syncOfficialNews(root, { now: monday, fetcher: site.fetcher, pause: async () => {} }), { fresh: 0, unreadable: [] });
  assert.deepEqual([site.pages, site.details], [[1, 2], []], 'a quiet day reads two pages');
  site.pages.length = 0;
  assert.deepEqual(await syncOfficialNews(root, { now: sunday, fetcher: site.fetcher, pause: async () => {} }), { fresh: 100, unreadable: [] });
  assert.deepEqual(site.pages, [1, 2, 3, 4], 'every page, the last one short');
  assert.deepEqual(site.details, Array.from({ length: 100 }, (_, i) => i + 1), 'the gap, oldest first');
  assert.equal(cachedIds(root, NEWS_DIR).length, 100);
}));

test('a given-up Global post is said once in the log, and never while a page still lists it', t => temporary(async root => {
  // Post 40 is listed and still failing; post 41 no page lists. Both were first reported more than
  // RETRY_DAYS ago, so only a listing brings either back: 40's does, and it is asked for again.
  const warn = t.mock.method(console, 'warn', () => {});
  const site = globalSite({ failing: new Set([40]) });
  cachePosts(root, Array.from({ length: 39 }, (_, i) => i + 1));
  const entry = (id: number) => ({ key: `official-news:${id}`, stage: 'official-news', action: 'omitted-new', reason: 'x', firstSeen: '2026-09-01' });
  fs.writeFileSync(path.join(root, 'data/quarantine.json'), JSON.stringify({ version: 1, entries: [entry(40), entry(41)] }));
  const run = await syncOfficialNews(root, { now: NOW, fetcher: site.fetcher, pause: async () => {} });
  assert.deepEqual(run.unreadable.map((post: { id: number }) => post.id), [40]);
  assert.deepEqual(site.details, [40]);
  const given = warn.mock.calls.map(call => String(call.arguments[0])).filter(line => /no longer asked for/.test(line));
  assert.deepEqual(given, ['Official news post 41, unread since 2026-09-01, is no longer asked for: no page read today lists it.']);
}));

test('a listed Global post that answers 404 is reported: it exists, whatever its detail says', () => temporary(async root => {
  const site = globalSite();
  const fetcher = async (input: string) => (new URL(input).searchParams.get('id') === '40' ? json({ code: 404 }, 404) : site.fetcher(input));
  const run = await syncOfficialNews(root, { now: NOW, fetcher, pause: async () => {} });
  assert.deepEqual(run.unreadable.map((post: { id: number }) => post.id), [40]);
}));

/* The CN site: a list page embedding three activity posts, each post page its own answer. */
const listEntry = (cid: string, title: string) => `{\\"cid\\":\\"${cid}\\",\\"tab\\":\\"1\\",\\"sticky\\":false,\\"title\\":\\"${title}\\",\\"author\\":\\"x\\",\\"displayTime\\":1790996400}`;
const article = (title: string) => `<html><body><div>${title}</div><p>一、A</p><p>活动时间： 10月09日 12:00 - 10月30日 03:59</p><p>【明日方舟】运营组</p><script></script></body></html>`;

test('one CN post that cannot be fetched or read is reported, the others are cached, and a rerun asks only for it', () => temporary(async root => {
  const list = listEntry('101', 'Readable') + listEntry('102', 'No article') + listEntry('103', 'Down');
  const asked: string[] = [];
  let down = true;
  const fetcher = async (input: string) => {
    asked.push(input);
    if (input === 'https://ak.hypergryph.com/news') return new Response(list);
    if (input.endsWith('/101')) return new Response(article('Readable'));
    if (input.endsWith('/102')) return new Response('<html><body>a challenge page</body></html>');
    if (down) throw new TypeError('fetch failed');
    return new Response(article('Down'));
  };
  const first = await syncCnNews(root, { fetcher, pause: async () => {} });
  assert.equal(first.fresh, 1);
  assert.deepEqual(first.unreadable.map((post: { cid: string; fetched: boolean }) => [post.cid, post.fetched]), [['102', true], ['103', false]]);
  assert.deepEqual(cachedIds(root, CN_NEWS_DIR), ['101']);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, CN_NEWS_DIR, '101.json'), 'utf8')).lines, ['一、A', '活动时间： 10月09日 12:00 - 10月30日 03:59']);
  // One wording either way, so a post that cannot be fetched one night and holds no article the next
  // keeps its entry as it is; which it was goes to the log.
  const [noArticle, notFetched] = first.unreadable.map(unreadPost);
  assert.deepEqual(notFetched, { key: 'cn-news:103', action: 'omitted-new', reason: 'The CN announcement "Down" (https://ak.hypergryph.com/news/103) could not be read; it is left out until it can be.' });
  assert.equal(unreadPost({ ...first.unreadable[1], fetched: true }).reason, notFetched.reason);
  assert.equal(noArticle.key, 'cn-news:102');
  asked.length = 0;
  down = false;
  const second = await syncCnNews(root, { fetcher, pause: async () => {} });
  assert.deepEqual(asked, ['https://ak.hypergryph.com/news', 'https://ak.hypergryph.com/news/102', 'https://ak.hypergryph.com/news/103']);
  assert.deepEqual([second.fresh, second.unreadable.map((post: { cid: string }) => post.cid)], [1, ['102']]);
  // The list page itself failing is the one failure that stops the sync (the command line keeps the cache).
  await assert.rejects(syncCnNews(root, { fetcher: async () => new Response('', { status: 502 }), pause: async () => {} }), /HTTP 502/);
}));

test('a joint operation preview (联合行动) is a banner of its own kind', () => {
  // SYNTHETIC: no archived 联合行动 post is in the tree, so this one is written in the shape of
  // the 定向甄选 post (fixtures/cn-news/1455.json); it holds the parser to the 联合行动 branch,
  // not to a real post's wording.
  const post = { cid: '0', title: '[活动预告]联合行动限时寻访即将开启', displayTime: 1790996400, url: 'https://ak.hypergryph.com/news/0', lines: [
    '一、【联合行动】特选干员限时寻访开启',
    '活动时间： 10月09日 16:00 - 10月23日 03:59',
    '★★★★★★（6★出率：2%）：甲 / 乙 / 丙 / 丁',
    '★★★★★（5★出率：8%）：戊 / 己 / 庚 / 辛',
  ] };
  const [banner] = cnBanners(post);
  assert.deepEqual([banner.name, banner.kind, banner.six, banner.five], ['联合行动', 'joint', ['甲', '乙', '丙', '丁'], ['戊', '己', '庚', '辛']]);
});

test('recent cached Global announcements are revisited and corrections replace their old text', () => temporary(async root => {
  const publishTime = NOW - 86400000;
  const fetcher = async (input: string) => input.includes('/list?')
    ? json({ code: 0, data: { rows: [{ id: 1, title: 'Corrected', type: 'event', publishTime }] } })
    : json({ code: 0, data: { id: 1, title: 'Corrected', publishTime, content: '<p>01 EVENT OPEN</p><p>DETAILS: corrected rewards</p>' } });
  cachePosts(root, [1]);
  assert.deepEqual(await syncOfficialNews(root, { now: NOW, fetcher, pause: async () => {} }), { fresh: 1, unreadable: [] });
  assert.match(fs.readFileSync(path.join(root, NEWS_DIR, '1.json'), 'utf8'), /corrected rewards/);
  assert.deepEqual(await syncOfficialNews(root, { now: NOW, fetcher, pause: async () => {} }), { fresh: 0, unreadable: [] });
}));
