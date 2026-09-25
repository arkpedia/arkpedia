import assert from 'node:assert/strict';
import { test } from 'node:test';
import { currentEventRows, currentPullBannerLinks, pruneScheduleProps, timelineOperatorsAt, type EventRow, type EventRowView } from '../../lib/schedule/eventRows';
import { resolveEventStoreCountdown, resolveMaterialCountdowns, type FarmingWindows } from '../../lib/schedule/countdownWindows';
import { daysUntil, estimateCelebrationRerun, limitedBannerSplit, limitedOperatorNote, nextOccurrenceOf } from '../../lib/gacha/limitedRerunNotes';
import { playablePalettes, type PaletteOperator } from '../../lib/minigames/logic';
import { selectEnemyStatusOperators, type EnemyStatusCandidates } from '../../lib/enemies/statusOperators';
import { currentPullPlan } from '../../lib/pulls/currentPlan';
import type { UpcomingBanner } from '../../lib/pulls/pulls';
import type { SkinCollection } from '../../lib/pulls/skinCollections';
import { isOperatorReleased, isReleasedAt, releaseMarker } from '../../lib/operators/operatorAvailability';
import { serverDate } from '../../lib/time/serverDay';
import { withContentPage } from '../../lib/content/server';

// Every value that depends on "now" is computed from a moment passed in: the request's
// (contentPageClock) or the reader's. Fixtures and fixed instants only; nothing here
// reads the real date or the repository's data.
const at = (iso: string) => Date.parse(iso);
const HOUR = 3_600_000, DAY = 24 * HOUR;

test('schedule rows: LIVE, membership and the pull-planner link follow the request clock', () => {
  const row = (name: string, start: string, end: string, pullBanner: EventRow['pullBanner'] = null): EventRow =>
    ({ name, poster: null, dateRange: '', isPredicted: false, start: at(start), end: at(end), pullBanner, featuredOperators: [] });
  const rows = [
    row('People, A People', '2026-09-16T15:00:00Z', '2026-09-30T11:00:00Z', { name: 'Standard Pool #176', end: at('2026-09-25T23:59:59Z') }),
    row('Critical Phase Transition', '2026-10-14T15:00:00Z', '2026-10-28T11:00:00Z'),
  ];
  const view = (now: number) => currentEventRows(rows, now).map(r => [r.name, r.isOngoing, r.pullBannerName]);
  assert.deepEqual(view(at('2026-09-24T12:00:00Z')), [['People, A People', true, 'Standard Pool #176'], ['Critical Phase Transition', false, null]]);
  assert.deepEqual(view(at('2026-09-26T00:00:00Z')), [['People, A People', true, null], ['Critical Phase Transition', false, null]]);
  assert.deepEqual(view(at('2026-10-01T00:00:00Z')), [['Critical Phase Transition', false, null]], 'an ended event leaves the list and its LIVE badge with it');
  // A release exported before rows carried windows is shown as it was exported.
  const legacy: EventRowView = { name: 'Old', poster: null, dateRange: '', isPredicted: false, isOngoing: true, pullBannerName: 'X', featuredOperators: [] };
  assert.deepEqual(currentEventRows([legacy], at('2030-01-01T00:00:00Z')), [legacy]);
  // The per-request prune drops only what rendering would drop anyway.
  const now = at('2026-10-01T00:00:00Z');
  const pruned = pruneScheduleProps({ eventRows: [...rows, legacy], pullBanners: { a: { name: 'A', end: now - 1 }, b: { name: 'B', end: now + 1 } }, now });
  assert.deepEqual(pruned.eventRows.map(r => r.name), ['Critical Phase Transition', 'Old']);
  assert.deepEqual(currentEventRows(pruned.eventRows, now), currentEventRows([...rows, legacy], now));
  assert.deepEqual(currentPullBannerLinks(pruned.pullBanners, undefined, now), { b: 'B' });
  assert.deepEqual(currentPullBannerLinks(undefined, { old: 'Old' }, now), { old: 'Old' });
});

test('timeline operators are released at their instant, not at the export', () => {
  const release = releaseMarker({ releaseAt: '2026-10-01T08:00:00-07:00' });
  const ops = [{ name: 'New', rarity: 6, basicInfo: null, release }, { name: 'Legacy', rarity: 5, basicInfo: null, isFuture: true }];
  assert.deepEqual(timelineOperatorsAt(ops, at('2026-10-01T14:59:59Z')).map(o => o.isFuture), [true, true]);
  assert.deepEqual(timelineOperatorsAt(ops, at('2026-10-01T15:00:00Z')).map(o => o.isFuture), [false, true]);
  assert.equal(isOperatorReleased({ releaseAt: '2026-10-01T08:00:00-07:00' }, at('2026-10-01T15:00:00Z')), true);
  assert.equal(isReleasedAt({ releasedAt: null, isFuture: true }, at('2099-01-01T00:00:00Z')), false);
  assert.equal(isReleasedAt(undefined, 0), true, 'payloads from before markers were filtered at their export');
});

