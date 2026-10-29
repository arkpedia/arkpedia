/**
 * Joint swap: put a whole sheet formation's support + trading rooms into the optimizer's plan at once.
 * A combo that only pays across rooms (Sui control center -> Mr. Nothing's room, Shamare's trio) is invisible
 * to single-room swaps. Usage: npx tsx scripts/bench/joint-342.ts [loginInterval=8]
 */
import { getAllOperators } from '../../lib/operators/operators';
import { toBaseRosters } from '../../lib/base/baseGroupRosters';
import { simulateBase, type SimulationBase, type SimulationShift, type SimulationResult } from '../../lib/base/baseSimulation';
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
const score = (s: SimulationResult) => sustainableOutput(s.perDay, 0).lmd * w.lmd + s.perDay.exp * w.exp - (s.periodic ? 0 : 1e9) - 1e6 * s.events.filter(e => e.kind === 'exhausted').length;
const line = (l: string, s: SimulationResult) => console.log(`${l.padEnd(34)} score ${score(s).toFixed(0).padStart(7)}  LMD ${s.perDay.lmd.toFixed(0)} EXP ${s.perDay.exp.toFixed(0)} made ${s.perDay.goldMade.toFixed(1)} exhausted ${s.events.filter(e => e.kind === 'exhausted').length}`);

const plan = optimizeBase({ base, roster, loginInterval, factoryProducts: FORMATIONS[0].products, sustainable: true, externalGold: 0 });
console.log('shape', plan.shape, 'shifts', plan.shifts.length);
line('optimizer', plan.simulation);
const slotOf = (n: string) => ({ operatorName: n, eliteLevel: roster[n].eliteLevel, level: roster[n].level });

function apply(shift: SimulationShift, teams: Record<string, string[]>): SimulationShift {
  const placed = new Set(Object.values(teams).flat());
  const next: BaseAssignments = Object.fromEntries(Object.entries(shift.assignments).map(([r, v]) => [r, (v ?? []).map(s => (s && placed.has(s.operatorName) ? null : s))]));
  for (const [room, team] of Object.entries(teams)) {
    const cap = SHEET_FACILITIES.find(f => f.id === room)?.capacity ?? 0;
    next[room] = [...team.slice(0, cap).map(slotOf), ...Array(Math.max(0, cap - team.length)).fill(null)];
  }
  return { ...shift, assignments: next };
}
const keep = (rooms: string[]) => (i: number) => Object.fromEntries(Object.entries(FORMATIONS[i % FORMATIONS.length].teams).filter(([r]) => rooms.includes(r)));
const variants: Record<string, string[]> = {
  'CC only': ['controlCenter'],
  'CC + office': ['controlCenter', 'office'],
  'TP rooms only': ['prod1', 'prod4', 'prod8'],
  'CC + office + TP rooms': ['controlCenter', 'office', 'prod1', 'prod4', 'prod8'],
  'all production + support': ['controlCenter', 'office', 'prod1', 'prod4', 'prod8', 'prod2', 'prod5', 'prod7', 'prod9', 'prod3', 'prod6'],
};
for (const [label, rooms] of Object.entries(variants)) {
  const pick = keep(rooms);
  const shifts = plan.shifts.map((s, i) => apply(s, pick(i)));
  line(`+ sheet ${label}`, simulateBase({ base, shifts, loginInterval }));
}
