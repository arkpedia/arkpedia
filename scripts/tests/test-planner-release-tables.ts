import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkItemSortIds, inGameOrder } from '../../lib/farming/materialSortOrder';
import type { MaterialCatalogue } from '../../lib/farming/materialCatalogue.mjs';
import type { FarmingTier } from '../../lib/farming/farmingTypes';
import { createCraftTools } from '../../lib/planner/craft';
import { checkImportAliases, parseForeign, type ImportAliases } from '../../lib/planner/foreignImport';
import { computeLevelCost, computeLevelCostRemaining, type LevelTable } from '../../lib/planner/plannerLogic';
import { createSourceTools } from '../../lib/planner/sources';
import { contentPageClock } from '../../lib/content/pageClock';
import { isReleasedAt, releaseMarker } from '../../lib/operators/operatorAvailability';

/*
 * The planner answers from the tables its page props carry, not from copies compiled
 * into its chunk. Each case hands in a made-up release table that says something the
 * deployed data/ does not, and expects the answer to follow it.
 */

/* A made-up release catalogue: what the planner holds is whatever the release says. */
const holdable = ['LMD', 'Release Material', 'Orirock Cube', 'Orirock'];
const catalogue: MaterialCatalogue = {
  version: 1, order: ['EXP', ...holdable], groups: [{ tag: 'Currency, records & chips', names: ['LMD'] }, { tag: 'Tier 3', names: ['Release Material'] }, { tag: 'Tier 2', names: ['Orirock Cube'] }, { tag: 'Tier 1', names: ['Orirock'] }],
  items: Object.fromEntries(holdable.map((name, i) => [name, { itemId: `id${i}`, tier: 1, client: 'EN' as const }])),
};

test('a stage the release\'s farming guide names is where the planner sends you', () => {
  const guide: FarmingTier[] = [{ tier: 3, materials: [{ name: 'Release Material', icon: '/material-icons/Release Material.webp', stages: [{ label: 'RL-1', kind: 'efficient' }, { label: 'Event Store', kind: 'plain' }] }] }];
  const { formulaFor } = createCraftTools({}, [], catalogue.order);
  const tools = createSourceTools({}, formulaFor, guide);
  assert.deepEqual(tools.sourceFor('Release Material'), { kind: 'farm', stages: ['RL-1'] });
  assert.deepEqual(tools.stagesToRun(['Release Material']), { codes: ['RL-1'], covers: 1 });
  // A guide without it: the same material has nowhere listed.
  assert.equal(createSourceTools({}, formulaFor, []).sourceFor('Release Material').kind, 'unknown');
});

test('level costs come from the release\'s level table', () => {
  const levels: LevelTable = { Elite0: { 2: { EXP: 100, LMD: 10 }, 3: { EXP: 200, LMD: 20 } } };
  assert.deepEqual(computeLevelCost(levels, 3, 0, 3), { exp: 300, lmd: 30 });
  assert.deepEqual(computeLevelCostRemaining(levels, 3, 0, 2, 0, 3), { exp: 200, lmd: 20 });
  assert.deepEqual(computeLevelCost({ Elite0: {} }, 3, 0, 3), { exp: 0, lmd: 0 });
});

test('the depot follows the release\'s in-game order, and a missing sortId fails where the table is read', () => {
  const reversed = Object.fromEntries(holdable.map((name, i) => [name, holdable.length - i]));
  assert.deepEqual(inGameOrder(catalogue, reversed), [...holdable].reverse());
  assert.equal(checkItemSortIds(reversed, catalogue), reversed);
  const { LMD: _lmd, ...withoutLmd } = reversed;
  assert.throws(() => checkItemSortIds(withoutLmd, catalogue), /no sortId for LMD/);
  // In the browser the same gap only sorts last; it never throws there.
  assert.equal(inGameOrder(catalogue, withoutLmd).at(-1), 'LMD');
});

test('another planner\'s export reads with the release\'s item ids, and a disagreeing table fails where it is read', () => {
  const aliases: ImportAliases = { byItemId: Object.fromEntries(holdable.map((name, i) => [`id${i}`, name])), byArkgraph: { 'X-1': holdable[0] } };
  const csv = ['itemId,itemName,owned,needed', 'id0,Whatever,7,0'].join('\n');
  assert.deepEqual(parseForeign(csv, aliases)?.depot, { [holdable[0]]: 7 });
  assert.equal(parseForeign(csv, { byItemId: {}, byArkgraph: {} }), null);
  assert.equal(checkImportAliases(aliases, catalogue), aliases);
  assert.throws(() => checkImportAliases({ ...aliases, byArkgraph: { 'X-1': 'Not A Material' } }, catalogue), /Maps a name the catalogue does not have: Not A Material/);
  // A material the release's catalogue gained that the aliases never heard of fails too.
  assert.throws(() => checkImportAliases(aliases, { order: [...catalogue.order, 'Newer Material'] }), /No itemId for: Newer Material/);
});