test('farming countdowns are text worked out from raw windows at render', () => {
  const windows: FarmingWindows = {
    materials: {
      Grindstone: [{ start: at('2026-10-28T15:00:00Z'), end: at('2026-11-11T11:00:00Z'), stageCode: 'MT-9' }],
      Aketon: [
        { start: at('2026-09-16T15:00:00Z'), end: at('2026-09-30T11:00:00Z'), stageCode: 'PA-7' },
        { start: at('2026-12-01T15:00:00Z'), end: at('2026-12-15T11:00:00Z'), stageCode: 'XX-1' },
      ],
    },
    eventStore: [{ start: at('2026-09-16T15:00:00Z'), end: at('2026-09-30T11:00:00Z') }, { start: at('2026-10-28T15:00:00Z'), end: at('2026-11-11T11:00:00Z') }],
  };
  const text = (now: number) => Object.fromEntries(Object.entries(resolveMaterialCountdowns(windows, now)).map(([k, v]) => [k, `${v.text} ${v.stageCode}`]));
  const exportDay = at('2026-09-24T14:05:00Z');
  assert.deepEqual(text(exportDay), { Grindstone: '35 days MT-9', Aketon: 'NOW PA-7' });
  assert.equal(resolveEventStoreCountdown(windows, exportDay)?.text, 'NOW');
  // Days later, with no new release: the page no longer says what the export said.
  const later = at('2026-10-28T03:00:00Z');
  assert.deepEqual(text(later), { Grindstone: '12 hours MT-9', Aketon: '35 days XX-1' });
  assert.equal(resolveEventStoreCountdown(windows, later)?.text, '12 hours');
  assert.deepEqual(text(at('2026-12-16T00:00:00Z')), {});
  assert.equal(resolveEventStoreCountdown(windows, at('2026-12-16T00:00:00Z')), null);
});

test('obtain-method notes use the server day in UTC, whatever the host timezone', () => {
  const previous = process.env.TZ;
  const now = at('2026-09-25T03:00:00Z'); // server day 2026-09-24 (rollover 11:00 UTC)
  const op = { characterInfo: { 'Release Date': '2025/01/10' } };
  const info = { type: 'Celebration' as const, appearances: ['2025/01/10', '2026/11/10'] };
  const notes: string[] = [];
  try {
    for (const zone of ['UTC', 'America/Los_Angeles', 'Europe/Berlin', 'Pacific/Auckland', 'Asia/Tokyo']) {
      process.env.TZ = zone;
      notes.push([
        limitedOperatorNote(op, info, [], now),
        limitedOperatorNote(op, { type: 'Festival', appearances: ['2025/07/17'] }, [], now),
        limitedOperatorNote(op, { type: 'Carnival', appearances: ['2026/01/17'] }, [], now),
        limitedOperatorNote(op, { type: 'Celebration', appearances: ['2025/01/10'] }, ['2025/05/01', '2026/11/10', '2027/05/01'], now),
      ].join(' | '));
    }
  } finally { if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous; }
  assert.equal(new Set(notes).size, 1, notes.join('\n'));
  // 2026-09-24 → 2026-11-10 is 47 days, → 2027-07-17 is 296, → 2027-01-17 is 115; across DST, still whole days.
  assert.equal(notes[0], 'Celebration — 47 days until scheduled rerun | Festival — est. 296 days until next rerun | Carnival — est. 115 days until next rerun | Celebration — est. 47 days until next rerun');
  assert.equal(daysUntil('2026-09-24'.replaceAll('-', '/'), now), 0);
  assert.equal(nextOccurrenceOf(9, 24, now), '2027/09/24', 'today is not next');
  assert.equal(estimateCelebrationRerun('2026/06/01', ['2026/11/10', '2027/05/01'], now), '2027/05/01', 'too new for the next one');
  // The last/next split moves with the day: a banner starting today is past.
  assert.deepEqual(limitedBannerSplit(info, at('2026-11-10T10:59:00Z')), { type: 'Celebration', lastBannerDate: '2025/01/10', nextScheduledDate: '2026/11/10' });
  assert.deepEqual(limitedBannerSplit(info, at('2026-11-10T11:00:00Z')), { type: 'Celebration', lastBannerDate: '2026/11/10', nextScheduledDate: null });
  // A debut is a release, not a rerun, until the operator's own release instant.
  const debut = { releaseAt: '2026-11-10T08:00:00-07:00' };
  assert.match(limitedOperatorNote(debut, { type: 'Celebration', appearances: ['2026/11/10'] }, [], at('2026-11-01T00:00:00Z')) ?? '', /days until release$/);
  // Releases exported before `appearances` keep the split made at their export.
  const legacy = { type: 'Festival' as const, lastBannerDate: null, nextScheduledDate: '2026/10/01' };
  assert.deepEqual(limitedBannerSplit(legacy, now), legacy);
});

