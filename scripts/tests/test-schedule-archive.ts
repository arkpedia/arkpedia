import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pastScheduleEvents, pruneScheduleProps } from '../../lib/schedule/eventRows';
import type { ScheduleEvent } from '../../lib/schedule/scheduleTypes';

const date = { dateRange: null, note: null };
function event(name: string, start: string, end: string, extra: Partial<ScheduleEvent> = {}): ScheduleEvent {
  return { name, year: 2026, poster: null, cn: date, tw: date,
    global: { ...date, dateRange: '2026/01/01–2026/01/02', startAt: start, endAt: end }, ...extra };
}

test('the archive lists confirmed finished events newest first, including the exact end instant', () => {
  const old = event('Old', '2026-01-01T10:00Z', '2026-01-02T10:00Z');
  const recent = event('Recent', '2026-02-01T10:00Z', '2026-02-02T10:00Z');
  const future = event('Future', '2026-03-01T10:00Z', '2026-03-02T10:00Z');
  const predicted = { ...old, name: 'Estimate', global: { ...old.global, note: 'Predicted Global date' } };
  const now = Date.parse(recent.global.endAt!);
  const rows = [old, future, predicted, { ...old, name: 'Banner', bannerName: 'Banner' }, recent, { ...old, name: 'Mode', modeId: 'mode' }];
  assert.deepEqual(pastScheduleEvents(rows, now).map(row => row.name), ['Recent', 'Old']);
  assert.deepEqual(pastScheduleEvents(rows, now - 1).map(row => row.name), ['Old']);
  // Past discovery reads the complete calendar, not the live row list pruned for payload size.
  const props = pruneScheduleProps({ events: rows, eventRows: [], now });
  assert.equal(pastScheduleEvents(props.events, now).length, 2);
  assert.equal(pastScheduleEvents([{ ...event('Unknown', '', ''), global: date }], now).length, 0);
});
