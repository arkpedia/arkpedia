import { test } from 'node:test';
import { REGIONAL_MATERIAL } from '../../lib/i18n/regionalMaterial';
import assert from 'node:assert/strict';
import fs from 'node:fs';
// @ts-expect-error Node scripts are plain JavaScript.
import { boardArt, boardEventItems, MAX_ART_BYTES, regionalPoolId, templatePictures, withBoardArt } from '../sync/regional-board.mjs';
import { webEventServer } from '../../lib/community/worldDirectory';
import { regionalArt, regionalBanners, regionalEvents, regionalGameEvents, regionalPullBanners, type RegionalSchedule } from '../../lib/time/regional';

/*
 * JP's and KR's in-game boards joined to the site's events and banners (scripts/sync/regional-board.mjs),
 * on a slice of the real boards and schedules of 2026-10-19 (fixtures/regional-board.json). The News
 * groups they are built into are arkpedia-data's importer (its scripts/tests/test-regional-board.ts).
 */
const fixture = JSON.parse(fs.readFileSync('scripts/tests/fixtures/regional-board.json', 'utf8'));
const CPT = '[Celebration] Critical Phase Transition';
const SWT = '[Celebration] Sealed With Time';
const DUEL = 'Duel Channel: Ivy Vine';

test('a Global pool id is the regional client pool by the server code', () => {
  assert.equal(regionalPoolId('LIMITED_EN_42_0_1', 'jp'), 'LIMITED_JP_42_0_1');
  assert.equal(regionalPoolId('CLASSIC_DOUBLE_EN_41_0_4', 'kr'), 'CLASSIC_DOUBLE_KR_41_0_4');
  assert.equal(regionalPoolId(undefined, 'jp'), null);
  // The schedule's banner windows carry the very id the board links to.
  assert.equal(fixture.schedules.jp.banners[SWT].poolId, regionalPoolId('LIMITED_EN_42_0_1', 'jp'));
});

test("an event item is the event's whose regional name it carries, on a plausible day, and only one", () => {
  const jp = boardEventItems(fixture.schedules.jp.events, fixture.boards.jp);
  // 「相変臨界」 in the heading; the anniversary sale's "2026 秋の大感謝祭" names no event.
  assert.deepEqual(Object.keys(jp).sort(), [CPT, DUEL].sort());
  assert.deepEqual(jp[CPT].map((item: { id: string }) => item.id), ['8386']);
  const kr = boardEventItems(fixture.schedules.kr.events, fixture.boards.kr);
  // KR names the event in the heading ('임계 상전이' 이벤트 안내) under one title for every event.
  assert.deepEqual(kr[CPT].map((item: { id: string }) => item.id), ['6889']);
  assert.deepEqual(kr[DUEL].map((item: { id: string }) => item.id), ['4974']);
  // Out of its window's days: an item a year later names nothing.
  const late = { bulletins: fixture.boards.kr.bulletins.map((item: { displayDate: string; firstSeen: string }) => ({ ...item, displayDate: '2027-10-09', firstSeen: '2027-10-09' })) };
  assert.deepEqual(boardEventItems(fixture.schedules.kr.events, late), {});
  // Two events of one regional name: neither.
  const twin = { ...fixture.schedules.kr.events, 'Twin': fixture.schedules.kr.events[CPT] };
  assert.equal(boardEventItems(twin, fixture.boards.kr)[CPT], undefined);
});

