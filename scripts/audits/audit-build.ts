#!/usr/bin/env node
/**
 * Checks that building spends exactly what it should, and lands exactly where
 * the plan said.
 *
 * WHY THIS EXISTS. A build writes the depot and the roster in one press, and
 * the reader has no way to check either against the game afterwards without
 * re-reading ninety-three counts. So the consumption is asserted here against
 * real recipes: what is held is spent first, a crafted material spends its
 * INGREDIENTS all the way down, the bench's LMD is charged per run for
 * automatic crafts as much as declared ones, EXP is spent as the records
 * actually held, and nothing is ever credited (byproducts are a dice roll).
 * Then the goal walk: building every goal of a plan in the game's order of
 * prerequisites reaches the target exactly, and costs exactly what the plan
 * priced as a whole -- the same materials, counted twice by different code,
 * have to agree.
 *
 * Run:  npm run audit:build
 */
import fs from 'fs';
import path from 'path';
import { applyGoal, goalBlocker, goalReady, planBuild, plannerModules, priceGoal, spendBattleRecords } from '@/lib/planner/build';
import { goalsFor, type Goal } from '@/lib/planner/goals';
import type { Depot } from '@/lib/planner/depot';
import type { Owned } from '@/lib/planner/roster';
import { getSkillList, type CostGroup, type PlannerOperator } from '@/lib/operators/operatorTypes';
import {
  addCostGroup,
  computeLevelCostRemaining,
  moduleStageCostRemaining,
  promotionCostsNeeded,
  skillLevelCostRemaining,
  skillMasteryCostRemaining,
  totalsToCostGroup,
  type LevelTable,
} from '@/lib/planner/plannerLogic';
import levelData from '@/data/operatorLevelExpLmd.json';

/* The planner reads the level table from its props; this reads this checkout's copy. */
const levels = levelData as LevelTable;

let failures = 0;
function check(label: string, cond: boolean, saw = '') {
  if (!cond) { failures++; console.log(`FAIL  ${label}${saw ? ` -- saw ${saw}` : ''}`); }
  else console.log(`ok    ${label}`);
}
const J = (x: unknown) => JSON.stringify(x);
const same = (a: unknown, b: unknown) => J(sortKeys(a)) === J(sortKeys(b));
function sortKeys(x: unknown): unknown {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return x;
  return Object.fromEntries(Object.keys(x as object).sort().map((k) => [k, sortKeys((x as Record<string, unknown>)[k])]));
}
const cost = (...items: [string, number][]): CostGroup => items.map(([name, quantity]) => ({ name, quantity }));

/* --- consumption, against real recipes. Orirock Cluster = 5 Cube + 200 LMD;
   Concentration = 4 Cluster + 300; Manganese Trihydrate = 2 Ore + 1 Polyester
   Pack + 1 Loxic Kohl + 300; Polyester Pack = 4 Polyester + 200. */
