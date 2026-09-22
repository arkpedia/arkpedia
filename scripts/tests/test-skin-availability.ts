import assert from 'node:assert/strict';
import test from 'node:test';
import skins from '../../data/skins.json';
import confirmed from '../../data/skin-availability-windows.json';
import { compareCurrentSkins, computeSkinCountdowns, getSkinWindows, skinKey, type SkinWindow } from '../../lib/skins/skinAvailability';
import { getAllEvents } from '../../lib/schedule/schedule';
import type { Skin } from '../../lib/skins/skinTypes';

const catalogue = skins as Skin[];
const events = getAllEvents();
const at = (time: string) => computeSkinCountdowns(catalogue, events, new Date(time));

test('all verified inventory entries resolve exactly once in the catalogue', () => {
  for (const window of confirmed.entries) {
    assert(Date.parse(window.endAt) > Date.parse(window.startAt));
    assert.equal(new Set(window.skinIds).size, window.skinIds.length);
    for (const id of window.skinIds) assert.equal(catalogue.filter(skin => skinKey(skin) === id).length, 1, id);
  }
  assert.deepEqual(confirmed.entries.filter(window => window.kind === 'draw').map(window => window.skinIds.length), [16, 18]);
});

test('current Global inventory includes returns, reward reissues and the two draw pools', () => {
  const result = at('2026-09-22T12:00:00Z');
  const current = [...result.values()].filter(window => window.live);
  assert.equal(current.length, 42);
  assert.equal(current.filter(window => window.kind === 'shop').length, 6);
  assert.equal(current.filter(window => window.kind === 'reward').length, 2);
  assert.equal(current.filter(window => window.kind === 'draw').length, 34);
  assert.equal(result.get('Mousse / Hydration Time')?.kind, 'reward');
  assert.equal(result.get('Ethan / Infiltrator')?.label, 'Event exchange');
  assert.equal(result.get('Qiubai / Courtesy')?.endAt, '2026-09-24T11:00:00Z');
  assert.equal(result.get('Saria / The Law')?.kind, 'draw');
});

test('sales open at the announced instant and expire at the exclusive server reset', () => {
  assert.equal(at('2026-09-10T14:59:59Z').get('Qiubai / Courtesy')?.live, false);
  assert.equal(at('2026-09-10T15:00:00Z').get('Qiubai / Courtesy')?.live, true);
  assert.equal(at('2026-09-24T10:59:59Z').get('Qiubai / Courtesy')?.live, true);
  assert.notEqual(at('2026-09-24T11:00:00Z').get('Qiubai / Courtesy')?.live, true);
  assert.equal(at('2026-10-03T12:00:00Z').get('Mousse / Hydration Time')?.live, true);
  assert.notEqual(at('2026-10-04T11:00:00Z').get('Mousse / Hydration Time')?.live, true);
  assert.equal(at('2026-10-06T12:00:00Z').get('Surtr / Prelude to Transcendence')?.live, true);
  assert.notEqual(at('2026-10-07T11:00:00Z').get('Surtr / Prelude to Transcendence')?.live, true);
});

test('CN schedules, release matches and Fashion Review flags never establish live stock', () => {
  const current = at('2026-09-22T12:00:00Z');
  assert([...current.values()].filter(window => window.live).every(window => !window.estimated));
  assert.notEqual(current.get('Kal\'tsit / Remnant')?.live, true);
  const forecasts = getSkinWindows(catalogue, events).filter(window => window.estimated);
  assert(forecasts.length > 0);
  const window = forecasts[0];
  const result = computeSkinCountdowns(catalogue, events, new Date(window.startAt), [window]);
  assert.equal(result.size, 0);
});

test('outfits with the same name remain distinct and direct purchase beats a draw', () => {
  const window: SkinWindow = { event: 'Example', kind: 'draw', label: 'Pool', startAt: '2026-09-01T15:00:00Z', endAt: '2026-10-01T11:00:00Z', skinIds: ['A / Shared', 'B / Shared'] };
  const result = computeSkinCountdowns([], [], new Date('2026-09-22T12:00:00Z'), [window, { ...window, kind: 'shop', skinIds: ['A / Shared'] }]);
  assert.equal(result.get('A / Shared')?.kind, 'shop');
  assert.equal(result.get('B / Shared')?.kind, 'draw');
});

test('expired build flags cannot revive a closed shop', () => {
  const stale = catalogue.map(skin => ({ ...skin, availableNow: true, availableDate: '2026-09-01' }));
  const result = computeSkinCountdowns(stale, [], new Date('2027-01-01T00:00:00Z'));
  assert.equal([...result.values()].filter(window => window.live).length, 0);
});

test('new current outfits lead reissues, including older published window metadata', () => {
  const result = at('2026-09-22T12:00:00Z');
  for (const legacy of [false, true]) {
    if (legacy) for (const window of result.values()) delete window.newRelease;
    const direct = catalogue.filter(skin => { const window = result.get(skinKey(skin)); return window?.live && window.kind !== 'draw'; })
      .sort((a, b) => compareCurrentSkins(a, b, result));
    assert.deepEqual(direct.slice(0, 3).map(skinKey), ['Surtr / Prelude to Transcendence', 'Nymph / Blooming Reverie', 'Mousse / Hydration Time']);
    assert(direct.findIndex(skin => skin.model === 'Ethan') >= 3);
    assert(direct.findIndex(skin => skin.model === 'Qiubai') >= 3);
  }
});
