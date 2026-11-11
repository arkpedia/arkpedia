import test from 'node:test';
import assert from 'node:assert/strict';
import { getAllOperators } from '../../lib/operators/operators';
import { defaultProductionSpots, getFacilities, presetLevels, presetSpots } from '../../lib/base/baseConfig';
import { toBaseRosters } from '../../lib/base/baseGroupRosters';
import { activeBaseSkills } from '../../lib/base/activeBaseSkills';
import { calculateBase } from '../../lib/base/calculateBase';
import { optimizeBase, DEFAULT_WEIGHTS, MAX_ROTATION_SETUPS, type OwnedOperator, type OptimizerResult } from '../../lib/base/baseOptimizer';
import type { SimulationBase } from '../../lib/base/baseSimulation';
import type { FactoryProducts, FacilityLevels } from '../../lib/base/baseTypes';
import groups from '../../data/base-group-rosters.json';
import slots from '../../data/base-skill-slots.json';
import recipes from '../../data/base-workshop-recipes.json';
import account from '../../tests/fixtures/base-account.json';
import { FORMATIONS, SHEET_FACILITIES, everyoneMaxed } from '../bench/sheet-342';
import { distinctSetups } from '../../lib/base/rotationSetups';

const operators = getAllOperators().filter(op => !/^Amiya \(/.test(op.name));
const shared = { operators, rosters: toBaseRosters(groups), skillSlots: slots, workshopRecipes: recipes };
const near = (actual: number, expected: number, tolerance = 1e-6) => assert(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
const placed = (assignments: Record<string, ({ operatorName: string } | null)[]>) => Object.values(assignments).flatMap(s => s.flatMap(x => x ? [x.operatorName] : []));

// A whole-account roster: every operator at the highest promotion their rarity allows.
const everyone: Record<string, OwnedOperator> = Object.fromEntries(operators.map(o => [o.name, (o.rarity ?? 0) >= 3 ? { eliteLevel: 'Elite 2', level: 60 } : { eliteLevel: 'Base', level: 30 }]));
const full243 = getFacilities(presetSpots('2-4-3'), presetLevels('2-4-3'));
const products243 = Object.fromEntries(full243.filter(f => f.kind === 'factory').map((f, i) => [f.id, i < 2 ? 'Precious Metals' : 'Battle Records'])) as FactoryProducts;
// Full-roster searches are local opt-in benchmarks, never routine GitHub runner work.
// Keep them lazy: even loading this test file must not run a large optimization.
const fullRosterEnabled = !process.env.CI && process.env.ARKPEDIA_BASE_FULL_ROSTER === '1';
const fullRuns = new Map<number, OptimizerResult>();
function fullRun(interval: number) {
  if (!fullRuns.has(interval)) fullRuns.set(interval, optimizeBase({ base: { ...shared, facilities: full243 }, roster: everyone, loginInterval: interval, factoryProducts: products243 }));
  return fullRuns.get(interval)!;
}

test('on a one-room base the optimizer finds the best Trading Post team that brute force over every team finds', () => {
  // Only one level 3 Trading Post and one dorm are built.
  const spots = defaultProductionSpots();
  const tp = Object.keys(spots).find(id => spots[id] === 'tradingPost')!;
  const levels: FacilityLevels = Object.fromEntries([...Object.keys(spots).map(id => [id, id === tp ? 3 : 0]),
    ['controlCenter', 0], ['dormitory1', 5], ['dormitory2', 0], ['dormitory3', 0], ['dormitory4', 0], ['receptionRoom', 0], ['office', 0], ['trainingRoom', 0], ['workshop', 0]]);
  const facilities = getFacilities(spots, levels);
  const base: SimulationBase = { ...shared, facilities };
  const names = ['Texas', 'Lappland', 'Exusiai', 'Shamare', 'Tequila', 'Myrtle'];
  const roster = Object.fromEntries(names.map(n => [n, { eliteLevel: 'Elite 2', level: 60 } as OwnedOperator]));
  const value = (team: string[]) => {
    const r = calculateBase({ ...base, assignments: { [tp]: team.map(n => ({ operatorName: n, eliteLevel: 'Elite 2', level: 60 })) }, factoryProducts: {}, loginInterval: 12, swapPolicy: 'onLogin' });
    return r.dailyGoldWorthGreen * DEFAULT_WEIGHTS.lmd;
  };
  // Every team of one, two or three: the optimizer may rightly leave a place empty.
  let best = -Infinity;
  const teams: string[][] = [[]];
  for (const name of names) for (const t of [...teams]) if (t.length < 3) teams.push([...t, name]);
  for (const team of teams) if (team.length) best = Math.max(best, value(team));
  const result = optimizeBase({ base, roster, loginInterval: 12, factoryProducts: {} });
  near(value(placed({ [tp]: result.crews[0][tp] ?? [] })), best);
});

test('the optimizer only places owned operators, and only with the skills their promotion and level unlock', () => {
  // FEater's Elite 2 skill replaces her base one; at Elite 0 she must be scored with the base one.
  const roster: Record<string, OwnedOperator> = { FEater: { eliteLevel: 'Base', level: 1 }, Adnachiel: { eliteLevel: 'Base', level: 1 }, Melantha: { eliteLevel: 'Elite 1', level: 1 } };
  const result = optimizeBase({ base: { ...shared, facilities: full243 }, roster, loginInterval: 12, factoryProducts: products243 });
  assert(distinctSetups(result.shifts) <= MAX_ROTATION_SETUPS, `${distinctSetups(result.shifts)} setups: more than the game stores`);
  for (const shift of result.shifts) for (const name of placed(shift.assignments)) assert(name in roster, `${name} is not owned`);
  for (const room of result.explanations) for (const op of room.operators) {
    const expected = activeBaseSkills(operators.find(o => o.name === op.name)!, full243.find(f => f.id === room.room)!.label, roster[op.name].eliteLevel, slots, roster[op.name].level).map(s => s.name);
    assert.deepEqual(op.skills.map(s => s.name), expected.map(n => n?.split('Replaces')[0].trim()));
    assert(!op.skills.some(s => s.name === 'Boxing Guidance Video'));
  }
});

for (const interval of [12, 24]) {
  test(`a whole-account rotation at ${interval} h logins repeats, never exhausts a worker, and changes staff only at logins`, { skip: !fullRosterEnabled }, () => {
    const result = fullRun(interval);
    assert(result.simulation.periodic);
    assert.equal(result.simulation.events.filter(e => e.kind === 'exhausted').length, 0);
    assert.equal(result.stepHours % interval, 0);
    assert(result.workHours <= 24);
    assert(result.score > 0);
    // Nobody is in two rooms at once, and the two crews share nobody.
    for (const shift of result.shifts) {
      const names = placed(shift.assignments);
      assert.equal(new Set(names).size, names.length);
    }
    const [a, b] = result.crews.map(c => new Set(placed(c)));
    assert(![...a].some(n => b.has(n)));
    // Everyone resting at a step fits the dorms: 4 dorms of 5 on 2-4-3.
    for (const shift of result.shifts) assert(Object.entries(shift.assignments).filter(([room]) => room.startsWith('dormitory')).flatMap(([, s]) => s.filter(Boolean)).length <= 20);
    assert.deepEqual(result.simulation.warnings, []);
  });
}

test('with 12 h logins a whole account still gets no more distinct setups than the game has preset slots', { skip: !fullRosterEnabled }, () => {
  // The four-change staggered shape used to win here; it needs four presets, one more than the game stores.
  for (const interval of [12, 24]) {
    const result = fullRun(interval);
    assert.notEqual(result.shape, 'staggered');
    assert(distinctSetups(result.shifts) <= MAX_ROTATION_SETUPS, `${distinctSetups(result.shifts)} setups`);
    assert.equal(result.shifts.length, result.schedule.length);
  }
});

test('every working operator is explained, and the explanation is the snapshot output lost without them', () => {
  const result = optimizeBase({ base: { ...shared, facilities: full243 }, roster: account.base.operatorProgress as Record<string, OwnedOperator>, loginInterval: 12, factoryProducts: products243 });
  const base = { ...shared, facilities: full243 };
  const value = (assignments: typeof result.crews[0]) => {
    const r = calculateBase({ ...base, assignments, factoryProducts: products243, loginInterval: 12, swapPolicy: 'onLogin' });
    return r.dailyGoldWorthGreen + r.dailyExpGreen * DEFAULT_WEIGHTS.exp + r.dailyGoldMadeGreen * DEFAULT_WEIGHTS.goldMade;
  };
  const crew = result.crews[0];
  const explained = result.explanations.filter(e => e.crew === 0);
  assert.deepEqual(explained.flatMap(e => e.operators.map(o => o.name)).sort(), placed(crew).sort());
  const op = explained[0].operators[0];
  const without = Object.fromEntries(Object.entries(crew).map(([room, s]) => [room, s.map(x => x?.operatorName === op.name ? null : x)]));
  near(op.marginal, value(crew) - value(without), 1e-6);
});

test('a formations plan never places an operator twice in a shift, Fiammetta included', { skip: !fullRosterEnabled }, () => {
  // Fiammetta has a Trading Post skill, so a crew builder that does not set her aside staffs a Trading Post with
  // her while the formations step also seats her in a dorm: two Fiammettas, both refilling (found 2026-10-30 on
  // the reference sheet's own operator pool, the smallest roster where formations wins; about 2.5 min).
  const names = new Set([...FORMATIONS.flatMap(f => Object.values(f.teams).flat()), 'Fiammetta']);
  const maxed = everyoneMaxed(operators);
  const roster: Record<string, OwnedOperator> = Object.fromEntries([...names].map(n => [n, maxed[n]]));
  const result = optimizeBase({ base: { ...shared, facilities: SHEET_FACILITIES }, roster, loginInterval: 8, factoryProducts: FORMATIONS[0].products, formations: true, drones: true });
  assert.ok(['formations', 'thirds'].includes(result.shape), result.shape);
  // The thirds retiming (2026-10-30) lifted this pool from 149,027 to about 153,300 weighted; guard the gain.
  assert.ok(result.score > 150_000, `score ${result.score.toFixed(0)}`);
  for (const [i, shift] of result.shifts.entries()) {
    const names = placed(shift.assignments as Record<string, ({ operatorName: string } | null)[]>);
    assert.equal(new Set(names).size, names.length, `shift ${i} places someone twice: ${names.filter((n, j) => names.indexOf(n) !== j).join(', ')}`);
  }
  assert.deepEqual(result.simulation.warnings.filter(w => / twice\.$/.test(w)), []);
});

test('in a full Sui Control Center Dusk loses 0.2 Morale an hour, and parked below 12 she adds Worldly Plight +15 beside Ling', () => {
  // What the optimizer's Dusk pass relies on: her +15 below 12 and Ling's +15 above 12 hold at once, read from each
  // one's own Morale. She does lose Morale there: Control Center staff get the base-wide relief only (0.75 an hour
  // for five on the game server, 2026-11-11), not the own-room term that once brought her to zero, so the pass keeps
  // her parked only where the simulated rotation holds.
  const tp = full243.find(f => f.kind === 'tradingPost')!.id;
  const cc = ['Dusk', 'Ling', 'Chongyue', 'Saileach', 'Swire'];
  const assignments = { controlCenter: cc.map(n => ({ operatorName: n, eliteLevel: 'Elite 2' as const, level: 90 })), [tp]: [{ operatorName: 'Mr. Nothing', eliteLevel: 'Elite 2' as const, level: 90 }] };
  const plight = (dusk: number) => {
    const r = calculateBase({ ...shared, facilities: full243, assignments, factoryProducts: products243, importedMorale: { ...Object.fromEntries(cc.map(n => [n, 20])), Dusk: dusk, 'Mr. Nothing': 20 } });
    return { plight: r.resourcePools.worldlyPlight, dusk: (r.rooms.controlCenter as { perOperatorMorale?: Record<string, number> }).perOperatorMorale?.Dusk };
  };
  const parked = plight(11), full = plight(20);
  near(parked.dusk ?? NaN, 0.2);
  near(parked.plight - full.plight, 15);
});

test('longer logins never beat shorter ones on the same roster', { skip: !fullRosterEnabled }, () => {
  assert(fullRun(24).score <= fullRun(12).score + 1e-6);
});
