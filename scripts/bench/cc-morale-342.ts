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
for (const moraleAbove12 of [true, false]) {
  const r: any = calculateBase({ operators, rosters: toBaseRosters(groups), skillSlots: slots, workshopRecipes: recipes, facilities: SHEET_FACILITIES, assignments: assignmentsOf(f.teams, roster), factoryProducts: f.products, loginInterval: 12, swapPolicy: 'onLogin', moraleAbove12 });
  const cc = r.rooms.controlCenter;
  console.log('moraleAbove12', moraleAbove12, 'WP', r.resourcePools.worldlyPlight, 'perception', r.resourcePools.perceptionInformation);
  if (moraleAbove12) console.log('  CC per-operator Morale/h (negative drains):', JSON.stringify(cc.perOperatorMorale), 'deadTime', cc.deadTime);
}
