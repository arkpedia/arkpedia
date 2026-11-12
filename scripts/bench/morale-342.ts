/** Drain rates of the sheet's workers and the Dusk/Ling Morale traces over the sheet's own rotation. */
import { getAllOperators } from '../../lib/operators/operators';
import { toBaseRosters } from '../../lib/base/baseGroupRosters';
import { calculateBase } from '../../lib/base/calculateBase';
import { simulateBase, type SimulationBase, type SimulationShift } from '../../lib/base/baseSimulation';
import groups from '../../data/base-group-rosters.json';
import slots from '../../data/base-skill-slots.json';
import recipes from '../../data/base-workshop-recipes.json';
import { FORMATIONS, SHEET_FACILITIES, assignmentsOf, everyoneMaxed } from './sheet-342';
const operators = getAllOperators().filter(op => !/^Amiya \(/.test(op.name));
const roster = everyoneMaxed(operators);
const base: SimulationBase = { operators, rosters: toBaseRosters(groups), skillSlots: slots, workshopRecipes: recipes, facilities: SHEET_FACILITIES };
for (const f of FORMATIONS) {
  const r: any = calculateBase({ ...base, assignments: assignmentsOf(f.teams, roster), factoryProducts: f.products, loginInterval: 8, swapPolicy: 'onLogin' });
  const rates = (room: string) => Object.entries(r.rooms[room]?.perOperatorMorale ?? {}).map(([n, v]) => `${n} ${(v as number).toFixed(2)}`).join(', ');
  console.log(f.name, '| CC:', rates('controlCenter'), '| TP lv3:', rates('prod1'), '| TP lv2:', rates('prod4'), '| TP lv2 b:', rates('prod8'));
}
// Dusk and Ling over the sheet's rotation (one login per formation, 8h each).
const dorms = SHEET_FACILITIES.filter(x => x.kind === 'dormitory');
const workingOf = (i: number) => new Set(Object.values(FORMATIONS[i].teams).flat());
const shifts: SimulationShift[] = FORMATIONS.map((f, i) => {
  const teams: Record<string, string[]> = { ...f.teams };
  const queue = [...new Set(FORMATIONS.flatMap((g, j) => (j === i ? [] : Object.values(g.teams).flat())))].filter(n => !workingOf(i).has(n));
  for (const d of dorms) teams[d.id] = (teams[d.id] ?? []).concat(queue.splice(0, d.capacity - (teams[d.id]?.length ?? 0)));
  return { assignments: assignmentsOf(teams, roster), factoryProducts: f.products, logins: 1 };
});
const sim = simulateBase({ base, shifts, loginInterval: 8 });
for (const n of ['Dusk', 'Ling', 'Shamare', 'Tequila', 'Proviso', 'Mr. Nothing']) console.log(n.padEnd(12), (sim.moraleTrace[n] ?? []).map(p => `${p.time.toFixed(0)}h:${p.morale.toFixed(1)}`).join('  '));
