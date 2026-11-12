/**
 * Persistent-core test: keep one team in its room through every shift (instead of resting it in a disjoint crew)
 * and let the simulator judge Morale. Usage: npx tsx scripts/bench/core-342.ts [loginInterval=8]
 */
import { getAllOperators } from '../../lib/operators/operators';
import { toBaseRosters } from '../../lib/base/baseGroupRosters';
import { simulateBase, type SimulationBase, type SimulationShift, type SimulationResult } from '../../lib/base/baseSimulation';
import { optimizeBase, DEFAULT_WEIGHTS } from '../../lib/base/baseOptimizer';
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
const raw = (s: SimulationResult) => s.perDay.lmd * w.lmd + s.perDay.exp * w.exp + s.perDay.goldMade * w.goldMade;
const ex = (s: SimulationResult) => s.events.filter(e => e.kind === 'exhausted').length;
const line = (l: string, s: SimulationResult) => console.log(`${l.padEnd(44)} weighted ${raw(s).toFixed(0).padStart(7)}  exhausted ${String(ex(s)).padStart(2)}  periodic ${s.periodic}`);

const plan = optimizeBase({ base, roster, loginInterval, factoryProducts: FORMATIONS[0].products });
console.log('shape', plan.shape, 'shifts', plan.shifts.length);
line('optimizer', plan.simulation);
const slotOf = (n: string) => ({ operatorName: n, eliteLevel: roster[n].eliteLevel, level: roster[n].level });

function persist(teams: Record<string, string[]>): SimulationShift[] {
  const placed = new Set(Object.values(teams).flat());
  return plan.shifts.map(shift => {
    const next: BaseAssignments = Object.fromEntries(Object.entries(shift.assignments).map(([r, v]) => [r, (v ?? []).map(s => (s && placed.has(s.operatorName) ? null : s))]));
    for (const [room, team] of Object.entries(teams)) {
      const cap = SHEET_FACILITIES.find(f => f.id === room)?.capacity ?? 0;
      next[room] = [...team.slice(0, cap).map(slotOf), ...Array(Math.max(0, cap - team.length)).fill(null)];
    }
    return { ...shift, assignments: next };
  });
}
const tryIt = (label: string, teams: Record<string, string[]>) => line(label, simulateBase({ base, shifts: persist(teams), loginInterval }));
const sheetTP = FORMATIONS[0].teams;
tryIt('Shamare trio in prod1, both shifts', { prod1: sheetTP.prod1 });
tryIt('Proviso+Mr. Nothing in prod4, both shifts', { prod4: sheetTP.prod4 });
tryIt('both TP cores', { prod1: sheetTP.prod1, prod4: sheetTP.prod4 });
tryIt('Sui CC in both shifts', { controlCenter: sheetTP.controlCenter });
tryIt('Sui CC + Mulberry + both TP cores', { controlCenter: sheetTP.controlCenter, office: sheetTP.office, prod1: sheetTP.prod1, prod4: sheetTP.prod4 });
for (const [room, crewTeams] of [['prod1', 0], ['prod4', 0], ['prod2', 0], ['prod5', 0]] as const) {
  const team = (plan.shifts[crewTeams].assignments[room] ?? []).flatMap(s => s ? [s.operatorName] : []);
  tryIt(`optimizer's own ${room} team in both shifts`, { [room]: team });
}
