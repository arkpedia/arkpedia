/**
 * JP and KR list Global's items one to one, in Global's order: only the dates change
 * (lib/time/regional.ts). The regional helpers once dropped every item the server's schedule had
 * no window for, so JP and KR lost the upcoming events, the CN-predicted banners and Global's
 * order (2026-10-21). This holds every list helper to the rule, on the release's own data and on
 * the server's real schedule, and holds the pages' own regional projections to it too.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import * as regional from '../../lib/time/regional';
import type { RegionalSchedule, RegionalSchedules } from '../../lib/time/regional';
import regionalTable from '../../data/regional-schedules.json';
import freeCatalogue from '../../data/free-rewards.json';
import confirmed from '../../data/skin-availability-windows.json';
import rotations from '../../data/skin-shop-rotations.json';
import { getAllEvents } from '../../lib/schedule/schedule';
import { bannerScheduleEvents } from '../../lib/schedule/bannerEvents';
import { getBannersSortedByDate } from '../../lib/gacha/headhuntingBannerData';
import { getPullEventSchedule, getPullSchedule } from '../../lib/pulls/schedule';
import { bundledBacklogSources } from '../../lib/pulls/sources';
import { allFreeRewards } from '../../lib/pulls/freeRewards';
import { getEventCalendar, loadGameEvents } from '../../lib/home/frontPageContent';
import { getAllSkins } from '../../lib/skins/skins';
import { getSkinWindows } from '../../lib/skins/skinAvailability';
import { pullSkinCatalogue } from '../../lib/pulls/skins';
import { pullSkinCollections, skinReleaseDates } from '../../lib/pulls/skinCollections';

const table = regionalTable as unknown as RegionalSchedules;
const SERVERS = ['jp', 'kr'] as const;
/** The helpers that take one item and are not lists. */
const NOT_LISTS = new Set(['regionalArt', 'regionalDate', 'regionalRange', 'regionalScheduleSlice']);

/** What names an item in a list: its name, else its id, else (a sale) its event, label and outfits. */
const key = (item: object): string => {
  const row = item as { name?: string; id?: string; event?: string; label?: string; kind?: string; skinIds?: string[] };
  return row.name ?? row.id ?? `${row.event} / ${row.kind} / ${row.label} / ${row.skinIds?.join(',')}`;
};

const skins = getAllSkins();
const events = getAllEvents();
const catalogue = pullSkinCatalogue(skins, skinReleaseDates(events, skins), {});
const predicted = new Set(getEventCalendar().filter(event => event.isPredicted).map(event => event.name));
const banners = getBannersSortedByDate();
const gameEvents = loadGameEvents().map(event => ({ ...event, start: event.start.toISOString(), end: event.end.toISOString() }));
/** Each list helper, with Global's list as the release builds it. */
const LISTS: Record<string, (schedule: RegionalSchedule | undefined, server: 'en' | 'jp' | 'kr') => object[]> = {
  regionalEvents: (schedule, server) => regional.regionalEvents([...events, ...bannerScheduleEvents(banners)], schedule, server),
  regionalBanners: (schedule, server) => regional.regionalBanners(banners, schedule, server),
  regionalPullBanners: (schedule, server) => regional.regionalPullBanners(getPullSchedule(), schedule, server),
  regionalPullEvents: (schedule, server) => regional.regionalPullEvents(getPullEventSchedule(bundledBacklogSources()), schedule, server),
  regionalCards: (schedule, server) => regional.regionalCards(Object.keys(table.servers.en?.contents ?? {}).concat('no-window').map(id => ({ id, start: 1, end: 2 })), schedule, server),
  regionalSkinWindows: (schedule, server) => regional.regionalSkinWindows(getSkinWindows(skins, events, { confirmed, rotations }), server === 'en' ? undefined : schedule, server),
  regionalSkinCollections: (schedule, server) => regional.regionalSkinCollections(pullSkinCollections(events, skins, catalogue, predicted), schedule, server),
  regionalGameEvents: (schedule, server) => regional.regionalGameEvents(gameEvents, schedule, server),
  regionalFreeRewards: (schedule, server) => regional.regionalFreeRewards(allFreeRewards(freeCatalogue as never), schedule, server),
};

test('every list helper in lib/time/regional.ts is held to parity here', () => {
  const helpers = Object.entries(regional).filter(([name, value]) => /^regional[A-Z]/.test(name) && typeof value === 'function' && !NOT_LISTS.has(name)).map(([name]) => name);
  assert.deepEqual(helpers.filter(name => !(name in LISTS)), [], 'a new regional list helper needs its parity case below');
});

for (const [name, list] of Object.entries(LISTS)) {
  test(`${name}: JP and KR list Global's items in Global's order`, () => {
    const global = list(table.servers.en, 'en').map(key);
    assert.ok(global.length > 0, `${name} has items to compare`);
    for (const server of SERVERS) {
      assert.deepEqual(list(table.servers[server], server).map(key), global, `${server} with its own schedule`);
      assert.deepEqual(list(undefined, server).map(key), global, `${server} with no schedule at all`);
      assert.deepEqual(list({ sources: {} }, server).map(key), global, `${server} with an empty schedule`);
    }
  });
}

