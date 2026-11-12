import assert from 'node:assert/strict';
import test from 'node:test';
import skins from '../../data/skins.json';
import confirmed from '../../data/skin-availability-windows.json';
import rotations from '../../data/skin-shop-rotations.json';
import { compareCurrentSkins, computeSkinCountdowns, confirmedWindow, getSkinWindows, skinKey, type SkinWindow } from '../../lib/skins/skinAvailability';
import { getAllEvents } from '../../lib/schedule/schedule';
import type { Skin } from '../../lib/skins/skinTypes';

const catalogue = skins as Skin[];
const events = getAllEvents();
const windows = getSkinWindows(catalogue, events, { confirmed, rotations });
// The windows the page's data builder hands over, worked out once: they do not depend on the instant.
const at = (time: string) => computeSkinCountdowns(new Date(time), windows);
const verified = confirmed.entries.map(confirmedWindow);

test('all verified inventory entries resolve exactly once in the catalogue', () => {
  for (const window of verified) {
    assert(Date.parse(window.endAt) > Date.parse(window.startAt));
    assert.equal(new Set(window.skinIds).size, window.skinIds.length);
    for (const id of window.skinIds) assert.equal(catalogue.filter(skin => skinKey(skin) === id).length, 1, id);
  }
});

/* The rules are checked on a fixture of windows at a fixed instant, and on the committed
   data only at instants the data itself names (each verified window's opening), never at a
   date written here and never by counting what is open: the daily refresh adds, re-dates
   and prunes windows, and none of that may fail the release. */
const fixtureSkin = (model: string, name: string) => ({ model, name, series: 'Fixture', seriesImage: null, code: null, illustrator: null,
  description: null, release: null, howToObtain: null, image: null } as Skin);
const instant = '2026-09-22T12:00:00Z';
const fixture: SkinWindow[] = [
  { event: 'Fixture', kind: 'shop', label: 'New outfits', startAt: '2026-09-16T15:00:00Z', endAt: '2026-09-30T11:00:00Z', skinIds: ['A / New'], newRelease: true },
  { event: 'Fixture', kind: 'draw', label: 'Pool', startAt: '2026-09-10T15:00:00Z', endAt: '2026-10-01T11:00:00Z', skinIds: ['A / New', 'B / Drawn'], newRelease: false },
  // A reissue that opened after the new outfits: by date alone it would come first.
  { event: 'Fixture', kind: 'shop', label: 'Returning outfits', startAt: '2026-09-18T15:00:00Z', endAt: '2026-09-24T11:00:00Z', skinIds: ['C / Old'], newRelease: false },
  { event: 'Fixture', kind: 'shop', label: 'Projected', startAt: '2026-09-01T15:00:00Z', endAt: '2026-10-01T11:00:00Z', skinIds: ['D / Forecast'], estimated: true, newRelease: false },
  { event: 'Fixture', kind: 'shop', label: 'Closed', startAt: '2026-08-01T15:00:00Z', endAt: '2026-08-15T11:00:00Z', skinIds: ['E / Gone'], newRelease: false },
];
const openAt = (entries: SkinWindow[], time: string) => entries.filter(window => !window.estimated && Date.parse(window.startAt) <= Date.parse(time) && Date.parse(time) < Date.parse(window.endAt));

test('only verified windows open at an instant are live, with direct purchase ahead of a draw', () => {
  const result = computeSkinCountdowns(new Date(instant), fixture);
  const live = Object.fromEntries([...result].filter(([, window]) => window.live).map(([id, window]) => [id, window.kind]));
  assert.deepEqual(live, { 'A / New': 'shop', 'B / Drawn': 'draw', 'C / Old': 'shop' });
  assert.equal(result.has('D / Forecast'), false, 'a forecast open now is not stock');
  assert.equal(result.has('E / Gone'), false);
  // The same rule on the committed data, at every instant a verified window opens.
  for (const time of new Set(verified.map(window => window.startAt))) {
    const open = openAt(verified, time);
    const liveIds = [...at(time)].filter(([, window]) => window.live);
    assert.deepEqual(liveIds.map(([id]) => id).sort(), [...new Set(open.flatMap(window => window.skinIds))].sort(), time);
    for (const [id, window] of liveIds) {
      const direct = open.filter(entry => entry.kind !== 'draw' && entry.skinIds.includes(id));
      assert.equal(window.estimated, undefined, id);
      if (direct.length) assert.ok(direct.some(entry => entry.kind === window.kind && entry.label === window.label && entry.endAt === window.endAt), id);
      else assert.equal(window.kind, 'draw', id);
    }
  }
});

