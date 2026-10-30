import test from 'node:test';
import assert from 'node:assert/strict';
import { getAllOperators } from '../../lib/operators/operators';
import { toBaseRosters } from '../../lib/base/baseGroupRosters';
import { optimizeAccountBase, optimizerLayouts, productOptions } from '../../lib/base/accountOptimizer';
import { sustainableOutput, optimizeBase } from '../../lib/base/baseOptimizer';
import { ownedBaseRoster } from '../../lib/base/optimizerRoster';
import { getFacilities, layoutProblems } from '../../lib/base/baseConfig';
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
  assert(layouts.some(l => l.id === 'mine'));
  assert(layouts.some(l => l.id === '2-5-2-right'));
  assert(!layouts.some(l => l.id === '2-5-2-left'));
  for (const layout of layouts) assert.deepEqual(layoutProblems(layout.spots, layout.levels), []);
  assert.deepEqual(optimizerLayouts(account.base, false).map(l => l.id), ['mine']);
  const mixed = layouts.find(l => l.id === '2-5-2-right')!;
  // Two Lv3 and three Lv2 factories: every 0..2 x 0..3 gold split is distinct.
  assert.equal(productOptions(mixed).length, 12);
});

test('only 243 and 252 layouts are searched when comparing; the imported layout stays when asked for alone', () => {
  const shape = (spots: Record<string, string>) => ['tradingPost', 'factory', 'powerPlant'].map(k => Object.values(spots).filter(v => v === k).length).join('');
  for (const compare of [true, false]) {
    for (const layout of optimizerLayouts(undefined, compare)) assert(['243', '252'].includes(shape(layout.spots)), `${layout.id} is ${shape(layout.spots)}`);
  }
  assert(!optimizerLayouts(undefined, true).some(l => ['1-5-3', '3-4-2'].includes(l.id)), '153 and 342 are no longer offered');
  // A 342 import compares only against the standard 243 and 252 layouts, but is searched alone on request.
  const threePosts = { ...account.base!, productionSpots: { ...account.base!.productionSpots, prod8: 'tradingPost' as const } };
  if (shape(threePosts.productionSpots) !== '243' && shape(threePosts.productionSpots) !== '252') {
    assert(!optimizerLayouts(threePosts, true).some(l => l.id === 'mine'));
    assert(optimizerLayouts(threePosts, false).some(l => l.id === 'mine'));
  }
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
  const result = optimizeAccountBase({ base, roster, snapshot: account.base, loginInterval: 12, objective: 'balanced', externalGold: 9.14, compareLayouts: true, searchSeconds: 6 }, (done, total) => { completed = done; of = total; });
  // Progress is the share of the search time used, and reaches the end when the search does.
  assert.equal(completed, of);
  // The fixture is itself a 243 (the same as the standard 243), so with only 243 and 252 searched there are two.
  assert(result.recommendations.length >= 2);
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
