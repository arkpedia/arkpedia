/** Which operators raise a dorm's recovery most? Candidate in dormitory1 with four plain residents. */
import { getAllOperators } from '../../lib/operators/operators';
import { toBaseRosters } from '../../lib/base/baseGroupRosters';
import { calculateBase } from '../../lib/base/calculateBase';
import { activeBaseSkills } from '../../lib/base/activeBaseSkills';
import groups from '../../data/base-group-rosters.json';
import slots from '../../data/base-skill-slots.json';
import recipes from '../../data/base-workshop-recipes.json';
import { SHEET_FACILITIES, assignmentsOf, everyoneMaxed } from './sheet-342';
const operators = getAllOperators().filter(op => !/^Amiya \(/.test(op.name));
const roster = everyoneMaxed(operators);
const plain = operators.filter(o => (o.rarity ?? 0) <= 2 && !(o.baseSkills ?? []).some(s => s.facility === 'Dormitory')).slice(0, 4).map(o => o.name);
const recovery = (team: string[]) => {
  const r: any = calculateBase({ operators, rosters: toBaseRosters(groups), skillSlots: slots, workshopRecipes: recipes, facilities: SHEET_FACILITIES, assignments: assignmentsOf({ dormitory1: team }, roster), factoryProducts: {}, loginInterval: 12, swapPolicy: 'onLogin' });
  return r.dormitoryRecoveryByFacility?.dormitory1;
};
console.log('filler', plain.join(','), 'baseline', JSON.stringify(recovery(plain)));
const rows: { name: string; avg: number; raw: unknown }[] = [];
for (const o of operators) {
  if (!roster[o.name] || !activeBaseSkills(o, 'Dormitory', roster[o.name].eliteLevel, slots, roster[o.name].level).length) continue;
  const v: any = recovery([o.name, ...plain.slice(0, 4)]);
  const num = Array.isArray(v) ? v.reduce((a: number, x: { bonus: number }) => a + x.bonus, 0) : NaN;
  rows.push({ name: o.name, avg: num, raw: v });
}
rows.sort((a, b) => b.avg - a.avg);
console.log(rows.length, 'dorm-skill operators; total bonus Morale/h added across a 5-resident dorm (base 2.5/h each):');
for (const r of rows.slice(0, 14)) console.log(' ', r.name.padEnd(18), String(r.avg?.toFixed?.(3)).padStart(7), (r.raw as { name: string; bonus: number }[]).map(x => `${x.name}:${x.bonus.toFixed(2)}`).join(' '));
