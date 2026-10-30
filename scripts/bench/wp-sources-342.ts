/** Worldly Plight in the sheet's Formation 1, source by source, and the CC operators' own Morale rates.
 * Usage: npx tsx scripts/bench/wp-sources-342.ts */
import { getAllOperators } from '../../lib/operators/operators';
import { toBaseRosters } from '../../lib/base/baseGroupRosters';
import { calculateBase } from '../../lib/base/calculateBase';
import groups from '../../data/base-group-rosters.json';
import slots from '../../data/base-skill-slots.json';
import recipes from '../../data/base-workshop-recipes.json';
import { FORMATIONS, SHEET_FACILITIES, assignmentsOf, everyoneMaxed } from './sheet-342';

const operators = getAllOperators().filter(op => !/^Amiya \(/.test(op.name));
const roster = everyoneMaxed(operators);
const rosters = toBaseRosters(groups);
const f1 = FORMATIONS[0];
// Fill the dorms the way the sheet does: its dorm1 column, then everyone from the other formations.
const working = new Set(Object.values(f1.teams).flat());
const others = [...new Set(FORMATIONS.slice(1).flatMap(f => Object.values(f.teams).flat()))].filter(n => !working.has(n));
const teams: Record<string, string[]> = { ...f1.teams };
for (const d of SHEET_FACILITIES.filter(f => f.kind === 'dormitory')) teams[d.id] = (teams[d.id] ?? []).concat(others.splice(0, d.capacity - (teams[d.id]?.length ?? 0)));
const dormCount = SHEET_FACILITIES.filter(f => f.kind === 'dormitory').reduce((n, d) => n + (teams[d.id]?.length ?? 0), 0);
const sui = new Set(rosters.SUI);
console.log('dorms:', SHEET_FACILITIES.filter(f => f.kind === 'dormitory').map(d => `${d.id} lv${d.level} cap${d.capacity}`).join(', '), '-> occupants', dormCount);
console.log('office level', SHEET_FACILITIES.find(f => f.kind === 'office')?.level);
console.log('Sui working outside dorms:', [...working].filter(n => sui.has(n)).join(', '));

const assignments = assignmentsOf(teams, roster);
for (const [label, morale] of [['Dusk 10, Ling 20', { Dusk: 10, Ling: 20 }], ['both 20', { Dusk: 20, Ling: 20 }], ['both 10', { Dusk: 10, Ling: 10 }]] as const) {
  const importedMorale = Object.fromEntries(Object.values(teams).flat().map(n => [n, 20]));
  Object.assign(importedMorale, morale);
  const r = calculateBase({ operators, rosters, skillSlots: slots, workshopRecipes: recipes, facilities: SHEET_FACILITIES, assignments, factoryProducts: f1.products, importedMorale });
  console.log(`${label}: Worldly Plight ${r.resourcePools.worldlyPlight}`);
}
const r = calculateBase({ operators, rosters, skillSlots: slots, workshopRecipes: recipes, facilities: SHEET_FACILITIES, assignments, factoryProducts: f1.products, importedMorale: Object.fromEntries(Object.values(teams).flat().map(n => [n, 20])) });
const cc = r.rooms.controlCenter as { perOperatorMorale?: Record<string, number>; combinedMoraleRate?: number };
console.log('CC Morale per hour (positive = loss):', JSON.stringify(cc.perOperatorMorale ?? cc.combinedMoraleRate));
