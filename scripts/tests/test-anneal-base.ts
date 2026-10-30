import test from 'node:test';
import assert from 'node:assert/strict';
import { getAllOperators } from '../../lib/operators/operators';
import { toBaseRosters } from '../../lib/base/baseGroupRosters';
import { optimizeBase, type OwnedOperator } from '../../lib/base/baseOptimizer';
import { decode, evaluate, genomeFromResult, toOptimizerResult, type GenomeContext } from '../../lib/base/planGenome';
import { anneal, placesNobodyTwice } from '../../lib/base/annealBase';
import { coreSeed } from '../../lib/base/coreSeed';
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

test('a staggered plan, whose schedule names only the rooms that change crew, reads back with each room\'s full pattern', () => {
  // Rooms in the second half keep the second crew for two changes running; the schedule names them only when
  // they change, and a room left unnamed keeps its crew (found 2026-10-30: it was read as the first crew).
  const rooms = facilities.filter(f => f.kind === 'factory').slice(0, 2).map(f => f.id);
  const [a, b] = Object.keys(roster);
  const slot = (n: string) => ({ operatorName: n, eliteLevel: roster[n].eliteLevel, level: roster[n].level });
  const crewA = { [rooms[0]]: [slot(a), null, null], [rooms[1]]: [null, null, null] };
  const crewB = { [rooms[0]]: [slot(b), null, null], [rooms[1]]: [null, null, null] };
  const staff = (crew: 0 | 1) => crew ? crewB[rooms[0]] : crewA[rooms[0]];
  const pattern = [0, 1, 1, 0] as const; // the second crew covers changes 2 and 3
  const fake = {
    ...today, shape: 'staggered' as const, crews: [crewA, crewB], stepHours: 12, initialMorale: undefined,
    shifts: pattern.map(c => ({ ...today.shifts[0], refill: undefined, assignments: { ...today.shifts[0].assignments, [rooms[0]]: staff(c), [rooms[1]]: [null, null, null] } })),
    schedule: [
      { hour: 0, crewIn: [{ crew: 0, rooms: [rooms[0]] }], resting: [] },
      { hour: 12, crewIn: [{ crew: 1, rooms: [rooms[0]] }], resting: [] },
      { hour: 24, crewIn: [], resting: [] },
      { hour: 36, crewIn: [{ crew: 0, rooms: [rooms[0]] }], resting: [] },
    ],
  };
  const g = genomeFromResult(fake, ctx)!;
  assert.deepEqual(g.assign[rooms[0]], [0, 1, 1, 0]);
  assert.equal(g.crews[1][rooms[0]][0]?.operatorName, b);
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
