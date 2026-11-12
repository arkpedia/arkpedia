import test from 'node:test';
import assert from 'node:assert/strict';
import { getAllOperators } from '../../lib/operators/operators';
import { defaultProductionSpots, getFacilities } from '../../lib/base/baseConfig';
import { toBaseRosters } from '../../lib/base/baseGroupRosters';
import { calculateBase } from '../../lib/base/calculateBase';
import { calcDormitoryRecovery } from '../../lib/base/baseProductivity';
import { simulateBase, allocateDrones, MORALE_THRESHOLDS, type SimulationBase, type SimulationShift } from '../../lib/base/baseSimulation';
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

test('drones: 10 an hour plus 5% per Power Plant worker, each worth 3 minutes of a Factory\'s base production, skills not applied', () => {
  // One plain worker in each of the three one-place Power Plants.
  const plants = facilities.filter(f => f.kind === 'powerPlant').map(f => f.id);
  assert.equal(plants.length, 3);
  const work = { [factory]: crewA.map(n => plain(n)), ...Object.fromEntries(plants.map((id, i) => [id, [plain(crewB[i])]])) };
  // Four-hour logins over one 24 h shift: six windows. Three plain workers add 3 x 5%, so 11.5 drones an hour.
  const off = simulateBase({ base, loginInterval: 4, fixedCycles: 1, shifts: [shift(work, { logins: 6 })] });
  const on = simulateBase({ base, loginInterval: 4, fixedCycles: 1, shifts: [shift(work, { logins: 6 })], drones: true });
  const drones = on.events.filter(e => e.kind === 'drones');
  assert.equal(drones.length, 6);
  // A Battle Record is 1000 EXP in 3 h of base production, so one drone is 1000 / 60 = 16.67 EXP whatever the Factory's own skills.
  const expected = 11.5 * 24 * (1000 / 60);
  assert(Math.abs(on.perDay.exp - off.perDay.exp - expected) < expected * 0.01, `${on.perDay.exp - off.perDay.exp} vs ${expected}`);
  assert(on.caveats.some(c => c.includes('Drones are spent at every login')));
  assert.equal(off.events.filter(e => e.kind === 'drones').length, 0, 'off by default');
});

