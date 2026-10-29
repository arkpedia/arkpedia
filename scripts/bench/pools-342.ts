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
const others = [...new Set(FORMATIONS.flatMap(g => Object.values(g.teams).flat()))].filter(n => !Object.values(f.teams).flat().includes(n));
for (const residents of [4, 20]) {
  const teams = { ...f.teams, dormitory1: others.slice(0, 5), dormitory2: others.slice(5, 10), dormitory3: others.slice(10, 15), dormitory4: others.slice(15, 20) };
  if (residents === 4) for (const k of ['dormitory2', 'dormitory3', 'dormitory4']) delete (teams as any)[k], teams.dormitory1 = f.teams.dormitory1;
  const r: any = calculateBase({ operators, rosters: toBaseRosters(groups), skillSlots: slots, workshopRecipes: recipes, facilities: SHEET_FACILITIES, assignments: assignmentsOf(teams, roster), factoryProducts: f.products, loginInterval: 12, swapPolicy: 'onLogin' });
  console.log(residents, 'dorm residents -> WP', r.resourcePools.worldlyPlight, 'perception', r.resourcePools.perceptionInformation, 'prod4 eff', r.rooms.prod4.facilityBreakdown.effectiveProductivity.toFixed(2), 'dormCount', r.dormitoryOperatorNames?.length);
}
