import { certificateMonths, greenCertificateIncome, certificatePulls } from '../../lib/pulls/incomeSettings';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { regionalBanners, regionalEvents, regionalPullBanners, regionalFreeRewards, currentRegionalFreeRewards, supplyOpen, regionalSkinWindows, type RegionalSchedule } from '../../lib/time/regional';
import { bannerFreePulls, type UpcomingBanner } from '../../lib/pulls/pulls';
import { availableBannerFreePulls, planBudgets } from '../../lib/pulls/plan';
import { parseBannerWindow } from '../../lib/gacha/realGachaBanners';
import { getCurrentlyAvailableChipClasses, getActiveReminders } from '../../lib/schedule/opsSchedules';
import type { HeadhuntingBanner } from '../../lib/gacha/headhuntingBanners';
import type { ScheduleEvent } from '../../lib/schedule/scheduleTypes';

const time = { startAt: '2026-10-14T07:00:00.000Z', endAt: '2026-10-27T19:00:00.000Z', timingSource: 'https://www.arknights.jp/news/4805', status: 'announced' };
const banner: HeadhuntingBanner = { name: 'Limited', category: 'Limited', pull_type: 'limited', cn_date: null, global_date: '2026/10/14–2026/10/28', six_stars: ['A'], five_stars: [], year: 2026, linked_event: null,
  global_window: { ...time, startAt: '2026-10-14T15:00:00.000Z', endAt: '2026-10-28T11:00:00.000Z' } } satisfies HeadhuntingBanner;
const event: ScheduleEvent = { name: 'Event', poster: null, year: 2026, cn: { dateRange: null, note: null }, global: { dateRange: '2026/10/14–2026/10/28', note: null }, tw: { dateRange: null, note: null } } satisfies ScheduleEvent;
const schedule: RegionalSchedule = { sources: {}, banners: { Limited: time }, events: { Event: { ...time, shopEndAt: '2026-11-03T19:00:00.000Z' } }, weekly: { weekly_1: [1, 4, 5, 7], weekly_2: [1, 2, 5, 6], weekly_3: [3, 4, 6, 7], weekly_4: [2, 3, 6, 7] } };

test("JP and KR use their own windows and one exclusive close, else Global's dates marked estimated", () => {
  for (const server of ['jp', 'kr'] as const) {
    const [selected] = regionalBanners([banner], schedule, server);
    assert.equal(parseBannerWindow(selected)?.end.toISOString(), time.endAt);
    assert.equal(selected.timingServer, server);
    const [fallback] = regionalBanners([banner], undefined, server);
    assert.deepEqual(fallback, { ...banner, global_date_estimated: true }, "Global's banner on Global's dates, marked estimated");
    assert.equal(parseBannerWindow(fallback)?.end.toISOString(), banner.global_window!.endAt);
    assert.deepEqual(regionalEvents([event], undefined, server)[0].global, { dateRange: event.global.dateRange, note: `Estimated from Global's dates; ${server.toUpperCase()} schedule not announced` });
    assert.equal(regionalEvents([event], schedule, server)[0].global.shopEndAt, '2026-11-03T19:00:00.000Z');
  }
  assert.deepEqual(regionalBanners([banner], undefined, 'en'), [banner]);
});

test("Global's own outfit sales join its windows, and a server without a sale keeps Global's", () => {
  // The sales are read out of each client's notices in arkpedia-data's importer
  // (scripts/tests/test-regional-schedules.ts); the site only files them by server.
  const sale = { event: 'Store', kind: 'shop', label: 'New outfits', startAt: time.startAt, endAt: time.endAt,
    skinIds: ['A / Sale'], newRelease: true } as unknown as Parameters<typeof regionalSkinWindows>[0][number];
  assert.deepEqual(regionalSkinWindows([], { ...schedule, skinWindows: [sale] }, 'en'), [sale]);
  assert.deepEqual(regionalSkinWindows([sale], undefined, 'kr'), [{ ...sale }]);
  assert.deepEqual(regionalSkinWindows([], undefined, 'kr'), []);
});

test('daily rotations and force-open campaigns use the selected reset day, including Saturday sniper chips', () => {
  const now = Date.parse('2026-10-16T19:00:00Z'); // Saturday reset in JP/KR, Friday on EN.
  assert.equal(supplyOpen('weekly_2', now - 1, schedule, 'jp'), true); // Friday
  assert.equal(supplyOpen('weekly_2', now, schedule, 'jp'), true); // Saturday
  assert.equal(supplyOpen('weekly_2', Date.parse('2026-10-17T19:00Z'), schedule, 'jp'), false); // Sunday
  assert.ok(getCurrentlyAvailableChipClasses(new Date(now), 'jp', schedule).includes('Sniper'));
  const forced = { ...schedule, forceOpen: [{ ...time, contentIds: ['weekly_1'] }] };
  assert.equal(supplyOpen('weekly_1', now, schedule, 'jp'), false);
  assert.equal(supplyOpen('weekly_1', now, forced, 'jp'), true);
  assert.equal(supplyOpen('weekly_1', Date.parse(time.endAt), forced, 'jp', 'Saturday'), false);
});

