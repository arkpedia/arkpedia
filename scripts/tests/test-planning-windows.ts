import test from 'node:test';
import assert from 'node:assert/strict';
import { planningDayEnd, planningDeadline, planningWindowEnd } from '../../lib/pulls/planningWindows';
import { currentPullPlan, openSkinCollections } from '../../lib/pulls/currentPlan';
import { resolvePullSchedule } from '../../lib/pulls/schedule';
import { pullSkinCollections } from '../../lib/pulls/skinCollections';
import type { PlannedSkin } from '../../lib/pulls/skins';
import { bannerFreePulls, type UpcomingBanner } from '../../lib/pulls/pulls';
import { availableBannerFreePulls, goalsAtBannerEnd, planBudgets } from '../../lib/pulls/plan';

const at = (value: string) => Date.parse(value);
const opening = '2026-10-14T15:00:00Z', closing = '2026-10-28T11:00:00Z';
const banner = { name: 'Fixture', start: '2026-10-14', end: '2026-10-28', startAt: opening, endAt: closing, freeDaily: 14, freeTicket: 10 } as UpcomingBanner;

test('the publisher preserves exact banner windows, and request filters remove them at the exclusive close', () => {
  const [published] = resolvePullSchedule([], [{ name: 'Fixture', global_date: '2026/10/14–2026/10/28', pull_type: 'limited', globalPoolId: 'SINGLE_EN_FIXTURE', global_window: { startAt: opening, endAt: closing, timingSource: 'https://www.arknights.global/news/4814' } }]);
  assert.equal(published.startAt, new Date(opening).toISOString());
  assert.equal(published.endAt, new Date(closing).toISOString());
  const props = { scheduledBanners: [published], bannerOdds: { Fixture: {} } as never, skinCollections: [] };
  assert.equal(currentPullPlan(props, at(closing) - 1).scheduledBanners.length, 1);
  const closed = currentPullPlan(props, at(closing));
  assert.deepEqual(closed.scheduledBanners, []);
  assert.deepEqual(closed.bannerOdds, {});
  assert.equal(props.scheduledBanners.length, 1, 'request filtering never mutates cached payloads');
});

test('confirmed outfit shops retain source instants and their owning Global calendar dates', () => {
  const close = '2026-10-28T00:00:00Z';
  const [shop] = pullSkinCollections([], [], [{ id: 'A / Summer' } as PlannedSkin], new Set(), [], [{ event: 'Fixture', kind: 'shop', label: 'Outfits', startAt: opening, endAt: close, skinIds: ['A / Summer'] }]);
  assert.equal(shop.endAt, close);
  assert.equal(shop.end, '2026-10-27', '00:00Z is still the previous Global calendar date');
  assert.equal(openSkinCollections([shop], '2026-10-27', at(close) - 1).length, 1);
  assert.deepEqual(openSkinCollections([shop], '2026-10-27', at(close)), []);
});

test('date-only legacy labels are inclusive in server calendar time, while malformed exact instants fail closed', () => {
  assert.equal(planningWindowEnd({ end: '2026-10-28' }), at('2026-10-29T07:00:00Z'));
  assert.equal(planningDayEnd('2026-10-28', 'jp'), at('2026-10-28T15:00:00Z'));
  assert.equal(planningDayEnd('2026-10-28', 'kr'), at('2026-10-28T15:00:00Z'));
  assert.ok(Number.isNaN(planningDayEnd('2026-02-30')));
  assert.ok(Number.isNaN(planningWindowEnd({ end: '2099-01-01', endAt: '2026-10-28T11:00:00' })), 'a host-local timestamp cannot revive a window');
});

test('a banner goal forecasts savings before its exact close and preserves manual goal values', () => {
  const goals = [{ banner: banner.name, spendOn: banner.end, pulls: 80 }];
  const original = structuredClone(goals);
  let forecastAt = 0;
  planBudgets(goals, [banner], new Date('2026-10-20T12:00:00Z'), date => { forecastAt = date.getTime(); return 100; });
  assert.equal(forecastAt, at(closing) - 1);
  assert.equal(planningDeadline(banner, banner.end).getTime(), at(closing) - 1);
  assert.deepEqual(goals, original);
});

test('actual daily freebies roll over at the owning banner reset, never UTC midnight or after close', () => {
  assert.equal(bannerFreePulls(banner, new Date(at(opening) - 1)), 0);
  for (const time of ['2026-10-15T00:00:00Z', '2026-10-15T10:59:59Z']) assert.equal(bannerFreePulls(banner, new Date(time)), 11);
  assert.equal(bannerFreePulls(banner, new Date('2026-10-15T11:00:00Z')), 12);
  const later = new Date('2026-10-15T12:00:00Z');
  assert.equal(availableBannerFreePulls(banner, later, new Date('2026-10-15T00:00:00Z')), 12);
  assert.equal(availableBannerFreePulls(banner, later, new Date('2026-10-15T11:00:00Z')), 11);
  assert.equal(availableBannerFreePulls(banner, later, new Date('2026-10-15T11:00:00Z'), true), 1);
  assert.equal(availableBannerFreePulls(banner, new Date(closing), new Date(closing)), 0);
});


test('a saved closing instant survives schedule pruning without discarding manual progress or reserving an expired budget', () => {
  const original = [{ banner: banner.name, spendOn: banner.end, pulls: 80, ticketUsed: true, targets: [{ name: 'A', copies: 2 }] }];
  const migrated = goalsAtBannerEnd(original, [banner]);
  assert.equal(migrated[0].bannerEndAt, closing);
  assert.equal('bannerEndAt' in original[0], false);
  const retained = goalsAtBannerEnd(migrated, []);
  assert.deepEqual(retained, migrated);
  assert.deepEqual(goalsAtBannerEnd(migrated, [{ ...banner, endAt: undefined }]), migrated, 'an older payload with the same day does not erase a saved instant');
  assert.equal(goalsAtBannerEnd(migrated, [{ ...banner, end: '2026-11-01', endAt: undefined }])[0].bannerEndAt, undefined, 'a rescheduled day cannot retain the former closing instant');
  const [row] = planBudgets(retained, [], new Date(closing), () => 100);
  assert.equal(row.paid, 0);
  assert.match(row.issue!, /has passed/);
  assert.equal(row.goal.pulls, 80);
  assert.equal(row.goal.ticketUsed, true);
  assert.deepEqual(row.goal.targets, [{ name: 'A', copies: 2 }]);
});
