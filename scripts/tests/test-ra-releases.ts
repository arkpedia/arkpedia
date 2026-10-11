import assert from 'node:assert/strict';
import { test } from 'node:test';
// @ts-expect-error standalone Node importer
import { reconcileRaReleases } from '../sync/sync-ra-releases.mjs';
import { scheduleModeRelease, modeReleaseRow } from '../../lib/schedule/modeReleases';
import { currentEventRows } from '../../lib/schedule/eventRows';
import { getEventCalendar, loadGameEvents } from '../../lib/home/frontPageContent';
import type { ScheduleEvent } from '../../lib/schedule/scheduleTypes';

const cn = { basicInfo: {
  sandbox_1: { topicId: 'sandbox_1', topicName: '沙洲遗闻', topicStartTime: 1706929200 },
  sandbox_2: { topicId: 'sandbox_2', topicName: '重启锚点', topicStartTime: 1778832000, fullStoredTime: 1853956800 },
} };
const en = { basicInfo: { sandbox_1: { topicId: 'sandbox_1', topicName: 'Tales Within the Sand', topicStartTime: 1723050000 } } };
const sources = { cnSource: 'https://example.invalid/cn/sandbox_perm_table.json', enSource: 'https://example.invalid/en/sandbox_perm_table.json' };
const names = { sandbox_2: { name: 'Relaunch Anchor' } };
const imported = () => reconcileRaReleases([], cn, en, sources, names) as ScheduleEvent[];

test('RA launches are keyed by topic ID, with regional dates and no fictional end', () => {
  const events = imported();
  const ra2 = events.find(e => e.modeId === 'sandbox_2')!;
  assert.equal(ra2.cn.releaseDate, '2026/05/15');
  assert.equal(ra2.cn.startAt, '2026-05-15T08:00:00.000Z');
  assert.equal(ra2.global.releaseDate, undefined);
  assert.equal(ra2.cn.endAt, undefined, 'fullStoredTime is not a mode closure');
  assert.equal(events.find(e => e.modeId === 'sandbox_1')!.global.releaseDate, '2024/08/07');
  assert.deepEqual(reconcileRaReleases(events, cn, en, sources, names), events, 'second import is idempotent');
});

test('a permanent launch appears on one calendar day and expires from the upcoming list', () => {
  const event = scheduleModeRelease(imported().find(e => e.modeId === 'sandbox_2')!, 175);
  assert.equal(event.global.dateRange, '2026/11/06–2026/11/06');
  const row = modeReleaseRow(event)!;
  assert.equal(row.dateRange, '2026/11/06');
  assert.equal(row.isPredicted, true);
  assert.equal(currentEventRows([row], Date.parse('2026-10-09T00:00Z')).length, 1);
  assert.equal(currentEventRows([row], row.start)[0].isOngoing, true);
  assert.deepEqual(currentEventRows([row], row.end), [], 'the permanent mode does not become an eternal live event');
});

test('a newly shipped Global theme replaces the forecast using its own ID and exact time', () => {
  const localized = structuredClone(en) as { basicInfo: Record<string, unknown> };
  localized.basicInfo.sandbox_2 = { topicId: 'sandbox_2', topicName: 'Localized Anchor', topicStartTime: Date.parse('2026-11-04T15:00Z') / 1000 };
  const events = reconcileRaReleases(imported(), cn, localized, sources, names) as ScheduleEvent[];
  assert.equal(events.length, 2);
  const event = scheduleModeRelease(events.find(e => e.modeId === 'sandbox_2')!, 175);
  assert.equal(event.name, '[Reclamation Algorithm] Localized Anchor');
  assert.equal(event.global.releaseDate, '2026/11/04');
  assert.equal(event.global.timingSource, sources.enSource);
  assert.equal(modeReleaseRow(event)!.isPredicted, false);
});

test('a missing regional row retains the last confirmation; invalid themes fail before writing', () => {
  const events = imported();
  events.find(e => e.modeId === 'sandbox_2')!.global.releaseDate = '2026/11/04';
  assert.equal((reconcileRaReleases(events, cn, en, sources, names) as ScheduleEvent[]).find(e => e.modeId === 'sandbox_2')!.global.releaseDate, '2026/11/04');
  assert.throws(() => reconcileRaReleases(events, { basicInfo: {} }, en, sources), /missing RA themes/);
  assert.throws(() => reconcileRaReleases(events, { basicInfo: { bad: { topicId: 'different' } } }, en, sources), /invalid RA theme/);
});

test('permanent releases stay out of timed event pages and homepage event countdowns', () => {
  assert.ok(!getEventCalendar().some(e => /Reclamation Algorithm\]/.test(e.name)));
  assert.ok(!loadGameEvents().some(e => /Reclamation Algorithm\]/.test(e.name)));
});