test('the music guesser counts a group as Global from the server day of its release date', () => {
  assert.equal(serverDate(new Date('2026-10-14T10:59:59Z')), '2026-10-13');
  assert.equal(serverDate(new Date('2026-10-14T11:00:00Z')), '2026-10-14');
});

test('the colour palette and enemy status lists admit an operator at its release instant', () => {
  const art = { image: '/six-star-skins/X - Base.webp', colors: ['#000000', '#111111', '#222222', '#333333', '#444444'] };
  const palette = (name: string, release?: PaletteOperator['release']): PaletteOperator => ({ name, aliases: [], rarity: 6, class: 'Guard', base: art, elite2: null, ...(release ? { release } : {}) });
  const catalogue = [palette('Out', { releasedAt: at('2026-01-01T00:00:00Z') }), palette('Later', { releasedAt: at('2026-10-01T15:00:00Z') }), palette('Legacy')];
  assert.deepEqual(playablePalettes(catalogue, at('2026-10-01T14:59:59Z')).map(o => o.name), ['Out', 'Legacy']);
  assert.deepEqual(playablePalettes(catalogue, at('2026-10-01T15:00:00Z')).map(o => o.name), ['Out', 'Later', 'Legacy']);

  const operator = (name: string, releasedAt: number) => ({ name, icon: `/${name}.webp`, sourceIcon: null, sourceLabel: null, release: { releasedAt } });
  const candidates: EnemyStatusCandidates = { Stun: { technique: 'Stun', operators: [
    operator('A', 0), operator('New', at('2026-10-01T15:00:00Z')), operator('B', 0), operator('C', 0), operator('D', 0),
  ] } };
  assert.deepEqual(selectEnemyStatusOperators(candidates, at('2026-09-24T12:00:00Z')).Stun?.operators.map(o => o.name), ['A', 'B', 'C', 'D']);
  const after = selectEnemyStatusOperators(candidates, at('2026-10-01T15:00:00Z')).Stun;
  assert.deepEqual(after?.operators.map(o => o.name), ['A', 'New', 'B', 'C']);
  assert.equal(after?.total, 5);
  assert.ok(after?.operators.every(o => !('release' in o)));
});

test('the pull planner drops banners and shops per request, through the end of their last day', () => {
  const banner = (name: string, end: string) => ({ name, end }) as UpcomingBanner;
  const shop = (id: string, end: string) => ({ id, end }) as SkinCollection;
  const props = {
    scheduledBanners: [banner('Over', '2026-09-24'), banner('Last day', '2026-09-25'), banner('Next', '2026-10-09')],
    bannerOdds: { Over: {}, 'Last day': {}, Next: {} } as never,
    skinCollections: [shop('closed', '2026-09-24'), shop('open', '2026-09-25')],
    backlogSources: null,
  };
  const current = currentPullPlan(props, at('2026-09-25T23:59:58Z'));
  assert.deepEqual(current.scheduledBanners.map(b => b.name), ['Last day', 'Next']);
  assert.deepEqual(Object.keys(current.bannerOdds), ['Last day', 'Next']);
  assert.deepEqual(current.skinCollections.map(c => c.id), ['open']);
  assert.equal(current.backlogSources, null);
  assert.deepEqual(currentPullPlan(props, at('2026-09-26T00:00:00Z')).scheduledBanners.map(b => b.name), ['Next']);
});

test('withContentPage takes revalidate as an option, and exports carry no clock field', async () => {
  const saved = { disabled: process.env.ARKPEDIA_CONTENT_DISABLED, exporting: process.env.ARKPEDIA_EXPORT_CONTENT };
  process.env.ARKPEDIA_CONTENT_DISABLED = '1';
  try {
    const context = { revalidateReason: 'build' as const };
    const page = withContentPage<{ value: string; now: number }>('/schedule', async () => ({ props: { value: 'record' } }), { revalidate: 1200 });
    const result = await page(context);
    assert.ok('props' in result);
    assert.equal(result.revalidate, 1200, 'the option reaches Next');
    const props = await result.props;
    assert.equal(props.value, 'record');
    assert.equal(props.now % 60_000, 0);
    // An interval inside the page data never reached Next when the page came from a
    // release; the type refuses it, and so does the runtime for untyped callers.
    const inner = withContentPage('/schedule', (async () => ({ props: { value: 'record' }, revalidate: 1200 })) as never);
    await assert.rejects(async () => inner(context), /set revalidate as a withContentPage option/);

    process.env.ARKPEDIA_EXPORT_CONTENT = '1';
    const exported = await page(context);
    assert.ok('props' in exported);
    assert.deepEqual(await exported.props, { value: 'record' }, 'no clock field in exported data');
  } finally {
    if (saved.disabled === undefined) delete process.env.ARKPEDIA_CONTENT_DISABLED; else process.env.ARKPEDIA_CONTENT_DISABLED = saved.disabled;
    if (saved.exporting === undefined) delete process.env.ARKPEDIA_EXPORT_CONTENT; else process.env.ARKPEDIA_EXPORT_CONTENT = saved.exporting;
  }
});