test('the resolver walks the release\'s catalogue order, so a new material crafts with no redeploy', () => {
  /* Concentrated Power Unit, which Closure costs: one Electrode Unit, one Liquified
     High-Energy Gas and one Integrated Device at the Workshop (CN building_data 68). */
  const recipe = (costs: [string, number][]) => ({ type: 'F_EVOLVE', room: 'WORKSHOP', count: 1, lmd: 300, costs: costs.map(([name, count]) => ({ name, count })), byproducts: [], byproductRate: 0, alternatives: [] });
  const formulas = { 'Concentrated Power Unit': recipe([['Integrated Device', 1], ['Liquified High-Energy Gas', 1], ['Electrode Unit', 1]]) };
  const order = ['EXP', 'LMD', 'Concentrated Power Unit', 'Electrode Unit', 'Liquified High-Energy Gas', 'Integrated Device'];
  const tools = createCraftTools(formulas, [], order);
  const held = { 'Electrode Unit': 3, 'Liquified High-Energy Gas': 2, 'Integrated Device': 2, LMD: 10_000 };
  const res = tools.resolveNeeds([{ name: 'Concentrated Power Unit', quantity: 2 }, { name: 'Electrode Unit', quantity: 1 }], held, { autoCraft: true });
  const row = (name: string) => res.rows.find(r => r.name === name);
  assert.equal(row('Concentrated Power Unit')?.fromCrafting, 2);
  assert.equal(row('Concentrated Power Unit')?.short, 0);
  // Higher tier first: the crafts take two Electrode Units, and the bill's own row gets the third.
  assert.equal(row('Electrode Unit')?.short, 0);
  assert.equal(res.craftingLmd, 600);
  assert.equal(res.stock['Electrode Unit'], undefined, 'three held: one for the bill, two for the crafts');
  // With only two held, the higher tier still wins them and the bill's own row is the one short.
  const tight = tools.resolveNeeds([{ name: 'Concentrated Power Unit', quantity: 2 }, { name: 'Electrode Unit', quantity: 1 }], { ...held, 'Electrode Unit': 2 }, { autoCraft: true });
  assert.equal(tight.rows.find(r => r.name === 'Concentrated Power Unit')?.short, 0);
  assert.equal(tight.rows.find(r => r.name === 'Electrode Unit')?.short, 1);
});

test('a declared craft adds what it is made of, and each row says what its count is for', () => {
  /* The planner's Missing view (2026-10-03): ticking Craft on a material puts its ingredients
     in the list, and a material both the upgrades and a craft want says which part is which. */
  const recipe = (costs: [string, number][]) => ({ type: 'F_EVOLVE', room: 'WORKSHOP', count: 1, lmd: 300, costs: costs.map(([name, count]) => ({ name, count })), byproducts: [], byproductRate: 0, alternatives: [] });
  const formulas = { 'Concentrated Power Unit': recipe([['Integrated Device', 1], ['Liquified High-Energy Gas', 1], ['Electrode Unit', 1]]) };
  const order = ['EXP', 'LMD', 'Concentrated Power Unit', 'Electrode Unit', 'Liquified High-Energy Gas', 'Integrated Device'];
  const tools = createCraftTools(formulas, [], order);
  const bill = [{ name: 'Concentrated Power Unit', quantity: 2 }, { name: 'Electrode Unit', quantity: 1 }];
  // Raw only: nothing is crafted unasked, and nothing is listed for a craft.
  const raw = tools.resolveNeeds(bill, {}, { autoCraft: false });
  assert.deepEqual(raw.rows.map(r => [r.name, r.need, r.direct, r.forCrafts]), [['Concentrated Power Unit', 2, 2, undefined], ['Electrode Unit', 1, 1, undefined]]);
  // Craft declared: its ingredients join the list, and Electrode Unit is wanted for both.
  const res = tools.resolveNeeds(bill, { 'Electrode Unit': 1 }, { autoCraft: false, crafting: new Set(['Concentrated Power Unit']) });
  const row = (name: string) => res.rows.find(r => r.name === name)!;
  assert.equal(row('Concentrated Power Unit').coverage, 'crafting');
  assert.equal(row('Concentrated Power Unit').fromCrafting, 2);
  assert.deepEqual([row('Electrode Unit').need, row('Electrode Unit').direct, row('Electrode Unit').forCrafts], [3, 1, { 'Concentrated Power Unit': 2 }]);
  assert.equal(row('Electrode Unit').short, 2, 'one held, of three: one for the upgrades and two for the crafts');
  assert.deepEqual([row('Integrated Device').direct, row('Integrated Device').forCrafts, row('Integrated Device').viaCrafting], [0, { 'Concentrated Power Unit': 2 }, true]);
});

test('the planner picker is judged per request from release markers, not at export', () => {
  // The export carries no clock; every request gets its `now`, rounded to the minute.
  assert.deepEqual(contentPageClock('/planner', { operators: [] }, { exporting: true }), { operators: [] });
  assert.equal((contentPageClock('/planner', { operators: [] }, { now: Date.UTC(2026, 9, 14, 12, 0, 30) }) as { now?: number }).now, Date.UTC(2026, 9, 14, 12, 0));
  // Closure's record: Global date 2026/10/14 (UTC-7), so plannable from the day after, never before.
  const closure = releaseMarker({ characterInfo: { 'Release Date': '2026/10/14' } });
  assert.equal(isReleasedAt(closure, Date.UTC(2026, 8, 25)), false);
  assert.equal(isReleasedAt(closure, Date.UTC(2026, 9, 15, 8)), true);
  // A payload from before markers was filtered at export, so it stays as it was.
  assert.equal(isReleasedAt({}, 0), true);
});
