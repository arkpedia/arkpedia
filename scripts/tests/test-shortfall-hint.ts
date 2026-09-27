import assert from 'node:assert/strict';
import { test } from 'node:test';
import baseFormulas from '../../data/base-formulas.json';
import battleRecords from '../../data/battle-records.json';
import supplyStages from '../../data/supply-stages.json';
import farmingTiers from '../../data/farming-tiers.json';
import catalogue from '../../data/material-catalogue.json';
import { createCraftTools, type Formula } from '../../lib/planner/craft';
import { createSourceTools } from '../../lib/planner/sources';
import type { FarmingTier } from '../../lib/farming/farmingTypes';
import { shortfallHint } from '../../lib/planner/shortfallHint';

/*
 * The sentence under the planner's shortfall cards (lib/planner/shortfallHint.ts), from
 * the tables the page reads. "None of these can be made at the bench, so every one of
 * them is a run or a shop." was shown with a Guard Dualchip short, whose card said
 * "Factory recipe" (2026-09-27): a recipe the planner does not walk is still a bench.
 */
const craft = createCraftTools(baseFormulas as unknown as Record<string, Formula>, battleRecords, catalogue.order);
const tools = { ...craft, ...createSourceTools(supplyStages as Record<string, string[]>, craft.formulaFor, farmingTiers as FarmingTier[]) };
const short = (...names: string[]) => names.map((name) => ({ name, short: 3 }));
/** The first material in the tables with this source kind that the resolver does not walk. */
const firstOf = (kind: string, pick: (name: string) => boolean = () => true) => {
  const names = [...catalogue.order].filter((n) => n !== 'LMD' && n !== 'EXP');
  const name = names.find((n) => tools.sourceFor(n).kind === kind && !tools.isCraftable(n) && pick(n));
  assert.ok(name, `the tables have a ${kind} material`);
  return name!;
};

test('the tables still say what these cases rest on', () => {
  assert.equal(tools.sourceFor('Guard Dualchip').kind, 'factory');
  assert.equal(tools.isCraftable('Guard Dualchip'), false, 'the resolver does not walk a Dualchip');
  assert.ok(tools.formulaFor('Guard Dualchip'), 'but a Dualchip has a recipe');
});

test('a short Dualchip is made in the Factory, not a run or a shop', () => {
  const hint = shortfallHint(short('Guard Dualchip'), {}, null, tools);
  assert.doesNotMatch(hint, /None of these can be made at the bench/);
  assert.doesNotMatch(hint, /run or a shop/);
  assert.equal(hint, 'Guard Dualchip is made in the Factory by a recipe the planner will not follow for you — open it to see the recipe.');
  assert.equal(shortfallHint(short('Guard Dualchip', 'Vanguard Dualchip'), {}, 'LMD and EXP', tools),
    'Both are made in the Factory by recipes the planner will not follow for you — open one to see its recipe.');
});

test('a class trade with no stage is made in the Workshop', () => {
  const chip = firstOf('workshop');
  assert.match(shortfallHint(short(chip), {}, null, tools), new RegExp(`^${chip} is made in the Workshop by a recipe`));
  assert.match(shortfallHint(short('Guard Dualchip', chip), {}, null, tools), /^Both are made in the Factory or the Workshop by recipes/);
});

test('bench-made and the rest are counted apart, and the rest named by route', () => {
  const farm = firstOf('farm');
  const shop = ['certificate', 'event'].map((kind) => [...catalogue.order].find((n) => tools.sourceFor(n).kind === kind && !tools.isCraftable(n))).find(Boolean)!;
  assert.ok(shop, 'the tables have a shop material');
  assert.equal(shortfallHint(short('Guard Dualchip', farm), {}, null, tools),
    'Guard Dualchip is made in the Factory by a recipe the planner will not follow for you — open it to see the recipe. The other one is a run.');
  assert.equal(shortfallHint(short('Guard Dualchip', 'Vanguard Dualchip', farm, shop), {}, null, tools),
    '2 of the 4 short are made in the Factory by recipes the planner will not follow for you — open one to see its recipe. The other 2 are runs or shops.');
});

test('"every one of them is a run or a shop" only when the cards say so', () => {
  const farm = firstOf('farm');
  assert.equal(shortfallHint(short(farm), {}, null, tools), 'None of these can be made at the bench, so every one of them is a run.');
  const unknown = { ...tools, sourceFor: (name: string) => (name === 'Mystery' ? { kind: 'unknown' as const } : tools.sourceFor(name)) };
  assert.equal(shortfallHint(short(farm, 'Mystery'), {}, null, unknown), 'None of these can be made at the bench, so every one of them is a run or found elsewhere.');
});

test('the walkable recipes keep their sentences', () => {
  // Orirock Cube is three Orirock at the Workshop; with none held it is blocked one level down.
  assert.equal(tools.isCraftable('Orirock Cube'), true);
  assert.equal(shortfallHint(short('Orirock Cube', 'Guard Dualchip'), {}, null, tools), '1 of the 2 short is craftable but blocked one level down — open a material to see its recipe.');
  assert.equal(shortfallHint(short('Orirock Cube'), { Orirock: 999 }, null, tools), '1 of the 1 short can be made at the bench right now — open a material to see its recipe.');
  assert.equal(shortfallHint([], {}, 'LMD and EXP', tools), 'Only LMD and EXP left to cover — no material is short.');
});
