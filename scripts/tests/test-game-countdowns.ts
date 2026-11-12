import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { eventShopEnd, parseGameWindow, windowCountdown } from '@/lib/schedule/gameWindow';
import { parseBannerDate, parseBannerEndDate } from '@/lib/gacha/realGachaBanners';
import { getAllHeadhuntingBanners } from '@/lib/gacha/headhuntingBannerData';
import { getHomeGachaBanners, getOngoingGachaBanners, getOngoingEvents, loadGameEvents } from '@/lib/home/frontPageContent';
import { isDebutAvailable, isOperatorReleased, plannerOperators, releaseMarker } from '@/lib/operators/operatorAvailability';
import { getAllOperators } from '@/lib/operators/operators';

const start = new Date('2026-09-16T15:00:00Z');
const end = new Date('2026-09-30T11:00:00Z');
/* An event and its banner announced for 08:00 PDT on the 16th, closing at the 04:00
   reset on the 30th -- People, A People and Rage of The Many, as fixtures, since the
   live records are renamed and re-timed by the daily refresh. */
const official = { startAt: '2026-09-16T15:00:00.000Z', endAt: '2026-09-30T11:00:00.000Z', timingSource: 'https://www.arknights.global/news/4635' };
const eventWindow = parseGameWindow('2026/09/16–2026/09/30', official)!;
const event = { name: '[Side Story] Fixture', poster: '', year: 2026, dateRange: '2026/09/16–2026/09/30', ...official, start: eventWindow.start, end: eventWindow.end } as ReturnType<typeof loadGameEvents>[number];
const banner = { name: 'Fixture banner', category: 'featured', pull_type: 'featured', year: 2026, cn_date: null, global_date: '2026/09/16–2026/09/30', global_window: official, six_stars: [], five_stars: [], four_stars: [] } as unknown as ReturnType<typeof getAllHeadhuntingBanners>[number];
test('an event and its banner share the announced opening, not midnight or reset', () => {
  assert.deepEqual(event.start, start);
  assert.deepEqual(event.end, end);
  assert.deepEqual(parseBannerDate(banner), start);
  assert.deepEqual(parseBannerEndDate(banner), end);
  for (const now of ['2026-09-16T00:00:00Z', '2026-09-16T11:00:00Z', '2026-09-16T14:59:59Z']) {
    assert.equal(getOngoingEvents(new Date(now), [event]).length, 0);
    assert.equal(getOngoingGachaBanners(new Date(now), [banner]).length, 0);
    assert.equal(getHomeGachaBanners(new Date(now), [banner])[0].name, banner.name);
  }
  assert.equal(getOngoingEvents(start, [event]).length, 1);
  assert.equal(getOngoingGachaBanners(start, [banner]).length, 1);
  assert.equal(getOngoingEvents(end, [event]).length, 0);
  assert.equal(getOngoingGachaBanners(end, [banner]).length, 0);
  assert.equal(getHomeGachaBanners(start, [{ ...banner, global_date: null, global_window: undefined }]).length, 0);
});

test("the home page keeps an event until its store closes, then lets it go", () => {
  // People, A People: stages to 09-30 11:00Z, store to 10-07 11:00Z (activity_table rewardEndTime).
  const shopping = { ...event, shopEndAt: '2026-10-07T11:00:00.000Z' };
  assert.deepEqual(eventShopEnd(shopping), new Date('2026-10-07T11:00:00Z'));
  assert.equal(eventShopEnd(event), null);
  assert.equal(eventShopEnd({ ...event, shopEndAt: event.endAt }), null, 'a store closing with the stages is no store phase');
  for (const now of [end, new Date('2026-10-07T10:59:59Z')]) assert.equal(getOngoingEvents(now, [shopping]).length, 1, now.toISOString());
  assert.equal(getOngoingEvents(new Date('2026-10-07T11:00:00Z'), [shopping]).length, 0);
  // Soonest to close first, by whichever closes next: an open event ending tomorrow leads a
  // store that closes in a week.
  const openTomorrow = { ...event, name: 'Open', end: new Date('2026-10-01T11:00:00Z'), endAt: '2026-10-01T11:00:00.000Z' };
  assert.deepEqual(getOngoingEvents(new Date('2026-09-30T12:00:00Z'), [shopping, openTomorrow]).map(e => e.name), ['Open', shopping.name]);
});

