/** The reference sheet's 2-5-2 variant (scripts/bench/sheet-252.ts) against the optimizer on the same 2-5-2 max
 * right layout, the same factory products and the sheet's own operators, at 8 h logins.
 * Usage: [PLAIN=1] npx tsx scripts/bench/sheet-252-vs-optimizer.ts [annealSeconds=120] [drones=on] */
import { getAllOperators } from '../../lib/operators/operators';
import { toBaseRosters } from '../../lib/base/baseGroupRosters';
import { DEFAULT_WEIGHTS, optimizeBase, type OwnedOperator } from '../../lib/base/baseOptimizer';
import { simulateBase, type SimulationBase, type SimulationResult } from '../../lib/base/baseSimulation';
import { genomeFromResult, type GenomeContext } from '../../lib/base/planGenome';
import { anneal, placesNobodyTwice } from '../../lib/base/annealBase';
import groups from '../../data/base-group-rosters.json';
import slots from '../../data/base-skill-slots.json';
import recipes from '../../data/base-workshop-recipes.json';
import { everyoneMaxed } from './sheet-342';
import { SHEET252_FACILITIES, SHEET252_NAMES, SHEET252_PRODUCTS, sheet252Shifts } from './sheet-252';

const annealSeconds = Number(process.argv[2] ?? 120);
const drones = (process.argv[3] ?? 'on') !== 'off';
const loginInterval = 8;
const operators = getAllOperators().filter(op => !/^Amiya \(/.test(op.name));
const maxed = everyoneMaxed(operators);
const missing = SHEET252_NAMES.filter(n => !maxed[n]);
if (missing.length) throw new Error(`not in the catalogue: ${missing.join(', ')}`);
const roster: Record<string, OwnedOperator> = Object.fromEntries(SHEET252_NAMES.map(n => [n, maxed[n]]));
const base: SimulationBase = { operators, rosters: toBaseRosters(groups), skillSlots: slots, workshopRecipes: recipes, facilities: SHEET252_FACILITIES };
const w = DEFAULT_WEIGHTS;
const weighted = (s: SimulationResult) => s.perDay.lmd * w.lmd + s.perDay.exp * w.exp + s.perDay.goldMade * w.goldMade;
const exhausted = (s: SimulationResult) => [...new Set(s.events.filter(e => e.kind === 'exhausted').map(e => e.operators?.[0]))].join(', ') || 'none';
const line = (label: string, s: SimulationResult) => console.log(`${label.padEnd(44)} weighted ${weighted(s).toFixed(0).padStart(7)}  LMD ${s.perDay.lmd.toFixed(0).padStart(6)}  EXP ${s.perDay.exp.toFixed(0).padStart(6)}  gold ${s.perDay.goldMade.toFixed(1).padStart(5)}  x${s.periodCycles} ${s.periodic ? '' : 'NOT repeating '} exhausted: ${exhausted(s)}`);

console.log(`2-5-2 max right, ${SHEET252_NAMES.length} sheet operators, ${loginInterval} h logins, drones ${drones ? 'on' : 'off'}`);
let best: SimulationResult | null = null;
for (const refillPolicy of ['rotation', 'lowest'] as const) {
  const s = simulateBase({ base, shifts: sheet252Shifts(roster), loginInterval, drones, refillPolicy });
  line(`sheet rotation, refill ${refillPolicy}`, s);
  if (!best || weighted(s) > weighted(best)) best = s;
}
const target = weighted(best!);

const input = { base, roster, loginInterval, factoryProducts: SHEET252_PRODUCTS, drones };
let t = Date.now();
// PLAIN=1: the account page's start, without the slow formations shapes.
const seed = optimizeBase({ ...input, formations: process.env.PLAIN !== '1' });
line(`optimizer seed (${seed.shape}, ${((Date.now() - t) / 1000).toFixed(0)} s)`, seed.simulation);
const ctx: GenomeContext = { base, roster, loginInterval, drones };
const g = genomeFromResult(seed, ctx);
if (g) {
  t = Date.now();
  const r = anneal(g, ctx, { timeMs: annealSeconds * 1000, seed: 1 });
  line(`optimizer annealed (${annealSeconds} s, ${r.rounds} rounds)`, r.evaluation.sim);
  console.log(`   ${(100 * weighted(r.evaluation.sim) / target).toFixed(1)}% of the sheet's better policy (${target.toFixed(0)}); no double placement: ${placesNobodyTwice(r.genome, ctx)}; steps ${r.genome.steps}, core [${r.genome.core.join(', ')}], parked ${JSON.stringify(r.genome.parked)}`);
}
