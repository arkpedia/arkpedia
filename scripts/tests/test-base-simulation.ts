import test from 'node:test';
import assert from 'node:assert/strict';
import { getAllOperators } from '../../lib/operators/operators';
import { defaultProductionSpots, getFacilities } from '../../lib/base/baseConfig';
import { toBaseRosters } from '../../lib/base/baseGroupRosters';
import { calculateBase } from '../../lib/base/calculateBase';
import { calcDormitoryRecovery } from '../../lib/base/baseProductivity';
import { simulateBase, MORALE_THRESHOLDS, type SimulationBase, type SimulationShift } from '../../lib/base/baseSimulation';
import type { BaseAssignments, SlotAssignment } from '../../lib/base/baseTypes';
import groups from '../../data/base-group-rosters.json';
import slots from '../../data/base-skill-slots.json';
import recipes from '../../data/base-workshop-recipes.json';

// Expected values come from building_data (EN gamedata excel), not from the code under test:
// manufactData.phases[2].outputCapacity 54, Tactical Battle Record 5 capacity and 3 h,
// basicSpeedBuff 0.01 per worker, manufactManpowerCostByNum [0, 0, -5, -10] (per 100 Morale),
// dormData.phases[4].manpowerRecover 200 and comfortManpowerRecoverFactor 25 at comfortLimit 5000.
const operators = getAllOperators().filter(op => !/^Amiya \(/.test(op.name));
const facilities = getFacilities(defaultProductionSpots(), {});
const factory = facilities.find(f => f.kind === 'factory')!.id;
const base: SimulationBase = {
  operators, rosters: toBaseRosters(groups), skillSlots: slots, workshopRecipes: recipes, facilities,
  dormitoryAmbience: { dormitory1: 5000, dormitory2: 5000, dormitory3: 5000, dormitory4: 5000 },
};
const near = (actual: number, expected: number, tolerance = 1e-6) => assert(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
// At Base promotion none of these has a Factory or Dormitory skill (Trading Post, Office or Training only).
const plain = (operatorName: string, eliteLevel = 'Base'): SlotAssignment => ({ operatorName, eliteLevel });
const shift = (assignments: BaseAssignments, extra: Partial<SimulationShift> = {}): SimulationShift => ({ assignments, factoryProducts: { [factory]: 'Battle Records' }, ...extra });
const crewA = ['Adnachiel', 'Melantha', 'Catapult'], crewB = ['Orchid', 'Plume', 'Midnight'];

test('the simulated thresholds are every current-Morale threshold the calculator\'s rates read', () => {
  // dorm_rec_all&tired: below 18 / below 20; control_costToBD, control_mp_cost&bd1/2: 12;
  // plus exhausted (0) and full (24). Totter, workshop dorm counts and clue guarantees do not
  // move these rates (see baseSimulation.ts).
  assert.deepEqual([...MORALE_THRESHOLDS], [0, 12, 18, 20, 24]);
});

test('three skill-less workers drain 0.9/h each, stop at 0 after 26.67 h, and their factory stops with them', () => {
  const r = simulateBase({ base, loginInterval: 30, fixedCycles: 1, shifts: [shift({ [factory]: crewA.map(n => plain(n)) })] });
  const exhausted = r.events.filter(e => e.kind === 'exhausted');
  assert.equal(exhausted.length, 3);
  for (const e of exhausted) near(e.time, 24 / 0.9);
  // 1.03 productivity: 1 + 0.01 x 3. One record per 3 h at 100%.
  near(r.rooms[factory].output.exp * 30 / 24, 1000 * (1.03 / 3) * (24 / 0.9));
  near(r.rooms[factory].exhaustedHours * 30 / 24, 30 - 24 / 0.9);
  assert.equal(r.events.filter(e => e.kind === 'storageFull').length, 0);
  // The threshold at 12 splits the segment: the trace passes through exactly 12.
  assert(r.moraleTrace.Adnachiel.some(p => p.morale === 12 && Math.abs(p.time - 12 / 0.9) < 1e-9));
});

test('a factory stops at its 54-capacity storage (ten Battle Records) until the next login collects', () => {
  const r = simulateBase({ base, loginInterval: 24, fixedCycles: 1, shifts: [shift({ [factory]: [plain('FEater', 'Elite 2')] })] });
  const productivity = calculateBase({ ...base, assignments: { [factory]: [plain('FEater', 'Elite 2')] }, factoryProducts: { [factory]: 'Battle Records' } }).roomDailyOutput[factory].exp / 8000;
  const fullAt = 10 * 3 / productivity;
  near(r.events.find(e => e.kind === 'storageFull')!.time, fullAt);
  near(r.rooms[factory].output.exp, 10_000);
  near(r.rooms[factory].idleFullHours, 24 - fullAt);
  // Her Morale keeps draining while the room waits: 1/h alone, so 0 exactly at the next login.
  assert.equal(r.moraleTrace.FEater.at(-1)!.morale, 0);
  // Steady state: she never recovers, so after the first day the room produces nothing.
  const steady = simulateBase({ base, loginInterval: 24, shifts: [shift({ [factory]: [plain('FEater', 'Elite 2')] })] });
  assert(steady.periodic);
  assert.equal(steady.perDay.exp, 0);
  // Starting a window at 0 in a working room is exhaustion, reported at the login.
  assert.deepEqual(steady.events.filter(e => e.kind === 'exhausted').map(e => e.time), [0]);
});

test('a level 5 dorm at 5000 ambience recovers 4 Morale/h: from 0 to full in 6 h, then holds', () => {
  near(calcDormitoryRecovery(5, 5000), (200 + 5000 / 25) / 100);
  const r = simulateBase({ base, loginInterval: 12, fixedCycles: 1, initialMorale: { Adnachiel: 0 }, shifts: [shift({ dormitory1: [plain('Adnachiel')] })] });
  const full = r.moraleTrace.Adnachiel.find(p => p.morale === 24)!;
  near(full.time, 6);
  assert.equal(r.moraleTrace.Adnachiel.at(-1)!.morale, 24);
});

test('a ramp skill keeps climbing while the operator stays in the same room, and starts over after a rest', () => {
  // Aroma "Routine Cleaning" ramps +2% an hour to 20%. 12 h in one stint vs two 6 h stints separated by rest.
  const crew = ['Aroma', 'Adnachiel', 'Melantha'].map(n => plain(n, n === 'Aroma' ? 'Elite 2' : 'Base'));
  const stay = simulateBase({ base, loginInterval: 6, fixedCycles: 1, shifts: [shift({ [factory]: crew }, { logins: 2 })] });
  const rest = simulateBase({ base, loginInterval: 6, fixedCycles: 1, shifts: [shift({ [factory]: crew }), shift({ dormitory1: crew })] });
  // Same 6 h windows, but the stay's second one starts 6 h up the ramp: more than twice the output of the one-window-in-two case.
  assert(stay.rooms[factory].output.exp > 2 * rest.rooms[factory].output.exp * 1.001, `${stay.rooms[factory].output.exp} vs 2 x ${rest.rooms[factory].output.exp}`);
  assert(stay.caveats.some(c => c.includes('already worked in the same room')));
});

test('Fiammetta already seated at full Morale swaps at once with whoever is put into her dorm afterwards', () => {
  // Shift 1 seats her alone; shift 2 puts the tired Adnachiel into her dorm.
  const alone = shift({ dormitory1: [plain('Fiammetta')], [factory]: crewA.map(n => plain(n)) });
  const later = shift({ dormitory1: [plain('Fiammetta'), plain('Adnachiel')], [factory]: ['Melantha', 'Catapult', 'Orchid'].map(n => plain(n)) });
  const r = simulateBase({ base, loginInterval: 12, fixedCycles: 1, initialMorale: { Adnachiel: 0, Fiammetta: 24 }, shifts: [alone, later] });
  const swap = r.events.find(e => e.kind === 'fiammettaSwap');
  assert.deepEqual(swap?.operators, ['Fiammetta', 'Adnachiel']);
  assert(r.caveats.some(c => c.includes('at once with whoever is put into her dorm')));
});

test('a worker refilled in place gets Fiammetta\'s full Morale at the login, keeps working, and the lowest of the list is chosen', () => {
  const rested = { dormitory1: [plain('Fiammetta')] };
  const working = { [factory]: crewA.map(n => plain(n)) };
  const initialMorale = { Adnachiel: 6, Melantha: 12, Catapult: 24, Fiammetta: 24 };
  const r = simulateBase({ base, loginInterval: 12, fixedCycles: 1, initialMorale, shifts: [shift({ ...rested, ...working }, { refill: ['Melantha', 'Adnachiel', 'Catapult', 'Orchid'] })] });
  const swaps = r.events.filter(e => e.kind === 'fiammettaSwap');
  assert.equal(swaps.length, 1, 'one Fiammetta makes one swap per staffing change');
  assert.deepEqual(swaps[0].operators, ['Fiammetta', 'Adnachiel'], 'the lowest-Morale worker on the list is refilled; one who is not working is ignored');
  assert.equal(r.moraleTrace.Adnachiel[0].morale, 24);
  assert.equal(r.moraleTrace.Fiammetta[0].morale, 6);
  assert(r.events.every(e => e.kind !== 'exhausted' || e.operators?.[0] !== 'Adnachiel'), 'the refilled worker does not stop working');
  assert(r.caveats.some(c => c.includes('refilled in place')));
  // Not at full Morale herself, or not in a dorm: nothing happens.
  const tired = simulateBase({ base, loginInterval: 12, fixedCycles: 1, initialMorale: { ...initialMorale, Fiammetta: 10 }, shifts: [shift({ ...rested, ...working }, { refill: ['Adnachiel'] })] });
  assert.equal(tired.events.filter(e => e.kind === 'fiammettaSwap').length, 0);
  const noDorm = simulateBase({ base, loginInterval: 12, fixedCycles: 1, initialMorale, shifts: [shift(working, { refill: ['Adnachiel'] })] });
  assert.equal(noDorm.events.filter(e => e.kind === 'fiammettaSwap').length, 0);
});

test('Fiammetta placed at full Morale after an exhausted operator swaps Morale with them, then recovers exactly 2/h', () => {
  const dorm = { dormitory1: [plain('Adnachiel'), plain('Fiammetta')] };
  const r = simulateBase({ base, loginInterval: 12, fixedCycles: 1, initialMorale: { Adnachiel: 0, Fiammetta: 24 }, shifts: [shift(dorm)] });
  const swap = r.events.find(e => e.kind === 'fiammettaSwap')!;
  assert.deepEqual(swap.operators, ['Fiammetta', 'Adnachiel']);
  assert.equal(r.moraleTrace.Adnachiel[0].morale, 24);
  assert.equal(r.moraleTrace.Fiammetta[0].morale, 0);
  near(r.moraleTrace.Fiammetta.find(p => p.morale === 12)!.time, 6);
  near(r.moraleTrace.Fiammetta.find(p => p.morale === 24)!.time, 12);
  assert(r.caveats.some(c => c.includes('Communal Suffering')));
  // Staying seated does not repeat the swap; an explicit re-seat does.
  const stay = simulateBase({ base, loginInterval: 12, fixedCycles: 2, initialMorale: { Adnachiel: 0, Fiammetta: 24 }, shifts: [shift(dorm)] });
  assert.equal(stay.events.filter(e => e.kind === 'fiammettaSwap').length, 0);
  const reseat = simulateBase({ base, loginInterval: 12, fixedCycles: 2, initialMorale: { Adnachiel: 0, Fiammetta: 24 }, shifts: [shift(dorm, { reseat: ['Fiammetta'] })] });
  assert.equal(reseat.events.filter(e => e.kind === 'fiammettaSwap').length, 1);
  // Nobody seated before her: no swap, and the reason is reported.
  const first = simulateBase({ base, loginInterval: 12, fixedCycles: 1, shifts: [shift({ dormitory1: [plain('Fiammetta'), plain('Adnachiel')] })] });
  assert(first.events.some(e => e.kind === 'fiammettaSkipped'));
});

test('a two-shift 12 h rotation settles into a repeating cycle with no exhaustion and the calculator\'s full output', () => {
  const a = shift({ [factory]: crewA.map(n => plain(n)), dormitory1: crewB.map(n => plain(n)) });
  const b = shift({ [factory]: crewB.map(n => plain(n)), dormitory1: crewA.map(n => plain(n)) });
  const r = simulateBase({ base, loginInterval: 12, shifts: [a, b] });
  assert(r.periodic);
  assert.equal(r.cycleHours, 24);
  assert.equal(r.events.filter(e => e.kind === 'exhausted').length, 0);
  near(r.perDay.exp, 1000 * (1.03 / 3) * 24);
  near(r.perDay.exp, calculateBase({ ...base, ...a }).dailyExpRed);
  // Workers go in full and come out after 12 h at 0.9/h; resting operators refill to full.
  near(r.moraleAtLogins[0].Adnachiel, 24);
  near(r.moraleAtLogins[1].Adnachiel, 24 - 0.9 * 12);
  near(r.moraleAtLogins[1].Orchid, 24);
  assert.deepEqual(r.warnings, []);
});

test('one shift held for two logins only collects at the second, and the cycle covers both', () => {
  const r = simulateBase({ base, loginInterval: 6, fixedCycles: 1, shifts: [shift({ [factory]: crewA.map(n => plain(n)) }, { logins: 2 })] });
  assert.equal(r.cycleHours, 12);
  assert.equal(r.moraleAtLogins.length, 2);
  near(r.moraleAtLogins[1].Adnachiel, 24 - 0.9 * 6);
});

test('a shift that places an operator twice or staffs a missing room is reported', () => {
  const r = simulateBase({ base, loginInterval: 12, fixedCycles: 1, shifts: [shift({ [factory]: [plain('Adnachiel')], dormitory1: [plain('Adnachiel')], nowhere: [plain('Orchid')] })] });
  assert(r.warnings.some(w => w.includes('places Adnachiel twice')));
  assert(r.warnings.some(w => w.includes('nowhere')));
});

test('an exhausted worker stays placed but stops adding the 1% base productivity; a room with nobody working produces nothing', () => {
  const run = (importedMorale: Record<string, number>) => calculateBase({ ...base, assignments: { [factory]: crewA.map(n => plain(n)) }, factoryProducts: { [factory]: 'Battle Records' }, importedMorale }).roomDailyOutput[factory];
  near(run({ Adnachiel: 24, Melantha: 24, Catapult: 24 }).exp, 8000 * 1.03);
  near(run({ Adnachiel: 0, Melantha: 24, Catapult: 24 }).exp, 8000 * 1.02);
  assert.equal(run({ Adnachiel: 0, Melantha: 0, Catapult: 0 }), undefined);
});

test('a worker who reaches 0 exactly at a login and then rests lost no work, so it is not exhaustion', () => {
  // A lone worker drains 1/h: 24 h on, 24 h in the dorm.
  const work = shift({ [factory]: [plain('Adnachiel')], dormitory1: [plain('Melantha')] });
  const rest = shift({ [factory]: [plain('Melantha')], dormitory1: [plain('Adnachiel')] });
  const r = simulateBase({ base, loginInterval: 24, shifts: [work, rest] });
  assert(r.periodic);
  assert.equal(r.events.filter(e => e.kind === 'exhausted').length, 0);
  near(r.moraleAtLogins[1].Adnachiel, 0);
});
