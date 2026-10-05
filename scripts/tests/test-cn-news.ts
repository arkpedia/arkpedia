import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// @ts-expect-error Plain Node modules shared with the importers.
import { cnAnnouncements, cnBanners, cnDays, cnEvents, cnWindow, daysOverlap } from '../build/cn-news.mjs';
// @ts-expect-error Plain Node modules shared with the importers.
import { CN_NEWS_DIR, listedPosts, postLines, readCnNews } from '../sync/sync-cn-news.mjs';
// @ts-expect-error Plain Node modules shared with the importers.
import { reconcileCalendars, renameReferences } from '../sync/catalogue-model.mjs';
import type { HeadhuntingBanner } from '../../lib/gacha/headhuntingBanners';

const post = (cid: string) => JSON.parse(fs.readFileSync(`scripts/tests/fixtures/cn-news/${cid}.json`, 'utf8'));
const iso = (ts: number) => new Date(ts * 1000).toISOString();

test('the news list gives each activity post once with its date; a post page gives its article from title to sign-off, or to the page\'s navigation', () => {
  const list = '{\\"cid\\":\\"5101\\",\\"tab\\":\\"1\\",\\"sticky\\":false,\\"title\\":\\"[活动预告]SideStory「昨日海」限时活动即将开启\\",\\"author\\":\\"【明日方舟】运营组\\",\\"displayTime\\":1790996400}'
    + '{\\"cid\\":\\"8577\\",\\"tab\\":\\"0\\",\\"sticky\\":false,\\"title\\":\\"闪断更新公告\\",\\"author\\":\\"x\\",\\"displayTime\\":1790650800}'
    + '{\\"cid\\":\\"5101\\",\\"tab\\":\\"1\\",\\"sticky\\":false,\\"title\\":\\"[活动预告]SideStory「昨日海」限时活动即将开启\\",\\"author\\":\\"x\\",\\"displayTime\\":1790996400}';
  assert.deepEqual(listedPosts(list), [{ cid: '5101', title: '[活动预告]SideStory「昨日海」限时活动即将开启', displayTime: 1790996400 }]);
  const page = '<html><body><div>活动</div><div>T</div><div>2026 // 10 / 03</div><p><strong>一、A</strong></p><p>活动时间： 10月09日 12:00 - 10月30日 03:59</p><p>【明日方舟】运营组</p><div>ARKNIGHTS</div><script>x</script></body></html>';
  assert.deepEqual(postLines(page, 'T'), ['一、A', '活动时间： 10月09日 12:00 - 10月30日 03:59']);
  // A post without the sign-off (a fan contest, 4923) ends where the page's own navigation
  // begins, under the article: none of it is the post's.
  const contest = '<html><body><div>T</div><div>2026 // 09 / 30</div><p>活动结束时间：2026年10月8日23:59</p><p>点击跳转活动详情</p>'
    + '<div>INFO</div><div>返回列表</div><div>GO BACK</div><div>返回首页</div><div>HOMEPAGE</div><div>02</div><div>// 01 / 05</div><div>ARKNIGHTS</div></body></html>';
  assert.deepEqual(postLines(contest, 'T'), ['活动结束时间：2026年10月8日23:59', '点击跳转活动详情']);
});

