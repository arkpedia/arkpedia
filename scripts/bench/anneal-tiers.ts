/** Today's optimizer vs the annealer (lib/base/annealBase.ts) on rosters from very thin to maxed.
 * Usage: npx tsx scripts/bench/anneal-tiers.ts [tiers=sheet,small,tiny] [seconds=60] [seed=1] */
import { getAllOperators } from '../../lib/operators/operators';
import { toBaseRosters } from '../../lib/base/baseGroupRosters';
import { optimizeBase, type OptimizerInput, type OwnedOperator } from '../../lib/base/baseOptimizer';
import { genomeFromResult, type GenomeContext } from '../../lib/base/planGenome';
import { anneal, placesNobodyTwice } from '../../lib/base/annealBase';
import { getFacilities, presetLevels, presetSpots } from '../../lib/base/baseConfig';
import type { FactoryProducts } from '../../lib/base/baseTypes';
import groups from '../../data/base-group-rosters.json';
import slots from '../../data/base-skill-slots.json';
import recipes from '../../data/base-workshop-recipes.json';
import { FORMATIONS, SHEET_FACILITIES, everyoneMaxed } from './sheet-342';

const tiers = (process.argv[2] ?? 'sheet,small,tiny').split(',');
const seconds = Number(process.argv[3] ?? 60);
const seed = Number(process.argv[4] ?? 1);
const operators = getAllOperators().filter(op => !/^Amiya \(/.test(op.name) && !op.isFuture);
const shared = { operators, rosters: toBaseRosters(groups), skillSlots: slots, workshopRecipes: recipes };
const maxed = everyoneMaxed(operators);
const byRarity = (r: number) => operators.filter(o => (o.rarity ?? 0) === r).map(o => o.name).sort();
const pick = (names: string[], n: number) => names.filter((_, i) => i % Math.max(1, Math.floor(names.length / n)) === 0).slice(0, n);
const sheetNames = new Set([...FORMATIONS.flatMap(f => Object.values(f.teams).flat()), 'Fiammetta']);
const f252 = getFacilities(presetSpots('2-5-2-right'), presetLevels('2-5-2-right'));
const p252 = Object.fromEntries(f252.filter(f => f.kind === 'factory').map((f, i) => [f.id, i < 2 ? 'Precious Metals' : 'Battle Records'])) as FactoryProducts;

const rosters: Record<string, { roster: Record<string, OwnedOperator>; input: Omit<OptimizerInput, 'roster'> }> = {
  sheet: { roster: Object.fromEntries([...sheetNames].filter(n => maxed[n]).map(n => [n, maxed[n]])), input: { base: { ...shared, facilities: SHEET_FACILITIES }, loginInterval: 8, factoryProducts: FORMATIONS[0].products, drones: true } },
  // Everyone owned, most at Elite 1, every 20th at Elite 2: "many operators, not many E2".
  mid: { roster: Object.fromEntries(operators.map((o, i) => [o.name, (o.rarity ?? 0) < 3 ? { eliteLevel: 'Base' as const, level: 30 } : i % 20 === 0 ? { eliteLevel: 'Elite 2' as const, level: 60 } : { eliteLevel: 'Elite 1' as const, level: 50 }])), input: { base: { ...shared, facilities: f252 }, loginInterval: 12, factoryProducts: p252, drones: true, sustainable: true, externalGold: 0 } },
  small: { roster: Object.fromEntries([...pick(byRarity(6), 10), ...pick(byRarity(5), 15), ...pick(byRarity(4), 15)].map(n => [n, { eliteLevel: 'Elite 1' as const, level: 60 }])), input: { base: { ...shared, facilities: f252 }, loginInterval: 12, factoryProducts: p252, drones: true, sustainable: true, externalGold: 0 } },
  tiny: { roster: Object.fromEntries([...pick(byRarity(6), 3), ...pick(byRarity(5), 6), ...pick(byRarity(4), 6)].map(n => [n, { eliteLevel: 'Base' as const, level: 30 }])), input: { base: { ...shared, facilities: f252 }, loginInterval: 12, factoryProducts: p252, drones: true, sustainable: true, externalGold: 0 } },
  maxed: { roster: maxed, input: { base: { ...shared, facilities: f252 }, loginInterval: 12, factoryProducts: p252, drones: true, sustainable: true, externalGold: 0 } },
};

for (const tier of tiers) {
  const { roster, input } = rosters[tier];
  let t = Date.now();
  const today = optimizeBase({ ...input, roster, formations: tier === 'sheet' });
  const todaySeconds = (Date.now() - t) / 1000;
  const ctx: GenomeContext = { base: input.base, roster, loginInterval: input.loginInterval, weights: input.weights, sustainable: input.sustainable, externalGold: input.externalGold, drones: input.drones };
  const g = genomeFromResult(today, ctx);
  if (!g) { console.log(`${tier}: today ${today.shape} ${today.score.toFixed(0)} -- not expressible as a genome, skipped`); continue; }
  t = Date.now();
  const r = anneal(g, ctx, { timeMs: seconds * 1000, seed });
  const exhausted = r.evaluation.sim.events.filter(e => e.kind === 'exhausted').length;
  console.log(`${tier.padEnd(6)} ${String(Object.keys(roster).length).padStart(4)} ops | today ${today.shape} ${today.score.toFixed(0)} (${todaySeconds.toFixed(0)} s) | anneal ${r.evaluation.value.toFixed(0)} (${r.evaluation.value >= today.score ? '+' : ''}${(r.evaluation.value - today.score).toFixed(0)}, ${((Date.now() - t) / 1000).toFixed(0)} s, ${r.rounds} rounds, ${r.simulations} sims) | steps ${r.genome.steps} core [${r.genome.core.join(', ')}] parked ${JSON.stringify(r.genome.parked)} | exhausted ${exhausted} periodic ${r.evaluation.sim.periodic} no-dup ${placesNobodyTwice(r.genome, ctx)}`);
  for (const line of r.improvements.slice(-6)) console.log('    ', line);
}
