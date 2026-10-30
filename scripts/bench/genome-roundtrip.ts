/** Milestone check for lib/base/planGenome.ts: today's best plans, turned into genomes and scored again, should
 * score the same (or better, where the genome's canonical dorm rule rests people differently).
 * Usage: npx tsx scripts/bench/genome-roundtrip.ts [quick] */
import { getAllOperators } from '../../lib/operators/operators';
import { toBaseRosters } from '../../lib/base/baseGroupRosters';
import { optimizeBase, type OptimizerInput, type OwnedOperator } from '../../lib/base/baseOptimizer';
import { evaluate, genomeFromResult, type GenomeContext } from '../../lib/base/planGenome';
import { getFacilities, presetLevels, presetSpots } from '../../lib/base/baseConfig';
import type { FactoryProducts } from '../../lib/base/baseTypes';
import groups from '../../data/base-group-rosters.json';
import slots from '../../data/base-skill-slots.json';
import recipes from '../../data/base-workshop-recipes.json';
import { FORMATIONS, SHEET_FACILITIES, everyoneMaxed } from './sheet-342';

const quick = process.argv[2] === 'quick';
const operators = getAllOperators().filter(op => !/^Amiya \(/.test(op.name) && !op.isFuture);
const all = everyoneMaxed(operators);
const shared = { operators, rosters: toBaseRosters(groups), skillSlots: slots, workshopRecipes: recipes };
const sheetNames = new Set([...FORMATIONS.flatMap(f => Object.values(f.teams).flat()), 'Fiammetta']);
const sheetRoster: Record<string, OwnedOperator> = Object.fromEntries([...sheetNames].filter(n => all[n]).map(n => [n, all[n]]));
const byRarity = (r: number) => operators.filter(o => (o.rarity ?? 0) === r).map(o => o.name).sort();
const pick = (names: string[], n: number) => names.filter((_, i) => i % Math.max(1, Math.floor(names.length / n)) === 0).slice(0, n);
const small: Record<string, OwnedOperator> = Object.fromEntries([...pick(byRarity(6), 10), ...pick(byRarity(5), 15), ...pick(byRarity(4), 15)].map(n => [n, { eliteLevel: 'Elite 1', level: 60 }]));
const f252 = getFacilities(presetSpots('2-5-2-right'), presetLevels('2-5-2-right'));
const p252 = Object.fromEntries(f252.filter(f => f.kind === 'factory').map((f, i) => [f.id, i < 2 ? 'Precious Metals' : 'Battle Records'])) as FactoryProducts;

const cases: { label: string; input: OptimizerInput }[] = [
  { label: 'sheet pool, plain, weighted', input: { base: { ...shared, facilities: SHEET_FACILITIES }, roster: sheetRoster, loginInterval: 8, factoryProducts: FORMATIONS[0].products, drones: true } },
  { label: 'small 40 E1, 252, funded', input: { base: { ...shared, facilities: f252 }, roster: small, loginInterval: 12, factoryProducts: p252, drones: true, sustainable: true, externalGold: 0 } },
  ...(quick ? [] : [{ label: 'sheet pool, formations (thirds), weighted', input: { base: { ...shared, facilities: SHEET_FACILITIES }, roster: sheetRoster, loginInterval: 8, factoryProducts: FORMATIONS[0].products, drones: true, formations: true } }]),
];
for (const { label, input } of cases) {
  const t = Date.now();
  const r = optimizeBase(input);
  const ctx: GenomeContext = { base: input.base, roster: input.roster, loginInterval: input.loginInterval, weights: input.weights, sustainable: input.sustainable, externalGold: input.externalGold, drones: input.drones };
  const g = genomeFromResult(r, ctx);
  if (!g) { console.log(`${label}: today ${r.shape} ${r.score.toFixed(0)} -- not expressible as a genome`); continue; }
  const e = evaluate(g, ctx);
  const dup = e.sim.warnings.filter(w => / twice\.$/.test(w));
  console.log(`${label}: today ${r.shape} ${r.score.toFixed(0)} | genome steps ${g.steps} core [${g.core.join(', ')}] parked ${JSON.stringify(g.parked)} -> ${e.value.toFixed(0)} (${(e.value - r.score >= 0 ? '+' : '')}${(e.value - r.score).toFixed(0)})${dup.length ? ' DUPLICATES ' + dup.join('; ') : ''}  ${((Date.now() - t) / 1000).toFixed(0)} s`);
}
