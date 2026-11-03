import test from 'node:test';
import assert from 'node:assert/strict';
import { getAllOperators } from '../../lib/operators/operators';
import { getFacilities, presetLevels, presetSpots } from '../../lib/base/baseConfig';
import { toBaseRosters } from '../../lib/base/baseGroupRosters';
import { completeStaffing } from '../../lib/base/completeStaffing';
import { simulateBase, type SimulationShift } from '../../lib/base/baseSimulation';
import { scoreOf, type GenomeContext } from '../../lib/base/planGenome';
import { MAX_ROTATION_SETUPS, distinctSetups } from '../../lib/base/rotationSetups';
import type { OptimizerResult, OwnedOperator } from '../../lib/base/baseOptimizer';
import groups from '../../data/base-group-rosters.json';
import recipes from '../../data/base-workshop-recipes.json';

const template = getAllOperators()[0];
const operators = Array.from({ length: 90 }, (_, i) => ({ ...template, name: `Worker ${String(i).padStart(2, '0')}`, baseSkills: [] }));
const roster = Object.fromEntries(operators.map(o => [o.name, { eliteLevel: 'Elite 2', level: 60 } as OwnedOperator]));
const facilities = getFacilities(presetSpots('2-5-2-right'), presetLevels('2-5-2-right'));
function context(): GenomeContext {
  return { base: { operators, facilities, rosters: toBaseRosters(groups), skillSlots: {}, workshopRecipes: recipes }, roster, loginInterval: 12, drones: true, sustainable: true };
}
function emptyPlan(ctx: GenomeContext, count = 3): OptimizerResult {
  const shifts: SimulationShift[] = Array.from({ length: count }, () => ({ assignments: Object.fromEntries(ctx.base.facilities.filter(f => f.capacity).map(f => [f.id, Array(f.capacity).fill(null)])), factoryProducts: Object.fromEntries(facilities.filter(f => f.kind === 'factory').map((f, i) => [f.id, i < 2 ? 'Precious Metals' : 'Battle Records'])), logins: 1 }));
  const simulation = simulateBase({ base: ctx.base, shifts, loginInterval: 12 });
  return { shifts, simulation, shape: 'duty', crews: [], schedule: shifts.map((_, i) => ({ hour: i * 12, crewIn: [], resting: [] })), stepHours: 12, workHours: 24, score: 0, explanations: [], notes: [], evaluations: 0 };
}
const occupied = (plan: OptimizerResult) => plan.shifts.map(s => Object.values(s.assignments).flatMap(slots => slots.flatMap(x => x ? [x.operatorName] : [])));

test('a three-shift 252 fills Reception, Office, Workshop, Control Center and power plants with real recovery', () => {
  const ctx = context(), seed = emptyPlan(ctx), before = JSON.stringify(seed);
  const plan = completeStaffing(seed, ctx);
  assert.equal(JSON.stringify(seed), before, 'does not alter the production search seed');
  for (const shift of plan.shifts) for (const room of facilities.filter(f => ['controlCenter', 'powerPlant', 'receptionRoom', 'office', 'workshop'].includes(f.kind))) {
    assert.equal(shift.assignments[room.id].filter(Boolean).length, room.capacity, `${room.label} is full in every shift`);
  }
  for (const names of occupied(plan)) {
    assert.equal(new Set(names).size, names.length, 'no duplicate placements');
    assert(names.every(n => n in roster));
  }
  assert(plan.simulation.periodic);
  assert(!plan.simulation.events.some(e => e.kind === 'exhausted'));
  assert.equal(plan.score, scoreOf(plan.simulation, ctx));
  assert(plan.notes.some(n => n.includes('crafting standby')));
  assert(plan.notes.some(n => n.includes('training target')));
  assert(plan.shifts.every(s => !s.assignments.trainingRoom.some(Boolean)));
  assert.deepEqual(plan.crews.map(c => Object.keys(c)), plan.schedule.map(s => s.crewIn[0].rooms));
});

test('limited roster and unavailable recovery leave explicit gaps, never invented staff or exhausted rotations', () => {
  const ctx = context(); ctx.roster = Object.fromEntries(Object.entries(roster).slice(0, 2));
  ctx.base = { ...ctx.base, facilities: facilities.map(f => f.kind === 'dormitory' ? { ...f, capacity: 0, level: 0 } : f) };
  const plan = completeStaffing(emptyPlan(ctx), ctx);
  assert(plan.notes.some(n => n.includes('No safe assignment')));
  assert(!plan.simulation.events.some(e => e.kind === 'exhausted'));
  for (const names of occupied(plan)) assert(names.every(n => n in ctx.roster));
});

