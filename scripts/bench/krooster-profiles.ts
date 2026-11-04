/** Run the account optimizer on a saved Krooster profile (the lookup page's HTML, or its profile data as saved
 * under tests/fixtures/krooster/<user>.json) the way the Base page does, and print the staffing room by room
 * with each worker's build and the base skills they bring to that room, so a pick can be judged against the
 * base's rules.
 * Usage: npx tsx scripts/bench/krooster-profiles.ts <profile.html|profile.json> [seconds=60] [loginInterval=12] */
import fs from 'node:fs';
import { getAllOperators } from '../../lib/operators/operators';
import { toBaseRosters } from '../../lib/base/baseGroupRosters';
import { optimizeAccountBase } from '../../lib/base/accountOptimizer';
import { ownedBaseRoster } from '../../lib/base/optimizerRoster';
import { activeBaseSkills } from '../../lib/base/activeBaseSkills';
import { getFacilities } from '../../lib/base/baseConfig';
import { parseKroosterPage, profileFromData, accountFromKrooster } from '../../lib/account-import/krooster';
import type { BaseOperator } from '../../lib/operators/operatorTypes';
import groups from '../../data/base-group-rosters.json';
import slots from '../../data/base-skill-slots.json';
import recipes from '../../data/base-workshop-recipes.json';
import map from '../../data/game-account-map.json';

const [file, secondsArg, intervalArg] = process.argv.slice(2);
const seconds = Number(secondsArg ?? 60), loginInterval = Number(intervalArg ?? 12);
const profile = file.endsWith('.json') ? profileFromData(JSON.parse(fs.readFileSync(file, 'utf8'))) : parseKroosterPage(fs.readFileSync(file, 'utf8'));
if (!profile) throw new Error('not a public profile page');
const { record } = accountFromKrooster(profile, map as any);
const operators: BaseOperator[] = getAllOperators().filter(op => !/^Amiya \(/.test(op.name)).map(op => ({ name: op.name, rarity: op.rarity, faction: op.faction, class: op.class, branch: op.branch, baseSkills: op.baseSkills, ...(op.aliases?.length ? { aliases: op.aliases } : {}) }));
const byName = new Map(operators.map(o => [o.name, o]));
const owned = ownedBaseRoster(record, new Set(operators.map(o => o.name)));
console.log(`${profile.username}: ${record.operators.length} operators imported, ${Object.keys(owned.roster).length} known to the base, ${owned.assumed.length} assumed E0`);
const base = { operators, rosters: toBaseRosters(groups), skillSlots: slots as any, workshopRecipes: recipes as any };
const t = Date.now();
const r = optimizeAccountBase({ base, roster: owned.roster, snapshot: undefined, loginInterval, objective: 'balanced', externalGold: 0, compareLayouts: true, searchSeconds: seconds });
const best = r.recommendations[0];
console.log(`${best.label}: LMD ${best.output.lmd.toFixed(0)} EXP ${best.output.exp.toFixed(0)} gold ${best.output.goldMade.toFixed(1)} /day, ${best.plan.shifts.length} shifts of ${best.plan.stepHours}h, ${r.searched} plans in ${((Date.now() - t) / 1000).toFixed(0)} s; others: ${r.recommendations.slice(1).map(x => `${x.label} ${x.score.toFixed(0)}`).join(', ')}`);
const facilities = getFacilities(best.spots, best.levels);
const label = (name: string, room: string) => {
  const op = byName.get(name), o = owned.roster[name];
  if (!op || !o) return `${name} [NOT IN ROSTER]`;
  const build = `${o.eliteLevel === 'Elite 2' ? 'E2' : o.eliteLevel === 'Elite 1' ? 'E1' : 'E0'}L${o.level}`;
  const skills = activeBaseSkills(op, room, o.eliteLevel, base.skillSlots, o.level).map(s => s.name);
  return `${name} ${build}${skills.length ? ` {${skills.join('; ')}}` : ' {no skill here}'}`;
};
best.plan.shifts.forEach((shift, i) => {
  console.log(`\n== Shift ${i + 1}${shift.refill?.length ? ` (refill ${shift.refill.join(', ')})` : ''}`);
  for (const f of facilities) {
    const staff = (shift.assignments[f.id] ?? []).filter(Boolean) as { operatorName: string }[];
    if (!f.capacity) continue;
    const product = best.products[f.id] ? ` [${best.products[f.id]}]` : '';
    console.log(`  ${f.label} L${f.level}${product}: ${staff.length ? staff.map(s => label(s.operatorName, f.label)).join(' | ') : '(empty)'}`);
  }
});
console.log(`\nnotes: ${[...best.plan.notes, ...best.plan.simulation.warnings].join(' / ')}`);

// Who else could have staffed the support rooms: every roster operator with a skill for the room, where the
// plan put them (work, dorm, or nowhere), so a weaker pick over a stronger idle one stands out.
const placeOf = (name: string) => {
  const places = new Set<string>();
  best.plan.shifts.forEach((shift, i) => { for (const [id, slots] of Object.entries(shift.assignments)) if (slots.some(s => s?.operatorName === name)) places.add(`${facilities.find(f => f.id === id)?.label ?? id}@${i + 1}`); });
  return places.size ? [...places].join(',') : 'idle';
};
for (const room of ['Office', 'Reception Room', 'Control Center']) {
  const rows = Object.entries(owned.roster).flatMap(([name, o]) => {
    const op = byName.get(name); if (!op) return [];
    const skills = activeBaseSkills(op, room, o.eliteLevel, base.skillSlots, o.level);
    return skills.length ? [`${name} ${o.eliteLevel === 'Elite 2' ? 'E2' : o.eliteLevel === 'Elite 1' ? 'E1' : 'E0'}L${o.level} {${skills.map(s => s.name).join('; ')}} -> ${placeOf(name)}`] : [];
  });
  console.log(`\n${room} candidates (${rows.length}):\n  ${rows.join('\n  ')}`);
}

// Built (E1+) operators with a production or power skill the plan never used anywhere: the pool an
// E0 level 1 fill was chosen over.
const idleBuilt = Object.entries(owned.roster).filter(([name, o]) => o.eliteLevel !== 'Base' && placeOf(name) === 'idle').flatMap(([name, o]) => {
  const op = byName.get(name); if (!op) return [];
  const rooms = ['Factory', 'Trading Post', 'Power Plant'].flatMap(room => activeBaseSkills(op, room, o.eliteLevel, base.skillSlots, o.level).map(s => `${room}: ${s.name}`));
  return rooms.length ? [`${name} ${o.eliteLevel === 'Elite 2' ? 'E2' : 'E1'}L${o.level} [${rooms.join(' / ')}]`] : [];
});
console.log(`\nIdle built operators with production skills (${idleBuilt.length}):\n  ${idleBuilt.join('\n  ')}`);
const e0Workers = new Set<string>();
best.plan.shifts.forEach(shift => { for (const [id, slots] of Object.entries(shift.assignments)) if (facilities.find(f => f.id === id)?.kind !== 'dormitory') for (const s of slots) if (s && owned.roster[s.operatorName]?.eliteLevel === 'Base' && owned.roster[s.operatorName]?.level === 1) e0Workers.add(s.operatorName); });
console.log(`E0 level 1 operators at work: ${e0Workers.size} (${[...e0Workers].join(', ')})`);
