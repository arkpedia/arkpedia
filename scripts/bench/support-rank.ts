/** The fill phase's view of a support room (Office, Reception Room, Power Plant): every skilled roster operator
 * alone in the room, with the benefit and Morale drain completeStaffing ranks by, in that order.
 * Usage: npx tsx scripts/bench/support-rank.ts <profile.html> [room=Office] [layout=2-5-2-left] */
import fs from 'node:fs';
import { getAllOperators } from '../../lib/operators/operators';
import { toBaseRosters } from '../../lib/base/baseGroupRosters';
import { ownedBaseRoster } from '../../lib/base/optimizerRoster';
import { activeBaseSkills } from '../../lib/base/activeBaseSkills';
import { calculateBase } from '../../lib/base/calculateBase';
import { getFacilities, presetLevels, presetSpots, type BasePresetId } from '../../lib/base/baseConfig';
import { parseKroosterPage, accountFromKrooster } from '../../lib/account-import/krooster';
import type { BaseOperator } from '../../lib/operators/operatorTypes';
import groups from '../../data/base-group-rosters.json';
import slots from '../../data/base-skill-slots.json';
import recipes from '../../data/base-workshop-recipes.json';
import map from '../../data/game-account-map.json';

const [file, roomLabel = 'Office', layout = '2-5-2-left'] = process.argv.slice(2);
const profile = parseKroosterPage(fs.readFileSync(file, 'utf8'))!;
const { record } = accountFromKrooster(profile, map as any);
const operators: BaseOperator[] = getAllOperators().filter(op => !/^Amiya \(/.test(op.name)).map(op => ({ name: op.name, rarity: op.rarity, faction: op.faction, class: op.class, branch: op.branch, baseSkills: op.baseSkills, ...(op.aliases?.length ? { aliases: op.aliases } : {}) }));
const byName = new Map(operators.map(o => [o.name, o]));
const owned = ownedBaseRoster(record, new Set(operators.map(o => o.name)));
const facilities = getFacilities(presetSpots(layout as BasePresetId), presetLevels(layout as BasePresetId));
const room = facilities.find(f => f.label === roomLabel && f.capacity)!;
const base = { operators, rosters: toBaseRosters(groups), skillSlots: slots as any, workshopRecipes: recipes as any, facilities };
const rows = Object.entries(owned.roster).flatMap(([name, o]) => {
  const op = byName.get(name); if (!op) return [];
  const skills = activeBaseSkills(op, room.label, o.eliteLevel, base.skillSlots, o.level);
  const assignments = { [room.id]: [{ operatorName: name, ...o }, ...Array(room.capacity - 1).fill(null)] };
  const r = calculateBase({ ...base, assignments, factoryProducts: {}, loginInterval: 12, swapPolicy: 'onLogin' } as any).rooms[room.id];
  const benefit = room.kind === 'receptionRoom' ? (r.clueSpeed ?? 0) : room.kind === 'office' ? (r.office?.speed ?? 0) : room.kind === 'powerPlant' ? (r.droneRate ?? 0) : (r.productivity?.yellow ?? 0);
  return [{ name, build: `${o.eliteLevel === 'Elite 2' ? 'E2' : o.eliteLevel === 'Elite 1' ? 'E1' : 'E0'}L${o.level}`, skills: skills.map(s => s.name).join('; '), benefit, drain: r.combinedMoraleRate }];
});
rows.sort((a, b) => b.benefit - a.benefit || a.drain - b.drain || a.name.localeCompare(b.name));
console.log(`${profile.username} ${room.label} L${room.level} (cap ${room.capacity}), ${rows.length} roster operators, in fill order:`);
for (const r of rows.slice(0, 40)) console.log(`  ${r.benefit.toFixed(3)}  drain ${r.drain.toFixed(2)}  ${r.name} ${r.build} ${r.skills ? `{${r.skills}}` : ''}`);
