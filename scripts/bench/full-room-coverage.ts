/**
 * Direct, concrete demonstration that the weak-roster joint plan covers every room TYPE the search handles
 * (Control Center, Trading Post, Factory, Power Plant, Reception Room, Office, Dormitories) -- printed from
 * the FINAL SIMULATED SHIFTS (post dorm-fill), not the pre-fill crew template. Training Room is the one
 * deliberately excluded room (documented: no shared objective unit with LMD/EXP/gold).
 */
import { getAllOperators } from '../../lib/operators/operators';
import { toBaseRosters } from '../../lib/base/baseGroupRosters';
import { optimizeAccountBase } from '../../lib/base/accountOptimizer';
import type { OwnedOperator } from '../../lib/base/baseOptimizer';
import type { FacilityKind } from '../../lib/base/baseTypes';
import groups from '../../data/base-group-rosters.json';
import slots from '../../data/base-skill-slots.json';
import recipes from '../../data/base-workshop-recipes.json';
import { getFacilities } from '../../lib/base/baseConfig';

const operators = getAllOperators().filter(op => !/^Amiya \(/.test(op.name) && !op.isFuture);
const byRarity = (r: number) => operators.filter(o => (o.rarity ?? 0) === r).map(o => o.name).sort();
const pick = (names: string[], n: number) => names.filter((_, i) => i % Math.max(1, Math.floor(names.length / n)) === 0).slice(0, n);

const which = process.argv[2] ?? 'small';
const roster: Record<string, OwnedOperator> = which === 'tiny'
  ? Object.fromEntries([...pick(byRarity(6), 3), ...pick(byRarity(5), 6), ...pick(byRarity(4), 6)].map(n => [n, { eliteLevel: 'Base', level: 30 }]))
  : Object.fromEntries([...pick(byRarity(6), 10), ...pick(byRarity(5), 15), ...pick(byRarity(4), 15)].map(n => [n, { eliteLevel: 'Elite 1', level: 60 }]));

const base = { operators, rosters: toBaseRosters(groups), skillSlots: slots, workshopRecipes: recipes };
const result = optimizeAccountBase({ base, roster, loginInterval: 12, objective: 'balanced', externalGold: 0, compareLayouts: true });
const best = result.recommendations[0];
if (!best) { console.log('NO VALID PLAN'); process.exit(1); }

const facilities = getFacilities(best.spots, best.levels);
const kindOf = Object.fromEntries(facilities.map(f => [f.id, f.kind]));
console.log(`${which} roster (${Object.keys(roster).length} ops), winning layout: ${best.label}, shape: ${best.plan.shape}`);

// Coverage, across ALL shifts in the cycle (a room might be staffed in one shift and resting/empty in another).
const everyKind = new Set(facilities.map(f => f.kind));
const staffedKind = new Set<FacilityKind>();
const staffedRoomIds = new Set<string>();
for (const shift of best.plan.shifts) {
  for (const [room, v] of Object.entries(shift.assignments)) {
    if ((v ?? []).some(Boolean)) { staffedKind.add(kindOf[room] as FacilityKind); staffedRoomIds.add(room); }
  }
}
console.log('room KINDS in this layout:', [...everyKind].sort().join(', '));
console.log('room kinds with at least one shift staffed:', [...staffedKind].sort().join(', '));
console.log('room kinds NEVER staffed in any shift:', [...everyKind].filter(k => !staffedKind.has(k)).sort().join(', ') || '(none)');
console.log(`rooms staffed: ${staffedRoomIds.size} of ${facilities.filter(f => f.capacity > 0).length} capacity-bearing facilities`);

// Dormitories specifically, since they're filled by a separate mechanism from the production/support search.
const dormIds = facilities.filter(f => f.kind === 'dormitory').map(f => f.id);
console.log(`dormitories (${dormIds.length}): staffed in at least one shift = ${dormIds.filter(d => staffedRoomIds.has(d)).length}`);
best.plan.shifts.forEach((shift, i) => {
  const dormCounts = dormIds.map(d => (shift.assignments[d] ?? []).filter(Boolean).length);
  console.log(`  shift ${i}: dorm occupancy ${dormCounts.join('/')}`);
});

// For any room kind the roster has NO owned candidate for, leaving it empty is correct, not a gap. For one
// it DOES have candidates for, show where each actually ended up -- confirms whether they were simply never
// tried (a real gap: every skilled candidate already has a production role, so a genuinely-free-operator-only
// fill pass never considers displacing one) or a legitimate case where keeping them in production scored higher.
import { activeBaseSkills } from '../../lib/base/activeBaseSkills';
for (const kind of ['office', 'receptionRoom'] as const) {
  const label = facilities.find(f => f.kind === kind)?.label ?? kind;
  const skilled = Object.keys(roster).filter(name => {
    const op = operators.find(o => o.name === name);
    return op && activeBaseSkills(op, label, roster[name].eliteLevel, slots, roster[name].level).length > 0;
  });
  console.log(`${kind}: ${skilled.length} owned operator(s) with an active skill there: ${skilled.join(', ') || '(none)'}`);
  if (staffedKind.has(kind)) continue; // this room IS staffed; no need to trace where its candidates went
  for (const name of skilled) {
    const placedIn: string[] = [];
    best.plan.shifts.forEach((shift, i) => {
      for (const [room, v] of Object.entries(shift.assignments)) if ((v ?? []).some(s => s?.operatorName === name)) placedIn.push(`shift${i}:${room}`);
    });
    console.log(`  ${name.padEnd(12)} placed in: ${placedIn.join(', ') || '(not placed anywhere)'}`);
  }
}

// Also check Control Center specifically, since it's the room with the widest base-wide impact.
{
  const label = facilities.find(f => f.kind === 'controlCenter')?.label ?? 'controlCenter';
  const skilled = Object.keys(roster).filter(name => {
    const op = operators.find(o => o.name === name);
    return op && activeBaseSkills(op, label, roster[name].eliteLevel, slots, roster[name].level).length > 0;
  });
  console.log(`controlCenter: ${skilled.length} owned operator(s) with an active skill there: ${skilled.join(', ') || '(none)'}`);
  if (!staffedKind.has('controlCenter')) {
    for (const name of skilled) {
      const placedIn: string[] = [];
      best.plan.shifts.forEach((shift, i) => {
        for (const [room, v] of Object.entries(shift.assignments)) if ((v ?? []).some(s => s?.operatorName === name)) placedIn.push(`shift${i}:${room}`);
      });
      console.log(`  ${name.padEnd(12)} placed in: ${placedIn.join(', ') || '(not placed anywhere)'}`);
    }
  }
}