test('drone allocation: funded, a gold deficit is covered first and Trading Posts take drones only as far as gold can be sold', () => {
  const tp = { room: 'tp', exp: 0, goldMade: 0, goldSold: 0.0775, extraLmd: 0, cap: 80 };
  const gold = { room: 'gold', exp: 0, goldMade: 1 / 24, goldSold: 0, extraLmd: 0, cap: 24 };
  const exp = { room: 'exp', exp: 1000 / 60, goldMade: 0, goldSold: 0, extraLmd: 0, cap: 60 };
  const w = { lmd: 1, exp: 1, goldMade: 500 };
  const used = (spent: ReturnType<typeof allocateDrones>, room: string) => spent.filter(x => x.target.room === room).reduce((n, x) => n + x.use, 0);
  // Raw: the Trading Post is worth most (0.0775 x 500 = 38.75 LMD a drone), then Precious Metals (20.8), then EXP (16.7).
  const raw = allocateDrones([tp, gold, exp], 100, w, null);
  assert.equal(used(raw, 'tp'), 80); assert.equal(used(raw, 'gold'), 20); assert.equal(used(raw, 'exp'), 0);
  // Funded with 10 gold short: the Factory makes gold first (capped at 24 drones), the Trading Post cannot sell what is not there, EXP takes the rest.
  const funded = allocateDrones([tp, gold, exp], 100, w, -10);
  assert.equal(used(funded, 'gold'), 24); assert.equal(used(funded, 'tp'), 0); assert.equal(used(funded, 'exp'), 60);
  // Funded with 5 gold to spare: the Trading Post takes drones until that gold is sold (5 / 0.0775 = 64.5).
  const spare = allocateDrones([tp, gold, exp], 100, w, 5);
  assert(Math.abs(used(spare, 'tp') - 5 / 0.0775) < 1e-6, String(used(spare, 'tp')));
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

test('a worker refilled in place gets Fiammetta\'s full Morale at the login and keeps working', () => {
  const rested = { dormitory1: [plain('Fiammetta')] };
  const working = { [factory]: crewA.map(n => plain(n)) };
  const initialMorale = { Adnachiel: 6, Melantha: 12, Catapult: 24, Fiammetta: 24 };
  const r = simulateBase({ base, loginInterval: 12, fixedCycles: 1, initialMorale, shifts: [shift({ ...rested, ...working }, { refill: ['Melantha', 'Adnachiel', 'Catapult', 'Orchid'] })] });
  const swaps = r.events.filter(e => e.kind === 'fiammettaSwap');
  assert.equal(swaps.length, 1, 'one Fiammetta makes one swap per staffing change');
  assert.deepEqual(swaps[0].operators, ['Fiammetta', 'Melantha'], 'the first opportunity is the first name on the list, its own turn in the rotation');
  assert.equal(r.moraleTrace.Melantha[0].morale, 24);
  assert.equal(r.moraleTrace.Fiammetta[0].morale, 12);
  assert(r.events.every(e => e.kind !== 'exhausted' || e.operators?.[0] !== 'Melantha'), 'the refilled worker does not stop working');
  assert(r.caveats.some(c => c.includes('refilled in place')));
  // Not at full Morale herself, or not in a dorm: nothing happens.
  const tired = simulateBase({ base, loginInterval: 12, fixedCycles: 1, initialMorale: { ...initialMorale, Fiammetta: 10 }, shifts: [shift({ ...rested, ...working }, { refill: ['Adnachiel'] })] });
  assert.equal(tired.events.filter(e => e.kind === 'fiammettaSwap').length, 0);
  const noDorm = simulateBase({ base, loginInterval: 12, fixedCycles: 1, initialMorale, shifts: [shift(working, { refill: ['Adnachiel'] })] });
  assert.equal(noDorm.events.filter(e => e.kind === 'fiammettaSwap').length, 0);
});

test('several workers on one refill list are visited in a fixed rotation, not "whichever is lowest"', () => {
  // So that a slower-draining member cannot starve while attention keeps cycling to whoever reads lowest right
  // now: every member gets a turn in a fixed order, and a wasted turn (already full, or not working) still
  // advances the rotation rather than being retried on someone else.
  const rested = { dormitory1: [plain('Fiammetta')] };
  const working = { [factory]: crewA.map(n => plain(n)) };
  const initialMorale = { Adnachiel: 6, Melantha: 20, Catapult: 24, Fiammetta: 24 };
  const list = ['Melantha', 'Adnachiel', 'Catapult', 'Orchid']; // Orchid never works here, so her turn is always wasted.
  const swapAtCycle = (cycles: number) => simulateBase({ base, loginInterval: 12, fixedCycles: cycles, initialMorale, shifts: [shift({ ...rested, ...working }, { refill: list })] })
    .events.find(e => e.kind === 'fiammettaSwap')?.operators?.[1];
  assert.equal(swapAtCycle(1), 'Melantha', 'turn 1: Melantha, first on the list');
  assert.equal(swapAtCycle(2), 'Adnachiel', 'turn 2: Adnachiel, regardless of Melantha now reading higher than him a moment ago');
  assert.equal(swapAtCycle(3), 'Catapult', 'turn 3: Catapult\'s turn; by now (24h worked) she genuinely needs it too, not because she read lowest');
  assert.equal(swapAtCycle(4), undefined, 'turn 4: Orchid\'s turn, but she never works here, so the visit is wasted');
  assert.equal(swapAtCycle(5), 'Melantha', 'turn 5: the rotation wraps back to the first name');
});

test('refillPolicy "lowest" gives Fiammetta\'s Morale to the lowest working member, not the next in the list', () => {
  const rested = { dormitory1: [plain('Fiammetta')] };
  const working = { [factory]: crewA.map(n => plain(n)) };
  const initialMorale = { Adnachiel: 6, Melantha: 20, Catapult: 24, Fiammetta: 24 };
  const first = (refillPolicy?: 'rotation' | 'lowest') => simulateBase({ base, loginInterval: 12, fixedCycles: 1, initialMorale, refillPolicy, shifts: [shift({ ...rested, ...working }, { refill: ['Melantha', 'Adnachiel', 'Catapult'] })] })
    .events.find(e => e.kind === 'fiammettaSwap')?.operators?.[1];
  assert.equal(first(), 'Melantha', 'rotation: first on the list');
  assert.equal(first('lowest'), 'Adnachiel', 'lowest: Adnachiel at 6 Morale');
});

test('a refill rotation that lines up with the cycle only every few cycles still counts as repeating, over all of them', () => {
  // Three names, two visits a cycle: Fiammetta's turn comes back to the first name every 3 cycles, so Morale one
  // cycle apart never matches and a one-cycle check would reject a steady plan (found 2026-10-30).
  const rested = { dormitory1: [plain('Fiammetta')] };
  const working = { [factory]: crewA.map(n => plain(n)) };
  const two = (refill: string[]) => simulateBase({ base, loginInterval: 12, shifts: [shift({ ...rested, ...working }, { refill }), shift({ ...rested, ...working }, { refill })] });
  const three = two(crewA);
  assert.equal(three.periodic, true);
  assert.equal(three.periodCycles, 3);
  // Two names over two visits line up every cycle, as before.
  assert.equal(two(crewA.slice(0, 2)).periodCycles, 1);
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

test('stepping only on the Morale levels each operator\'s rates read gives the same results as stepping on every level', () => {
  // Each special plan seats operators whose rates read Morale, beside workers who come to them tired (4 h logins,
  // so a rest is too short to fill up): Vendela (below 18), Perfumer the Distilled (below 20), Bobbing and Coldshot
  // (who is below 24), a single-target dorm skill (the lowest roommate), Gladiia's Abyssal Hunters at 24, and Ling
  // and Dusk at 12 feeding Mr. Nothing and Proviso's Worldly Plight. Random plans over the catalogue follow.
  let state = 12345;
  const random = () => { state = (state * 1103515245 + 12345) % 2147483648; return state / 2147483648; };
  const shuffle = <T,>(xs: T[]) => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pool = operators.filter(o => (o.rarity ?? 0) >= 3 && !o.isFuture).map(o => o.name);
  const e2 = (operatorName: string): SlotAssignment => ({ operatorName, eliteLevel: 'Elite 2', level: 90 });
  const rooms = facilities.filter(f => f.capacity > 0);
  const tps = rooms.filter(f => f.kind === 'tradingPost').map(f => f.id);
  const dorm = rooms.find(f => f.kind === 'dormitory')!.id;
  const products = Object.fromEntries(facilities.filter(f => f.kind === 'factory').map((f, i) => [f.id, i % 2 ? 'Precious Metals' : 'Battle Records'])) as SimulationShift['factoryProducts'];
  const fill = (fixed: Record<string, string[]>) => {
    const used = new Set(Object.values(fixed).flat());
    const rest = shuffle(pool.filter(n => !used.has(n)));
    const assignments: BaseAssignments = {};
    for (const f of rooms) assignments[f.id] = [...(fixed[f.id] ?? []), ...rest.splice(0, Math.max(0, f.capacity - (fixed[f.id]?.length ?? 0)))].slice(0, f.capacity).map(e2);
    return assignments;
  };
  // Two crews swap every 4 h: whoever works one change rests in the dorms the next.
  const swap = (a: BaseAssignments): BaseAssignments => {
    const work = rooms.filter(f => f.kind !== 'dormitory').map(f => f.id), dorms = rooms.filter(f => f.kind === 'dormitory').map(f => f.id);
    const workers = work.flatMap(id => a[id] ?? []), resting = dorms.flatMap(id => a[id] ?? []);
    const b: BaseAssignments = {};
    for (const id of work) b[id] = resting.splice(0, rooms.find(f => f.id === id)!.capacity);
    for (const id of dorms) b[id] = workers.splice(0, rooms.find(f => f.id === id)!.capacity);
    return b;
  };
  const special: Record<string, string[]>[] = [
    { controlCenter: ['Ling', 'Dusk'], [tps[0]]: ['Mr. Nothing', 'Proviso'] },
    { [dorm]: ['Vendela'] }, { [dorm]: ['Perfumer the Distilled'] }, { [dorm]: ['Bobbing'] }, { [dorm]: ['Coldshot'] },
    { [dorm]: ['Exusiai the New Covenant'] }, { controlCenter: ['Gladiia'], [dorm]: ['Skadi', 'Specter the Unchained'] },
  ];
  const plans = [...special, ...Array.from({ length: 6 }, () => ({}))];
  for (const [i, fixed] of plans.entries()) {
    const first = fill(fixed);
    // One crew works 4 h, the other 16 h (and so arrives in the dorms tired), both ways round; and bare dorms, where
    // a rest is too slow to fill up (at 24 every path ends the same, which would hide a missed level).
    for (const [logins, ambience] of [[[1, 4], 5000], [[4, 1], 5000], [[1, 4], 0], [[4, 1], 0]] as const) {
    const shifts: SimulationShift[] = [first, swap(first)].map((assignments, k) => ({ assignments, factoryProducts: products, logins: logins[k] }));
    const dorms = { ...base, dormitoryAmbience: Object.fromEntries(rooms.filter(f => f.kind === 'dormitory').map(f => [f.id, ambience])) };
    const run = (allMoraleLevels: boolean) => simulateBase({ base: dorms, shifts, loginInterval: 4, drones: true, allMoraleLevels });
    const all = run(true), read = run(false);
    for (const k of ['lmd', 'exp', 'goldMade', 'goldSold'] as const) near(read.perDay[k], all.perDay[k], 1e-6 * Math.max(1, Math.abs(all.perDay[k])));
    assert.equal(read.periodic, all.periodic, `plan ${i}`);
    assert.equal(read.moraleAtLogins.length, all.moraleAtLogins.length, `plan ${i}`);
    all.moraleAtLogins.forEach((m, j) => { for (const [name, v] of Object.entries(m)) near(read.moraleAtLogins[j][name], v, 1e-6); });
    assert.ok(read.evaluations <= all.evaluations);
    }
  }
});

test('calculateBase reads current Morale only at the levels it reports for each operator', () => {
  // Every operator's Morale moved to other values on the same side of each level reported for them (and, in a
  // single-target dorm, keeping their place in its order) leaves every rate unchanged. A level read but not
  // reported shows as a change.
  let state = 777;
  const random = () => { state = (state * 1103515245 + 12345) % 2147483648; return state / 2147483648; };
  const shuffle = <T,>(xs: T[]) => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pool = operators.filter(o => (o.rarity ?? 0) >= 3 && !o.isFuture).map(o => o.name);
  const rooms = facilities.filter(f => f.capacity > 0);
  const dorms = rooms.filter(f => f.kind === 'dormitory').map(f => f.id);
  const tps = rooms.filter(f => f.kind === 'tradingPost').map(f => f.id);
  const products = Object.fromEntries(facilities.filter(f => f.kind === 'factory').map((f, i) => [f.id, i % 2 ? 'Precious Metals' : 'Battle Records'])) as SimulationShift['factoryProducts'];
  const special: Record<string, string[]>[] = [
    { controlCenter: ['Ling', 'Dusk', 'Chongyue'], [tps[0]]: ['Mr. Nothing', 'Proviso'] },
    { [dorms[0]]: ['Vendela'] }, { [dorms[0]]: ['Perfumer the Distilled'] }, { [dorms[0]]: ['Bobbing'] }, { [dorms[0]]: ['Coldshot'] },
    { [dorms[0]]: ['Exusiai the New Covenant'] }, { controlCenter: ['Gladiia'], [dorms[0]]: ['Skadi', 'Specter the Unchained'] },
    {}, {}, {},
  ];
  const samples = [0, 0.5, 6, 11.9, 12, 12.1, 15, 17.9, 18, 18.1, 19.9, 20, 20.1, 22, 23.9, 24];
  const side = (m: number, levels: number[]) => levels.map(t => (m < t ? 0 : m === t ? 1 : 2)).join('');
  for (const fixed of special) {
    const used = new Set(Object.values(fixed).flat());
    const rest = shuffle(pool.filter(n => !used.has(n)));
    const assignments: BaseAssignments = {};
    for (const f of rooms) assignments[f.id] = [...(fixed[f.id] ?? []), ...rest.splice(0, Math.max(0, f.capacity - (fixed[f.id]?.length ?? 0)))].slice(0, f.capacity)
      .map(operatorName => ({ operatorName, eliteLevel: 'Elite 2', level: 90 }));
    const names = Object.values(assignments).flatMap(s => (s ?? []).flatMap(x => x ? [x.operatorName] : []));
    const morale = Object.fromEntries(names.map(n => [n, samples[Math.floor(random() * samples.length)]]));
    const calc = (m: Record<string, number>) => {
      const withMorale = Object.fromEntries(Object.entries(assignments).map(([room, s]) => [room, (s ?? []).map(x => x ? { ...x, morale: m[x.operatorName] } : null)]));
      const r = calculateBase({ ...base, assignments: withMorale, factoryProducts: products, importedMorale: m, loginInterval: 8, swapPolicy: 'onLogin' });
      const rates = JSON.stringify([r.roomDailyOutput, Object.fromEntries(Object.entries(r.rooms).map(([id, x]) => [id, [x?.perOperatorMorale ?? null, x?.combinedMoraleRate ?? null]])), r.dormitoryRecoveryByFacility]);
      return { r, rates };
    };
    const at = calc(morale);
    const orderOf = (m: Record<string, number>, dorm: string) => [...at.r.moraleOrder[dorm]].sort((a, b) => m[a] - m[b]).join('>');
    for (const name of names) {
      const levels = at.r.moraleLevels[name] ?? [];
      for (const v of samples) {
        if (v === morale[name] || side(v, levels) !== side(morale[name], levels)) continue;
        const moved = { ...morale, [name]: v };
        if (Object.keys(at.r.moraleOrder).some(d => orderOf(moved, d) !== orderOf(morale, d))) continue;
        assert.equal(calc(moved).rates, at.rates, `${name}: Morale ${morale[name]} -> ${v} changed a rate, but only [${levels.join(', ')}] are reported (${JSON.stringify(fixed)})`);
      }
    }
  }
});
