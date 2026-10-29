import assert from 'node:assert/strict';
import { test } from 'node:test';
import baseFormulas from '../../data/base-formulas.json';
import battleRecords from '../../data/battle-records.json';
import catalogue from '../../data/material-catalogue.json';
import eventsTable from '../../data/farming-events.json';
import { createCraftTools, type Formula } from '../../lib/planner/craft';
import { incomingFor, parseFarmingMethod, NO_FARMING_METHOD, type FarmingEventsTable, type PermanentRewardsTable } from '../../lib/planner/farmingMethod';
import { buildFarmingEvents } from '../build/build-farming-events';
import { planBuild } from '../../lib/planner/build';

/*
 * The Farming method: the events up to a date count as materials on their way (lib/planner/farmingMethod.ts),
 * beside the depot and never in it, so a Build still spends only what is held.
 */
const tools = createCraftTools(baseFormulas as unknown as Record<string, Formula>, battleRecords, catalogue.order);
const T: FarmingEventsTable = {
  banners: [{ name: 'Banner A', end: '2026-11-20' }],
  events: [
    { name: 'Open now', start: '2026-10-20', end: '2026-11-03', estimated: false, free: { Orirock: 10 }, shop: { limited: { 'Orirock Cube': 4 }, unlimited: ['Loxic Kohl'] } },
    { name: 'Next week', start: '2026-11-10', end: '2026-11-24', estimated: true, free: { Orirock: 5 }, shop: { limited: {}, unlimited: [] } },
    { name: 'After', start: '2026-12-01', end: '2026-12-10', estimated: true, free: { Orirock: 99 }, shop: { limited: {}, unlimited: [] } },
    { name: 'Over', start: '2026-09-01', end: '2026-09-10', estimated: false, free: { Orirock: 7 }, shop: { limited: {}, unlimited: [] } },
  ],
};
const NOW = Date.parse('2026-10-29T12:00:00Z');
const NONE = { table: { modes: [] }, claimed: new Set<string>() };
/** What arrives, summed per material, whatever the dates. */
const sums = (incoming: { arrivals: Record<string, readonly { count: number }[]> }) => Object.fromEntries(Object.entries(incoming.arrivals).map(([name, list]) => [name, list.reduce((n, t) => n + t.count, 0)]));
const method = (over: object = {}) => parseFarmingMethod({ until: { mode: 'date', date: '2026-11-20' }, ...over });

test('events open or opening by the date count, once, and an ended or later one does not', () => {
  const got = incomingFor(method(), T, NOW, NONE)!;
  assert.deepEqual(got.events.map((e) => e.name), ['Open now', 'Next week']);
  assert.deepEqual(sums(got.incoming), { Orirock: 15 }, 'free materials only, summed across events');
  assert.deepEqual(got.incoming.arrivals.Orirock, [{ date: '2026-11-03', count: 10 }, { date: '2026-11-24', count: 5 }], 'each tranche dated by the end of its event');
  // The date's own day counts through its end.
  assert.equal(incomingFor(method({ until: { mode: 'date', date: '2026-11-10' } }), T, NOW, NONE)!.events.length, 2);
  assert.equal(incomingFor(method({ until: { mode: 'date', date: '2026-11-09' } }), T, NOW, NONE)!.events.length, 1);
});

test('a banner sets the date by its last day; off, or a banner no longer listed, counts nothing', () => {
  assert.equal(incomingFor(method({ until: { mode: 'banner', banner: 'Banner A' } }), T, NOW, NONE)!.events.length, 2);
  assert.equal(incomingFor(method({ until: { mode: 'banner', banner: 'Gone' } }), T, NOW, NONE), null);
  assert.equal(incomingFor(NO_FARMING_METHOD, T, NOW, NONE), null);
});

test('the two shop toggles add the limited stock, and name the unlimited materials', () => {
  assert.deepEqual(sums(incomingFor(method({ shop: true }), T, NOW, NONE)!.incoming), { Orirock: 15, 'Orirock Cube': 4 });
  assert.deepEqual([...incomingFor(method({ shop: true }), T, NOW, NONE)!.incoming.unlimited], []);
  assert.deepEqual([...incomingFor(method({ unlimitedShop: true }), T, NOW, NONE)!.incoming.unlimited], [['Loxic Kohl', '2026-11-03']], 'from the end of the first event that sells it');
});