test('sales open at the announced instant and expire at the exclusive server reset', () => {
  const window: SkinWindow = { event: 'Example', kind: 'shop', label: 'Returning outfits', startAt: '2026-09-10T15:00:00Z', endAt: '2026-09-24T11:00:00Z', skinIds: ['A / Outfit'], newRelease: false };
  const live = (time: string) => computeSkinCountdowns(new Date(time), [window]).get('A / Outfit')?.live;
  assert.equal(live('2026-09-10T14:59:59Z'), false);
  assert.equal(live('2026-09-10T15:00:00Z'), true);
  assert.equal(live('2026-09-24T10:59:59Z'), true);
  assert.notEqual(live('2026-09-24T11:00:00Z'), true);
  // The same holds for every verified window in the data, where no other window keeps the outfit.
  for (const entry of verified) {
    const only = entry.skinIds.filter(id => verified.every(other => other === entry || !other.skinIds.includes(id)));
    const before = at(new Date(Date.parse(entry.startAt) - 1000).toISOString()), opening = at(entry.startAt);
    const last = at(new Date(Date.parse(entry.endAt) - 1000).toISOString()), closed = at(entry.endAt);
    for (const id of only) {
      assert.notEqual(before.get(id)?.live, true, `${id} before ${entry.startAt}`);
      assert.equal(opening.get(id)?.live, true, `${id} at ${entry.startAt}`);
      assert.equal(last.get(id)?.live, true, `${id} before ${entry.endAt}`);
      assert.notEqual(closed.get(id)?.live, true, `${id} at ${entry.endAt}`);
    }
  }
});

test('CN schedules, release matches and Fashion Review flags never establish live stock', () => {
  const forecast: SkinWindow = { event: 'Example', kind: 'shop', label: 'Projected', startAt: '2026-09-01T15:00:00Z', endAt: '2026-10-01T11:00:00Z', skinIds: ['A / Outfit'], estimated: true, newRelease: false };
  assert.equal(computeSkinCountdowns(new Date(instant), [forecast]).size, 0);
  // Whatever the data holds, at any instant it names, nothing live is a forecast.
  for (const time of new Set(verified.map(window => window.startAt))) {
    assert([...at(time).values()].filter(window => window.live).every(window => !window.estimated), time);
  }
  // Every projected window the data produces is a forecast only, whenever it opens.
  for (const window of windows.filter(window => window.estimated)) {
    assert.equal(computeSkinCountdowns(new Date(window.startAt), [window]).size, 0, window.label);
  }
});

test('outfits with the same name remain distinct and direct purchase beats a draw', () => {
  const window: SkinWindow = { event: 'Example', kind: 'draw', label: 'Pool', startAt: '2026-09-01T15:00:00Z', endAt: '2026-10-01T11:00:00Z', skinIds: ['A / Shared', 'B / Shared'], newRelease: false };
  const result = computeSkinCountdowns(new Date('2026-09-22T12:00:00Z'), [window, { ...window, kind: 'shop', skinIds: ['A / Shared'] }]);
  assert.equal(result.get('A / Shared')?.kind, 'shop');
  assert.equal(result.get('B / Shared')?.kind, 'draw');
});

test('expired build flags cannot revive a closed shop', () => {
  assert.equal([...computeSkinCountdowns(new Date('2026-12-01T00:00:00Z'), fixture).values()].filter(window => window.live).length, 0);
  // The whole catalogue, a day after the last window the data knows of has closed.
  const after = new Date(Math.max(...windows.map(window => Date.parse(window.endAt))) + 86_400_000);
  assert.equal([...computeSkinCountdowns(after, windows).values()].filter(window => window.live).length, 0);
});