test('countdown crosses opening and closing without stale labels or negative time', () => {
  assert.deepEqual(windowCountdown(start, end, new Date(+start - 1000)), { label: 'Starts in', remaining: 1000 });
  assert.deepEqual(windowCountdown(start, end, start), { label: 'Ends in', remaining: +end - +start });
  assert.deepEqual(windowCountdown(start, end, new Date(+end - 1000)), { label: 'Ends in', remaining: 1000 });
  for (const now of [end, new Date(+end + 1000)]) assert.deepEqual(windowCountdown(start, end, now), { label: 'Ended', remaining: 0 });
});

test('date-only fallback is timezone-independent, with exact maintenance hours taking precedence', () => {
  const before = process.env.TZ;
  try {
    for (const tz of ['UTC', 'America/Los_Angeles', 'Asia/Tokyo', 'Europe/Zurich']) {
      process.env.TZ = tz;
      assert.deepEqual(parseGameWindow('2026/09/16–2026/09/30'), { start, end });
      assert.equal(parseGameWindow('2026/09/16–2026/09/30', {}, 'global', true)?.start.toISOString(), '2026-09-16T11:00:00.000Z');
      assert.equal(parseGameWindow('2026/09/16–2026/09/30', {}, 'cn', true)?.start.toISOString(), '2026-09-15T20:00:00.000Z');
      assert.equal(parseGameWindow('2026/09/16–2026/09/30', { startAt: '2026-09-16T10:00:00-07:00' })?.start.toISOString(), '2026-09-16T17:00:00.000Z');
    }
  } finally { if (before === undefined) delete process.env.TZ; else process.env.TZ = before; }
  assert.equal(parseGameWindow('2026/02/30–2026/03/15'), null);
  assert.equal(parseGameWindow('2026/09/16–2026/09/30', { startAt: '2026-09-16T15:00:00' }), null);
  assert.equal(parseGameWindow('2026/09/30–2026/09/16'), null);
});

/* The calendar days a script writes come from one helper (scripts/lib/server-day.mjs), so the
   window the catalogue or the CN announcements write is one string for one day. A copy that
   drifts (an offset's sign, the 04:00 rollover) would date the same window two ways, and each
   stage would rewrite the other's days. arkpedia-data's importer holds the same guard over
   its own scripts. */
test('no script keeps its own serverDay: every one imports scripts/lib/server-day.mjs', () => {
  const copies: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const at = path.join(dir, entry.name);
      if (entry.isDirectory()) { if (at !== path.join('scripts', 'tests')) walk(at); continue; }
      if (!/\.(?:mjs|js|ts)$/.test(entry.name) || at === path.join('scripts', 'lib', 'server-day.mjs')) continue;
      if (/\b(?:function\s+serverDay\b|(?:const|let|var)\s+serverDay\s*=)/.test(fs.readFileSync(at, 'utf8'))) copies.push(at);
    }
  };
  walk('scripts');
  assert.deepEqual(copies, [], `import { serverDay } from scripts/lib/server-day.mjs instead of defining one in ${copies.join(', ')}`);
  assert.match(fs.readFileSync('scripts/sync/catalogue-model.mjs', 'utf8'), /import \{ serverDay \} from '\.\.\/lib\/server-day\.mjs'/, 'not vacuous: the catalogue dates its windows with the shared helper');
});