test('stored values that are not understood read as the feature off', () => {
  for (const bad of [null, 'x', [], { until: { mode: 'date', date: 'tomorrow' } }, { until: { mode: 'banner', banner: 5 } }, { until: { mode: 'date', date: '2026-02-31x' } }]) {
    assert.deepEqual(parseFarmingMethod(bad), NO_FARMING_METHOD);
  }
  assert.deepEqual(parseFarmingMethod({ until: { mode: 'date', date: '2026-11-20' }, shop: 'yes', unlimitedShop: true }), { until: { mode: 'date', date: '2026-11-20' }, permanent: [], shop: false, unlimitedShop: true });
});

test('incoming covers what the depot did not, ahead of a bench, and is never in the stock', () => {
  const need = [{ name: 'Orirock Cube', quantity: 10 }];
  const res = tools.resolveNeeds(need, { 'Orirock Cube': 3 }, { incoming: { arrivals: { 'Orirock Cube': [{ date: '2026-11-03', count: 4 }] }, unlimited: new Map() }, autoCraft: false });
  const row = res.rows[0];
  assert.equal(row.fromDepot, 3);
  assert.equal(row.fromIncoming, 4);
  assert.equal(row.short, 3);
  assert.equal(row.coverage, 'short');
  assert.deepEqual(res.stock, {}, 'the depot after it: what was held is spent, what is coming is not in it');
  const covered = tools.resolveNeeds(need, { 'Orirock Cube': 3 }, { incoming: { arrivals: { 'Orirock Cube': [{ date: '2026-11-03', count: 7 }] }, unlimited: new Map() }, autoCraft: false });
  assert.equal(covered.rows[0].coverage, 'incoming');
  assert.equal(covered.rows[0].readyBy, '2026-11-03', 'dated by the tranche it drew on');
  assert.equal(covered.rows[0].short, 0);
});

test('a store with no limit covers the rest of a material, and says how much', () => {
  const res = tools.resolveNeeds([{ name: 'Loxic Kohl', quantity: 8 }], { 'Loxic Kohl': 1 }, { incoming: { arrivals: {}, unlimited: new Map([['Loxic Kohl', '2026-11-24']]) }, autoCraft: false });
  assert.deepEqual([res.rows[0].fromIncoming, res.rows[0].fromUnlimited, res.rows[0].short], [7, 7, 0]);
  assert.equal(res.rows[0].readyBy, '2026-11-24');
});

test('a declared craft takes what is coming before it asks for ingredients', () => {
  const res = tools.resolveNeeds([{ name: 'Orirock Cluster', quantity: 2 }], {}, { crafting: new Set(['Orirock Cluster']), incoming: { arrivals: { 'Orirock Cluster': [{ date: null, count: 2 }] }, unlimited: new Map() }, autoCraft: false });
  assert.deepEqual(res.rows.map((r) => [r.name, r.coverage]), [['Orirock Cluster', 'incoming']]);
});

test('a build spends what is held and never what is coming', () => {
  const cost = [{ name: 'Orirock Cube', quantity: 5 }];
  assert.equal(planBuild(cost, { 'Orirock Cube': 2 }, { autoCraft: false }, tools).ok, false, 'incoming is not a depot');
  const ok = planBuild(cost, { 'Orirock Cube': 5 }, { autoCraft: false }, tools);
  assert.equal(ok.ok, true);
});

