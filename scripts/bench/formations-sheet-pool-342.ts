/** Does the optimizer's own formations search reach the sheet's score when restricted to exactly the
 * sheet's own operator pool (the fairest test of the search mechanism, separate from candidate-discovery
 * noise at full-catalogue scale)? Usage: npx tsx scripts/bench/formations-sheet-pool-342.ts [loginInterval=8] */
import { getAllOperators } from '../../lib/operators/operators';
import { toBaseRosters } from '../../lib/base/baseGroupRosters';
import { optimizeBase, DEFAULT_WEIGHTS, type OwnedOperator } from '../../lib/base/baseOptimizer';
import { simulateBase, type SimulationBase, type SimulationResult } from '../../lib/base/baseSimulation';
import groups from '../../data/base-group-rosters.json';
import slots from '../../data/base-skill-slots.json';
import recipes from '../../data/base-workshop-recipes.json';
import { FORMATIONS, SHEET_FACILITIES, SHEET_REFILL, everyoneMaxed, sheetShifts } from './sheet-342';

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

const w = DEFAULT_WEIGHTS;
const weighted = (s: SimulationResult) => s.perDay.lmd * w.lmd + s.perDay.exp * w.exp + s.perDay.goldMade * w.goldMade;
const exhausted = (s: SimulationResult) => [...new Set(s.events.filter(e => e.kind === 'exhausted').map(e => e.operators?.[0]))].join(', ') || 'none';
// The target is the sheet's own rotation, simulated here with the SAME settings as each optimizer run (never a
// constant: one written down before drones existed was compared against drones-on results for a while).
for (const drones of [false, true]) {
  const sheet = simulateBase({ base, shifts: sheetShifts(SHEET_REFILL, allMaxed), loginInterval, drones });
  console.log(`\n== drones ${drones ? 'on' : 'off'}`);
  console.log(`sheet rotation + refill: weighted ${weighted(sheet).toFixed(0)}  LMD ${sheet.perDay.lmd.toFixed(0)}  periodic ${sheet.periodic} x${sheet.periodCycles}  exhausted: ${exhausted(sheet)}`);
  for (const [label, extra] of [['plain', { formations: false }], ['formations', { formations: true }], ['formations, exhaustion allowed (as the sheet)', { formations: true, allowExhaustion: true }]] as const) {
    const t = Date.now();
    const r = optimizeBase({ base, roster: restricted, loginInterval, factoryProducts: FORMATIONS[0].products, drones, ...extra });
    const core = (r.shifts[0] as { refill?: string[] }).refill ?? [];
    console.log(`optimizer ${label}: ${r.shape} weighted ${weighted(r.simulation).toFixed(0)} (${(100 * weighted(r.simulation) / weighted(sheet)).toFixed(1)}% of the sheet)  exhausted: ${exhausted(r.simulation)}${core.length ? `  core ${core.join(', ')}` : ''}  (${((Date.now() - t) / 1000).toFixed(0)} s)`);
  }
}
