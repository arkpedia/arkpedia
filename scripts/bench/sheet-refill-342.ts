/** The sheet's own three formations, with Fiammetta refilling Shamare, Tequila and Proviso in turn. Usage: npx tsx scripts/bench/sheet-refill-342.ts [loginInterval=8] */
import { getAllOperators } from '../../lib/operators/operators';
import { toBaseRosters } from '../../lib/base/baseGroupRosters';
import { simulateBase, type SimulationBase, type SimulationShift, type SimulationResult } from '../../lib/base/baseSimulation';
import { DEFAULT_WEIGHTS, sustainableOutput } from '../../lib/base/baseOptimizer';
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
const workingOf = (i: number) => new Set(Object.values(FORMATIONS[i].teams).flat());
function build(refill: string[]): SimulationShift[] {
  return FORMATIONS.map((f, i) => {
    const teams: Record<string, string[]> = { ...f.teams };
    // The sheet's dorm column (Fiammetta first, then her helpers) stays; everyone else off shift fills the beds.
    const queue = [...new Set(FORMATIONS.flatMap((g, j) => (j === i ? [] : Object.values(g.teams).flat())))].filter(n => !workingOf(i).has(n) && !(teams.dormitory1 ?? []).includes(n));
    for (const d of dorms) teams[d.id] = (teams[d.id] ?? []).concat(queue.splice(0, d.capacity - (teams[d.id]?.length ?? 0)));
    return { assignments: assignmentsOf(teams, roster), factoryProducts: f.products, logins: 1, ...(refill.length ? { refill } : {}) };
  });
}
const report = (label: string, s: SimulationResult) => {
  const who = [...new Set(s.events.filter(e => e.kind === 'exhausted').map(e => e.operators?.[0]))];
  console.log(`${label.padEnd(44)} periodic ${s.periodic} x${s.periodCycles} LMD ${s.perDay.lmd.toFixed(0).padStart(6)}  EXP ${s.perDay.exp.toFixed(0).padStart(6)}  gold ${s.perDay.goldMade.toFixed(1)}  weighted ${weighted(s).toFixed(0)}  swaps ${s.events.filter(e => e.kind === 'fiammettaSwap').length}  exhausted: ${who.join(', ') || 'none'}`);
};
console.log(`login ${loginInterval}h, one login per formation`);
report('sheet rotation, no refill', simulateBase({ base, shifts: build([]), loginInterval }));
report('+ refill Shamare, Tequila, Proviso', simulateBase({ base, shifts: build(['Shamare', 'Tequila', 'Proviso']), loginInterval }));
report('+ refill Shamare, Bibeak, Tequila, Proviso', simulateBase({ base, shifts: build(['Shamare', 'Bibeak', 'Tequila', 'Proviso']), loginInterval }));
report('+ refill all five TP workers', simulateBase({ base, shifts: build(['Shamare', 'Bibeak', 'Tequila', 'Proviso', 'Mr. Nothing']), loginInterval }));
report('+ refill all five, drones on', simulateBase({ base, shifts: build(['Shamare', 'Bibeak', 'Tequila', 'Proviso', 'Mr. Nothing']), loginInterval, drones: true }));

// The optimizer's own yardstick: funded gold (no outside gold), drones allocated to cover gold first.
const funded = (label: string, refill: string[]) => {
  const s = simulateBase({ base, shifts: build(refill), loginInterval, drones: true, droneFunding: { externalGold: 0 } });
  const out = sustainableOutput(s.perDay, 0);
  console.log(`${label.padEnd(44)} funded score ${(out.lmd + out.exp).toFixed(0)}  (LMD ${out.lmd.toFixed(0)} EXP ${s.perDay.exp.toFixed(0)} gold made ${s.perDay.goldMade.toFixed(1)} sold ${s.perDay.goldSold.toFixed(1)})  exhausted: ${[...new Set(s.events.filter(e => e.kind === 'exhausted').map(e => e.operators?.[0]))].join(', ') || 'none'}`);
};
funded('FUNDED: sheet rotation, no refill', []);
funded('FUNDED: sheet rotation + refill all five', ['Shamare', 'Bibeak', 'Tequila', 'Proviso', 'Mr. Nothing']);