interface Case {
  label: string;
  cost: CostGroup;
  depot: Depot;
  autoCraft?: boolean;
  crafting?: string[];
  spent?: Record<string, number>;
  remaining?: Depot;
  made?: Record<string, number>;
  wasted?: number;
  short?: string[];
}
const cases: Case[] = [
  { label: 'held materials are spent as they are', cost: cost(['Orirock Cube', 4]), depot: { 'Orirock Cube': 10 },
    spent: { 'Orirock Cube': 4 }, remaining: { 'Orirock Cube': 6 }, made: {} },
  { label: 'a crafted Cluster spends five Cubes and the bench fee, not a Cluster', cost: cost(['Orirock Cluster', 1]), depot: { 'Orirock Cube': 7, LMD: 1000 },
    spent: { 'Orirock Cube': 5, LMD: 200 }, remaining: { 'Orirock Cube': 2, LMD: 800 }, made: { 'Orirock Cluster': 1 } },
  { label: 'held first, then crafted: one Cluster from the shelf, one from Cubes', cost: cost(['Orirock Cluster', 2]), depot: { 'Orirock Cluster': 1, 'Orirock Cube': 5, LMD: 200 },
    spent: { 'Orirock Cluster': 1, 'Orirock Cube': 5, LMD: 200 }, remaining: {}, made: { 'Orirock Cluster': 1 } },
  { label: 'two tiers down: a Concentration from nothing but Cubes charges both benches', cost: cost(['Orirock Concentration', 1]), depot: { 'Orirock Cube': 20, LMD: 5000 },
    spent: { 'Orirock Cube': 20, LMD: 1100 }, remaining: { LMD: 3900 }, made: { 'Orirock Cluster': 4, 'Orirock Concentration': 1 } },
  { label: 'two tiers down, partly held: two Clusters from the shelf, two from Cubes', cost: cost(['Orirock Concentration', 1]), depot: { 'Orirock Cluster': 2, 'Orirock Cube': 10, LMD: 1000 },
    spent: { 'Orirock Cluster': 2, 'Orirock Cube': 10, LMD: 700 }, remaining: { LMD: 300 }, made: { 'Orirock Cluster': 2, 'Orirock Concentration': 1 } },
  { label: 'a declared craft spends its recipe with automatic crafting OFF', cost: cost(['Manganese Trihydrate', 1]), autoCraft: false, crafting: ['Manganese Trihydrate'],
    depot: { 'Manganese Ore': 2, 'Polyester Pack': 1, 'Loxic Kohl': 1, LMD: 300 },
    spent: { 'Manganese Ore': 2, 'Polyester Pack': 1, 'Loxic Kohl': 1, LMD: 300 }, remaining: {}, made: { 'Manganese Trihydrate': 1 } },
  { label: 'a declared craft whose ingredient is itself auto-crafted', cost: cost(['Manganese Trihydrate', 1]), crafting: ['Manganese Trihydrate'],
    depot: { 'Manganese Ore': 2, Polyester: 4, 'Loxic Kohl': 1, LMD: 500 },
    spent: { 'Manganese Ore': 2, Polyester: 4, 'Loxic Kohl': 1, LMD: 500 }, remaining: {}, made: { 'Polyester Pack': 1, 'Manganese Trihydrate': 1 } },
  { label: 'the plan\'s own LMD and the bench\'s are one line', cost: cost(['LMD', 1000], ['Orirock Cluster', 1]), depot: { 'Orirock Cube': 5, LMD: 1200 },
    spent: { 'Orirock Cube': 5, LMD: 1200 }, remaining: {}, made: { 'Orirock Cluster': 1 } },
  { label: 'EXP is spent as the records held, largest first', cost: cost(['EXP', 5000]),
    depot: { 'Strategic Battle Record': 1, 'Tactical Battle Record': 1, 'Frontline Battle Record': 3, 'Drill Battle Record': 10 },
    spent: { 'Strategic Battle Record': 1, 'Tactical Battle Record': 1, 'Frontline Battle Record': 3, 'Drill Battle Record': 4 }, remaining: { 'Drill Battle Record': 6 }, made: {}, wasted: 0 },
  { label: 'EXP: the smallest record that covers the rest, not the smallest record', cost: cost(['EXP', 300]), depot: { 'Drill Battle Record': 1, 'Frontline Battle Record': 1 },
    spent: { 'Frontline Battle Record': 1 }, remaining: { 'Drill Battle Record': 1 }, made: {}, wasted: 100 },
  { label: 'EXP: two Drills when nothing covers 300 alone', cost: cost(['EXP', 300]), depot: { 'Drill Battle Record': 5 },
    spent: { 'Drill Battle Record': 2 }, remaining: { 'Drill Battle Record': 3 }, made: {}, wasted: 100 },
  { label: 'EXP: three Drills (8 wasted), not one Tactical (408 wasted)', cost: cost(['EXP', 592]), depot: { 'Tactical Battle Record': 2, 'Drill Battle Record': 5 },
    spent: { 'Drill Battle Record': 3 }, remaining: { 'Tactical Battle Record': 2, 'Drill Battle Record': 2 }, made: {}, wasted: 8 },
  { label: 'EXP: a real level run, 24,592, off 25 Tacticals and 5 Drills', cost: cost(['EXP', 24592]), depot: { 'Tactical Battle Record': 25, 'Drill Battle Record': 5 },
    spent: { 'Tactical Battle Record': 24, 'Drill Battle Record': 3 }, remaining: { 'Tactical Battle Record': 1, 'Drill Battle Record': 2 }, made: {}, wasted: 8 },
  { label: 'EXP: exact change prefers the large records', cost: cost(['EXP', 2000]), depot: { 'Strategic Battle Record': 1, 'Tactical Battle Record': 2, 'Drill Battle Record': 10 },
    spent: { 'Strategic Battle Record': 1 }, remaining: { 'Tactical Battle Record': 2, 'Drill Battle Record': 10 }, made: {}, wasted: 0 },
  { label: 'EXP: the whole shelf when it is exactly enough', cost: cost(['EXP', 3600]), depot: { 'Strategic Battle Record': 1, 'Tactical Battle Record': 1, 'Frontline Battle Record': 1, 'Drill Battle Record': 1 },
    spent: { 'Strategic Battle Record': 1, 'Tactical Battle Record': 1, 'Frontline Battle Record': 1, 'Drill Battle Record': 1 }, remaining: {}, made: {}, wasted: 0 },
  { label: 'refused: a Cluster with four Cubes', cost: cost(['Orirock Cluster', 1]), depot: { 'Orirock Cube': 4, LMD: 999 }, short: ['Orirock Cluster'] },
  { label: 'refused: automatic crafting off and nothing declared', cost: cost(['Orirock Cluster', 1]), autoCraft: false, depot: { 'Orirock Cube': 50, LMD: 999 }, short: ['Orirock Cluster'] },
  { label: 'refused: the bench fee alone is short', cost: cost(['Orirock Cluster', 1]), depot: { 'Orirock Cube': 5, LMD: 199 }, short: ['LMD'] },
  { label: 'refused: records do not reach the EXP', cost: cost(['EXP', 5000]), depot: { 'Drill Battle Record': 10 }, short: ['EXP'] },
  { label: 'refused names everything short, not the first', cost: cost(['Orirock Cluster', 1], ['EXP', 400], ['LMD', 50]), depot: {}, short: ['Orirock Cluster', 'LMD', 'EXP'] },
];

