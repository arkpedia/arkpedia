import test from 'node:test';
import assert from 'node:assert/strict';
import { getAllOperators } from '../../lib/operators/operators';
import { toBaseRosters } from '../../lib/base/baseGroupRosters';
import { MAX_ROTATION_SETUPS, optimizeBase, type OwnedOperator } from '../../lib/base/baseOptimizer';
import { decode, evaluate, genomeFromResult, genomeNotes, hasWorkingCollision, placeGenomeOperator, splitCrew, toOptimizerResult, type Genome, type GenomeContext } from '../../lib/base/planGenome';
import { anneal, placesNobodyTwice } from '../../lib/base/annealBase';
import { coreSeed } from '../../lib/base/coreSeed';
import { distinctSetups } from '../../lib/base/rotationSetups';
import { getFacilities, presetLevels, presetSpots } from '../../lib/base/baseConfig';
import type { FactoryProducts } from '../../lib/base/baseTypes';
import groups from '../../data/base-group-rosters.json';
import slots from '../../data/base-skill-slots.json';
import recipes from '../../data/base-workshop-recipes.json';

// A thin account: fifteen operators at Elite 0, a 2-5-2 base, funded scoring -- small enough for routine CI.
const operators = getAllOperators().filter(o => !/^Amiya \(/.test(o.name) && !o.isFuture);
const byRarity = (r: number) => operators.filter(o => (o.rarity ?? 0) === r).map(o => o.name).sort();
const pick = (names: string[], n: number) => names.filter((_, i) => i % Math.max(1, Math.floor(names.length / n)) === 0).slice(0, n);
const roster: Record<string, OwnedOperator> = Object.fromEntries([...pick(byRarity(6), 3), ...pick(byRarity(5), 6), ...pick(byRarity(4), 6)].map(n => [n, { eliteLevel: 'Base', level: 30 }]));
const facilities = getFacilities(presetSpots('2-5-2-right'), presetLevels('2-5-2-right'));
const products = Object.fromEntries(facilities.filter(f => f.kind === 'factory').map((f, i) => [f.id, i < 2 ? 'Precious Metals' : 'Battle Records'])) as FactoryProducts;
const base = { operators, rosters: toBaseRosters(groups), skillSlots: slots, workshopRecipes: recipes, facilities };
const ctx: GenomeContext = { base, roster, loginInterval: 12, sustainable: true, externalGold: 0, drones: true };
const today = optimizeBase({ base, roster, loginInterval: 12, factoryProducts: products, sustainable: true, externalGold: 0, drones: true });
const seed = genomeFromResult(today, ctx)!;

test("today's plan reads back as a genome that scores the same", () => {
  assert.ok(seed, `shape ${today.shape} should be expressible`);
  assert.ok(placesNobodyTwice(seed, ctx));
  // The same, or better where the genome's dorm rules seat an idle operator in a spare bed.
  assert.ok(evaluate(seed, ctx).value >= today.score - 1e-6);
});

test('the annealer never returns worse than its seed, places nobody twice, and repeats without exhaustion', () => {
  const r = anneal(seed, ctx, { timeMs: 60_000, seed: 7, maxRounds: 40 });
  assert.ok(r.evaluation.value >= today.score - 1e-6, `${r.evaluation.value} < ${today.score}`);
  assert.ok(placesNobodyTwice(r.genome, ctx));
  for (const sh of decode(r.genome, ctx)) {
    const names = Object.values(sh.assignments).flatMap(s => (s ?? []).flatMap(x => x ? [x.operatorName] : []));
    assert.equal(new Set(names).size, names.length);
  }
  assert.equal(r.evaluation.sim.periodic, true);
  assert.equal(r.evaluation.sim.events.filter(e => e.kind === 'exhausted').length, 0);
  // Never more distinct setups than the game stores as presets, whatever the step-count move proposed.
  assert.ok(distinctSetups(decode(r.genome, ctx)) <= MAX_ROTATION_SETUPS, `${distinctSetups(decode(r.genome, ctx))} setups`);
  // It renders like any other plan: one schedule step per staffing change, every working operator explained.
  const result = toOptimizerResult(r.genome, r.evaluation, ctx);
  assert.equal(result.schedule.length, r.genome.steps);
  assert.equal(result.shifts.length, r.genome.steps);
});

test('the same seed and round count give the same plan', () => {
  const a = anneal(seed, ctx, { timeMs: 60_000, seed: 11, maxRounds: 25 });
  const b = anneal(seed, ctx, { timeMs: 60_000, seed: 11, maxRounds: 25 });
  assert.equal(a.evaluation.value, b.evaluation.value);
  assert.deepEqual(a.genome, b.genome);
});

test('a plan whose schedule names only the rooms that change crew reads back with each room\'s full pattern', () => {
  // A room keeps the second crew for two changes running; the schedule names it only when it changes, and a
  // room left unnamed keeps its crew (found 2026-10-30: it was read as the first crew).
  const rooms = facilities.filter(f => f.kind === 'factory').slice(0, 2).map(f => f.id);
  const [a, b] = Object.keys(roster);
  const slot = (n: string) => ({ operatorName: n, eliteLevel: roster[n].eliteLevel, level: roster[n].level });
  const crewA = { [rooms[0]]: [slot(a), null, null], [rooms[1]]: [null, null, null] };
  const crewB = { [rooms[0]]: [slot(b), null, null], [rooms[1]]: [null, null, null] };
  const staff = (crew: 0 | 1) => crew ? crewB[rooms[0]] : crewA[rooms[0]];
  const pattern = [0, 1, 1] as const; // the second crew covers changes 2 and 3
  const fake = {
    ...today, shape: 'thirds' as const, crews: [crewA, crewB], stepHours: 12, initialMorale: undefined,
    shifts: pattern.map(c => ({ ...today.shifts[0], refill: undefined, assignments: { ...today.shifts[0].assignments, [rooms[0]]: staff(c), [rooms[1]]: [null, null, null] } })),
    schedule: [
      { hour: 0, crewIn: [{ crew: 0, rooms: [rooms[0]] }], resting: [] },
      { hour: 12, crewIn: [{ crew: 1, rooms: [rooms[0]] }], resting: [] },
      { hour: 24, crewIn: [], resting: [] },
    ],
  };
  const g = genomeFromResult(fake, ctx)!;
  assert.deepEqual(g.assign[rooms[0]], [0, 1, 1]);
  assert.equal(g.crews[1][rooms[0]][0]?.operatorName, b);
});

test('a plan that needs more presets than the game stores is not a genome; repeated setups share one', () => {
  // The game stores three base presets. Four distinct shifts (the old staggered shape) cannot be set up as
  // presets, so the annealer never starts from them (the user saw four-shift recommendations, 2026-11-03). A
  // four-step duty of A, A, A, B needs two presets, so it is still a genome.
  assert.equal(MAX_ROTATION_SETUPS, 3);
  const rooms = Object.keys(today.shifts[0].assignments);
  const staffed = rooms.filter(id => (today.shifts[0].assignments[id] ?? []).some(Boolean));
  assert.ok(staffed.length >= 4, 'the fixture plan staffs at least four rooms');
  const without = (room: string) => ({ ...today.shifts[0], assignments: { ...today.shifts[0].assignments, [room]: today.shifts[0].assignments[room].map(() => null) } });
  const schedule = (crews: number[]) => crews.map((crew, i) => ({ hour: i * 12, crewIn: [{ crew, rooms }], resting: [] }));
  const four = { ...today, shifts: staffed.slice(0, 4).map(without), schedule: schedule([0, 1, 0, 1]) };
  assert.equal(distinctSetups(four.shifts), 4);
  assert.equal(genomeFromResult(four, ctx), null);
  const duty = { ...today, shifts: [today.shifts[0], today.shifts[0], today.shifts[0], today.shifts[1]], schedule: schedule([0, 0, 0, 1]) };
  assert.ok(distinctSetups(duty.shifts) <= 2);
  const g = genomeFromResult(duty, ctx);
  assert.ok(g && g.steps === 4, 'a four-step duty reads back');
  assert.ok(distinctSetups(decode(g!, ctx)) <= MAX_ROTATION_SETUPS);
});

// A built roster with Fiammetta and the Shamare trio, small enough for CI: today's optimizer staffs a Trading Post
// with Fiammetta as a plain worker and keeps no refill core.
const builtNames = ['Fiammetta', 'Shamare', 'Bibeak', 'Tequila', 'Proviso', 'Mr. Nothing', 'Vigil', 'Exusiai', 'Lemuen', 'Vermeil', 'Scene', 'Pallas', 'Weedy', 'Purestream', 'Bubble', 'Vulcan', 'Greyy the Lightningbearer', 'Lancet-2', 'Swire', 'Ling', 'Dusk', 'Mulberry', 'Iris', 'Czerny'];
const built: Record<string, OwnedOperator> = Object.fromEntries(builtNames.map(n => [n, { eliteLevel: 'Elite 2', level: 90 }]));
const builtCtx: GenomeContext = { base, roster: built, loginInterval: 8, drones: true };
const builtToday = optimizeBase({ base, roster: built, loginInterval: 8, factoryProducts: products, drones: true });
const builtSeed = genomeFromResult(builtToday, builtCtx)!;

test('Fiammetta working without a refill core rests like any worker when a plan is read back', () => {
  // Found 2026-10-30: she was left out of the dorms (as if refilling), ran out of Morale and the seed scored -890k.
  const works = builtToday.shifts.some(sh => Object.entries(sh.assignments).some(([id, s]) => !id.startsWith('dormitory') && (s ?? []).some(x => x?.operatorName === 'Fiammetta')));
  assert.ok(works && !builtSeed.core.length, 'the fixture should have Fiammetta working with no core');
  const e = evaluate(builtSeed, builtCtx);
  assert.ok(!e.sim.events.some(x => x.kind === 'exhausted'));
  assert.ok(e.value >= builtToday.score - 1e-6, `${e.value} < ${builtToday.score}`);
});

test('the core seed makes a whole room team the refill core, over three crews, with nobody run out or placed twice', () => {
  const r = coreSeed(builtSeed, builtCtx);
  assert.ok(r);
  assert.ok(r.genome.refillLowest);
  assert.equal(r.genome.crews.length, 3);
  assert.ok(placesNobodyTwice(r.genome, builtCtx));
  assert.ok(!r.evaluation.sim.events.some(x => x.kind === 'exhausted') && r.evaluation.sim.periodic);
  // Every core member holds the same room in every crew.
  for (const name of r.genome.core) {
    const rooms = r.genome.crews.map(c => Object.entries(c).find(([, s]) => (s ?? []).some(x => x?.operatorName === name))?.[0]);
    assert.ok(rooms[0] && rooms.every(x => x === rooms[0]), `${name}: ${rooms.join(', ')}`);
  }
});


test('three-crew results read back with their complete patterns and lowest-morale refill policy', () => {
  const shaped = coreSeed(builtSeed, builtCtx)!;
  assert.ok(shaped);
  const rendered = toOptimizerResult(shaped.genome, shaped.evaluation, builtCtx);
  const read = genomeFromResult(rendered, builtCtx)!;
  assert.equal(read.crews.length, 3);
  assert.deepEqual(read.assign, shaped.genome.assign);
  assert.equal(read.refillLowest, true);
  assert.ok(placesNobodyTwice(read, builtCtx));
  const evaluation = evaluate(read, builtCtx);
  assert.ok(evaluation.value >= shaped.evaluation.value - 1e-6);
  for (let step = 0; step < read.steps; step++) for (const room of facilities.filter(f => f.kind !== 'dormitory')) {
    assert.deepEqual(evaluation.shifts[step].assignments[room.id], shaped.evaluation.shifts[step].assignments[room.id]);
  }
});


test('a worker may change factories between shifts, while simultaneous placements are removed', () => {
  const [a, b] = facilities.filter(f => f.kind === 'factory');
  const name = Object.keys(roster)[0];
  const slot = { operatorName: name, ...roster[name] };
  const g: Genome = { ...structuredClone(seed), steps: 2, crews: [{}, { [b.id]: [slot] }], assign: { [a.id]: [0, 1], [b.id]: [0, 1] }, core: [] };
  placeGenomeOperator(g, 0, a.id, 0, slot, a.capacity);
  assert.equal(g.crews[1][b.id]?.[0]?.operatorName, name, 'the worker returns to another room on the other shift');
  assert.equal(hasWorkingCollision(g), false);
  assert.ok(placesNobodyTwice(g, ctx));
  g.assign[b.id] = [1, 0];
  assert.equal(hasWorkingCollision(g), true, 'retiming must not silently double-book the shared worker');
  placeGenomeOperator(g, 0, a.id, 0, slot, a.capacity);
  assert.equal(g.crews[1][b.id]?.[0], null, 'an overlapping placement leaves that other room');
  assert.equal(hasWorkingCollision(g), false);
  assert.ok(placesNobodyTwice(g, ctx));
});


test('splitting a crew starts the third template without changing placements, rest or refill output', () => {
  const [first, second] = facilities.filter(f => f.kind === 'factory').map(f => f.id);
  const split = splitCrew(seed, [{ room: first, step: 0 }, { room: second, step: 1 }])!;
  assert.deepEqual(split.crews[2][first], seed.crews[seed.assign[first][0]][first]);
  assert.deepEqual(split.crews[2][second], seed.crews[seed.assign[second][1]][second]);
  assert.equal(split.crews.length, 3);
  assert.deepEqual(decode(split, ctx), decode(seed, ctx));
  assert.equal(evaluate(split, ctx).value, evaluate(seed, ctx).value);
  assert.equal(splitCrew(split, []), null);
});


test('an atomic team replacement keeps an existing refill core in its other crews', () => {
  const room = facilities.find(f => f.kind === 'tradingPost')!;
  const [name, replacement] = Object.keys(roster);
  const slot = (operatorName: string) => ({ operatorName, ...roster[operatorName] });
  const g: Genome = { ...structuredClone(seed), steps: 2, crews: [{ [room.id]: [slot(name)] }, { [room.id]: [slot(name)] }],
    assign: { [room.id]: [0, 1] }, core: [name] };
  placeGenomeOperator(g, 1, room.id, 0, null, room.capacity, false);
  placeGenomeOperator(g, 1, room.id, 0, slot(name), room.capacity, false);
  placeGenomeOperator(g, 1, room.id, 1, slot(replacement), room.capacity, false);
  assert.equal(g.crews[0][room.id]?.[0]?.operatorName, name);
  assert.deepEqual(g.core, [name]);
  assert.ok(placesNobodyTwice(g, ctx));
});

test('a staggered seat decodes seat by seat, collides like any placement, and reads back from a saved plan exactly', () => {
  // The first factory's third seat takes the second crew's worker at change 2 while seats 1 and 2 work on.
  const factory = facilities.filter(f => f.kind === 'factory' && f.capacity >= 3)[0].id;
  const [a, b, c, d] = Object.keys(roster);
  const g: Genome = { ...seed, crews: seed.crews.map(crew => structuredClone(crew)), assign: Object.fromEntries(Object.entries(seed.assign).map(([r, p]) => [r, [...p]])), steps: 3 };
  for (const room of Object.keys(g.assign)) g.assign[room] = [0, 0, 1];
  const slot = (n: string) => ({ operatorName: n, eliteLevel: roster[n].eliteLevel, level: roster[n].level });
  g.crews = [{ ...g.crews[0], [factory]: [slot(a), slot(b), slot(c)] }, { ...g.crews[1], [factory]: [null, null, slot(d)] }];
  for (const crew of g.crews) for (const room of Object.keys(crew)) if (room !== factory) crew[room] = (crew[room] ?? []).map(x => x && [a, b, c, d].includes(x.operatorName) ? null : x);
  g.seatCrews = { [factory]: [undefined, undefined, [0, 1, 1]] };
  const shifts = decode(g, ctx);
  assert.deepEqual(shifts.map(sh => (sh.assignments[factory] ?? []).map(x => x?.operatorName ?? null)), [[a, b, c], [a, b, d], [null, null, d]]);
  assert.ok(placesNobodyTwice(g, ctx));
  // The seat's worker in the other crew's room elsewhere collides.
  const bad: Genome = structuredClone(g);
  const other = Object.keys(g.assign).find(r => r !== factory)!;
  bad.crews[0][other] = [slot(d), ...(bad.crews[0][other] ?? []).slice(1)];
  assert.ok(hasWorkingCollision(bad));
  // Through the result and back: the same shifts.
  const e = evaluate(g, ctx);
  const result = toOptimizerResult(g, e, ctx);
  assert.deepEqual(result.seatCrews, g.seatCrews);
  const back = genomeFromResult(result, ctx)!;
  assert.deepEqual(decode(back, ctx).map(sh => (sh.assignments[factory] ?? []).map(x => x?.operatorName ?? null)), [[a, b, c], [a, b, d], [null, null, d]]);
  assert.ok(toOptimizerResult(back, evaluate(back, ctx), ctx, genomeNotes(back, evaluate(back, ctx), ctx)).notes.some(n => n.includes('staggers')));
});

test('large neighbourhood search: off is the walk as it was, and the move keeps plans valid', () => {
  const opts = { timeMs: 60_000, seed: 7, maxRounds: 25 };
  const plain = anneal(seed, ctx, opts);
  // Off is the default, and asking for it by name draws the same moves: the walk is the one it was without.
  assert.deepEqual(anneal(seed, ctx, { ...opts, lns: 'off' }).genome, plain.genome);
  const moved = anneal(seed, ctx, { ...opts, lns: 'move' });
  // A re-solve may lead the walk anywhere (it costs output on some rosters), but never past a gate the search keeps.
  assert.ok(placesNobodyTwice(moved.genome, ctx));
  assert.equal(moved.evaluation.sim.periodic, true);
  assert.equal(moved.evaluation.sim.events.filter(e => e.kind === 'exhausted').length, 0);
  assert.ok(distinctSetups(decode(moved.genome, ctx)) <= MAX_ROTATION_SETUPS);
  // The same seed, the same plan.
  assert.deepEqual(anneal(seed, ctx, { ...opts, lns: 'move' }).genome, moved.genome);
});
