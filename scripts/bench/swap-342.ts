/**
 * "Does any sheet team improve the optimizer's plan?" Runs the optimizer on the sheet's 3-4-2 layout, then
 * tries every sheet team in the matching room of every shift. Any gain under the app's funded scoring
 * is a combo the search missed. Usage: npx tsx scripts/bench/swap-342.ts [loginInterval=12]
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

const loginInterval = Number(process.argv[2] ?? 12);
const operators = getAllOperators().filter(op => !/^Amiya \(/.test(op.name));
const roster = everyoneMaxed(operators);
const base: SimulationBase = { operators, rosters: toBaseRosters(groups), skillSlots: slots, workshopRecipes: recipes, facilities: SHEET_FACILITIES };
const w = DEFAULT_WEIGHTS;
const score = (s: SimulationResult) => sustainableOutput(s.perDay, 0).lmd * w.lmd + s.perDay.exp * w.exp
  - (s.periodic ? 0 : 1e9) - 1e6 * s.events.filter(e => e.kind === 'exhausted').length;

const t0 = Date.now();
const plan = optimizeBase({ base, roster, loginInterval, factoryProducts: FORMATIONS[0].products, sustainable: true, externalGold: 0 });
console.log(`optimizer ${plan.shape}: score ${plan.score.toFixed(0)} (LMD ${plan.simulation.perDay.lmd.toFixed(0)} EXP ${plan.simulation.perDay.exp.toFixed(0)} made ${plan.simulation.perDay.goldMade.toFixed(1)}) in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
const baseline = score(plan.simulation);
console.log('  rescored', baseline.toFixed(0));

const slotOf = (n: string) => ({ operatorName: n, eliteLevel: roster[n].eliteLevel, level: roster[n].level });
const teamsByRoom = new Map<string, Set<string>>();
for (const f of FORMATIONS) for (const [room, team] of Object.entries(f.teams)) if (team.length && room !== 'dormitory1') (teamsByRoom.get(room) ?? teamsByRoom.set(room, new Set()).get(room)!).add(JSON.stringify(team));

let best = 0;
const found: string[] = [];
plan.shifts.forEach((shift, si) => {
  for (const [room, set] of teamsByRoom) for (const raw of set) {
    const team: string[] = JSON.parse(raw);
    const next: BaseAssignments = Object.fromEntries(Object.entries(shift.assignments).map(([r, v]) => [r, (v ?? []).map(s => (s && team.includes(s.operatorName) && r !== room ? null : s))]));
    const cap = SHEET_FACILITIES.find(f => f.id === room)?.capacity ?? 0;
    if (!cap) continue;
    next[room] = [...team.slice(0, cap).map(slotOf), ...Array(Math.max(0, cap - team.length)).fill(null)];
    const shifts: SimulationShift[] = plan.shifts.map((s, i) => (i === si ? { ...s, assignments: next } : s));
    const gain = score(simulateBase({ base, shifts, loginInterval })) - baseline;
    if (gain > 1) { found.push(`shift ${si} ${room} <- ${team.join('+')}  +${gain.toFixed(0)}`); best = Math.max(best, gain); }
  }
});
console.log(found.length ? `MISSED COMBOS (${found.length}):\n  ${found.join('\n  ')}` : 'no sheet team improves the optimizer plan in any single room');