test('a JP/KR item takes its own window where it has one, else keeps Global’s date marked estimated', () => {
  const jp = table.servers.jp!;
  const named = banners.find(banner => jp.banners?.[banner.name] && banner.global_date)!;
  const unnamed = banners.find(banner => !jp.banners?.[banner.name] && !banner.global_date && banner.cn_date)!;
  const [own, cnPredicted] = regional.regionalBanners([named, unnamed], jp, 'jp');
  assert.equal(own.global_window?.endAt, jp.banners![named.name].endAt);
  assert.equal(cnPredicted.cn_date, unnamed.cn_date, 'a CN-predicted banner keeps its CN-based date');
  const event = events.find(event => !jp.events?.[event.name] && /ESTIMATED/.test(event.global.note ?? ''));
  if (event) assert.deepEqual(regional.regionalEvents([event], jp, 'jp')[0].global, event.global, "Global's own estimate stands as it is");
});

test("a JP/KR outfit sale moves Global's window onto it, and a larger draw pool is left alone", () => {
  const kr = { sources: {}, skinWindows: [{ event: 'K', kind: 'shop' as const, label: 'New outfits', startAt: '2026-10-14T07:00:00.000Z', endAt: '2026-11-10T19:00:00.000Z', skinIds: ['a', 'b', 'c'], estimated: false, newRelease: true, source: 'https://example.test/kr' }] };
  const global = [
    { event: 'G', kind: 'shop' as const, label: 'Main shop', startAt: '2026-10-14T15:00:00.000Z', endAt: '2026-11-11T11:00:00.000Z', skinIds: ['a', 'b', 'c', 'd'], estimated: true, newRelease: false },
    { event: 'G', kind: 'shop' as const, label: 'Fashion Review', startAt: '2026-10-14T15:00:00.000Z', endAt: '2026-11-11T11:00:00.000Z', skinIds: ['a', 'e', 'f', 'g', 'h', 'i', 'j'], estimated: true, newRelease: false },
  ];
  const [main, review] = regional.regionalSkinWindows(global, kr, 'kr');
  assert.deepEqual([main.startAt, main.endAt, main.estimated, main.label], [kr.skinWindows[0].startAt, kr.skinWindows[0].endAt, false, 'Main shop']);
  assert.deepEqual(review, global[1]);
  const [collection] = regional.regionalSkinCollections([{ id: 'G', name: 'G · Main shop', start: '2026-10-14', end: '2026-11-10', startAt: global[0].startAt, endAt: global[0].endAt, estimated: true, skinIds: ['a', 'b', 'c', 'd'], featuredIds: [] }], kr, 'kr');
  assert.deepEqual([collection.name, collection.endAt, collection.estimated, collection.sourceRegion], ['G · Main shop', kr.skinWindows[0].endAt, false, 'kr']);
});

test("Global's own announced sale confirms the planner's CN-projected collection; one it does not list stays as it is", () => {
  const en = { sources: {}, skinWindows: [{ event: 'MAIN THEME EPISODE 17', kind: 'shop' as const, label: 'Returning outfits', startAt: '2026-10-14T15:00:00.000Z', endAt: '2026-11-11T11:00:00.000Z', skinIds: ['a', 'b', 'c'], estimated: false, newRelease: false, source: 'https://www.arknights.global/news/4814' }] };
  const projected = { id: 'C', name: 'C · Returning outfits', start: '2026-10-14', end: '2026-11-11', estimated: true, skinIds: ['a', 'b', 'c', 'd'], featuredIds: [], sourceRegion: 'cn', source: 'https://arknights.wiki.gg/wiki/C' };
  const other = { ...projected, id: 'X', name: 'X · Returning outfits', start: '2027-03-01', end: '2027-03-29', skinIds: ['x', 'y'] };
  const [confirmed, untouched] = regional.regionalSkinCollections([projected, other], en, 'en');
  assert.deepEqual([confirmed.start, confirmed.end, confirmed.startAt, confirmed.endAt, confirmed.estimated, confirmed.sourceRegion, confirmed.source],
    ['2026-10-14', '2026-11-11', en.skinWindows[0].startAt, en.skinWindows[0].endAt, false, 'global', en.skinWindows[0].source]);
  assert.deepEqual(untouched, other, 'no Global post for it: the projection stands, still an estimate');
});

test('no page drops a Global item its JP/KR schedule has no window for', () => {
  const pages = path.join(__dirname, '../../pages');
  const files = fs.readdirSync(pages, { recursive: true }).map(String).filter(file => /\.tsx?$/.test(file));
  const offenders: string[] = [];
  for (const file of files) {
    const lines = fs.readFileSync(path.join(pages, file), 'utf8').split('\n');
    lines.forEach((line, index) => {
      if (!/schedule\?\.(events|banners|rewardWindows)\?\.\[/.test(line)) return;
      const next = lines.slice(index, index + 3).join('\n');
      if (/return \[\];|\] : \[\]|\? \[\{[^]*\}\] : \[\]/.test(next)) offenders.push(`${file}:${index + 1}`);
    });
  }
  assert.deepEqual(offenders, [], 'map Global\'s item onto its own dates instead (lib/time/regional.ts)');
});
