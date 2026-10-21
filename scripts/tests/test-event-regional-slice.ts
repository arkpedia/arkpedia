import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { regionalScheduleSlice, type RegionalSchedules } from '../../lib/time/regional';

const window = (startAt: string) => ({ startAt, endAt: '2026-11-01T00:00:00Z', timingSource: 'test' });

test('an event page keeps only its own event and banner windows, on every server', () => {
  const table = { version: 1, servers: {
    en: { events: { A: window('2026-10-01T00:00:00Z'), B: window('2026-10-02T00:00:00Z') }, banners: { X: window('2026-10-01T00:00:00Z'), Y: window('2026-10-03T00:00:00Z') }, sources: {} },
    jp: { events: { A: window('2026-10-05T00:00:00Z') }, banners: {}, sources: {} },
  } } as unknown as RegionalSchedules;
  const slice = regionalScheduleSlice(table, { events: ['A'], banners: ['X'] });
  assert.deepEqual(Object.keys(slice.servers.en!.events!), ['A']);
  assert.deepEqual(Object.keys(slice.servers.en!.banners!), ['X']);
  assert.deepEqual(Object.keys(slice.servers.jp!.events!), ['A']);
  assert.deepEqual(slice.servers.jp!.banners, {});
  assert.ok('sources' in slice.servers.en!, 'what the page does not slice stays');
  assert.deepEqual(Object.keys(table.servers.en!.events!), ['A', 'B'], 'the shared table is not changed');
});

// Every event page carried every server's every window (~600 kB): the dev build ran out of memory.
test('the event page slices its regional table in finalize', () => {
  const page = fs.readFileSync('pages/events/[slug].tsx', 'utf8');
  assert.match(page, /finalize: async \(props\) => withRegionalSlice\(/);
});
