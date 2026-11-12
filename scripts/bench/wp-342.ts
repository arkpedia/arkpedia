/** Worldly Plight for the sheet's Formation 1, full dorms, one source removed at a time. */
import { getAllOperators } from '../../lib/operators/operators';
import { toBaseRosters } from '../../lib/base/baseGroupRosters';
import { calculateBase } from '../../lib/base/calculateBase';
import groups from '../../data/base-group-rosters.json';
import slots from '../../data/base-skill-slots.json';
import recipes from '../../data/base-workshop-recipes.json';
import { FORMATIONS, SHEET_FACILITIES, assignmentsOf, everyoneMaxed } from './sheet-342';
const operators = getAllOperators().filter(op => !/^Amiya \(/.test(op.name));
const roster = everyoneMaxed(operators);
const f = FORMATIONS[0];
const used = new Set(Object.values(f.teams).flat());
const fillers = operators.filter(o => !used.has(o.name) && !(o.baseSkills ?? []).length).map(o => o.name);
const run = (teams: Record<string, string[]>, label: string) => {
  const t = { ...teams, dormitory1: fillers.slice(0, 5), dormitory2: fillers.slice(5, 10), dormitory3: fillers.slice(10, 15), dormitory4: fillers.slice(15, 20) };
  const r: any = calculateBase({ operators, rosters: toBaseRosters(groups), skillSlots: slots, workshopRecipes: recipes, facilities: SHEET_FACILITIES, assignments: assignmentsOf(t, roster), factoryProducts: f.products, loginInterval: 12, swapPolicy: 'onLogin' });
  console.log(label.padEnd(26), 'WP', r.resourcePools.worldlyPlight, ' prod4 eff', r.rooms.prod4.facilityBreakdown.effectiveProductivity.toFixed(2));
  return r;
};
console.log('fillers', fillers.length, 'office level', SHEET_FACILITIES.find(x => x.id === 'office')?.level);
run(f.teams, 'sheet formation 1');
run({ ...f.teams, office: [] }, 'without Mulberry');
for (const n of ['Dusk', 'Ling', 'Chongyue']) run({ ...f.teams, controlCenter: f.teams.controlCenter.filter(x => x !== n) }, `without ${n}`);