for (const c of cases) {
  const plan = planBuild(c.cost, c.depot, { autoCraft: c.autoCraft ?? true, crafting: new Set(c.crafting ?? []) });
  if (c.short) {
    check(c.label, !plan.ok && same(plan.short, c.short), plan.ok ? 'ok' : J(plan.short));
    continue;
  }
  if (!plan.ok) { check(c.label, false, `short ${J(plan.short)}`); continue; }
  const good = same(plan.spent, c.spent) && same(plan.remaining, c.remaining) && same(plan.made, c.made)
    && (c.wasted === undefined || plan.expWasted === c.wasted);
  check(c.label, good, `spent ${J(plan.spent)} remaining ${J(plan.remaining)} made ${J(plan.made)} wasted ${plan.expWasted}`);
  /* Conservation, on every case: what left equals the difference, and nothing
     came back (byproducts are not credited). */
  const keys = new Set([...Object.keys(c.depot), ...Object.keys(plan.remaining)]);
  let conserved = true;
  for (const k of keys) {
    const before = c.depot[k] || 0;
    const after = plan.remaining[k] || 0;
    if (after > before || before - after !== (plan.spent[k] || 0)) conserved = false;
  }
  check(`  conserved: ${c.label}`, conserved);
}

/* The record spender on its own: a shelf that cannot reach it says so. */
check('spendBattleRecords: nothing to spend is nothing spent', same(spendBattleRecords(0, { 'Drill Battle Record': 1 }), { spent: {}, wasted: 0 }));
check('spendBattleRecords: an empty shelf is null', spendBattleRecords(1, {}) === null);

/* --- the goal walk, on a real operator. Texas is 5-star: E0/E1/E2 cap at
   50/70/80, one plannable module, unlocking at E2 Lv50. */
const texas = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/planner-data/Texas.json'), 'utf8')) as PlannerOperator;
const rarity = texas.rarity || 5;
const modules = plannerModules(texas).map((m, i) => ({ name: m.name || `Module ${i + 1}`, stages: m.stages.length }));
const skillCount = getSkillList(texas).length;
check('Texas has two skills and one plannable module', skillCount === 2 && modules.length === 1, `${skillCount} / ${modules.length}`);

const asFrom = (o: Owned) => ({
  elite: o.elite, level: o.level, skillLevel: o.skillLevel,
  masteryOf: (i: number) => o.masteries[i] || 0,
  moduleStageOf: (i: number) => o.modules?.[i] ?? -1,
});
const start: Owned = { elite: 0, level: 1, skillLevel: 1, masteries: {} };
const target: Owned = { elite: 2, level: 60, skillLevel: 7, masteries: { 0: 1 }, modules: { 0: 0 } };
const goalsAt = (o: Owned) => goalsFor(rarity, skillCount, modules, asFrom(o), asFrom(target));

