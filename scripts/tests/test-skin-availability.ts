import assert from 'node:assert/strict';
import test from 'node:test';
import skins from '../../data/skins.json';
import confirmed from '../../data/skin-availability-windows.json';
import { compareCurrentSkins, computeSkinCountdowns, getSkinWindows, skinKey, type SkinWindow } from '../../lib/skins/skinAvailability';
import { getAllEvents } from '../../lib/schedule/schedule';
import type { Skin } from '../../lib/skins/skinTypes';

const catalogue = skins as Skin[];
const events = getAllEvents();
const windows = getSkinWindows(catalogue, events);
// computeSkinCountdowns's default, worked out once: the windows do not depend on the instant.
const at = (time: string) => computeSkinCountdowns(catalogue, events, new Date(time), windows);
const verified = confirmed.entries as SkinWindow[];

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
  { event: 'Fixture', kind: 'draw', label: 'Pool', startAt: '2026-09-10T15:00:00Z', endAt: '2026-10-01T11:00:00Z', skinIds: ['A / New', 'B / Drawn'] },
  // A reissue that opened after the new outfits: by date alone it would come first.
  { event: 'Fixture', kind: 'shop', label: 'Returning outfits', startAt: '2026-09-18T15:00:00Z', endAt: '2026-09-24T11:00:00Z', skinIds: ['C / Old'], newRelease: false },
  { event: 'Fixture', kind: 'shop', label: 'Projected', startAt: '2026-09-01T15:00:00Z', endAt: '2026-10-01T11:00:00Z', skinIds: ['D / Forecast'], estimated: true },
  { event: 'Fixture', kind: 'shop', label: 'Closed', startAt: '2026-08-01T15:00:00Z', endAt: '2026-08-15T11:00:00Z', skinIds: ['E / Gone'] },
];
const openAt = (entries: SkinWindow[], time: string) => entries.filter(window => !window.estimated && Date.parse(window.startAt) <= Date.parse(time) && Date.parse(time) < Date.parse(window.endAt));

test('only verified windows open at an instant are live, with direct purchase ahead of a draw', () => {
  const result = computeSkinCountdowns([], [], new Date(instant), fixture);
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
  const window: SkinWindow = { event: 'Example', kind: 'shop', label: 'Returning outfits', startAt: '2026-09-10T15:00:00Z', endAt: '2026-09-24T11:00:00Z', skinIds: ['A / Outfit'] };
  const live = (time: string) => computeSkinCountdowns([], [], new Date(time), [window]).get('A / Outfit')?.live;
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
  const forecast: SkinWindow = { event: 'Example', kind: 'shop', label: 'Projected', startAt: '2026-09-01T15:00:00Z', endAt: '2026-10-01T11:00:00Z', skinIds: ['A / Outfit'], estimated: true };
  assert.equal(computeSkinCountdowns([], [], new Date(instant), [forecast]).size, 0);
  // Whatever the data holds, at any instant it names, nothing live is a forecast.
  for (const time of new Set(verified.map(window => window.startAt))) {
    assert([...at(time).values()].filter(window => window.live).every(window => !window.estimated), time);
  }
  // Every projected window the data produces is a forecast only, whenever it opens.
  for (const window of windows.filter(window => window.estimated)) {
    assert.equal(computeSkinCountdowns(catalogue, events, new Date(window.startAt), [window]).size, 0, window.label);
  }
});

test('outfits with the same name remain distinct and direct purchase beats a draw', () => {
  const window: SkinWindow = { event: 'Example', kind: 'draw', label: 'Pool', startAt: '2026-09-01T15:00:00Z', endAt: '2026-10-01T11:00:00Z', skinIds: ['A / Shared', 'B / Shared'] };
  const result = computeSkinCountdowns([], [], new Date('2026-09-22T12:00:00Z'), [window, { ...window, kind: 'shop', skinIds: ['A / Shared'] }]);
  assert.equal(result.get('A / Shared')?.kind, 'shop');
  assert.equal(result.get('B / Shared')?.kind, 'draw');
});

test('expired build flags cannot revive a closed shop', () => {
  const stale = (list: Skin[]) => list.map(skin => ({ ...skin, availableNow: true, availableDate: '2026-09-01' }));
  const fixtureSkins = ['A / New', 'B / Drawn', 'C / Old', 'E / Gone'].map(id => fixtureSkin(...id.split(' / ') as [string, string]));
  assert.equal([...computeSkinCountdowns(stale(fixtureSkins), [], new Date('2026-12-01T00:00:00Z'), fixture).values()].filter(window => window.live).length, 0);
  // The whole catalogue, a day after the last window the data knows of has closed.
  const after = new Date(Math.max(...windows.map(window => Date.parse(window.endAt))) + 86_400_000);
  assert.equal([...computeSkinCountdowns(stale(catalogue), [], after).values()].filter(window => window.live).length, 0);
});

test('new current outfits lead reissues', () => {
  const fixtureSkins = ['C / Old', 'B / Drawn', 'A / New'].map(id => fixtureSkin(...id.split(' / ') as [string, string]));
  const result = computeSkinCountdowns(fixtureSkins, [], new Date(instant), fixture);
  const direct = fixtureSkins.filter(skin => { const window = result.get(skinKey(skin)); return window?.live && window.kind !== 'draw'; })
    .sort((a, b) => compareCurrentSkins(a, b, result));
  assert.deepEqual(direct.map(skinKey), ['A / New', 'C / Old']);
});

/* An older published payload has no newRelease on its windows, so the comparison falls back
   to the verified windows the build ships with: checked on one the data holds, at its own
   opening. A data set with no such window has nothing to check. */
const released = verified.filter(window => window.newRelease && window.kind !== 'draw').sort((a, b) => Date.parse(b.startAt) - Date.parse(a.startAt))[0];
test('new current outfits lead reissues in older published window metadata too', { skip: !released && 'the data has no verified new-release sale' }, () => {
  // A reissue opening an hour after the new outfits, which by date alone would lead.
  const opening = Date.parse(released.startAt);
  const reissue: SkinWindow = { event: 'Fixture', kind: 'shop', label: 'Returning outfits', startAt: new Date(opening + 3_600_000).toISOString(),
    endAt: released.endAt, skinIds: ['Z / Reissue'] };
  const list = [fixtureSkin('Z', 'Reissue'), ...catalogue.filter(skin => released.skinIds.includes(skinKey(skin)))];
  const result = computeSkinCountdowns(list, [], new Date(opening + 7_200_000), [reissue, released]);
  for (const window of result.values()) delete window.newRelease;
  const direct = list.filter(skin => result.get(skinKey(skin))?.live).sort((a, b) => compareCurrentSkins(a, b, result));
  assert.deepEqual(direct.map(skinKey).slice(0, -1).sort(), [...released.skinIds].sort());
  assert.equal(skinKey(direct.at(-1)!), 'Z / Reissue', 'the reissue comes after every new outfit');
});
