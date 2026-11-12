/** Dusk drains 0 Morale/h in the Control Center, so a player can drain her below 12 once and she stays
 * there, adding Worldly Plight +15 alongside Ling's +15 (above 12). The simulator starts everyone at full
 * Morale, so it never sees this. How much is it worth on the sheet's own rotation?
 * Usage: npx tsx scripts/bench/dusk-parked-342.ts [loginInterval=8] */
import { getAllOperators } from '../../lib/operators/operators';
import { toBaseRosters } from '../../lib/base/baseGroupRosters';
import { simulateBase, type SimulationBase, type SimulationShift, type SimulationResult } from '../../lib/base/baseSimulation';
import { DEFAULT_WEIGHTS } from '../../lib/base/baseOptimizer';
import groups from '../../data/base-group-rosters.json';
import slots from '../../data/base-skill-slots.json';
import recipes from '../../data/base-workshop-recipes.json';
import { FORMATIONS, SHEET_FACILITIES, assignmentsOf, everyoneMaxed } from './sheet-342';

const loginInterval = Number(process.argv[2] ?? 8);
const operators = getAllOperators().filter(op => !/^Amiya \(/.test(op.name));
const roster = everyoneMaxed(operators);
const base: SimulationBase = { operators, rosters: toBaseRosters(groups), skillSlots: slots, workshopRecipes: recipes, facilities: SHEET_FACILITIES };
const dorms = SHEET_FACILITIES.filter(f => f.kind === 'dormitory');
const w = DEFAULT_WEIGHTS;
const weighted = (s: SimulationResult) => s.perDay.lmd * w.lmd + s.perDay.exp * w.exp + s.perDay.goldMade * w.goldMade;
const REFILL = ['Shamare', 'Bibeak', 'Tequila', 'Proviso', 'Mr. Nothing'];

/** The sheet's rotation; `keepOut` names never go to a dorm while off shift (they wait unassigned and keep their Morale). */
function build(keepOut: string[]): SimulationShift[] {
  return FORMATIONS.map((f, i) => {
    const teams: Record<string, string[]> = { ...f.teams };
    const working = new Set(Object.values(f.teams).flat());
    const queue = [...new Set(FORMATIONS.flatMap((g, j) => (j === i ? [] : Object.values(g.teams).flat())))]
      .filter(n => !working.has(n) && !(teams.dormitory1 ?? []).includes(n) && !keepOut.includes(n));
    for (const d of dorms) teams[d.id] = (teams[d.id] ?? []).concat(queue.splice(0, d.capacity - (teams[d.id]?.length ?? 0)));
    return { assignments: assignmentsOf(teams, roster), factoryProducts: f.products, logins: 1, refill: REFILL };
  });
}
const run = (label: string, keepOut: string[], initialMorale?: Record<string, number>) => {
  const s = simulateBase({ base, shifts: build(keepOut), loginInterval, drones: true, initialMorale });
  const exhausted = [...new Set(s.events.filter(e => e.kind === 'exhausted').map(e => e.operators?.[0]))];
  console.log(`${label.padEnd(52)} weighted ${weighted(s).toFixed(0)}  LMD ${s.perDay.lmd.toFixed(0)}  periodic ${s.periodic}  exhausted: ${exhausted.join(', ') || 'none'}`);
};
run('sheet rotation, everyone starts full', []);
run('Dusk starts at 11, rests in a dorm in Formation 3', [], { Dusk: 11 });
run('Dusk starts at 11, waits unassigned in Formation 3', ['Dusk'], { Dusk: 11 });