test('the catalogue reads every cached post, and nothing else in the directory; a tree with none has no posts', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cn-news-'));
  try {
    assert.deepEqual(readCnNews(root), []);
    fs.mkdirSync(path.join(root, CN_NEWS_DIR), { recursive: true });
    for (const cid of ['5101', '1455']) fs.writeFileSync(path.join(root, CN_NEWS_DIR, `${cid}.json`), JSON.stringify(post(cid)));
    fs.writeFileSync(path.join(root, CN_NEWS_DIR, 'notes.json'), '{}');
    assert.deepEqual(readCnNews(root).map((p: any) => p.cid), ['1455', '5101']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('dates take the post\'s year, a December post announcing January the next one, and a :59 end its next minute', () => {
  const w = cnWindow('活动时间： 10月09日 12:00 - 10月23日 03:59', 1790996400);
  assert.deepEqual([iso(w.start), iso(w.end), cnDays(w)], ['2026-10-09T04:00:00.000Z', '2026-10-22T20:00:00.000Z', '2026/10/09–2026/10/23']);
  const december = Date.UTC(2026, 11, 28) / 1000;
  assert.equal(cnDays(cnWindow('01月05日 16:00 - 01月19日 03:59', december)), '2027/01/05–2027/01/19');
  assert.equal(cnDays(cnWindow('12月29日 16:00 - 01月12日 03:59', december)), '2026/12/29–2027/01/12');
});

test('two runs overlap by more than the day one closes and the next opens; the same days are one run, a one-day run\'s too', () => {
  const run = (first: string, last: string) => [first, last];
  assert.equal(daysOverlap(run('2026/09/29', '2026/10/13'), run('2026/09/30', '2026/10/14')), true);
  // The next run opens the day the one before closes: no overlap, either way round.
  assert.equal(daysOverlap(run('2026/09/29', '2026/10/13'), run('2026/10/13', '2026/10/27')), false);
  assert.equal(daysOverlap(run('2026/10/13', '2026/10/27'), run('2026/09/29', '2026/10/13')), false);
  // A one-day run is the one run its own days give, and is inside a run around it.
  assert.equal(daysOverlap(run('2026/10/13', '2026/10/13'), run('2026/10/13', '2026/10/13')), true);
  assert.equal(daysOverlap(run('2026/10/13', '2026/10/13'), run('2026/10/12', '2026/10/14')), true);
  // On the day another closes or opens it is still the run before or after.
  assert.equal(daysOverlap(run('2026/10/13', '2026/10/13'), run('2026/09/29', '2026/10/13')), false);
  assert.equal(daysOverlap(run('2026/10/13', '2026/10/13'), run('2026/10/13', '2026/10/27')), false);
  // A record with no days overlaps nothing, another with none neither.
  assert.equal(daysOverlap([undefined, undefined], [undefined, undefined]), false);
  // Two posts repeating a one-day Orienteering announce one banner.
  const oneDay = (cid: string, displayTime: number) => ({ ...preview('一、【定向甄选】寻访开启', '活动时间： 10月13日 16:00 - 10月13日 23:59'), cid, displayTime });
  assert.deepEqual(cnAnnouncements([oneDay('8001', 1790996400), oneDay('8002', 1790996400 + 3600)]).banners.map((b: any) => [b.name, cnDays(b)]), [['定向甄选', '2026/10/13–2026/10/13']]);
});

test('a preview gives its event, by the stages\' window, and its banner with the rate-ups; logins, outfits and packs are not records', () => {
  const [event] = cnEvents(post('5101'));
  // The stages close 10/23 (the segments); 10/30 is the store.
  assert.deepEqual({ ...event, start: iso(event.start), end: iso(event.end) }, { type: 'Side Story', name: '昨日海', start: '2026-10-09T04:00:00.000Z', end: '2026-10-22T20:00:00.000Z', source: 'https://ak.hypergryph.com/news/5101' });
  assert.equal(cnEvents(post('5101')).length, 1);
  assert.deepEqual(cnBanners(post('5101')).map((b: any) => [b.name, b.kind, cnDays(b), b.six, b.five, b.rateUpSix]),
    [['海渊巡游', 'featured', '2026/10/09–2026/10/23', ['克莱门莎'], ['德·托莱多', '火哨'], []]]);
  // A mode keeps its number; a story collection opens "限时开启".
  assert.deepEqual(cnEvents(post('1455')).map((e: any) => [e.type, e.name, cnDays(e)]), [['Event', '矢量突破#3「拟生态」', '2026/09/29–2026/10/20']]);
  assert.deepEqual(cnEvents(post('9686')).map((e: any) => [e.type, e.name]), [['Story Collection', '丛林症结']]);
  // A post that is no preview (a fan contest, 4923) announces nothing for the calendar.
  assert.deepEqual(cnAnnouncements([post('4923')]), { events: [], banners: [] });
  // The selectable pool is the lineup of a 定向甄选; nothing else in that post is a banner.
  assert.deepEqual(cnBanners(post('1455')).map((b: any) => [b.name, b.kind, b.six.length, b.five.length]), [['定向甄选', 'orienteering', 6, 6]]);
});

// A post of one section, for the parser's edge cases.
const preview = (...lines: string[]) => ({ title: '[活动预告]', displayTime: 1790996400, url: 'https://ak.hypergryph.com/news/0', lines });
const opensOct9 = '活动时间： 10月09日 12:00 - 10月23日 03:59';

test('a SideStory is a crossover by a × or a stand-alone x outside its 「name」, and a banner kind the reader does not know is no banner', () => {
  const typeOf = (title: string) => cnEvents(preview(`一、${title}`, opensOct9)).map((e: any) => [e.type, e.name]);
  // A name can hold any word: an x inside one marks nothing.
  assert.deepEqual(typeOf('全新SideStory「Exodus」，活动关卡开启'), [['Side Story', 'Exodus']]);
  assert.deepEqual(typeOf('《明日方舟》×《彩虹六号》联动SideStory「水晶箭行动」，活动关卡开启'), [['Side Story – Crossover', '水晶箭行动']]);
  assert.deepEqual(typeOf('明日方舟 x 彩虹六号联动SideStory「水晶箭行动」，活动关卡开启'), [['Side Story – Crossover', '水晶箭行动']]);
  // An x against a digit is a multiplier, not the collaboration's ×.
  assert.deepEqual(typeOf('全新SideStory「Exodus」，活动关卡开启，掉落x2'), [['Side Story', 'Exodus']]);
  assert.deepEqual(typeOf('全新SideStory「Exodus」，活动关卡开启，2x掉落'), [['Side Story', 'Exodus']]);
  const kindOf = (said: string) => cnBanners(preview('一、【某寻访】限时寻访开启', opensOct9, `◆本次活动【某寻访】寻访为【${said}】`)).map((b: any) => b.kind);
  assert.deepEqual([kindOf('标准寻访'), kindOf('限定寻访')], [['featured'], ['limited']]);
  // Only what is certain: a kind the reader does not know is left to the client, not taken for Limited.
  assert.deepEqual(kindOf('联动寻访'), []);
});

test('a limited banner\'s off-banner limiteds are its rate-up six-stars, and the exchange\'s lists are not its rates', () => {
  const [banner] = cnBanners(post('6247'));
  assert.deepEqual([banner.name, banner.kind, banner.six, banner.rateUpSix, banner.five],
    ['车辙与风的归所', 'limited', ['予愿安洁莉娜', '珊比'], ['斩业星熊', '佩佩', '纯烬艾雅法拉'], ['嘉辛塔']]);
});

// The calendar, before and after the CN client carries what a post announced.
const october = Date.parse('2026-10-04T00:00:00Z');
const announced = cnAnnouncements([post('5101')]);
const empty = { characters: {}, skins: { charSkins: {}, brandList: {} }, activity: { basicInfo: {}, missionData: {} }, gacha: { gachaPoolClient: [] } };
const firewhistle = { name: 'Firewhistle', internalName: 'char_493_firwhl', rarity: 5, otherLanguages: { Chinese: '火哨' } };
const clementia = { name: 'Clementia', internalName: 'char_4999_clem', rarity: 6, otherLanguages: { 'Simplified Chinese': '克莱门莎' } };
const toledo = { name: 'De Toledo', internalName: 'char_4998_toled', rarity: 5, otherLanguages: { 'Simplified Chinese': '德·托莱多' } };
const at = (text: string) => Date.parse(text) / 1000;
const client = {
  ...empty, source: 'cn-mirror',
  activity: { missionData: {}, basicInfo: {
    act47side: { id: 'act47side', name: '昨日海', hasStage: true, startTime: at('2026-10-09T12:00:00+08:00'), endTime: at('2026-10-23T03:59:59+08:00') },
    act47login: { id: 'act47login', name: '签到', hasStage: false, startTime: at('2026-10-09T12:00:00+08:00'), endTime: at('2026-10-23T03:59:59+08:00') },
  } },
  gacha: { gachaPoolClient: [{ gachaPoolId: 'SINGLE_78_0_1', gachaRuleType: 'SINGLE', gachaPoolName: '海渊巡游', openTime: at('2026-10-09T12:00:00+08:00'), endTime: at('2026-10-23T03:59:59+08:00'), dynMeta: null, limitParam: null, linkageParam: null }] },
};

test('a post publishes its event and banner before the client, the lineup pending until every operator it names has a record', () => {
  const before = reconcileCalendars({ events: [], banners: [], operators: [firewhistle], cn: empty, en: empty, eventRows: [], bannerRows: [], announced, now: october });
  assert.deepEqual(before.events.map((e: any) => [e.name, e.cn.dateRange, e.cn.timingSource, e.global.note, e.activityId]),
    [['[Side Story] 昨日海', '2026/10/09–2026/10/23', 'https://ak.hypergryph.com/news/5101', 'Global release unannounced', undefined]]);
  const [banner] = before.banners;
  assert.deepEqual([banner.name, banner.cn_date, banner.cn_window.startAt, banner.cn_window.endAt, banner.pull_type, banner.lineupSource, banner.six_stars],
    ['[Headhunting] 海渊巡游', '2026/10/09–2026/10/23', '2026-10-09T04:00:00.000Z', '2026-10-22T20:00:00.000Z', 'featured', 'pending', []]);
  assert.deepEqual(banner.announcedLineup, { six: ['克莱门莎'], five: ['德·托莱多', '火哨'], rateUpSix: [] });
  // Announced together: the event's page shows the banner.
  assert.equal(banner.linked_event, '[Side Story] 昨日海');
  assert.deepEqual(before.quarantine.map((e: any) => [e.key, e.action]), [['banner:announced:海渊巡游', 'published-partial']]);
  assert.match(before.quarantine[0].reason, /克莱门莎 and 德·托莱多 have no operator record yet/);
  // The client adds Clementia and De Toledo: by their Chinese names, the post's lineup is theirs.
  const named = reconcileCalendars({ events: before.events, banners: before.banners, operators: [firewhistle, clementia, toledo], cn: empty, en: empty, eventRows: [], bannerRows: [], announced, now: october });
  assert.deepEqual([named.banners[0].six_stars, named.banners[0].five_stars, named.banners[0].lineupSource, named.banners[0].announcedLineup],
    [['Clementia'], ['De Toledo', 'Firewhistle'], 'announcement', undefined]);
  assert.equal(named.banners.length, 1);
  assert.equal(named.events.length, 1);
});

test('a later post that moves a window moves the records the earlier one published: never a second event or banner', () => {
  const first = post('5101');
  const delayed = { ...first, cid: '5102', url: 'https://ak.hypergryph.com/news/5102', displayTime: first.displayTime + 86400,
    lines: first.lines.map((line: string) => line.replaceAll('10月09日 12:00', '10月10日 16:00')) };
  const both = cnAnnouncements([first, delayed]);
  assert.deepEqual([both.events.map((e: any) => [e.name, cnDays(e)]), both.banners.map((b: any) => [b.name, cnDays(b), b.source])],
    [[['昨日海', '2026/10/10–2026/10/23']], [['海渊巡游', '2026/10/10–2026/10/23', 'https://ak.hypergryph.com/news/5102']]]);
  const before = reconcileCalendars({ events: [], banners: [], operators: [firewhistle], cn: empty, en: empty, eventRows: [], bannerRows: [], announced, now: october });
  const moved = reconcileCalendars({ events: before.events, banners: before.banners, operators: [firewhistle], cn: empty, en: empty, eventRows: [], bannerRows: [], announced: both, now: october });
  assert.deepEqual(moved.events.map((e: any) => [e.name, e.cn.dateRange, e.cn.startAt, e.cn.timingSource]),
    [['[Side Story] 昨日海', '2026/10/10–2026/10/23', '2026-10-10T08:00:00.000Z', 'https://ak.hypergryph.com/news/5102']]);
  assert.deepEqual(moved.banners.map((b: any) => [b.name, b.cn_date, b.cn_window.startAt, b.cn_window.timingSource, b.linked_event]),
    [['[Headhunting] 海渊巡游', '2026/10/10–2026/10/23', '2026-10-10T08:00:00.000Z', 'https://ak.hypergryph.com/news/5102', '[Side Story] 昨日海']]);
  // Once the client carries it, its window is the truth: a post no longer moves the record.
  const linked = reconcileCalendars({ events: [], banners: [], operators: [firewhistle], cn: client, en: empty, eventRows: [], bannerRows: [], announced, now: october });
  const held = reconcileCalendars({ events: linked.events, banners: linked.banners, operators: [firewhistle], cn: client, en: empty, eventRows: [], bannerRows: [], announced: both, now: october });
  assert.deepEqual([held.events.map((e: any) => e.cn.dateRange), held.banners.map((b: any) => [b.cn_date, b.cnPoolId])],
    [['2026/10/09–2026/10/23'], [['2026/10/09–2026/10/23', 'SINGLE_78_0_1']]]);
  // A post extending the banner, read only after its old close (a nightly run missed), is that
  // run's, whose days it overlaps: the record moves, and no second one is added as for a rerun.
  const bannerTime = first.lines.indexOf('二、【海渊巡游】限时寻访开启') + 1;
  const extended = { ...first, cid: '5103', url: 'https://ak.hypergryph.com/news/5103', displayTime: first.displayTime + 17 * 86400,
    lines: first.lines.map((line: string, i: number) => (i === bannerTime ? line.replace('10月23日', '10月30日') : line)) };
  const october24 = Date.parse('2026-10-24T00:00:00Z'), late = cnAnnouncements([first, extended]);
  const lateMoved = reconcileCalendars({ events: before.events, banners: before.banners, operators: [firewhistle], cn: empty, en: empty, eventRows: [], bannerRows: [], announced: late, now: october24 });
  assert.deepEqual(lateMoved.banners.map((b: any) => [b.name, b.cn_date, b.cn_window.timingSource]),
    [['[Headhunting] 海渊巡游', '2026/10/09–2026/10/30', 'https://ak.hypergryph.com/news/5103']]);
  // Linked to its pool, it is found the same way, and the client's window stands.
  const lateHeld = reconcileCalendars({ events: linked.events, banners: linked.banners, operators: [firewhistle], cn: client, en: empty, eventRows: [], bannerRows: [], announced: late, now: october24 });
  assert.deepEqual(lateHeld.banners.map((b: any) => [b.name, b.cn_date, b.cnPoolId]), [['[Headhunting] 海渊巡游', '2026/10/09–2026/10/23', 'SINGLE_78_0_1']]);
});

test('two banners of one kind opening together are two records, each with its own lineup, whichever post names them', () => {
  const section = (numeral: string, name: string, star: string) => [`${numeral}、【${name}】限时寻访开启`, opensOct9, star, `◆本次活动【${name}】寻访为【标准寻访】`];
  const lineups = (banners: any[]) => banners.map(b => [b.name, b.cn_date, b.six_stars, b.five_stars, b.lineupSource]);
  const tide = ['[Headhunting] 甲之潮', '2026/10/09–2026/10/23', ['Clementia'], [], 'announcement'];
  const wind = ['[Headhunting] 乙之风', '2026/10/09–2026/10/23', [], ['Firewhistle'], 'announcement'];
  const run = (posts: any[], banners: any[] = []) => reconcileCalendars({ events: [], banners, operators: [firewhistle, clementia], cn: empty, en: empty, eventRows: [], bannerRows: [], announced: cnAnnouncements(posts), now: october });
  // One post: the second is not the record the first just made, though it holds the same days and kind.
  const both = preview(...section('一', '甲之潮', '★★★★★★：克莱门莎（占6★出率的50%）'), ...section('二', '乙之风', '★★★★★：火哨（占5★出率的50%）'));
  const once = run([both]);
  assert.deepEqual(lineups(once.banners), [tide, wind]);
  assert.deepEqual(lineups(run([both], once.banners).banners), [tide, wind]);
  // Two posts, the newer read first: the record the older one made is its post's, not the newer's by its days.
  const older = { ...preview(...section('一', '甲之潮', '★★★★★★：克莱门莎（占6★出率的50%）')), cid: '7001' };
  const newer = { ...preview(...section('一', '乙之风', '★★★★★：火哨（占5★出率的50%）')), cid: '7002', displayTime: older.displayTime + 3600 };
  assert.deepEqual(lineups(run([older, newer], run([older]).banners).banners), [tide, wind]);
});

test('an Orienteering is named by its first day, every post calling it 定向甄选: the next one is a record of its own, a correction moves it', () => {
  const september = post('1455'), september28 = Date.parse('2026-09-28T00:00:00Z');
  const shifted = (cid: string, days: number, to: string) => ({ ...september, cid, url: `https://ak.hypergryph.com/news/${cid}`, displayTime: september.displayTime + days * 86400,
    lines: september.lines.map((line: string) => line.replace('09月29日 16:00 - 10月13日 03:59', to)) });
  // The next one opens the day this one closes: one shared day is no overlap.
  const next = shifted('1456', 14, '10月13日 16:00 - 10月27日 03:59');
  const two = reconcileCalendars({ events: [], banners: [], operators: [], cn: empty, en: empty, eventRows: [], bannerRows: [], announced: cnAnnouncements([september, next]), now: september28 });
  assert.deepEqual(two.banners.map((b: any) => [b.name, b.cn_date, b.pull_type, b.announcedName]), [
    ['Orienteering (CN 2026/09/29)', '2026/09/29–2026/10/13', 'orienteering', '定向甄选'],
    ['Orienteering (CN 2026/10/13)', '2026/10/13–2026/10/27', 'orienteering', '定向甄选'],
  ].reverse());
  assert.deepEqual(two.quarantine.map((e: any) => e.key).sort(), ['banner:announced:定向甄选 (CN 2026/09/29–2026/10/13)', 'banner:announced:定向甄选 (CN 2026/10/13–2026/10/27)']);
  // A correction (the same run a day later) moves the record and its name; the old name stays an alias.
  const first = reconcileCalendars({ events: [], banners: [], operators: [], cn: empty, en: empty, eventRows: [], bannerRows: [], announced: cnAnnouncements([september]), now: september28 });
  const corrected = reconcileCalendars({ events: first.events, banners: first.banners, operators: [], cn: empty, en: empty, eventRows: [], bannerRows: [], now: september28,
    announced: cnAnnouncements([september, shifted('1457', 1, '09月30日 16:00 - 10月14日 03:59')]) });
  assert.deepEqual(corrected.banners.map((b: any) => [b.name, b.cn_date, b.aliases]), [['Orienteering (CN 2026/09/30)', '2026/09/30–2026/10/14', ['Orienteering (CN 2026/09/29)']]]);
  assert.deepEqual(corrected.renames, [['Orienteering (CN 2026/09/29)', 'Orienteering (CN 2026/09/30)']]);
  // One whose announcedName a rename rewrote before renameReferences kept it (to Orienteering #12,
  // from 定向甄选) no post names any more, so it is still the record holding the post's days.
  const rewritten = { ...first.banners[0], name: 'Orienteering #12', announcedName: 'Orienteering #12', aliases: ['Orienteering #12'] };
  const kept = reconcileCalendars({ events: [], banners: [rewritten], operators: [], cn: empty, en: empty, eventRows: [], bannerRows: [], announced: cnAnnouncements([september]), now: september28 });
  assert.deepEqual(kept.banners.map((b: any) => [b.name, b.cn_date]), [['Orienteering #12', '2026/09/29–2026/10/13']]);
});

test('when the client carries them, the announced records are the ones it links, and the wiki renames them: never a second record', () => {
  const first = reconcileCalendars({ events: [], banners: [], operators: [firewhistle, clementia, toledo], cn: empty, en: empty, eventRows: [], bannerRows: [], announced, now: october });
  const linked = reconcileCalendars({ events: first.events, banners: first.banners, operators: [firewhistle, clementia, toledo], cn: client, en: empty, eventRows: [], bannerRows: [], announced, now: october });
  assert.deepEqual(linked.events.map((e: any) => [e.name, e.activityId]), [['[Side Story] 昨日海', 'act47side']]);
  assert.deepEqual(linked.banners.map((b: any) => [b.name, b.cnPoolId, b.lineupSource]), [['[Headhunting] 海渊巡游', 'SINGLE_78_0_1', 'announcement']]);
  // What it still lacks is the wiki's to give, and the entry names the post as its source.
  assert.deepEqual(linked.quarantine.map((e: any) => [e.key, e.action]), [['banner:SINGLE_78_0_1', 'published-partial']]);
  assert.match(linked.quarantine[0].reason, /is published from an official CN announcement without an English name and key art/);
  const wiki = reconcileCalendars({ events: linked.events, banners: linked.banners, operators: [firewhistle, clementia, toledo], cn: client, en: empty, announced, now: october,
    eventRows: [{ name: "Yesterday's Sea", type: 'Side Story', cnstart: '2026/10/09', cnend: '2026/10/23' }],
    bannerRows: [{ name: 'Abyssal Cruise', type: 'special', cnstart: '2026/10/09', cnend: '2026/10/23', operators: 'Clementia, De Toledo, Firewhistle' }] });
  assert.deepEqual(wiki.events.map((e: any) => [e.name, e.activityId, e.aliases, e.poster]),
    [["[Side Story] Yesterday's Sea", 'act47side', ['[Side Story] 昨日海'], "/event-poster/Yesterday's Sea.webp"]]);
  assert.deepEqual(wiki.banners.map((b: any) => [b.name, b.cnPoolId, b.lineupSource, b.aliases]),
    [['[Headhunting] Abyssal Cruise', 'SINGLE_78_0_1', 'wiki', ['[Headhunting] 海渊巡游']]]);
  // The official hours stay: the post is the source of the window.
  assert.equal(wiki.banners[0].cn_window.timingSource, 'https://ak.hypergryph.com/news/5101');
  // As sync-catalogue.mjs writes the files (renameReferences): whatever names the renamed event
  // follows it, and the aliases keep the old names, which saved pull-plan goals are found by.
  const renames = new Map(wiki.renames as [string, string][]);
  const [banner] = renameReferences(wiki.banners, renames), [event] = renameReferences(wiki.events, renames);
  assert.deepEqual([banner.name, banner.aliases, banner.linked_event, event.name, event.aliases],
    ['[Headhunting] Abyssal Cruise', ['[Headhunting] 海渊巡游'], "[Side Story] Yesterday's Sea", "[Side Story] Yesterday's Sea", ['[Side Story] 昨日海']]);
  // An outfit's old "Model / Name" is its searchAliases entry, kept the same way.
  assert.deepEqual(renameReferences([{ model: 'Old', searchAliases: ['Old / Tide'] }], new Map([['Old', 'New'], ['Old / Tide', 'New / Tide']])), [{ model: 'New', searchAliases: ['Old / Tide'] }]);
  // A banner's announcedName is what the next post finds it by, and every Orienteering post names
  // its banner 定向甄选: a record an announcement named so, renamed by its wiki row, leaves that
  // name on itself and on every other announced Orienteering, the one a later post is still moving.
  const orienteering = { pull_type: 'orienteering', category: 'special', announcedName: '定向甄选', lineupSource: 'pending' };
  assert.deepEqual(renameReferences([
    { ...orienteering, name: 'Orienteering #12', aliases: ['定向甄选'], cn_date: '2026/09/29–2026/10/13', cnPoolId: 'SPECIAL_9_0_1' },
    { ...orienteering, name: 'Orienteering (CN 2026/10/13)', cn_date: '2026/10/13–2026/10/27' },
  ], new Map([['定向甄选', 'Orienteering #12']])).map((b: any) => [b.name, b.aliases, b.announcedName]), [
    ['Orienteering #12', ['定向甄选'], '定向甄选'],
    ['Orienteering (CN 2026/10/13)', undefined, '定向甄选'],
  ]);
  // The wiki's lineup is not replaced by the post's on a later run.
  const later = reconcileCalendars({ events: wiki.events, banners: wiki.banners, operators: [firewhistle, clementia, toledo], cn: client, en: empty, eventRows: [], bannerRows: [], announced, now: october });
  assert.equal(later.banners[0].lineupSource, 'wiki');
  assert.equal(later.events.length + later.banners.length, 2);
});

test('an announced event has only the fields every event record has: pages pass events to the browser whole', () => {
  // A field the published props lack fails the content release (test-previous-release-props.ts):
  // nameStatus and announcedName on events did, on main's run of 2026-10-04.
  const { events } = reconcileCalendars({ events: [], banners: [], operators: [], cn: client, en: empty, eventRows: [], bannerRows: [], announced, now: october });
  const known = new Set(['name', 'year', 'poster', 'cn', 'global', 'tw', 'activityId', 'aliases']);
  assert.deepEqual(Object.keys(events[0]).filter(key => !known.has(key)), []);
  assert.deepEqual(Object.keys(events[0].cn).sort(), ['dateRange', 'endAt', 'startAt', 'timingSource']);
});

test('a window already over is history, and a record already holding the window keeps its name', () => {
  const past = reconcileCalendars({ events: [], banners: [], operators: [], cn: empty, en: empty, eventRows: [], bannerRows: [], announced, now: Date.parse('2026-11-01T00:00:00Z') });
  assert.equal(past.events.length + past.banners.length, 0);
  const held = { name: '[Headhunting] Abyssal Cruise', category: 'special', pull_type: 'featured', cn_date: '2026/10/09–2026/10/23', six_stars: ['Clementia'], five_stars: [], four_stars: [], rate_up_six_stars: [], lineupSource: 'wiki' };
  const result = reconcileCalendars({ events: [], banners: [held], operators: [], cn: empty, en: empty, eventRows: [], bannerRows: [], announced, now: october });
  assert.deepEqual(result.banners.map((b: any) => [b.name, b.lineupSource, b.cn_window?.timingSource]), [['[Headhunting] Abyssal Cruise', 'wiki', 'https://ak.hypergryph.com/news/5101']]);
  // A rerun's post reuses the 【name】 the first run's had: that record's run is over, and stays as it was.
  const firstRun = { ...held, name: '[Headhunting] Abyssal Cruise (2025)', cn_date: '2025/10/09–2025/10/23', cnPoolId: 'SINGLE_60_0_1', announcedName: '海渊巡游' };
  const rerun = reconcileCalendars({ events: [], banners: [firstRun], operators: [], cn: empty, en: empty, eventRows: [], bannerRows: [], announced, now: october });
  assert.deepEqual(rerun.banners.map((b: any) => [b.name, b.cn_date]), [['[Headhunting] Abyssal Cruise (2025)', '2025/10/09–2025/10/23'], ['[Headhunting] 海渊巡游', '2026/10/09–2026/10/23']]);
  assert.throws(() => reconcileCalendars({ events: [], banners: [], operators: [], cn: empty, en: empty, eventRows: [], bannerRows: [], now: october }), /CN announcements/);
});

test('an earlier year\'s event under the post\'s name or alias is history: the post publishes its own record, and moves only a run not over or one its days overlap', () => {
  const run = (events: any[], now = october, posts = announced) => reconcileCalendars({ events, banners: [], operators: [firewhistle], cn: empty, en: empty, eventRows: [], bannerRows: [], announced: posts, now });
  const lastYear = { name: '[Side Story] 昨日海', year: 2025, poster: null,
    cn: { dateRange: '2025/10/09–2025/10/23', startAt: '2025-10-09T04:00:00.000Z', endAt: '2025-10-22T20:00:00.000Z', timingSource: 'https://ak.hypergryph.com/news/4101' },
    global: { dateRange: null, note: 'Global release unannounced' }, tw: { dateRange: null, note: null } };
  const days = (result: any) => result.events.map((e: any) => [e.name, e.year, e.cn.dateRange, e.cn.timingSource]);
  // Under the same name: the 2025 record keeps its year and run, and the post's event is a record of its own.
  const sameName = run([lastYear]);
  assert.deepEqual(sameName.events[0], lastYear);
  assert.deepEqual(days(sameName), [
    ['[Side Story] 昨日海', 2025, '2025/10/09–2025/10/23', 'https://ak.hypergryph.com/news/4101'],
    ['[Side Story] 昨日海', 2026, '2026/10/09–2026/10/23', 'https://ak.hypergryph.com/news/5101']]);
  // Renamed by its wiki row, the Chinese name an alias: the same, and the banner opens with the new record.
  const renamed = { ...lastYear, name: "[Side Story] Yesterday's Sea", aliases: ['[Side Story] 昨日海'] };
  const byAlias = run([renamed]);
  assert.deepEqual(byAlias.events[0], renamed);
  assert.deepEqual(days(byAlias).slice(1), [['[Side Story] 昨日海', 2026, '2026/10/09–2026/10/23', 'https://ak.hypergryph.com/news/5101']]);
  assert.equal(byAlias.banners[0].linked_event, '[Side Story] 昨日海');
  assert.deepEqual(byAlias.renames, []);
  // This year's record whose run closed before a post extending it was read (a nightly run
  // missed) is that run's, whose days the post's overlap: it moves, and none is added.
  const first = post('5101'), stages = first.lines.indexOf('◆「“我们的伊比利亚”」开启时间： 10月16日 16:00 - 10月23日 03:59');
  const extended = { ...first, cid: '5104', url: 'https://ak.hypergryph.com/news/5104', displayTime: first.displayTime + 17 * 86400,
    lines: first.lines.map((line: string, i: number) => (i === stages ? line.replace('10月23日', '10月30日') : line)) };
  const thisYear = run([], october).events;
  const moved = run(thisYear, Date.parse('2026-10-24T00:00:00Z'), cnAnnouncements([first, extended]));
  assert.deepEqual(days(moved), [['[Side Story] 昨日海', 2026, '2026/10/09–2026/10/30', 'https://ak.hypergryph.com/news/5104']]);
});

test('an announced lineup still pending is reported once, by its cause; one the wiki fills in the same run is not reported, nor kept', () => {
  // Linked to its pool, lineup pending: the post's entry names the missing records, the pool's
  // entry only what a wiki row supplies -- not the lineup a second time, with another cause.
  const pending = reconcileCalendars({ events: [], banners: [], operators: [firewhistle], cn: client, en: empty, eventRows: [], bannerRows: [], announced, now: october });
  assert.deepEqual(pending.quarantine.map((e: any) => [e.key, e.action]), [['banner:announced:海渊巡游', 'published-partial'], ['banner:SINGLE_78_0_1', 'published-partial']]);
  assert.doesNotMatch(pending.quarantine[1].reason, /lineup/);
  // Records with no Chinese name cannot take the post's names; the wiki's row names them in English.
  const english = [firewhistle, clementia, toledo].map(({ otherLanguages, ...op }) => op);
  const filled = reconcileCalendars({ events: [], banners: [], operators: english, cn: client, en: empty, eventRows: [], announced, now: october,
    bannerRows: [{ name: 'Abyssal Cruise', type: 'special', cnstart: '2026/10/09', cnend: '2026/10/23', operators: 'Clementia, De Toledo, Firewhistle' }] });
  assert.deepEqual(filled.banners.map((b: any) => [b.lineupSource, b.six_stars, b.announcedLineup]), [['wiki', ['Clementia'], undefined]]);
  assert.deepEqual(filled.quarantine, []);
});

test('an announced event links to its activity by both days when another with stages opens that day, and the wiki takes over one left unlinked', () => {
  const crowded = { ...client, activity: { missionData: {}, basicInfo: { ...client.activity.basicInfo,
    act47mini: { id: 'act47mini', name: '小活动', hasStage: true, startTime: at('2026-10-09T12:00:00+08:00'), endTime: at('2026-10-16T03:59:59+08:00') } } } };
  const row = { name: "Yesterday's Sea", type: 'Side Story', cnstart: '2026/10/09', cnend: '2026/10/23' };
  const linked = reconcileCalendars({ events: [], banners: [], operators: [firewhistle], cn: crowded, en: empty, eventRows: [], bannerRows: [], announced, now: october });
  assert.deepEqual(linked.events.map((e: any) => [e.name, e.activityId]), [['[Side Story] 昨日海', 'act47side']]);
  const wiki = reconcileCalendars({ events: linked.events, banners: linked.banners, operators: [firewhistle], cn: crowded, en: empty, eventRows: [row], bannerRows: [], announced, now: october });
  assert.deepEqual(wiki.events.map((e: any) => [e.name, e.activityId]), [["[Side Story] Yesterday's Sea", 'act47side']]);
  // One a run before this rule left unlinked, its post gone: the wiki row's activity, on its very days, takes it over.
  const { activityId, ...stranded } = linked.events[0];
  const repaired = reconcileCalendars({ events: [stranded], banners: [], operators: [], cn: crowded, en: empty, eventRows: [row], bannerRows: [], announced: { events: [], banners: [] }, now: october });
  assert.deepEqual(repaired.events.map((e: any) => [e.name, e.activityId, e.aliases]), [["[Side Story] Yesterday's Sea", 'act47side', ['[Side Story] 昨日海']]]);
});

test('an announced banner has only the fields HeadhuntingBanner declares: the home page passes banners to the browser whole', () => {
  // A field the published props lack fails the content release (test-previous-release-props.ts),
  // as the announced events' did on 2026-10-04. The names are keyof HeadhuntingBanner, so tsc
  // holds each to a declared field: a new one is declared there, and listed in DATA_ONLY for /'s
  // ongoingBanners, which getHomeGachaBanners spreads from whole records. /gacha lists the fields
  // it hands over one by one, so a new field reaches its props only once gacha.tsx names it.
  const known = new Set<keyof HeadhuntingBanner>(['name', 'aliases', 'category', 'year', 'global_date', 'banner_image', 'cn_date', 'cn_window', 'cnPoolId',
    'pull_type', 'six_stars', 'five_stars', 'four_stars', 'rate_up_six_stars', 'lineupSource', 'nameStatus', 'announcedName', 'announcedLineup', 'linked_event']);
  const before = reconcileCalendars({ events: [], banners: [], operators: [firewhistle], cn: empty, en: empty, eventRows: [], bannerRows: [], announced, now: october });
  const linked = reconcileCalendars({ events: before.events, banners: before.banners, operators: [firewhistle], cn: client, en: empty, eventRows: [], bannerRows: [], announced, now: october });
  const wiki = reconcileCalendars({ events: linked.events, banners: linked.banners, operators: [firewhistle, clementia, toledo], cn: client, en: empty, eventRows: [], announced, now: october,
    bannerRows: [{ name: 'Abyssal Cruise', type: 'special', cnstart: '2026/10/09', cnend: '2026/10/23', operators: 'Clementia, De Toledo, Firewhistle' }] });
  for (const { banners } of [before, linked, wiki]) {
    assert.deepEqual(Object.keys(banners[0]).filter(key => !known.has(key as keyof HeadhuntingBanner)), []);
  }
});
