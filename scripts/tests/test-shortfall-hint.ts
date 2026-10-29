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
/** The first material in the tables with this source kind that the card offers no Craft box for. */
const firstOf = (kind: string, pick: (name: string) => boolean = () => true) => {
  const names = [...catalogue.order].filter((n) => n !== 'LMD' && n !== 'EXP');
  const name = names.find((n) => tools.sourceFor(n).kind === kind && !tools.isDeclarable(n) && pick(n));
  assert.ok(name, `the tables have a ${kind} material`);
  return name!;
};
/* A recipe made in the Factory that a card offers no Craft box for: the Dualchip had been the
   only one, and has one now (2026-10-29), so the sentence for the rest is held with a stand-in. */
const BY_HAND = 'Made-by-hand Unit';
const byHand = {
  ...tools,
  isDeclarable: (name: string) => name !== BY_HAND && tools.isDeclarable(name),
  formulaFor: (name: string) => (name === BY_HAND ? { count: 1, costs: [{ name: 'Orirock', count: 2 }] } : tools.formulaFor(name)),
  sourceFor: (name: string) => (name === BY_HAND ? { kind: 'factory' as const } : tools.sourceFor(name)),
};

test('the tables still say what these cases rest on', () => {
  assert.equal(tools.sourceFor('Guard Dualchip').kind, 'factory');
  assert.equal(tools.isCraftable('Guard Dualchip'), false, 'the automatic walk does not take a Dualchip');
  assert.equal(tools.isDeclarable('Guard Dualchip'), true, 'but its card offers a Craft box');
  assert.ok(tools.formulaFor('Guard Dualchip'), 'and a Dualchip has a recipe');
});

test('a short Dualchip is craftable, and the sentence agrees with the Craft box on its card', () => {
  // Said "made in the Factory by a recipe the planner will not follow for you" (2026-09-27),
  // then the card grew a Craft box beside it. Nothing held: blocked one level down.
  assert.equal(shortfallHint(short('Guard Dualchip'), {}, null, tools),
    '1 of the 1 short is craftable but blocked one level down — open a material to see its recipe.');
  // Holding what it is made of, it can be made now.
  assert.equal(shortfallHint(short('Guard Dualchip'), { 'Guard Chip Pack': 99, 'Chip Catalyst': 99 }, null, tools),
    '1 of the 1 short can be made at the bench right now — open a material to see its recipe.');
});

test('a recipe made in the Factory with no Craft box is made by hand, not a run or a shop', () => {
  const hint = shortfallHint(short(BY_HAND), {}, null, byHand);
  assert.doesNotMatch(hint, /None of these can be made at the bench/);
  assert.equal(hint, `${BY_HAND} is made in the Factory by a recipe the planner will not follow for you — open it to see the recipe.`);
  assert.equal(shortfallHint(short(BY_HAND, 'Other Unit'), {}, 'LMD and EXP', { ...byHand, sourceFor: (name: string) => (name === 'Other Unit' ? { kind: 'factory' as const } : byHand.sourceFor(name)) }),
    'Both are made in the Factory by recipes the planner will not follow for you — open one to see its recipe.');
});

test('a class trade with no stage is made in the Workshop', () => {
  const chip = firstOf('workshop');
  assert.match(shortfallHint(short(chip), {}, null, tools), new RegExp(`^${chip} is made in the Workshop by a recipe`));
  assert.match(shortfallHint(short(BY_HAND, chip), {}, null, byHand), /^Both are made in the Factory or the Workshop by recipes/);
});

test('bench-made and the rest are counted apart, and the rest named by route', () => {
  const farm = firstOf('farm');
  const shop = ['certificate', 'event'].map((kind) => [...catalogue.order].find((n) => tools.sourceFor(n).kind === kind && !tools.isDeclarable(n))).find(Boolean)!;
  assert.ok(shop, 'the tables have a shop material');
  assert.equal(shortfallHint(short(BY_HAND, farm), {}, null, byHand),
    `${BY_HAND} is made in the Factory by a recipe the planner will not follow for you — open it to see the recipe. The other one is a run.`);
  assert.equal(shortfallHint(short(BY_HAND, 'Other Unit', farm, shop), {}, null, { ...byHand, sourceFor: (name: string) => (name === 'Other Unit' ? { kind: 'factory' as const } : byHand.sourceFor(name)) }),
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
  assert.equal(shortfallHint(short('Orirock Cube', 'Guard Dualchip'), {}, null, tools), '2 of the 2 short are craftable but blocked one level down — open a material to see its recipe.');
  assert.equal(shortfallHint(short('Orirock Cube'), { Orirock: 999 }, null, tools), '1 of the 1 short can be made at the bench right now — open a material to see its recipe.');
  assert.equal(shortfallHint([], {}, 'LMD and EXP', tools), 'Only LMD and EXP left to cover — no material is short.');
});
