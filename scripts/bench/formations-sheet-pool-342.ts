/** Does the optimizer's own formations search reach the sheet's score when restricted to exactly the
 * sheet's own operator pool (the fairest test of the search mechanism, separate from candidate-discovery
 * noise at full-catalogue scale)? Usage: npx tsx scripts/bench/formations-sheet-pool-342.ts [loginInterval=8] */
import { getAllOperators } from '../../lib/operators/operators';
import { toBaseRosters } from '../../lib/base/baseGroupRosters';
import { optimizeBase, sustainableOutput, DEFAULT_WEIGHTS, type OwnedOperator } from '../../lib/base/baseOptimizer';
import type { SimulationBase } from '../../lib/base/baseSimulation';
import groups from '../../data/base-group-rosters.json';
import slots from '../../data/base-skill-slots.json';
import recipes from '../../data/base-workshop-recipes.json';
import { FORMATIONS, SHEET_FACILITIES, everyoneMaxed } from './sheet-342';

const loginInterval = Number(process.argv[2] ?? 8);
const operators = getAllOperators().filter(op => !/^Amiya \(/.test(op.name));
const allMaxed = everyoneMaxed(operators);
const base: SimulationBase = { operators, rosters: toBaseRosters(groups), skillSlots: slots, workshopRecipes: recipes, facilities: SHEET_FACILITIES };

// The sheet's own operator pool only: every name used across its three formations, plus Fiammetta.
const sheetNames = new Set([...FORMATIONS.flatMap(f => Object.values(f.teams).flat()), 'Fiammetta']);
const restricted: Record<string, OwnedOperator> = Object.fromEntries([...sheetNames].filter(n => allMaxed[n]).map(n => [n, allMaxed[n]]));
console.log(`restricted roster: ${Object.keys(restricted).length} of ${sheetNames.size} sheet names recognized`);
const missing = [...sheetNames].filter(n => !allMaxed[n]);
if (missing.length) console.log('NOT RECOGNIZED (dropped):', missing.join(', '));

const t0 = Date.now();
const plain = optimizeBase({ base, roster: restricted, loginInterval, factoryProducts: FORMATIONS[0].products, drones: true, formations: false });
console.log(`plain (formations off): ${plain.shape} weighted ${plain.score.toFixed(0)}  LMD ${plain.simulation.perDay.lmd.toFixed(0)} EXP ${plain.simulation.perDay.exp.toFixed(0)}  (${((Date.now() - t0) / 1000).toFixed(0)} s)`);

const t1 = Date.now();
const withFormations = optimizeBase({ base, roster: restricted, loginInterval, factoryProducts: FORMATIONS[0].products, drones: true, formations: true });
console.log(`with formations: ${withFormations.shape} weighted ${withFormations.score.toFixed(0)}  LMD ${withFormations.simulation.perDay.lmd.toFixed(0)} EXP ${withFormations.simulation.perDay.exp.toFixed(0)}  (${((Date.now() - t1) / 1000).toFixed(0)} s)`);
if (withFormations.shape === 'formations') {
  const core = (withFormations.shifts[0] as { refill?: string[] }).refill ?? [];
  console.log('core found:', core.join(', '));
}
console.log(`target (sheet rotation + refill, hand-built): weighted 151,804`);
