import { certificateMonths, greenCertificateIncome, certificatePulls } from '../../lib/pulls/incomeSettings';
import assert from 'node:assert/strict';
import { test } from 'node:test';
// @ts-expect-error Plain Node ingestion.
import { noticeOpening, noticeSkinWindows, buildRegionalSchedule } from '../sync/sync-regional-schedules.mjs';
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

test('JP and KR use their own windows and one exclusive close, never Global fallback', () => {
  for (const server of ['jp', 'kr'] as const) {
    const [selected] = regionalBanners([banner], schedule, server);
    assert.equal(parseBannerWindow(selected)?.end.toISOString(), time.endAt);
    assert.equal(selected.timingServer, server);
    assert.deepEqual(regionalBanners([banner], undefined, server), []);
    assert.equal(regionalEvents([event], undefined, server)[0].global.dateRange, null);
    assert.equal(regionalEvents([event], schedule, server)[0].global.shopEndAt, '2026-11-03T19:00:00.000Z');
  }
  assert.deepEqual(regionalBanners([banner], undefined, 'en'), [banner]);
});

test('a named regional announcement corrects maintenance preloading without shifting a closing date', () => {
  const client = { ...time, startAt: '2026-10-14T02:00:00.000Z', localName: '約諾' };
  const notices = [{ title: '約諾', publishTime: Date.parse('2026-10-09T00:00Z'), url: time.timingSource, lines: ['2026年10月14日（水）16:00 ~ 2026年10月28日（水）3:59'] }];
  assert.equal(noticeOpening(client, notices, 'jp').startAt, time.startAt);
  assert.equal(noticeOpening(client, notices, 'jp').endAt, time.endAt);
  assert.equal(noticeOpening(client, [{ ...notices[0], title: '別のイベント', lines: ['2026年10月14日（水）16:00'] }], 'jp').startAt, client.startAt);
  assert.equal(noticeOpening(client, [{ ...notices[0], lines: [...notices[0].lines, '2026年10月14日（水）17:00'] }], 'jp').startAt, client.startAt);
  const korean = { ...client, localName: '서약' };
  assert.equal(noticeOpening(korean, [{ ...notices[0], title: '한정 헤드헌팅 서약', lines: ['10월 14일(수) 16:00 부터 개방'] }], 'kr').startAt, time.startAt);
});

test('shop extraction uses the sale paragraph and OP inventory, not an earlier login or stage deadline', () => {
  const skins = [{ skinId: 'paid', model: 'A', name: 'Sale', howToObtain: 'Outfit Store ( 24 Originite Prime )' }, { skinId: 'free', model: 'B', name: 'Login', howToObtain: 'Login Event' }];
  const tables = { skin: { charSkins: { paid: { isBuySkin: true, displaySkin: { skinName: '販売服', getTime: Date.parse(time.startAt) / 1000 } }, free: { isBuySkin: true, displaySkin: { skinName: '無料服' } } } } };
  const notices = [{ title: 'Notice', url: time.timingSource, publishTime: Date.parse('2026-10-09T00:00Z'), lines: ['ログイン報酬「無料服」', '2026年10月14日（水）16:00 ~ 2026年10月28日（水）3:59', '「販売服」 A専用コーデ', '▼販売期間', '2026年10月14日（水）16:00 ~ 2026年11月11日（水）3:59'] }];
  const [shop] = noticeSkinWindows(notices, tables, skins, 'jp');
  assert.deepEqual(shop.skinIds, ['A / Sale']);
  assert.equal(shop.endAt, '2026-11-10T19:00:00.000Z');
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

test('timed regional reward claims keep stable IDs and manual claims; unknown regional gifts stay out', () => {
  const rewards = [{ id: 'free:act:1', startAt: 1, endAt: 2 }, { id: 'permanent' }, { id: 'free:announcement:unknown', startAt: 1, endAt: 2 }];
  const selected = regionalFreeRewards(rewards, { ...schedule, rewardWindows: { 'free:act:1': time } }, 'kr');
  assert.deepEqual(selected.map(r => r.id), ['free:act:1', 'permanent']);
  assert.equal(selected[0].endAt, Date.parse(time.endAt));assert.equal(rewards[0].endAt, 2);
});

test('server filtering retains rewards that close after Global in either regional client', () => {
  const now = Date.parse('2026-10-28T12:00:00Z');
  const rewards = [{ id: 'free:jp', endAt: now - 1 }, { id: 'free:kr', endAt: now - 1 }, { id: 'expired', endAt: now - 1 }, { id: 'permanent' }];
  const before = structuredClone(rewards);
  const window = { ...time, endAt: new Date(now + 60_000).toISOString() };
  const tables = { version: 1 as const, servers: { jp: { sources: {}, rewardWindows: { 'free:jp': window } }, kr: { sources: {}, rewardWindows: { 'free:kr': window } } } };
  const current = currentRegionalFreeRewards(rewards, tables, now);
  assert.deepEqual(current.map(reward => reward.id), ['free:jp', 'free:kr', 'permanent']);
  assert.deepEqual(regionalFreeRewards(current, tables.servers.jp, 'jp').map(reward => reward.id), ['free:jp', 'permanent']);
  assert.deepEqual(regionalFreeRewards(current, tables.servers.kr, 'kr').map(reward => reward.id), ['free:kr', 'permanent']);
  assert.deepEqual(currentRegionalFreeRewards(rewards, tables, now + 60_000).map(reward => reward.id), ['permanent']);
  assert.deepEqual(currentRegionalFreeRewards(rewards, undefined, now).map(reward => reward.id), ['permanent']);
  assert.deepEqual(rewards, before);
});

test('ingestion rejects truncated regional inputs instead of manufacturing schedules', () => {
  assert.throws(() => buildRegionalSchedule({ server: 'jp', tables: {}, english: {}, events: [], banners: [], skins: [], stages: [], contents: {}, base: 'https://example.test' }), /Incomplete jp/);
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


test('English official openings also outrank maintenance preloading at the same close', () => {
  const client = { ...time, startAt: '2026-10-14T12:00:00.000Z', endAt: '2026-10-28T11:00:00.000Z', localName: 'Critical Phase Transition' };
  const notices = [{ title: 'Main Theme Episode 17: Critical Phase Transition', publishTime: Date.parse('2026-10-09T00:00Z'), url: 'https://www.arknights.global/news/4814', lines: ['OPEN TIME: October 14, 2026, 08:00 (UTC-7)'] }];
  assert.equal(noticeOpening(client, notices, 'en').startAt, '2026-10-14T15:00:00.000Z');
  assert.equal(noticeOpening(client, notices, 'en').endAt, client.endAt);
});