test('regional free banner pulls reset on JP/KR 04:00 and retain manual budget inputs', () => {
  const reward = { name: 'Limited', poolId: 'LIMITED_73_0_1', event: null, start: '2026-10-14', end: '2026-10-28', freeDaily: 14, freeTicket: 10, aliases: [], sixStars: ['A'] } as unknown as UpcomingBanner;
  const [regional] = regionalPullBanners([reward], schedule, 'jp');
  assert.equal(regional.poolId, reward.poolId, 'regional timing must not replace the verified mechanics pool identity');
  assert.equal(bannerFreePulls(regional, new Date('2026-10-14T18:59:59Z')), 11);
  assert.equal(bannerFreePulls(regional, new Date('2026-10-14T19:00:00Z')), 12);
  assert.equal(availableBannerFreePulls(regional, new Date(time.endAt), new Date(time.endAt)), 0);
  const goal = { banner: 'Limited', pulls: 80, spendOn: '2026-10-28', targets: [{ name: 'A', copies: 2 }] };
  const before = structuredClone(goal);
  const [row] = planBudgets([goal], [regional], new Date(time.endAt), () => 100);
  assert.equal(row.expired, true);assert.equal(row.paid, 0);assert.deepEqual(goal, before);
});

test("timed regional reward claims keep stable IDs and manual claims; a gift without a regional window keeps Global's", () => {
  const rewards = [{ id: 'free:act:1', startAt: 1, endAt: 2 }, { id: 'permanent' }, { id: 'free:announcement:unknown', startAt: 1, endAt: 2 }];
  const selected = regionalFreeRewards(rewards, { ...schedule, rewardWindows: { 'free:act:1': time } }, 'kr');
  assert.deepEqual(selected.map(r => r.id), ['free:act:1', 'permanent', 'free:announcement:unknown']);
  assert.equal(selected[0].endAt, Date.parse(time.endAt));assert.equal(rewards[0].endAt, 2);
  assert.deepEqual(selected[2], rewards[2], "Global's own window");
});

test('server filtering retains rewards that close after Global in either regional client', () => {
  const now = Date.parse('2026-10-28T12:00:00Z');
  const rewards = [{ id: 'free:jp', endAt: now - 1 }, { id: 'free:kr', endAt: now - 1 }, { id: 'expired', endAt: now - 1 }, { id: 'permanent' }];
  const before = structuredClone(rewards);
  const window = { ...time, endAt: new Date(now + 60_000).toISOString() };
  const tables = { version: 1 as const, servers: { jp: { sources: {}, rewardWindows: { 'free:jp': window } }, kr: { sources: {}, rewardWindows: { 'free:kr': window } } } };
  const current = currentRegionalFreeRewards(rewards, tables, now);
  assert.deepEqual(current.map(reward => reward.id), ['free:jp', 'free:kr', 'permanent']);
  // Global's list on each server, each reward on that server's window where it has one.
  const jp = regionalFreeRewards(current, tables.servers.jp, 'jp'), kr = regionalFreeRewards(current, tables.servers.kr, 'kr');
  assert.deepEqual(jp.map(reward => reward.id), ['free:jp', 'free:kr', 'permanent']);
  assert.deepEqual(kr.map(reward => reward.id), ['free:jp', 'free:kr', 'permanent']);
  assert.deepEqual(jp.map(reward => reward.endAt! > now), [true, false, false]);
  assert.deepEqual(kr.map(reward => reward.endAt! > now), [false, true, false]);
  assert.deepEqual(currentRegionalFreeRewards(rewards, tables, now + 60_000).map(reward => reward.id), ['permanent']);
  assert.deepEqual(currentRegionalFreeRewards(rewards, undefined, now).map(reward => reward.id), ['permanent']);
  assert.deepEqual(rewards, before);
});

test('SSS reminders use the selected client season and never a Global reward-cycle anchor for JP/KR', () => {
  const now = new Date('2026-10-15T18:00:00Z');
  const source = { ...schedule, sss: [{ id: 'season', number: 10, name: 'Season', start: Date.parse('2026-06-15T19:00Z') / 1000, end: Date.parse('2026-10-15T19:00Z') / 1000, contentIds: [], replicated: [] }] };
  const legacy = { version: 1 as const, cycleEnd: '2026-08-17T11:00:00Z', periodDays: 28 };
  assert.match(getActiveReminders(now, legacy, 'jp', source).find(row => row.id === 'sss')!.text, /SSS season ends in 1 hour/);
  assert.equal(getActiveReminders(new Date('2026-10-15T19:00Z'), legacy, 'jp', source).some(row => row.id === 'sss'), false);
  assert.equal(getActiveReminders(now, legacy, 'kr').some(row => row.id === 'sss'), false);
});


test('monthly shops cross the account reset at 04:00, not regional midnight', () => {
  for (const server of ['jp', 'kr'] as const) {
    const beforeMidnight = new Date('2026-10-31T14:59:59Z');
    const midnight = new Date('2026-10-31T15:00:00Z');
    const beforeReset = new Date('2026-10-31T18:59:59Z');
    const reset = new Date('2026-10-31T19:00:00Z');
    assert.deepEqual(certificateMonths(beforeMidnight, midnight, server), ['2026-10']);
    assert.equal(greenCertificateIncome(beforeMidnight, beforeReset, true, server).months, 0);
    assert.equal(greenCertificateIncome(beforeReset, reset, true, server).months, 1);
    assert.equal(certificatePulls(beforeReset, reset, 516, true, undefined, server), 76);
    assert.deepEqual(certificateMonths(beforeReset, reset, 'en'), ['2026-10']);
  }
});