test('the committed table has dated events and counts, and the build refuses an undated one', () => {
  const t = eventsTable as unknown as FarmingEventsTable;
  assert.ok(t.events.length > 0 && t.banners.length > 0);
  for (const event of t.events) {
    assert.match(event.start, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(event.end >= event.start, `${event.name} ends after it starts`);
    // Not checked against the material catalogue: that is a release table of its own, regenerated every
    // content run, and a material it drops (a CN-only one) is harmless here: a plan cannot cost it.
    for (const [name, count] of Object.entries(event.free)) assert.ok(count > 0, `${event.name}: ${name} is a count`);
  }
  const calendar = [{ name: 'E', start: new Date('2026-11-01T00:00:00Z'), end: new Date('2026-11-10T00:00:00Z'), isPredicted: false }];
  const inputs = { calendar, rewards: { events: {} }, stores: { events: {} }, banners: [], materials: new Set(['Orirock']), today: '2026-10-29' };
  assert.throws(() => buildFarmingEvents({ ...inputs, rewards: { events: { Dateless: { groups: [] } } } }), /no place in the calendar/);
  const built = buildFarmingEvents({
    ...inputs,
    rewards: { events: { E: { groups: [{ kind: 'login', items: [{ name: 'Orirock', count: 3, kind: 'material' }, { name: 'Token', count: 1, kind: 'material' }] }, { kind: 'packs', items: [{ name: 'Orirock', count: 50, kind: 'material' }] }] } } },
    stores: { events: { E: { stores: [{ items: [{ name: 'Orirock', type: 'material', quantity: 2, stock: '5' }, { name: 'Orirock', type: 'material', quantity: 1, stock: 'unlimited' }, { name: 'Chair', type: 'furniture', quantity: 1, stock: '1' }] }] } } },
  });
  assert.deepEqual(built.table.events[0].free, { Orirock: 3 }, 'login counts, packs (paid) do not, a token is not a material');
  assert.deepEqual(built.table.events[0].shop, { limited: { Orirock: 10 }, unlimited: ['Orirock'] });
  assert.deepEqual(built.dropped, ['Token']);
});

test('a shortfall is dated by the last tranche it needed, earliest first, and what is there now has no date', () => {
  const incoming = { arrivals: { 'Orirock Cube': [{ date: '2026-12-10', count: 5 }, { date: null, count: 2 }, { date: '2026-11-03', count: 4 }] }, unlimited: new Map() };
  const date = (quantity: number) => tools.resolveNeeds([{ name: 'Orirock Cube', quantity }], {}, { incoming, autoCraft: false }).rows[0].readyBy;
  assert.equal(date(2), undefined, 'covered by what is on hand: nothing to wait for');
  assert.equal(date(6), '2026-11-03', 'the second event is not needed');
  assert.equal(date(7), '2026-12-10', 'the third tranche is');
  // Two rows spending from one tranche do not both get all of it.
  const both = tools.resolveNeeds([{ name: 'Orirock Cube', quantity: 3 }, { name: 'Orirock Cube', quantity: 3 }], {}, { incoming, autoCraft: false });
  assert.equal(both.rows[0].fromIncoming, 6);
});

test('an unclaimed permanent reward counts as available now, a claimed one does not, a mode left off adds nothing', () => {
  const table: PermanentRewardsTable = { modes: [
    { id: 'is-2', label: 'IS2', kind: 'is', topic: 'rogue_2', global: true, rewards: [
      { id: 'bp_level_4', materials: { 'Orirock Cube': 3 } }, { id: 'bp_level_9', materials: { 'Orirock Cube': 2, Ester: 1 } } ] },
    { id: 'is-6', label: 'IS6', kind: 'is', topic: 'rogue_6', global: false, rewards: [{ id: 'bp_level_4', cn: true, materials: { Ester: 10 } }] },
  ] };
  const source = (claimed: string[]) => ({ table, claimed: new Set(claimed) });
  const off = parseFarmingMethod({ permanent: [] });
  assert.equal(incomingFor(off, T, NOW, source([])), null, 'nothing on: nothing counted');
  const on = parseFarmingMethod({ permanent: ['is-2'] });
  const got = incomingFor(on, T, NOW, source([]))!;
  assert.equal(got.until, null, 'no date set: only the permanent rewards');
  assert.deepEqual(got.events, []);
  assert.deepEqual(sums(got.incoming), { 'Orirock Cube': 5, Ester: 1 });
  assert.deepEqual(got.incoming.arrivals.Ester, [{ date: null, count: 1 }], 'no date: it is there now');
  assert.deepEqual(got.permanent, [{ id: 'is-2', label: 'IS2', rewards: 2, materials: 6, cn: 0 }]);
  const some = incomingFor(on, T, NOW, source(['is-2:bp_level_4']))!;
  assert.deepEqual(sums(some.incoming), { 'Orirock Cube': 2, Ester: 1 }, 'the claimed level leaves it');
  assert.equal(incomingFor(on, T, NOW, source(['is-6:bp_level_4']))!.permanent[0].rewards, 2, 'another mode\'s claim does not');
  // CN-only content counts when the reader turns it on, and is counted as such.
  assert.deepEqual(incomingFor(parseFarmingMethod({ permanent: ['is-6'] }), T, NOW, source([]))!.permanent[0], { id: 'is-6', label: 'IS6', rewards: 1, materials: 10, cn: 1 });
  // With a date as well, both add up and the event dates stay.
  const both = incomingFor(method({ permanent: ['is-2'] }), T, NOW, source([]))!;
  assert.deepEqual(sums(both.incoming), { Orirock: 15, 'Orirock Cube': 5, Ester: 1 });
  // Stored ids are untrusted.
  assert.deepEqual(parseFarmingMethod({ permanent: ['is-2', 5, '../x', 'is-2', 'sss'] }).permanent, ['is-2', 'sss']);
});