test("a board's template picture, a picture filed long before, and an oversize one are never key art", () => {
  const templates = templatePictures(fixture.boards.kr);
  // KR's one 2024 picture under every "신규 이벤트 안내".
  assert.ok(templates.has('400be245c1e6266cfc46f7b5e2c4049c2f75342f'));
  const boardOnly = withBoardArt(fixture.schedules.kr, { ...fixture.boards.kr, headlines: [] });
  assert.equal(boardOnly.events[CPT].art, undefined, 'the template is not the event art');
  assert.equal(boardOnly.events[DUEL].art, undefined);
  const kr = withBoardArt(fixture.schedules.kr, fixture.boards.kr);
  assert.equal(kr.events[DUEL].art, undefined, 'no headline of its own: Global\'s stays');
  // KR's Standard banner art of 2026-10-09 is 18.6 MB: a page would hotlink it as its hero.
  const standard = fixture.boards.kr.bulletins.find((item: { poolId?: string }) => item.poolId === 'DOUBLE_KR_41_0_9');
  assert.ok(standard.image.bytes > MAX_ART_BYTES);
  const { small: _small, ...withoutSmall } = standard.image;
  const noCopy = { ...fixture.boards.kr, bulletins: fixture.boards.kr.bulletins.map((item: { id: string }) => (item.id === standard.id ? { ...standard, image: withoutSmall } : item)) };
  assert.equal(withBoardArt(fixture.schedules.kr, noCopy).banners['Standard Pool #177 (Global)'].art, undefined, 'oversize, and no smaller copy');
  const tooBig = { ...noCopy, bulletins: noCopy.bulletins.map((item: { id: string }) => (item.id === standard.id ? { ...standard, image: { ...standard.image, small: { ...standard.image.small, bytes: MAX_ART_BYTES + 1 } } } : item)) };
  assert.equal(withBoardArt(fixture.schedules.kr, tooBig).banners['Standard Pool #177 (Global)'].art, undefined, 'a smaller copy still over the size');
  assert.deepEqual(kr.banners[SWT].art, { url: 'https://ark-kr-static-online-1300509597.yo-star.com/announce/images/20261013/2503c5194d4999c585e78056d5223d60.jpg', sha1: '92ce5499c5d0678c51038e30a54ae408ca60ab25' });
  // One subject with two different pictures is no answer; a picture filed a year before the item is a reuse.
  const one = fixture.boards.jp.bulletins.find((item: { id: string }) => item.id === '1159');
  assert.equal(boardArt([one, { ...one, id: 'x', image: { ...one.image, sha1: 'b'.repeat(40), url: one.image.url.replace('962d', 'aaaa') } }], new Set()), null);
  assert.equal(boardArt([{ ...one, image: { ...one.image, url: one.image.url.replace('/20260923/', '/20250901/') } }], new Set()), null);
  assert.deepEqual(boardArt([one], new Set()), { url: one.image.url, sha1: one.image.sha1 });
});

test("KR's own art: the official site's headline for its event, and the host's smaller copy of an oversize banner", () => {
  const kr = withBoardArt(fixture.schedules.kr, fixture.boards.kr);
  // The site's headline names the event in its own words ("'임계 상전이' 메인 트레일러(PV)"), seen in the window's days.
  assert.deepEqual(kr.events[CPT].art, { url: 'https://webusstatic.yo-star.com/web-cms-test/upload/content/2026/10/12/n74WatYI.png', sha1: '003845daa5887386505683d9c5968b1e0691b0a6' });
  // Standard #177: the same picture as WebP from the board's host, with that copy's hash.
  assert.deepEqual(kr.banners['Standard Pool #177 (Global)'].art, {
    url: 'https://ark-kr-static-online-1300509597.yo-star.com/announce/images/20261008/24f0e4b3a9988d7a01a7bbaf4576aeea.jpg?imageMogr2/format/webp',
    sha1: 'cfc1e870cf79aa9112f41f01c0db730bb18e8bcb' });
  // The other banners keep their pool ids' pictures.
  assert.equal(kr.banners[SWT].art?.sha1, '92ce5499c5d0678c51038e30a54ae408ca60ab25');
  assert.equal(kr.banners['Kernel #63 (Global)'].art?.url, 'https://ark-kr-static-online-1300509597.yo-star.com/announce/images/20260929/257b6d84000000c425effab36618eea2.jpg');
  const [headline] = fixture.boards.kr.headlines;
  const withHeadline = (changes: object) => withBoardArt(fixture.schedules.kr, { ...fixture.boards.kr, headlines: [{ ...headline, ...changes }] }).events[CPT].art;
  // Seen long after the event closed, or naming no event: nothing.
  assert.equal(withHeadline({ firstSeen: '2027-03-01' }), undefined);
  assert.equal(withHeadline({ title: '명일방주 메인 트레일러(PV)' }), undefined);
  // A picture filed months before it was seen is a reused one.
  assert.equal(withHeadline({ image: { ...headline.image, url: headline.image.url.replace('/2026/10/12/', '/2026/01/12/') } }), undefined);
  // The same picture as a board item of another title is a template, here as on the board.
  const template = fixture.boards.kr.bulletins.find((item: { id: string }) => item.id === '6889').image;
  assert.equal(withHeadline({ image: template }), undefined);
});