test('"Now Available" lasts as long as the debut: its banner, or an event operator\'s stages', () => {
  // Ukusik on Rage of The Many and Botani from People, A People, both to 09-30 11:00Z; it
  // counted two weeks from 09-16 15:00Z and ran past both. Not the event store (to 10-07):
  // it sells Botani's potential tokens, never Botani.
  const at = (iso: string) => Date.parse(iso);
  const banner = { releaseAt: '2026-09-16T15:00:00.000Z', availableUntil: '2026-09-30T11:00:00.000Z' };
  assert.equal(isDebutAvailable(banner, at('2026-09-16T14:59:00Z')), false, 'not before the release');
  assert.equal(isDebutAvailable(banner, at('2026-09-30T10:59:00Z')), true);
  assert.equal(isDebutAvailable(banner, at('2026-09-30T11:00:00Z')), false, 'the banner closed');
  const botani = getAllOperators().find(op => op.name === 'Botani');
  if (botani?.availableUntil) assert.equal(botani.availableUntil, '2026-09-30T11:00:00.000Z', 'the stages, not the store');
  // No known end (or a release from before the records carried one): two weeks.
  const bare = { releaseAt: '2026-09-16T15:00:00.000Z' };
  assert.equal(isDebutAvailable(bare, at('2026-09-30T14:59:00Z')), true);
  assert.equal(isDebutAvailable(bare, at('2026-09-30T15:01:00Z')), false);
  // Every record's debut ends after it starts, so none can read as never available.
  for (const op of getAllOperators()) {
    if (op.availableUntil) assert.ok(op.releaseAt && Date.parse(op.availableUntil) > Date.parse(op.releaseAt), `${op.name}: ${op.releaseAt} .. ${op.availableUntil}`);
  }
});

test('the planner offers every operator, the ones not on Global yet marked CN', () => {
  // Nineteen CN operators (Closure, Viy, Kal'tsit - Esperanta, the Persona 3 crossover) could not be
  // added after the switch on 2026-09-30: the planner kept Global-released operators alone. From the
  // release markers alone, so the release in use (main's code compiles it) needs nothing new.
  const now = Date.parse('2026-10-01T12:00:00Z');
  const ops = [
    { name: 'out', releasedAt: Date.parse('2026-09-16T15:00:00Z') },
    { name: 'dated', releasedAt: Date.parse('2026-10-15T15:00:00Z') },
    { name: 'undated', releasedAt: null, isFuture: true as const },
    { name: 'old payload' },
  ];
  assert.deepEqual(plannerOperators(ops, now).map((op) => [op.name, op.cnOnly ?? false]), [['out', false], ['dated', true], ['undated', true], ['old payload', false]]);
  // The data, at the clock it is judged by on the day: the content run tests the night's refresh.
  // Judged at the fixed date above, Closure (CN-only then, a Global record since 2026-10-14) read
  // as "marked CN but a Global record" and failed that night's run. "Marked CN => CN record" never
  // held around a patch anyway: the EN tables make a record Global before its release instant
  // (GALLUS²'s day-only date opens at 07:00 UTC the next day). What must hold at any clock: every
  // operator is offered, marked CN exactly when the site calls it unreleased, and a CN record with
  // no Global date is never offered as out on Global.
  const today = Date.now();
  const records = getAllOperators();
  const all = records.map((op) => ({ ...releaseMarker(op), name: op.name, sourceRegion: op.sourceRegion }));
  const offered = plannerOperators(all, today);
  assert.equal(offered.length, all.length);
  records.forEach((record, i) => {
    assert.equal(offered[i].cnOnly === true, !isOperatorReleased(record, today), `${record.name}: the planner marks CN exactly what the site calls unreleased`);
    if (record.sourceRegion === 'CN' && offered[i].releasedAt === null) assert.equal(offered[i].cnOnly, true, `${record.name} is a CN record with no Global date, so it is marked CN`);
  });
  assert.ok(offered.some((op) => op.cnOnly), 'some operator is not on Global yet');
  assert.match(fs.readFileSync('pages/planner.tsx', 'utf8'), /useMemo\(\(\) => plannerOperators\(exportedOperators, now\)/);
});
