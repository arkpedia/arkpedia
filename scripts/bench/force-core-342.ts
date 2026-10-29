/** Force the sheet's own core (Shamare trio + Proviso/Mr. Nothing) as a formations core, full catalogue,
 * and compare against the optimizer's own best plan. Usage: npx tsx scripts/bench/force-core-342.ts [loginInterval=8] */
import { getAllOperators } from '../../lib/operators/operators';
import { toBaseRosters } from '../../lib/base/baseGroupRosters';
import { simulateBase, type SimulationBase, type SimulationShift } from '../../lib/base/baseSimulation';
import { optimizeBase, sustainableOutput, DEFAULT_WEIGHTS } from '../../lib/base/baseOptimizer';
import type { BaseAssignments } from '../../lib/base/baseTypes';
import groups from '../../data/base-group-rosters.json';
import slots from '../../data/base-skill-slots.json';
import recipes from '../../data/base-workshop-recipes.json';
import { FORMATIONS, SHEET_FACILITIES, everyoneMaxed } from './sheet-342';

const loginInterval = Number(process.argv[2] ?? 8);
const operators = getAllOperators().filter(op => !/^Amiya \(/.test(op.name));
const roster = everyoneMaxed(operators);
const base: SimulationBase = { operators, rosters: toBaseRosters(groups), skillSlots: slots, workshopRecipes: recipes, facilities: SHEET_FACILITIES };
const w = DEFAULT_WEIGHTS;

const t0 = Date.now();
const plan = optimizeBase({ base, roster, loginInterval, factoryProducts: FORMATIONS[0].products, sustainable: true, externalGold: 0, drones: true, formations: true });
const planOut = sustainableOutput(plan.simulation.perDay, 0);
console.log(`optimizer's own plan (${plan.shape}): score ${(planOut.lmd + planOut.exp).toFixed(0)}  (${((Date.now() - t0) / 1000).toFixed(0)} s)`);

// Build the forced core: Shamare, Bibeak, Tequila, Proviso, Mr. Nothing stay in prod1/prod4 every shift,
// a greedy crew fills everything else, Fiammetta refills them.
const core = ['Shamare', 'Bibeak', 'Tequila', 'Proviso', 'Mr. Nothing'];
const slotOf = (n: string) => ({ operatorName: n, eliteLevel: roster[n].eliteLevel, level: roster[n].level });
const dorms = SHEET_FACILITIES.filter(f => f.kind === 'dormitory');
// Two crews: each run the optimizer with core fixed, by excluding core names from the normal search and
// re-adding them to prod1/prod4 afterwards, then score with the simulator.
function buildAround(): SimulationShift[] {
  // Use the optimizer's own plan as the "fill" crews, strip anyone it placed in prod1/prod4, add the core there.
  const crews = plan.crews.map(crew => {
    const next: BaseAssignments = { ...crew };
    next.prod1 = [slotOf('Shamare'), slotOf('Bibeak'), slotOf('Tequila')];
    next.prod4 = [slotOf('Proviso'), slotOf('Mr. Nothing')];
    for (const room of Object.keys(next)) if (room !== 'prod1' && room !== 'prod4') next[room] = (next[room] ?? []).map(s => s && core.includes(s.operatorName) ? null : s);
    return next;
  });
  return crews.map((crew, i) => {
    const resting = crews.filter((_, j) => j !== i).flatMap(c => Object.values(c).flatMap(s => (s ?? []).flatMap(x => x ? [x.operatorName] : []))).filter(n => !core.includes(n));
    const seen = new Set<string>(); const uniqResting = resting.filter(n => !seen.has(n) && seen.add(n));
    const result: BaseAssignments = { ...crew };
    const queue = [...uniqResting];
    for (const d of dorms) {
      if (d === dorms[0]) { result[d.id] = [slotOf('Fiammetta'), ...queue.splice(0, d.capacity - 1).map(slotOf)]; continue; }
      result[d.id] = queue.splice(0, d.capacity).map(slotOf);
    }
    return { assignments: result, factoryProducts: FORMATIONS[0].products, logins: 1, refill: core };
  });
}
const forced = buildAround();
const sim = simulateBase({ base, shifts: forced, loginInterval, drones: true, droneFunding: { externalGold: 0 } });
const out = sustainableOutput(sim.perDay, 0);
console.log(`forced sheet core (Shamare trio + Proviso/Mr.Nothing): score ${(out.lmd + out.exp).toFixed(0)}  LMD ${out.lmd.toFixed(0)} EXP ${sim.perDay.exp.toFixed(0)}  exhausted: ${[...new Set(sim.events.filter(e => e.kind === 'exhausted').map(e => e.operators?.[0]))].join(', ') || 'none'}  periodic ${sim.periodic}`);
