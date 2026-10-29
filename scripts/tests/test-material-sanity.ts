import assert from 'node:assert/strict';
import { test } from 'node:test';
import baseFormulas from '../../data/base-formulas.json';
import sanityTable from '../../data/material-sanity.json';
import { MIN_RUNS, materialSanity } from '../build/build-material-sanity.mjs';
import { createSanityTools, type MaterialSanityTable } from '../../lib/planner/sanity';

/*
 * The planner's sanity estimate (scripts/build/build-material-sanity.mjs, lib/planner/sanity.ts):
 * the cheapest stage by Penguin Statistics' measured rates, or the craft from cheaper tiers
 * when that costs less, never a stage that has closed, never one with too few runs behind it.
 */
const items = [
  { itemId: '1', name_i18n: { en: 'Cube' } },
  { itemId: '2', name_i18n: { en: 'Cluster' } },
  { itemId: '3', name_i18n: { en: 'Event token' } },
];
const stages = [
  { stageId: 'a', code: '1-7', apCost: 6, stageType: 'MAIN' },
  { stageId: 'b', code: '2-9', apCost: 15, stageType: 'MAIN' },
  { stageId: 'ev', code: 'EV-1', apCost: 9, stageType: 'ACTIVITY' },
];
const row = (stageId: string, itemId: string, times: number, quantity: number, end: number | null = null) => ({ stageId, itemId, times, quantity, end });
const formulas = {
  Cluster: { type: 'F_EVOLVE', room: 'WORKSHOP', count: 1, lmd: 100, costs: [{ name: 'Cube', count: 5 }, { name: 'LMD', count: 100 }], byproducts: [], byproductRate: 0, alternatives: [] },
  Dualchip: { type: 'MANUFACTURE', room: 'FACTORY', count: 1, lmd: 0, costs: [{ name: 'Cube', count: 2 }], byproducts: [], byproductRate: 0, alternatives: [] },
} as never;
const price = (matrix: ReturnType<typeof row>[], names = ['Cube', 'Cluster', 'Event token', 'Dualchip']) =>
  materialSanity({ matrix, stages, items, formulas, names });

test('a material costs the cheapest stage\'s sanity per drop, and a craft is priced from its ingredients', () => {
  const got = price([row('a', '1', 1000, 1250), row('b', '1', 1000, 2000), row('a', '2', 1000, 10)]);
  assert.deepEqual(got.Cube, { sanity: 4.8, via: 'farm', stage: '1-7' }, '6 sanity over 1.25 drops');
  // The stage drops a Cluster at 600 sanity each; five Cubes at 4.8 make one for 24.
  assert.deepEqual(got.Cluster, { sanity: 24, via: 'craft' });
});

test('a closed window, an event stage and a thin sample do not price anything', () => {
  const got = price([row('a', '1', 1000, 1250, 1_700_000_000_000), row('ev', '3', 5000, 5000), row('b', '3', MIN_RUNS - 1, 1000)]);
  assert.deepEqual(got, {}, 'nothing priced');
});

test('a chip pack costs the cheaper of its stage and converting another class\'s, the trade being a cycle', () => {
  const trade = (from: string) => ({ type: 'F_ASC', room: 'WORKSHOP', count: 2, lmd: 0, costs: [{ name: from, count: 3 }], byproducts: [], byproductRate: 0, alternatives: [] });
  const chips = { PackA: trade('PackB'), PackB: trade('PackA'), PackC: trade('PackA') } as never;
  const chipItems = [{ itemId: 'a', name_i18n: { en: 'PackA' } }, { itemId: 'b', name_i18n: { en: 'PackB' } }];
  const run = (matrix: ReturnType<typeof row>[], names: string[]) => materialSanity({ matrix, stages, items: chipItems, formulas: chips, names });
  // A drops at 10 sanity, B at 100: B is cheaper converted from A (3 for 2 -> 15) than farmed. A stays at its stage.
  const got = run([row('a', 'a', 1000, 600), row('a', 'b', 1000, 60)], ['PackA', 'PackB', 'PackC']);
  assert.deepEqual(got.PackA, { sanity: 10, via: 'farm', stage: '1-7' });
  assert.deepEqual(got.PackB, { sanity: 15, via: 'convert' });
  // A pack no stage drops is priced from a class that has one, and the cycle ends.
  assert.deepEqual(got.PackC, { sanity: 15, via: 'convert' });
  // Where a stage is already as cheap as a conversion, the stage stays.
  assert.equal(run([row('a', 'a', 1000, 600), row('a', 'b', 1000, 600)], ['PackA', 'PackB']).PackB.via, 'farm');
});

test('only the recipes the planner walks price a craft; no source means no entry', () => {
  const got = price([row('a', '1', 1000, 1250)]);
  assert.equal(got.Dualchip, undefined, 'a Dualchip is a factory recipe, not a tier step');
  assert.equal(got['Event token'], undefined);
  assert.equal(price([row('a', '2', 1000, 10)]).Cluster.via, 'farm');
});

test('the committed table is Penguin\'s, names real materials, and prices each sensibly', () => {
  const table = sanityTable as unknown as MaterialSanityTable;
  assert.equal(table.source.name, 'Penguin Statistics');
  assert.ok(Object.keys(table.items).length >= 40, 'most of the catalogue is priced');
  for (const [name, entry] of Object.entries(table.items)) {
    assert.ok(entry.sanity > 0 && Number.isFinite(entry.sanity), `${name} has a positive cost`);
    assert.ok(entry.via === 'farm' ? !!entry.stage : !entry.stage, `${name}: a farm names its stage, a craft does not`);
  }
  // A craft never costs more than the stage that drops it, since the cheaper of the two is kept.
  for (const [name, entry] of Object.entries(table.items)) {
    const recipe = (baseFormulas as Record<string, { type: string; count: number; costs: { name: string; count: number }[] }>)[name];
    if (entry.via !== 'craft' || !recipe) continue;
    const cost = recipe.costs.filter((c) => c.name !== 'LMD').reduce((n, c) => n + c.count * (table.items[c.name]?.sanity ?? Infinity), 0) / recipe.count;
    assert.ok(Math.abs(cost - entry.sanity) < 0.2, `${name}: ${entry.sanity} is the sum of what it is crafted from (${cost.toFixed(1)})`);
  }
});

test('the planner adds up only what is short, and names what has no estimate', () => {
  const tools = createSanityTools({ source: { name: 'Penguin Statistics', url: 'https://penguin-stats.io', server: 'US', minRuns: 300, fetchedAt: '2026-10-29' },
    items: { Orirock: { sanity: 4.8, via: 'farm', stage: '1-7' } } });
  const got = tools.sanityFor([{ name: 'Orirock', short: 10 }, { name: 'Chip Catalyst', short: 3 }, { name: 'Orirock', short: 0 }]);
  assert.equal(got.total, 48);
  assert.deepEqual(got.uncounted, ['Chip Catalyst']);
  assert.equal(tools.unitSanity('toString'), null, 'a prototype key is not a material');
});
