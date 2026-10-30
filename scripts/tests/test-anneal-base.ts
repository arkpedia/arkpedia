import test from 'node:test';
import assert from 'node:assert/strict';
import { getAllOperators } from '../../lib/operators/operators';
import { toBaseRosters } from '../../lib/base/baseGroupRosters';
import { optimizeBase, type OwnedOperator } from '../../lib/base/baseOptimizer';
import { decode, evaluate, genomeFromResult, toOptimizerResult, type GenomeContext } from '../../lib/base/planGenome';
import { anneal, placesNobodyTwice } from '../../lib/base/annealBase';
import { getFacilities, presetLevels, presetSpots } from '../../lib/base/baseConfig';
import type { FactoryProducts } from '../../lib/base/baseTypes';
import groups from '../../data/base-group-rosters.json';
import slots from '../../data/base-skill-slots.json';
import recipes from '../../data/base-workshop-recipes.json';

// A thin account: fifteen operators at Elite 0, a 2-5-2 base, funded scoring -- small enough for routine CI.
const operators = getAllOperators().filter(o => !/^Amiya \(/.test(o.name) && !o.isFuture);
const byRarity = (r: number) => operators.filter(o => (o.rarity ?? 0) === r).map(o => o.name).sort();
const pick = (names: string[], n: number) => names.filter((_, i) => i % Math.max(1, Math.floor(names.length / n)) === 0).slice(0, n);
const roster: Record<string, OwnedOperator> = Object.fromEntries([...pick(byRarity(6), 3), ...pick(byRarity(5), 6), ...pick(byRarity(4), 6)].map(n => [n, { eliteLevel: 'Base', level: 30 }]));
const facilities = getFacilities(presetSpots('2-5-2-right'), presetLevels('2-5-2-right'));
const products = Object.fromEntries(facilities.filter(f => f.kind === 'factory').map((f, i) => [f.id, i < 2 ? 'Precious Metals' : 'Battle Records'])) as FactoryProducts;
const base = { operators, rosters: toBaseRosters(groups), skillSlots: slots, workshopRecipes: recipes, facilities };
const ctx: GenomeContext = { base, roster, loginInterval: 12, sustainable: true, externalGold: 0, drones: true };
const today = optimizeBase({ base, roster, loginInterval: 12, factoryProducts: products, sustainable: true, externalGold: 0, drones: true });
const seed = genomeFromResult(today, ctx)!;

test("today's plan reads back as a genome that scores the same", () => {
  assert.ok(seed, `shape ${today.shape} should be expressible`);
  assert.ok(placesNobodyTwice(seed, ctx));
  // The same, or better where the genome's dorm rules seat an idle operator in a spare bed.
  assert.ok(evaluate(seed, ctx).value >= today.score - 1e-6);
});

test('the annealer never returns worse than its seed, places nobody twice, and repeats without exhaustion', () => {
  const r = anneal(seed, ctx, { timeMs: 60_000, seed: 7, maxRounds: 40 });
  assert.ok(r.evaluation.value >= today.score - 1e-6, `${r.evaluation.value} < ${today.score}`);
  assert.ok(placesNobodyTwice(r.genome, ctx));
  for (const sh of decode(r.genome, ctx)) {
    const names = Object.values(sh.assignments).flatMap(s => (s ?? []).flatMap(x => x ? [x.operatorName] : []));
    assert.equal(new Set(names).size, names.length);
  }
  assert.equal(r.evaluation.sim.periodic, true);
  assert.equal(r.evaluation.sim.events.filter(e => e.kind === 'exhausted').length, 0);
  // It renders like any other plan: one schedule step per staffing change, every working operator explained.
  const result = toOptimizerResult(r.genome, r.evaluation, ctx);
  assert.equal(result.schedule.length, r.genome.steps);
  assert.equal(result.shifts.length, r.genome.steps);
});

test('the same seed and round count give the same plan', () => {
  const a = anneal(seed, ctx, { timeMs: 60_000, seed: 11, maxRounds: 25 });
  const b = anneal(seed, ctx, { timeMs: 60_000, seed: 11, maxRounds: 25 });
  assert.equal(a.evaluation.value, b.evaluation.value);
  assert.deepEqual(a.genome, b.genome);
});