const all = goalsAt(start);
check('the plan counts 2 promotions, 3 runs, 6 ranks, 1 mastery, 1 module = 13', all.length === 13, String(all.length));
const readyAtStart = all.filter((g) => goalReady(g, start, rarity)).map((g) => g.label);
check('at E0 Lv1 only the first run and rank 2 are pressable', same(readyAtStart, ['E0 to Lv 50', 'Skill rank 2']), J(readyAtStart));
check('the promotion says what it is waiting for', goalBlocker(all[0], start, rarity) === 'After E0 Lv50', goalBlocker(all[0], start, rarity));
check('the mastery says what it is waiting for', goalBlocker(all.find((g) => g.kind === 'mastery')!, start, rarity) === 'After E2');

/* Prices, one goal each, against the operator's own data. */
const byLabel = (label: string) => all.find((g) => g.label === label)!;
check('E1 promotion costs the promotion table\'s E1 row',
  same(priceGoal(byLabel('E1 promotion'), texas, rarity, { ...start, level: 50 }, levels), texas.promotion[0].cost), J(priceGoal(byLabel('E1 promotion'), texas, rarity, start, levels)));
check('E0 to Lv 50 costs the level table from where the operator stands',
  same(priceGoal(byLabel('E0 to Lv 50'), texas, rarity, { ...start, level: 20 }, levels),
    (() => { const { exp, lmd } = computeLevelCostRemaining(levels, rarity, 0, 20, 0, 50); return cost(['EXP', exp], ['LMD', lmd]); })()));
check('Skill rank 2 costs skillCost["2"]', same(priceGoal(byLabel('Skill rank 2'), texas, rarity, start, levels), skillLevelCostRemaining(texas, 1, 2)));
check('S1 M1 costs the skill\'s m1', same(priceGoal(byLabel('S1 M1'), texas, rarity, start, levels), skillMasteryCostRemaining(0, texas, 0, 1)));
const modGoal = all.find((g) => g.kind === 'module')!;
check('module S1 costs the module\'s first stage', same(priceGoal(modGoal, texas, rarity, start, levels), moduleStageCostRemaining(plannerModules(texas)[0], -1, 0)));

/* Walk it: always the first pressable goal, until none is. */
let now: Owned = start;
let steps = 0;
const walkTotals = new Map<string, number>();
const order: string[] = [];
for (;;) {
  const goals = goalsAt(now);
  const next = goals.find((g) => goalReady(g, now, rarity));
  if (!next) break;
  if (goals.length !== all.length - steps) { check('every step removes exactly one goal from the list', false, `${goals.length} left after ${steps}`); break; }
  addCostGroup(walkTotals, priceGoal(next, texas, rarity, now, levels));
  order.push(next.label);
  now = applyGoal(next, now);
  if (++steps > 40) break;
}
check('the walk takes exactly one step per goal', steps === all.length, `${steps} of ${all.length}`);
check('the walk lands exactly on the target', same(now, target), J(now));
check('a promotion resets the level to 1 on the way', order.indexOf('E1 promotion') < order.indexOf('E1 to Lv 70'));
check('the walk\'s order is the game\'s: run, promote, run, promote, run, then the rest',
  same(order.slice(0, 5), ['E0 to Lv 50', 'E1 promotion', 'E1 to Lv 70', 'E2 promotion', 'E2 to Lv 60']), J(order.slice(0, 5)));

/* And the walk costs exactly what the plan prices as a whole -- the same
   materials, counted by the page's own method. */
const whole = new Map<string, number>();
const lc = computeLevelCostRemaining(levels, rarity, start.elite, start.level, target.elite, target.level);
addCostGroup(whole, cost(['EXP', lc.exp], ['LMD', lc.lmd]));
for (const p of promotionCostsNeeded(texas, target.elite, start.elite)) addCostGroup(whole, p.cost);
addCostGroup(whole, skillLevelCostRemaining(texas, start.skillLevel, target.skillLevel));
addCostGroup(whole, skillMasteryCostRemaining(0, texas, 0, 1));
addCostGroup(whole, moduleStageCostRemaining(plannerModules(texas)[0], -1, 0));
check('building every goal costs exactly the whole plan', same(totalsToCostGroup(walkTotals), totalsToCostGroup(whole)),
  `walk ${J(totalsToCostGroup(walkTotals))}\n      whole ${J(totalsToCostGroup(whole))}`);

/* A goal that is not ready is not priced as free. */
const goalAtE0: Goal = { kind: 'mastery', label: 'S1 M1', skill: 0, mastery: 1 };
check('an unready goal still has its price', priceGoal(goalAtE0, texas, rarity, start, levels).length > 0);

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll build checks passed.');
process.exit(failures ? 1 : 0);