test('locked residents and existing production assignments stay in their original slots', () => {
  const ctx = context(); ctx.lockedDorm = ['Worker 00'];
  const seed = emptyPlan(ctx);
  for (const shift of seed.shifts) shift.assignments.dormitory1[0] = { operatorName: 'Worker 00', ...roster['Worker 00'] };
  const worker = { operatorName: 'Worker 01', ...roster['Worker 01'] };
  seed.shifts[0].assignments.prod1[0] = worker;
  seed.shifts[1].assignments.dormitory1[1] = worker;
  seed.simulation = simulateBase({ base: ctx.base, shifts: seed.shifts, loginInterval: 12 });
  const plan = completeStaffing(seed, ctx);
  assert.deepEqual(plan.shifts[0].assignments.prod1[0], worker);
  assert.deepEqual(plan.shifts[1].assignments.dormitory1[1], worker);
  for (const shift of plan.shifts) assert.deepEqual(shift.assignments.dormitory1[0], seed.shifts[0].assignments.dormitory1[0]);
  assert(!plan.simulation.events.some(e => e.kind === 'exhausted'));
});

test('a duty rotation completes its support rooms within the presets the game stores', () => {
  // A duty rotation A, A, B needs two presets. Fills go into both A shifts alike and rest in B; a worker who
  // would exhaust resting one shift in three gets the A shifts split into alternate halves that rest in each
  // other. Either way the rotation stays within three setups and every support room is staffed (found
  // 2026-11-03: filling shift by shift could turn a two-preset rotation into four).
  const ctx = context();
  ctx.base.facilities = facilities.filter(f => ['dormitory', 'controlCenter', 'office', 'receptionRoom', 'powerPlant'].includes(f.kind) || f.id === 'prod1');
  const seed = emptyPlan(ctx, 3);
  const worker = { operatorName: 'Worker 01', ...roster['Worker 01'] };
  seed.shifts[0].assignments.prod1[0] = worker;
  seed.shifts[1].assignments.prod1[0] = worker;
  seed.shifts[2].assignments.dormitory1[0] = worker;
  seed.simulation = simulateBase({ base: ctx.base, shifts: seed.shifts, loginInterval: 12 });
  assert.equal(distinctSetups(seed.shifts), 2);
  const plan = completeStaffing(seed, ctx);
  assert.ok(distinctSetups(plan.shifts) <= MAX_ROTATION_SETUPS, `${distinctSetups(plan.shifts)} setups`);
  for (const shift of plan.shifts) for (const room of ctx.base.facilities.filter(f => ['controlCenter', 'office', 'receptionRoom', 'powerPlant'].includes(f.kind))) {
    assert.equal(shift.assignments[room.id].filter(Boolean).length, room.capacity, `${room.label} is full in every shift`);
  }
  for (const names of occupied(plan)) assert.equal(new Set(names).size, names.length);
  assert(plan.simulation.periodic);
  assert(!plan.simulation.events.some(e => e.kind === 'exhausted'));
  // A full base with four alike shifts: whatever it fills, never more setups than the game stores.
  const wide = completeStaffing(emptyPlan(context(), 4), context());
  assert.ok(distinctSetups(wide.shifts) <= MAX_ROTATION_SETUPS, `${distinctSetups(wide.shifts)} setups on a full base`);
});

test('an explicit training target gets a trainer while the trainee stays reserved', () => {
  const ctx = context();
  // Isolate training eligibility from the separate, deliberately limited dorm-budget case.
  ctx.base.facilities = facilities.filter(f => ['dormitory', 'trainingRoom'].includes(f.kind));
  ctx.base.trainingTarget = { operatorName: 'Worker 00', class: 'Guard', branch: '', mastery: 1, timeReductionActive: false, instantTrainingReady: false };
  const plan = completeStaffing(emptyPlan(ctx), ctx);
  for (const shift of plan.shifts) {
    assert.equal(shift.assignments.trainingRoom.filter(Boolean).length, 1);
    assert(!Object.values(shift.assignments).flat().some(s => s?.operatorName === 'Worker 00'));
  }
  assert(!plan.simulation.events.some(e => e.kind === 'exhausted'));
});
