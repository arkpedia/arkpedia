import test from 'node:test';
import assert from 'node:assert/strict';
import { getAllOperators } from '../../lib/operators/operators';
import { toBaseRosters } from '../../lib/base/baseGroupRosters';
import { optimizeAccountBase, optimizerLayouts, productOptions } from '../../lib/base/accountOptimizer';
import { mergeAccountResults } from '../../lib/base/accountResults';
import { sustainableOutput, optimizeBase } from '../../lib/base/baseOptimizer';
import { ownedBaseRoster } from '../../lib/base/optimizerRoster';
import { getFacilities, layoutProblems, presetLevels, presetSpots } from '../../lib/base/baseConfig';
import type { AccountRecord } from '../../lib/account/accountStore';
import accountData from '../../tests/fixtures/base-account.json';
import groups from '../../data/base-group-rosters.json';
import slots from '../../data/base-skill-slots.json';
import recipes from '../../data/base-workshop-recipes.json';

const account = accountData as unknown as AccountRecord;
const operators = getAllOperators().filter(o => !/^Amiya \(/.test(o.name));
const known = new Set(operators.map(o => o.name));
const base = { operators, rosters: toBaseRosters(groups), skillSlots: slots, workshopRecipes: recipes };
// Exercise real layout/cadence logic with a bounded roster; never benchmark the
// entire released catalogue in routine CI.
const fixtureRoster = ownedBaseRoster({ ...account, operators: ['FEater', 'Gravel', 'Spot', 'Proviso', 'Texas', 'Myrtle', 'Lancet-2', 'Perfumer'] }, known).roster;

test('funded LMD uses gold once, and outside gold covers deficits without inventing EXP', () => {
  const output = { lmd: 10000, exp: 1234, goldMade: 10, goldSold: 20 };
  assert.equal(sustainableOutput(output).lmd, 5000);
  assert.equal(sustainableOutput(output, 5).lmd, 7500);
  assert.equal(sustainableOutput(output, 20).lmd, 10000);
  assert.equal(sustainableOutput(output).exp, 1234);
  assert.equal(sustainableOutput({ ...output, goldFreeLmd: 2000 }).lmd, 6000);
  assert.equal(sustainableOutput({ ...output, goldSold: 0 }).lmd, 10000);
});

test('layout comparisons preserve irreversible room upgrades and remain within the power budget', () => {
  const layouts = optimizerLayouts(account.base);
  assert(!layouts.some(l => l.id === 'mine'), '243 import is not an automatic recommendation');
  assert(layouts.some(l => l.id === '2-5-2-right'));
  assert(!layouts.some(l => l.id === '2-5-2-left'));
  for (const layout of layouts) assert.deepEqual(layoutProblems(layout.spots, layout.levels), []);
  assert.deepEqual(optimizerLayouts(account.base, false).map(l => l.id), ['mine']);
  const mixed = layouts.find(l => l.id === '2-5-2-right')!;
  // Two Lv3 and three Lv2 factories: every 0..2 x 0..3 gold split is distinct.
  assert.equal(productOptions(mixed).length, 12);
});

test('automatic recommendations search only 252; any valid imported layout can be searched alone', () => {
  const shape = (spots: Record<string, string>) => ['tradingPost', 'factory', 'powerPlant'].map(k => Object.values(spots).filter(v => v === k).length).join('');
  for (const compare of [true, false]) {
    for (const layout of optimizerLayouts(undefined, compare)) assert.equal(shape(layout.spots), '252', layout.id);
  }
  for (const id of ['2-4-3', '2-5-2-left', '2-5-2-right'] as const) {
    const snapshot = { ...account.base!, productionSpots: presetSpots(id), facilityLevels: presetLevels(id) };
    const compared = optimizerLayouts(snapshot, true);
    assert(compared.length > 0);
    for (const layout of compared) assert.equal(shape(layout.spots), '252', layout.id);
    assert.equal(compared.some(l => l.id === 'mine'), id !== '2-4-3');
    assert.deepEqual(optimizerLayouts(snapshot, false).map(l => l.id), ['mine']);
  }
  const threePosts = { ...account.base!, productionSpots: { ...presetSpots('2-5-2-right'), prod8: 'tradingPost' as const }, facilityLevels: presetLevels('2-5-2-right') };
  assert.equal(shape(threePosts.productionSpots), '342');
  assert(!optimizerLayouts(threePosts, true).some(l => l.id === 'mine'));
  assert.deepEqual(optimizerLayouts(threePosts, false).map(l => l.id), ['mine']);
});

test('selected-account progress takes precedence and class forms are one worker', () => {
  const selected = { operators: ['Amiya', 'Amiya (Guard)', 'Spot', 'FEater'], base: { ...account.base!, operatorProgress: { Spot: { eliteLevel: 'Base', level: 1 } } }, operatorBuilds: undefined };
  const result = ownedBaseRoster(selected, known);
  assert.equal(Object.keys(result.roster).length, 3);
  assert.deepEqual(result.roster.Spot, { eliteLevel: 'Base', level: 1 });
  assert.deepEqual(result.roster.FEater, { eliteLevel: 'Base', level: 1 });
  assert(result.assumed.includes('FEater'));
});

test('invalid login intervals fail before entering the search', () => {
  for (const loginInterval of [0, -1, Infinity, NaN]) assert.throws(() => optimizeBase({ base: { ...base, facilities: [] }, roster: {}, loginInterval, factoryProducts: {} }), /login interval/);
});

test('ordinary workers staff both factories in both crews instead of spending everyone on the first crew', () => {
  const facilities = getFacilities().map(f => ({ ...f, level: ['prod2', 'prod5', 'dormitory1'].includes(f.id) ? f.level : 0, capacity: ['prod2', 'prod5', 'dormitory1'].includes(f.id) ? f.capacity : 0 }));
  const roster = Object.fromEntries(['Adnachiel', 'Melantha', 'Catapult', 'Orchid', 'Plume', 'Midnight'].map(name => [name, { eliteLevel: 'Base' as const, level: 1 }]));
  const result = optimizeBase({ base: { ...base, facilities }, roster, loginInterval: 12, factoryProducts: { prod2: 'Battle Records', prod5: 'Battle Records' } });
  for (const crew of result.crews) for (const id of ['prod2', 'prod5']) assert(crew[id].some(Boolean), `${id} should have ordinary workers in both crews`);
  // Two factories' 8000 EXP base, plus 1% from three working operators on average.
  assert(Math.abs(result.simulation.perDay.exp - 16240) < 1e-6);
  assert(result.simulation.periodic);
  assert(!result.simulation.events.some(e => e.kind === 'exhausted'));
});

test('gold and EXP factories are distinct candidate rooms even at the same level', () => {
  const facilities = getFacilities().map(f => ({ ...f, level: ['prod2', 'prod5', 'dormitory1'].includes(f.id) ? f.level : 0, capacity: ['prod2', 'prod5', 'dormitory1'].includes(f.id) ? f.capacity : 0 }));
  const roster = Object.fromEntries(['Adnachiel', 'Melantha', 'Catapult', 'Orchid'].map(name => [name, { eliteLevel: 'Base' as const, level: 1 }]));
  const result = optimizeBase({ base: { ...base, facilities }, roster, loginInterval: 12, factoryProducts: { prod2: 'Precious Metals', prod5: 'Battle Records' } });
  assert(result.simulation.perDay.exp > 8000);
  assert(result.simulation.perDay.goldMade > 20);
  for (const crew of result.crews) assert(crew.prod2.some(Boolean) && crew.prod5.some(Boolean));
});

test('the standard-layout search returns the best funded score first and reports actual progress', () => {
  const roster = fixtureRoster;
  let completed = 0, of = 0;
  const snapshot = { ...account.base!, productionSpots: presetSpots('2-5-2-left'), facilityLevels: presetLevels('2-5-2-left') };
  const result = optimizeAccountBase({ base, roster, snapshot, loginInterval: 12, objective: 'balanced', externalGold: 9.14, compareLayouts: true, searchSeconds: 6 }, (done, total) => { completed = done; of = total; });
  // Progress is the share of the search time used, and reaches the end when the search does.
  assert.equal(completed, of);
  // An imported max-left 252 and max-right alternative remain distinct candidates.
  assert.deepEqual(new Set(result.recommendations.map(r => r.id)), new Set(['mine', '2-5-2-right']));
  for (let i = 1; i < result.recommendations.length; i++) assert(result.recommendations[i - 1].score >= result.recommendations[i].score);
  for (const recommendation of result.recommendations) assert.equal(recommendation.score, recommendation.output.lmd + recommendation.output.exp);
});

test('an imported account gets funded, repeatable, owned-only recommendations at daily and twice-daily logins', () => {
  const roster = fixtureRoster;
  for (const loginInterval of [24, 12, 8, 6]) {
    const progress: number[] = [];
    const result = optimizeAccountBase({ base, roster, snapshot: account.base, loginInterval, objective: 'balanced', externalGold: 0, compareLayouts: false, searchSeconds: 6 }, (done, total) => progress.push(done / total));
    assert(result.recommendations.length > 0);
    assert.equal(progress.at(-1), 1);
    const recommendation = result.recommendations[0];
    assert(recommendation.plan.simulation.periodic);
    assert(!recommendation.plan.simulation.events.some(e => e.kind === 'exhausted'));
    assert(recommendation.output.goldSold <= recommendation.output.goldMade + 1e-6);
    const facilities = getFacilities(recommendation.spots, recommendation.levels);
    for (const shift of recommendation.plan.shifts) {
      const names = Object.values(shift.assignments).flatMap(s => s.flatMap(o => o ? [o.operatorName] : []));
      assert.equal(names.length, new Set(names).size);
      for (const name of names) assert(name in roster);
      for (const room of facilities) assert((shift.assignments[room.id]?.filter(Boolean).length ?? 0) <= room.capacity);
    }
  }
});

test('a recommendation saved as a rotation recalculates to the yields the optimizer showed', async () => {
  // pages/base.tsx saveOptimizerRotation, reduced: one preset per shift, and the plan carries Fiammetta's
  // refills, drone weights and parked Morale. Without them the page re-scored a different plan (2026-10-30).
  const { calculateRotation } = await import('../../lib/base/calculateRotation');
  const result = optimizeAccountBase({ base, roster: fixtureRoster, snapshot: account.base, loginInterval: 12, objective: 'balanced', externalGold: 0, compareLayouts: false, searchSeconds: 6 });
  const r = result.recommendations[0];
  const presets = r.plan.shifts.map((shift, i) => ({
    id: `p${i}`, name: `p${i}`, savedAt: '', version: 1 as const, productionSpots: r.spots, facilityLevels: r.levels,
    assignments: shift.assignments, factoryProducts: shift.factoryProducts, dormitoryAmbience: account.base?.dormitoryAmbience ?? {},
    clueExchangeActive: false, moraleAbove12: true, swapPolicy: 'onLogin' as const, loginInterval: 12,
    trainingTarget: { class: 'Guard', branch: '', mastery: 1, timeReductionActive: false, instantTrainingReady: false },
    workshopSettings: { recipeId: '1', causality: 0, karma: 0, thornsFailures: 0, qualifyingDormOperators: 0 },
  }));
  const plan = { version: 1 as const, startHour: 8, externalGold: 0, drones: r.weights, ...(r.plan.initialMorale ? { parked: r.plan.initialMorale } : {}), ...(r.plan.refillPolicy ? { refillPolicy: r.plan.refillPolicy } : {}),
    shifts: presets.map((p, i) => ({ id: `s${i}`, presetId: p.id, hours: r.plan.stepHours, ...(r.plan.shifts[i].refill ? { refill: r.plan.shifts[i].refill } : {}), ...(r.plan.shifts[i].reseat ? { reseat: r.plan.shifts[i].reseat } : {}) })) };
  const rotation = calculateRotation(base, plan, presets as never, 12);
  assert.ok(rotation.totals);
  assert.ok(Math.abs(rotation.totals!.dailyExpGreen - r.output.exp) < 1, `EXP ${rotation.totals!.dailyExpGreen} vs ${r.output.exp}`);
  assert.ok(Math.abs(rotation.totals!.dailyGoldWorthGreen - r.output.lmd) < 1, `LMD ${rotation.totals!.dailyGoldWorthGreen} vs ${r.output.lmd}`);
});

test('the formations search, run beside the main one, merges into each layout\'s better plan', () => {
  // Fiammetta added so formations are tried; one first plan per layout, then all the time on the leader.
  const roster = ownedBaseRoster({ ...account, operators: ['FEater', 'Gravel', 'Spot', 'Proviso', 'Texas', 'Myrtle', 'Lancet-2', 'Perfumer', 'Fiammetta', 'Shamare'] }, known).roster;
  const input = { base, roster, snapshot: account.base, loginInterval: 12, objective: 'balanced' as const, externalGold: 0, compareLayouts: true, searchSeconds: 6 };
  const main = optimizeAccountBase(input);
  const formations = optimizeAccountBase({ ...input, formations: true });
  assert(formations.recommendations.length >= 1);
  for (const r of formations.recommendations) {
    assert(r.plan.simulation.periodic && !r.plan.simulation.events.some(e => e.kind === 'exhausted'));
    for (const sh of r.plan.shifts) { const names = Object.values(sh.assignments).flatMap(s => (s ?? []).flatMap(x => x ? [x.operatorName] : [])); assert.equal(new Set(names).size, names.length); }
  }
  const merged = mergeAccountResults(main, null, formations)!;
  assert.deepEqual(merged.recommendations.map(r => r.id).sort(), [...new Set([...main.recommendations, ...formations.recommendations].map(r => r.id))].sort());
  for (const r of merged.recommendations) assert.equal(r.score, Math.max(...[...main.recommendations, ...formations.recommendations].filter(x => x.id === r.id).map(x => x.score)));
  for (let i = 1; i < merged.recommendations.length; i++) assert(merged.recommendations[i - 1].score >= merged.recommendations[i].score);
  assert.equal(merged.searched, main.searched + formations.searched);
  assert.equal(mergeAccountResults(null, undefined), null);
});


test('dorm recovery residents stay reserved through account seeds and annealing', () => {
  const roster = { ...fixtureRoster, Perfumer: { eliteLevel: 'Elite 1' as const, level: 60 } };
  const result = optimizeAccountBase({ base, roster, snapshot: account.base, loginInterval: 12,
    objective: 'balanced', externalGold: 0, compareLayouts: false, searchSeconds: 5, lockedDorm: ['Perfumer'] });
  assert.ok(result.recommendations.length);
  for (const recommendation of result.recommendations) {
    const kinds = new Map(getFacilities(recommendation.spots, recommendation.levels).map(f => [f.id, f.kind]));
    for (const shift of recommendation.plan.shifts) {
      const placements = Object.entries(shift.assignments).flatMap(([room, slots]) =>
        (slots ?? []).flatMap(s => s?.operatorName === 'Perfumer' ? [room] : []));
      assert.equal(placements.length, 1);
      assert.equal(kinds.get(placements[0]), 'dormitory');
    }
    assert.ok(recommendation.plan.simulation.periodic);
    assert.ok(!recommendation.plan.simulation.events.some(e => e.kind === 'exhausted'));
  }
});
