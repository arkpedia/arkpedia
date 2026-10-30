import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scheduleModeRelease, modeReleaseRow } from '../../lib/schedule/modeReleases';
import { currentEventRows } from '../../lib/schedule/eventRows';
import { getEventCalendar, loadGameEvents } from '../../lib/home/frontPageContent';
import type { ScheduleEvent } from '../../lib/schedule/scheduleTypes';

// An RA launch row exactly as arkpedia-data's importer files it (its scripts/sync/sync-ra-releases.mjs,
// whose own test lives beside it): a CN start with no Global date yet, and no end at all,
// because a permanent mode never closes.
const unannounced = (): ScheduleEvent => ({
  name: '[Reclamation Algorithm] Relaunch Anchor',
  modeId: 'sandbox_2',
  year: 2026,
  poster: null,
  cn: { dateRange: null, note: null, releaseDate: '2026/05/15', startAt: '2026-05-15T08:00:00.000Z', timingSource: 'https://example.invalid/cn/sandbox_perm_table.json' },
  global: { dateRange: null, note: 'Global release unannounced' },
  tw: { dateRange: null, note: null },
  hasFashionReview: false,
} as ScheduleEvent);

test('a permanent launch appears on one calendar day and expires from the upcoming list', () => {
  const event = scheduleModeRelease(unannounced(), 175);
  assert.equal(event.global.dateRange, '2026/11/06–2026/11/06');
  const row = modeReleaseRow(event)!;
  assert.equal(row.dateRange, '2026/11/06');
  assert.equal(row.isPredicted, true);
  assert.equal(currentEventRows([row], Date.parse('2026-10-09T00:00Z')).length, 1);
  assert.equal(currentEventRows([row], row.start)[0].isOngoing, true);
  assert.deepEqual(currentEventRows([row], row.end), [], 'the permanent mode does not become an eternal live event');
});

test('a shipped Global theme is no longer a forecast', () => {
  const shipped = unannounced();
  shipped.name = '[Reclamation Algorithm] Localized Anchor';
  shipped.global = { dateRange: null, note: null, releaseDate: '2026/11/04', startAt: '2026-11-04T15:00:00.000Z', timingSource: 'https://example.invalid/en/sandbox_perm_table.json' };
  const event = scheduleModeRelease(shipped, 175);
  assert.equal(event.global.releaseDate, '2026/11/04');
  assert.equal(modeReleaseRow(event)!.isPredicted, false);
});

test('permanent releases stay out of timed event pages and homepage event countdowns', () => {
  assert.ok(!getEventCalendar().some(e => /Reclamation Algorithm\]/.test(e.name)));
  assert.ok(!loadGameEvents().some(e => /Reclamation Algorithm\]/.test(e.name)));
});