test("the regional schedule's windows carry JP's own art, and lose one the board no longer gives", () => {
  const jp = withBoardArt(fixture.schedules.jp, fixture.boards.jp);
  assert.equal(jp.events[CPT].art?.url, 'https://ark-jp-static-online.yo-star.com/announce/images/20260923/0d4ade920ccb4638dd7a4db8debb365b.png');
  assert.equal(jp.banners[SWT].art?.url, 'https://ark-jp-static-online.yo-star.com/announce/images/20260923/962dcf6a97e61897ddbff7a68877b55c.png');
  assert.equal(jp.events['[Side Story] People, A People'].art, undefined, 'nothing on the board, no art');
  const stale = { events: { [CPT]: { ...fixture.schedules.jp.events[CPT], art: { url: 'https://example.invalid/old.png', sha1: 'c'.repeat(40) } } }, banners: {} };
  assert.equal(withBoardArt(stale, { bulletins: [] }).events[CPT].art, undefined);
  assert.equal(fixture.schedules.jp.events[CPT].art, undefined, 'the windows handed in are left alone');
});

test("a web event is its region's server's, and one naming no region is every server's", () => {
  assert.equal(webEventServer({ region: 'Japan (JP)' }), 'jp');
  assert.equal(webEventServer({ region: 'Korea (KR)' }), 'kr');
  assert.equal(webEventServer({ region: 'Global (EN)' }), 'en');
  assert.equal(webEventServer({}), null);
});

test("the pages' lists show the site server's art, falling back to Global's", () => {
  const schedule = withBoardArt(fixture.schedules.jp, fixture.boards.jp) as RegionalSchedule;
  const jpArt = schedule.banners![SWT].art!.url;
  assert.equal(regionalArt(schedule.banners![SWT], '/banners/swt.webp', 'en'), '/banners/swt.webp', 'Global keeps its own');
  if (!REGIONAL_MATERIAL) {
    // Off until the site has JP/KR languages (lib/i18n/regionalMaterial.ts): Global's art on every server.
    assert.equal(regionalArt(schedule.banners![SWT], '/banners/swt.webp', 'jp'), '/banners/swt.webp');
    assert.equal(regionalArt(schedule.banners![SWT], '/banners/swt.webp', 'kr'), '/banners/swt.webp');
    return;
  }
  assert.equal(regionalArt(schedule.banners![SWT], '/banners/swt.webp', 'jp'), jpArt);
  assert.equal(regionalArt(schedule.banners!['Kernel #63 (Global)'], null, 'jp'), schedule.banners!['Kernel #63 (Global)'].art!.url);
  assert.equal(regionalArt(undefined, '/banners/x.webp', 'jp'), '/banners/x.webp');
  const banner = { name: SWT, banner_image: '/banners/swt.webp' } as Parameters<typeof regionalBanners>[0][number];
  assert.equal(regionalBanners([banner], schedule, 'jp')[0].banner_image, jpArt);
  assert.equal(regionalBanners([banner], schedule, 'en')[0].banner_image, '/banners/swt.webp');
  const event = { name: CPT, poster: '/event-poster/cpt.webp', global: { dateRange: null, note: null } } as unknown as Parameters<typeof regionalEvents>[0][number];
  const shown = regionalEvents([event], schedule, 'jp')[0];
  assert.equal(shown.poster, schedule.events![CPT].art!.url);
  assert.equal((shown.global as { art?: unknown }).art, undefined, 'the art is no timing field');
  const game = { name: CPT, poster: '/event-poster/cpt.webp', dateRange: '', start: '', end: '' };
  assert.equal(regionalGameEvents([game], schedule, 'jp')[0].poster, schedule.events![CPT].art!.url);
  assert.equal(regionalGameEvents([{ ...game, name: '[Side Story] People, A People' }], schedule, 'jp')[0].poster, '/event-poster/cpt.webp', "Global's when the board has none");
  const pull = { name: SWT, image: '/banners/swt.webp' } as unknown as Parameters<typeof regionalPullBanners>[0][number];
  assert.equal(regionalPullBanners([pull], schedule, 'jp')[0].image, jpArt);
});
