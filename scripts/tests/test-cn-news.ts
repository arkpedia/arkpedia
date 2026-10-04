import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
// @ts-expect-error Plain Node modules shared with the importers.
import { cnAnnouncements, cnBanners, cnDays, cnEvents, cnWindow } from '../build/cn-news.mjs';
// @ts-expect-error Plain Node modules shared with the importers.
import { listedPosts, postLines } from '../sync/sync-cn-news.mjs';
// @ts-expect-error Plain Node modules shared with the importers.
import { reconcileCalendars } from '../sync/catalogue-model.mjs';

const post = (cid: string) => JSON.parse(fs.readFileSync(`scripts/tests/fixtures/cn-news/${cid}.json`, 'utf8'));
const iso = (ts: number) => new Date(ts * 1000).toISOString();

test('the news list gives each activity post once with its date; a post page gives its article from title to sign-off', () => {
  const list = '{\\"cid\\":\\"5101\\",\\"tab\\":\\"1\\",\\"sticky\\":false,\\"title\\":\\"[活动预告]SideStory「昨日海」限时活动即将开启\\",\\"author\\":\\"【明日方舟】运营组\\",\\"displayTime\\":1790996400}'
    + '{\\"cid\\":\\"8577\\",\\"tab\\":\\"0\\",\\"sticky\\":false,\\"title\\":\\"闪断更新公告\\",\\"author\\":\\"x\\",\\"displayTime\\":1790650800}'
    + '{\\"cid\\":\\"5101\\",\\"tab\\":\\"1\\",\\"sticky\\":false,\\"title\\":\\"[活动预告]SideStory「昨日海」限时活动即将开启\\",\\"author\\":\\"x\\",\\"displayTime\\":1790996400}';
  assert.deepEqual(listedPosts(list), [{ cid: '5101', title: '[活动预告]SideStory「昨日海」限时活动即将开启', displayTime: 1790996400 }]);
  const page = '<html><body><div>活动</div><div>T</div><div>2026 // 10 / 03</div><p><strong>一、A</strong></p><p>活动时间： 10月09日 12:00 - 10月30日 03:59</p><p>【明日方舟】运营组</p><div>ARKNIGHTS</div><script>x</script></body></html>';
  assert.deepEqual(postLines(page, 'T'), ['一、A', '活动时间： 10月09日 12:00 - 10月30日 03:59']);
  // A post without the sign-off ends where the site's footer begins.
  assert.equal(post('4923').lines.at(-1).includes('ARKNIGHTS'), false);
});

test('dates take the post\'s year, a December post announcing January the next one, and a :59 end its next minute', () => {
  const w = cnWindow('活动时间： 10月09日 12:00 - 10月23日 03:59', 1790996400);
  assert.deepEqual([iso(w.start), iso(w.end), cnDays(w)], ['2026-10-09T04:00:00.000Z', '2026-10-22T20:00:00.000Z', '2026/10/09–2026/10/23']);
  const december = Date.UTC(2026, 11, 28) / 1000;
  assert.equal(cnDays(cnWindow('01月05日 16:00 - 01月19日 03:59', december)), '2027/01/05–2027/01/19');
  assert.equal(cnDays(cnWindow('12月29日 16:00 - 01月12日 03:59', december)), '2026/12/29–2027/01/12');
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
  // The selectable pool is the lineup of a 定向甄选; nothing else in that post is a banner.
  assert.deepEqual(cnBanners(post('1455')).map((b: any) => [b.name, b.kind, b.six.length, b.five.length]), [['定向甄选', 'orienteering', 6, 6]]);
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

test('when the client carries them, the announced records are the ones it links, and the wiki renames them: never a second record', () => {
  const first = reconcileCalendars({ events: [], banners: [], operators: [firewhistle, clementia, toledo], cn: empty, en: empty, eventRows: [], bannerRows: [], announced, now: october });
  const linked = reconcileCalendars({ events: first.events, banners: first.banners, operators: [firewhistle, clementia, toledo], cn: client, en: empty, eventRows: [], bannerRows: [], announced, now: october });
  assert.deepEqual(linked.events.map((e: any) => [e.name, e.activityId]), [['[Side Story] 昨日海', 'act47side']]);
  assert.deepEqual(linked.banners.map((b: any) => [b.name, b.cnPoolId, b.lineupSource]), [['[Headhunting] 海渊巡游', 'SINGLE_78_0_1', 'announcement']]);
  const wiki = reconcileCalendars({ events: linked.events, banners: linked.banners, operators: [firewhistle, clementia, toledo], cn: client, en: empty, announced, now: october,
    eventRows: [{ name: "Yesterday's Sea", type: 'Side Story', cnstart: '2026/10/09', cnend: '2026/10/23' }],
    bannerRows: [{ name: 'Abyssal Cruise', type: 'special', cnstart: '2026/10/09', cnend: '2026/10/23', operators: 'Clementia, De Toledo, Firewhistle' }] });
  assert.deepEqual(wiki.events.map((e: any) => [e.name, e.activityId, e.aliases, e.poster]),
    [["[Side Story] Yesterday's Sea", 'act47side', ['[Side Story] 昨日海'], "/event-poster/Yesterday's Sea.webp"]]);
  assert.deepEqual(wiki.banners.map((b: any) => [b.name, b.cnPoolId, b.lineupSource, b.aliases]),
    [['[Headhunting] Abyssal Cruise', 'SINGLE_78_0_1', 'wiki', ['[Headhunting] 海渊巡游']]]);
  // The official hours stay: the post is the source of the window.
  assert.equal(wiki.banners[0].cn_window.timingSource, 'https://ak.hypergryph.com/news/5101');
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
  assert.throws(() => reconcileCalendars({ events: [], banners: [], operators: [], cn: empty, en: empty, eventRows: [], bannerRows: [], now: october }), /CN announcements/);
});