test('new current outfits lead reissues', () => {
  const fixtureSkins = ['C / Old', 'B / Drawn', 'A / New'].map(id => fixtureSkin(...id.split(' / ') as [string, string]));
  const result = computeSkinCountdowns(new Date(instant), fixture);
  const direct = fixtureSkins.filter(skin => { const window = result.get(skinKey(skin)); return window?.live && window.kind !== 'draw'; })
    .sort((a, b) => compareCurrentSkins(a, b, result));
  assert.deepEqual(direct.map(skinKey), ['A / New', 'C / Old']);
});

/* newRelease is stated on every window the page's data builder hands over, so "current" never
   needs a lookup: it used to fall back on the verified windows compiled into the bundle. */
test('every window states newRelease, and only a verified new-release sale is new', () => {
  for (const window of windows) assert.equal(typeof window.newRelease, 'boolean', `${window.event} / ${window.label}`);
  for (const window of windows.filter(window => window.estimated)) assert.equal(window.newRelease, false, window.label);
  const newSales = windows.filter(window => window.newRelease);
  assert.deepEqual(newSales.map(window => window.startAt).sort(), verified.filter(window => window.newRelease).map(window => window.startAt).sort());
});

test('upcoming uses Global debut timestamps, puts dated windows first, and excludes random draws', async () => {
  const { isUpcomingSkin, compareUpcomingSkins } = await import('../../lib/skins/skinAvailability');
  const now = Date.parse('2026-10-08T00:00:00Z');
  const staleCN = { ...fixtureSkin('A', 'Released'), sourceRegion: 'CN', globalReleaseAt: now / 1000 - 86400 };
  const newCN = { ...fixtureSkin('B', 'Undated'), sourceRegion: 'CN' };
  const scheduled = fixtureSkin('C', 'Returning');
  const window = { event: 'Future', kind: 'shop' as const, label: 'Returning', startAt: '2026-10-14T15:00:00Z', endAt: '2026-11-11T11:00:00Z', skinIds: [skinKey(scheduled)], live: false, estimated: true, newRelease: false };
  assert.equal(isUpcomingSkin(staleCN, undefined, now), false);
  assert.equal(isUpcomingSkin(newCN, undefined, now), true);
  assert.equal(isUpcomingSkin(scheduled, window, now), true);
  assert.equal(isUpcomingSkin(scheduled, { ...window, kind: 'draw' }, now), false);
  const availability = new Map([[skinKey(scheduled), window]]);
  assert.deepEqual([newCN, scheduled].sort((a,b) => compareUpcomingSkins(a,b,availability)), [scheduled,newCN]);
  const returning = {...scheduled, globalReleaseAt: now / 1000 - 86400};
  availability.set(skinKey(newCN), {...window, skinIds: [skinKey(newCN)]});
  assert.deepEqual([returning, newCN].sort((a,b) => compareUpcomingSkins(a,b,availability)), [newCN,returning]);
});

test('partial shop confirmation preserves returning inventory; exhaustive confirmation replaces it', () => {
  const skins = [fixtureSkin('A','New'),fixtureSkin('B','Returning')];
  const events = [{name:'Event',year:2026,poster:null,cn:{dateRange:null,note:null},global:{dateRange:'2026/10/14–2026/10/28',note:null},tw:{dateRange:null,note:null}}];
  const rotations = { entries: [{ event:'Event',eventStart:'2026-05-01',rotations:[{label:'Shop',start:'2026-05-01',end:'2026-05-29',new:['A / New'],returning:['B / Returning']}] }] };
  const verified = { event:'Event',kind:'shop',label:'New',startAt:'2026-10-14T15:00:00Z',endAt:'2026-11-11T11:00:00Z',skinIds:['A / New'] };
  const partial = getSkinWindows(skins,events,{confirmed:{entries:[verified]},rotations});
  assert.deepEqual(partial.filter(window => window.estimated).flatMap(window => window.skinIds), ['B / Returning']);
  assert.equal(getSkinWindows(skins,events,{confirmed:{entries:[{...verified,inventoryComplete:true}]},rotations}).length,1);
});
