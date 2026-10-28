import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { regionalScheduleSlice, stripRegionalTimingSources, withLightRegionalTable, type RegionalSchedules } from '../../lib/time/regional';

const window = (startAt: string) => ({ startAt, endAt: '2026-11-01T00:00:00Z', timingSource: 'https://raw.githubusercontent.com/x/y' });
const table = () => ({ version: 1, servers: {
  en: { events: { A: window('2026-10-01T00:00:00Z') }, banners: { X: window('2026-10-01T00:00:00Z') }, activities: { P: window('2026-10-01T00:00:00Z') },
    forceOpen: [{ ...window('2026-10-01T00:00:00Z'), contentIds: ['c1'] }], skinReleases: { S: { at: '2026-10-01T00:00:00Z', localName: null, timingSource: 'https://raw.githubusercontent.com/x/z' } }, sources: { a: 'b' } },
  jp: { events: { A: window('2026-10-05T00:00:00Z') }, banners: {}, sources: {} },
} } as unknown as RegionalSchedules);

// The home page shipped 1,450 provenance links, 250 kB of a 720 kB table, that no page reads in the browser.
test('the table without timing sources keeps every window, every server and every other field', () => {
  const light = stripRegionalTimingSources(table());
  for (const server of ['en', 'jp'] as const) {
    const schedule = light.servers[server]!;
    assert.equal(schedule.events!.A.startAt, table().servers[server]!.events!.A.startAt);
    assert.ok(!('timingSource' in schedule.events!.A), `${server}: the event window's link is gone`);
  }
  const en = light.servers.en!;
  assert.ok(!('timingSource' in en.banners!.X) && !('timingSource' in en.activities!.P) && !('timingSource' in en.forceOpen![0]) && !('timingSource' in en.skinReleases!.S));
  assert.deepEqual((en.forceOpen![0] as { contentIds: string[] }).contentIds, ['c1']);
  assert.deepEqual(en.sources, { a: 'b' });
  assert.ok(!JSON.stringify(light).includes('raw.githubusercontent'));
  assert.ok('timingSource' in table().servers.en!.events!.A, 'the shared table is not changed');
});

test('a page with the table gets it stripped; a page without passes through', () => {
  const props = { now: 1, __contentTables: { other: { k: 1 }, 'regional-schedules': table() } };
  const light = withLightRegionalTable(props);
  assert.deepEqual(light.__contentTables.other, { k: 1 });
  assert.ok(!JSON.stringify(light).includes('raw.githubusercontent'));
  const plain = { now: 1 };
  assert.equal(withLightRegionalTable(plain), plain);
});

test('slicing then stripping keeps only the named rows, on every server', () => {
  const light = stripRegionalTimingSources(regionalScheduleSlice(table(), { events: ['A'], banners: [] }));
  assert.deepEqual(Object.keys(light.servers.jp!.events!), ['A']);
  assert.deepEqual(light.servers.en!.banners, {});
});

// The home page's finalize slices the table to the panels' rows and strips it (pages/index.tsx).
test('the home page slices and strips its regional table in finalize', () => {
  const page = fs.readFileSync('pages/index.tsx', 'utf8');
  const finalize = page.slice(page.indexOf('async function finalizeHome'), page.indexOf('export const getStaticProps'));
  assert.match(finalize, /stripRegionalTimingSources\(regionalScheduleSlice\(regional, \{/);
  assert.match(finalize, /banners: ongoingBanners\.map\(banner => banner\.name\)/);
  assert.match(finalize, /upcomingEvent\.name/);
});
// The other regional routes strip theirs the same way.
test('the schedule, pulls and gacha routes strip their regional table in finalize', () => {
  for (const route of ['pages/schedule.tsx', 'pages/pulls.tsx', 'pages/gacha.tsx']) {
    assert.match(fs.readFileSync(route, 'utf8'), /withLightRegionalTable\(/, route);
  }
});
