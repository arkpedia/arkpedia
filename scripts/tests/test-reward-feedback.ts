import type { EventRow } from '../../lib/schedule/eventRows';
import { mergeMissingModeLaunches, scheduleModeRelease } from '../../lib/schedule/modeReleases';
import type { ScheduleEvent } from '../../lib/schedule/scheduleTypes';
import fs from 'node:fs';
import path from 'node:path';
import { WELFARE_PRIORITIES, welfarePriority } from '../../lib/pulls/welfarePriority';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { paradoxAvailability, remainingSanity } from '../../lib/pulls/rewardOverview';
import { freeRewardsForAccount, freeRewardTotals } from '../../lib/pulls/freeRewards';
import { scheduleBarSources } from '../../lib/schedule/scheduleDates';
import type { BacklogSources } from '../../lib/pulls/pulls';

test('Paradox unlocks use the actual promotion and level, including low-rarity exceptions', () => {
  const stage = { id: 'paradox:a', name: 'A', amount: 200, operatorId: 'a', unlock: { elite: 1, level: 55 } };
  const owned = { elite: 1, level: 54, skillLevel: 1, masteries: {} };
  assert.equal(paradoxAvailability(stage).ready, null);
  assert.equal(paradoxAvailability(stage, {}).ready, false);
  assert.equal(paradoxAvailability(stage, { a: owned }).ready, false);
  assert.equal(paradoxAvailability(stage, { a: { ...owned, level: 55 } }).ready, true);
  assert.equal(paradoxAvailability(stage, { A: { ...owned, level: 55 } }).ready, true);
  assert.equal(paradoxAvailability(stage, { a: { ...owned, elite: 2, level: 1 } }).ready, true);
});

test('remaining sanity respects partial clears, manual completion, exclusions and unavailable costs', () => {
  const backlog = { chapters: [{ id: 'chapter', op: 2, stages: ['one', 'two'] }], playable: [], resources: [{ id: 'resource:daily', amount: 1 }], annihilation: [], stageSanity: { one: 6, two: 9, daily: 10 } } as unknown as BacklogSources;
  assert.equal(remainingSanity(backlog, new Set(), new Set(), false, null), 25);
  assert.equal(remainingSanity(backlog, new Set(), new Set(), false, new Set(['one'])), 19);
  assert.equal(remainingSanity(backlog, new Set(['chapter']), new Set(), false, null), 10);
  assert.equal(remainingSanity(backlog, new Set(['daily']), new Set(), false, null), 15);
  assert.equal(remainingSanity({ ...backlog, stageSanity: {} }, new Set(), new Set(), false, null), null);
});

test('a veteran import does not turn missing welcome-mail history into available Orundum', () => {
  const reward = { id: 'free:welcome-mail', group: 'Beginner rewards', name: 'Welcome mail', rewards: [{ id: '4003', name: 'Orundum', count: 3800, orundum: 3800 }], forecast: true };
  assert.equal(freeRewardTotals(freeRewardsForAccount([reward], null), new Set(), 0).orundum, 3800);
  const imported = freeRewardsForAccount([reward], { server: 'en' });
  assert.equal(imported[0].claimUnknown, true);
  assert.equal(freeRewardTotals(imported, new Set(), 0).orundum, 0);
});

test('calendar includes list forecasts and one-day mode releases, and removes stale banner estimates', () => {
  const event = { name: 'Forecast', global: { dateRange: null, note: null } };
  const base = { poster: null, isPredicted: true, pullBanner: null, featuredOperators: [] };
  const sources = scheduleBarSources([event], [
    { ...base, name: 'Forecast', dateRange: '2027/03/02–2027/03/04', start: 1803988800000, end: 1804161600000 },
    { ...base, name: 'IS7', modeId: 'rogue_6', dateRange: '2027/01/08', start: Date.parse('2027-01-08T17:00:00Z'), end: Date.parse('2027-01-09T17:00:00Z') },
    { ...base, name: 'Old estimate', bannerName: 'Old', dateRange: '2026/01/01–2026/01/02', start: 1, end: 2 },
  ], 'en', 100);
  assert.deepEqual(sources.map(row => row.name), ['Forecast', 'IS7']);
  assert.equal(sources[0].start.getDate(), 2);
  assert.equal(sources[0].end.getDate(), 4);
  assert.equal(+sources[1].start, +sources[1].end);
});

test('the supplied welfare guide uses existing catalogue names and keeps unlisted operators unranked', () => {
  const names = new Set([5, 6].flatMap(rarity => fs.readdirSync(`data/operators-${rarity}star`).map(file => path.basename(file, '.json'))));
  const ranked = WELFARE_PRIORITIES.flat();
  assert.equal(new Set(ranked).size, ranked.length);
  for (const name of ranked) assert.ok(names.has(name), name);
  assert.equal(welfarePriority('Robin'), 2);
  assert.equal(welfarePriority('Absinthe'), 3);
  assert.equal(welfarePriority('Grani'), 4);
  assert.equal(welfarePriority('Unlisted operator'), undefined);
});

test('mode compatibility adds only absent permanent launches and preserves release-owned event windows', () => {
  const mode = { name: 'IS7', modeId: 'rogue_6', year: 2026, poster: null, cn: { dateRange: null, releaseDate: '2026/07/17', note: null }, global: { dateRange: null, note: null }, tw: { dateRange: null, note: null } } as ScheduleEvent;
  const dated = scheduleModeRelease(mode, 175);
  const timed = { ...mode, name: 'Timed event', modeId: undefined };
  const original = { events: [timed], eventRows: [] as EventRow[] };
  const filled = mergeMissingModeLaunches(original, [dated, { ...timed, name: 'Unpublished timed event' }]);
  assert.equal(filled.events.length, 2);
  assert.equal(filled.eventRows.length, 1);
  assert.equal(filled.events[0], timed);
  const unchanged = mergeMissingModeLaunches(filled, [{ ...dated, global: { ...dated.global, releaseDate: '2099/01/01' } }]);
  assert.equal(unchanged, filled);
  assert.equal(filled.eventRows[0].dateRange, '2027/01/08');
});
