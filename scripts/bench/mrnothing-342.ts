/** In the sheet's Formation 1 context with full dorms, what is a lv2 Trading Post worth with each team? */
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
const others = [...new Set(FORMATIONS.flatMap(g => Object.values(g.teams).flat()))].filter(n => !used.has(n));
const dorm = { dormitory1: others.slice(0, 5), dormitory2: others.slice(5, 10), dormitory3: others.slice(10, 15), dormitory4: others.slice(15, 20) };
console.log('residents', Object.values(dorm).flat().length);
for (const team of [['Proviso', 'Mr. Nothing'], ['Proviso', 'Vigil'], ['Proviso', 'Exusiai'], ['Lemuen', 'Exusiai'], ['Mr. Nothing', 'Vigil'], ['Proviso', 'Underflow']]) {
  if (team.some(n => used.has(n) && !f.teams.prod4.includes(n))) { /* the operator works elsewhere in this formation; swap it out for the test */ }
  const teams: Record<string, string[]> = { ...f.teams, ...dorm };
  for (const [room, t] of Object.entries(teams)) if (room !== 'prod4' && !room.startsWith('dormitory')) teams[room] = t.filter(n => !team.includes(n));
  teams.prod4 = team;
  const r: any = calculateBase({ operators, rosters: toBaseRosters(groups), skillSlots: slots, workshopRecipes: recipes, facilities: SHEET_FACILITIES, assignments: assignmentsOf(teams, roster), factoryProducts: f.products, loginInterval: 12, swapPolicy: 'onLogin' });
  const o = r.roomDailyOutput.prod4;
  console.log(team.join(' + ').padEnd(24), 'WP', String(r.resourcePools.worldlyPlight).padStart(3), ' eff', r.rooms.prod4.facilityBreakdown.effectiveProductivity.toFixed(2), ' LMD/day', (o.goldSold * 500 + o.extraLmd).toFixed(0).padStart(6), ' gold used', o.goldSold.toFixed(1));
}
