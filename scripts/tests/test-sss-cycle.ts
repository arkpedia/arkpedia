import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import committed from '../../data/sss-cycle.json';
import { getActiveReminders, getSSSNextEnd } from '../../lib/schedule/opsSchedules';
import { checkSssCycle, nextSssEnd, type SssCycle } from '../../lib/schedule/sssCycle';
import { pageTables } from '../../lib/content/tables.mjs';

/*
 * The ticker's Stationary Security Service countdown follows data/sss-cycle.json, which the
 * release carries in the home page's props. It was an anchor typed into
 * lib/schedule/opsSchedules.ts (2026-08-17 19:00 SGT, every 28 days), so a new or shifted
 * cycle needed a code change and a redeploy. The ticker is on the home page only, so the cycle
 * is that page's table.
 */
const cycle = (cycleEnd: string, periodDays = 28): SssCycle => ({ version: 1, cycleEnd, periodDays });

test('the countdown follows the cycle the release carries', () => {
  const data = checkSssCycle(committed);
  // The same instants the typed-in anchor gave: 2026-08-17 19:00 SGT, then every 28 days.
  assert.equal(getSSSNextEnd(new Date('2026-09-25T00:00:00Z'), data).toISOString(), '2026-10-12T11:00:00.000Z');
  assert.equal(getSSSNextEnd(new Date('2026-10-12T11:00:00Z'), data).toISOString(), '2026-10-12T11:00:00.000Z');
  assert.equal(getSSSNextEnd(new Date('2026-10-12T11:00:01Z'), data).toISOString(), '2026-11-09T11:00:00.000Z');
  // A cycle the game shifts is a data edit: the answer moves with it.
  assert.equal(nextSssEnd(new Date('2026-09-25T00:00:00Z'), cycle('2026-10-01T11:00:00Z', 14)).toISOString(), '2026-10-01T11:00:00.000Z');
  // An anchor far ahead still names the first end after now.
  assert.equal(nextSssEnd(new Date('2026-09-25T00:00:00Z'), cycle('2026-12-03T11:00:00Z')).toISOString(), '2026-10-08T11:00:00.000Z');
});

test('the ticker names SSS inside the last three days of the cycle it is given', () => {
  const at = new Date('2026-10-10T11:00:00Z');
  assert.ok(getActiveReminders(at, cycle('2026-08-17T11:00:00Z')).some(r => r.id === 'sss' && r.text === 'SSS ends in 2 days'));
  assert.ok(!getActiveReminders(new Date('2026-09-25T00:00:00Z'), cycle('2026-08-17T11:00:00Z')).some(r => r.id === 'sss'));
  // A shifted cycle moves the reminder with it.
  assert.ok(getActiveReminders(new Date('2026-09-25T00:00:00Z'), cycle('2026-09-26T11:00:00Z')).some(r => r.id === 'sss'));
});

test('the cycle is a checked release table of the home page, and no date is typed into the code', () => {
  assert.throws(() => checkSssCycle({ version: 1, cycleEnd: '2026-08-17 19:00', periodDays: 28 }), /is not/);
  assert.throws(() => checkSssCycle({ version: 1, cycleEnd: '2026-08-17T11:00:00Z', periodDays: 0 }), /is not/);
  assert.deepEqual(pageTables('/'), ['sss-cycle', 'regional-schedules']);
  const code = fs.readFileSync('lib/schedule/opsSchedules.ts', 'utf8');
  assert.doesNotMatch(code, /SSS_FIRST_END|SSS_CYCLE_MS|\b20\d\d, month:/);
  assert.match(fs.readFileSync('scripts/content/hydrate-source.mjs', 'utf8'), /'data\/sss-cycle\.json'/);
  // The home page hands it to the ticker as a required prop; the ticker uses nothing else.
  assert.match(fs.readFileSync('pages/index.tsx', 'utf8'), /<AnnouncementTicker sssCycle=\{sssCycle\} \/>/);
  const ticker = fs.readFileSync('components/layout/AnnouncementTicker.tsx', 'utf8');
  assert.match(ticker, /AnnouncementTicker\(\{ sssCycle \}: \{ sssCycle: SssCycle \}\)/);
  assert.match(ticker, /getActiveReminders\(new Date\(\), sssCycleRef\.current, server, scheduleRef\.current\)/);
});
