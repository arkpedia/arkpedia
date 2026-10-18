import assert from 'node:assert/strict';
import test from 'node:test';
import { getSkinsForEvent } from '../../lib/schedule/scheduleSkinMatch';
import { eventSkins } from '../../lib/events/eventSkins';
import { currentEventRows, type EventRow } from '../../lib/schedule/eventRows';
import { permanentEventListing, modeDetails } from '../../lib/events/modeDetails';
import type { Skin } from '../../lib/skins/skinTypes';
import type { ScheduleEvent } from '../../lib/schedule/scheduleTypes';
const original = '[Side Story] A Story', rerun = '[Rerun] A Story Rerun';
const skin = (name: string, release: string) => ({ name, model: 'Operator', release } as Skin);
const skins = [skin('Original login', original), skin('Original shop', original), skin('Rerun debut', rerun)];
const names = [original, rerun];
test('reruns never inherit original debut or login outfits, including a tag-only rerun', () => {
  assert.deepEqual(getSkinsForEvent(rerun, skins, names).map(s => s.name), ['Rerun debut']);
  assert.deepEqual(getSkinsForEvent('[Rerun] A Story', skins, names).map(s => s.name), ['Rerun debut']);
  assert.deepEqual(getSkinsForEvent(original, skins, names).map(s => s.name), ['Original login', 'Original shop']);
});
test('the run inventory includes explicit reissues, without importing its original login or Fashion Review', () => {
  const result = eventSkins(rerun, skins, names, { confirmed: { entries: [] }, rotations: { entries: [{ event: rerun, eventStart: '2026-05-22', rotations: [
    { label: 'Outfit shop', start: '2026-05-22', end: '2026-06-05', new: ['Operator / Rerun debut'], returning: ['Operator / Original shop'] },
    { label: 'Fashion Review', start: '2026-05-22', end: '2026-06-05', new: [], returning: ['Operator / Original login'] },
  ] }] } });
  assert.deepEqual(result.map(s => s.name), ['Original shop', 'Rerun debut']);
});
test('an elapsed unconfirmed banner forecast becomes undated and cannot be live or reserve planner pulls', () => {
  const row: EventRow = { name: 'Orienteering #7', bannerName: 'Orienteering #7', poster: null, dateRange: '2026/10/18–2026/11/01', isPredicted: true, start: 100, end: 200, featuredOperators: [], pullBanner: { name: 'Pool', end: 200 } };
  assert.equal(currentEventRows([row], 99)[0].isPredicted, true);
  for (const now of [100, 201]) assert.deepEqual(currentEventRows([row], now).map(r => [r.dateRange, r.isOngoing, r.pullBannerName]), [['Global date unannounced', false, null]]);
  assert.equal(currentEventRows([{ ...row, isPredicted: false }], 101)[0].isOngoing, true);
});
test('a permanent launch has an accessible detail listing without a fictitious close', () => {
  const event = { name: '[Reclamation Algorithm] Relaunch Anchor', modeId: 'sandbox_2', poster: null, year: 2026, global: { releaseDate: '2026/10/28', note: 'ESTIMATED' }, cn: { releaseDate: '2026/05/15' } } as ScheduleEvent;
  const result = permanentEventListing(event)!;
  assert.equal(+result.start, +result.end);
  assert.equal(result.dateRange, '2026/10/28');
  assert(modeDetails(event.name)?.source.startsWith('https://ak.hypergryph.com/'));
});

test('a complete Global inventory supersedes CN rotations for the same run', () => {
  const result = eventSkins(rerun, skins, names, { confirmed: { entries: [{ event: rerun, kind: 'shop', label: 'Outfits', startAt: '2026-01-01T00:00:00Z', endAt: '2026-01-15T00:00:00Z', skinIds: ['Operator / Rerun debut'], inventoryComplete: true }] }, rotations: { entries: [{ event: rerun, eventStart: '2026-01-01', rotations: [{ label: 'Shop', start: '2026-01-01', end: '2026-01-15', new: [], returning: ['Operator / Original shop'] }] }] } });
  assert.deepEqual(result.map(s => s.name), ['Rerun debut']);
});

test('a withdrawn forecast cannot be regenerated from its CN date', async () => {
  const { estimateBannerFromCn } = await import('../../lib/gacha/bannerSchedule');
  const { bannerScheduleEvents } = await import('../../lib/schedule/bannerEvents');
  const banner = { name: 'Orienteering #7', pull_type: 'orienteering', global_date: null, cn_date: '2026/05/15–2026/05/29', globalForecastWithdrawn: true };
  assert.equal(estimateBannerFromCn(banner, 175).global_date, null);
  assert.equal(bannerScheduleEvents([banner as never])[0].global.dateRange, null);
});

test('wiki enrichment cannot revive a withdrawn Global forecast', async () => {
  const { estimateBannerFromCn, globalBannerPreview } = await import('../../lib/gacha/bannerSchedule');
  const banner = { pull_type: 'orienteering', globalLineupPending: true, global_date: '2026/10/18–2026/11/01', cn_date: '2026/05/15–2026/05/29', globalForecastWithdrawn: true };
  assert.equal(estimateBannerFromCn(banner, 175).global_date, null);
  assert.equal(globalBannerPreview(banner).global_date, null);
});
