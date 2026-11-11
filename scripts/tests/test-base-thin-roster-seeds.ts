import test from 'node:test';
import assert from 'node:assert/strict';
import { getAllOperators } from '../../lib/operators/operators';
import { getFacilities, presetLevels, presetSpots } from '../../lib/base/baseConfig';
import { toBaseRosters } from '../../lib/base/baseGroupRosters';
import { optimizeBase, type OptimizerResult, type OwnedOperator } from '../../lib/base/baseOptimizer';
import groups from '../../data/base-group-rosters.json';
import slots from '../../data/base-skill-slots.json';
import recipes from '../../data/base-workshop-recipes.json';

// A thin roster at 12-hour logins (found 2026-11-11): two alternating teams are capped by the 20 beds, so a third of
// the seats stood open. The seed plans below are what staff them: a three-shift rotation with the support rooms
// staffed first, and Team Rainbow's standing Control Center (the owner's suggestion).
const operators = getAllOperators().filter(o => !/^Amiya \(/.test(o.name) && !o.isFuture);
const facilities = getFacilities(presetSpots('2-5-2-right'), presetLevels('2-5-2-right'));
const base = { operators, facilities, rosters: toBaseRosters(groups), skillSlots: slots, workshopRecipes: recipes };
const RAINBOW = ['Ash', 'Frost', 'Tachanka', 'Blitz'];
const kind = new Map(facilities.map(f => [f.id, f.kind]));
/** The first `count` released operators by name, without Team Rainbow's four, each at Elite 2 level 60. */
function thin(count: number, extra: string[] = []): Record<string, OwnedOperator> {
  const names = operators.map(o => o.name).filter(n => !RAINBOW.includes(n) && n !== 'Fiammetta').sort().slice(0, count);
  return Object.fromEntries([...names, ...extra].map(n => [n, { eliteLevel: 'Elite 2', level: 60 } as OwnedOperator]));
}
const products = Object.fromEntries(facilities.filter(f => f.kind === 'factory').map((f, i) => [f.id, i < 2 ? 'Precious Metals' as const : 'Battle Records' as const]));
const plan = (roster: Record<string, OwnedOperator>) => optimizeBase({ base, roster, loginInterval: 12, factoryProducts: products, weights: { lmd: 1, exp: 1, goldMade: 500 }, sustainable: true, externalGold: 0, drones: true });
function assertSound(result: OptimizerResult) {
  assert.ok(result.simulation.periodic, 'the rotation repeats');
  assert.equal(result.simulation.events.filter(e => e.kind === 'exhausted').length, 0, 'nobody runs out of Morale');
  for (const [i, shift] of result.shifts.entries()) {
    const names = Object.values(shift.assignments).flatMap(s => s.flatMap(x => x ? [x.operatorName] : []));
    assert.equal(new Set(names).size, names.length, `shift ${i + 1} places nobody twice`);
  }
}
const working = (result: OptimizerResult, step: number) => Object.entries(result.shifts[step].assignments).filter(([id]) => kind.get(id) !== 'dormitory').flatMap(([, s]) => s.flatMap(x => x ? [x.operatorName] : []));

test("Team Rainbow's four hold the Control Center in every shift, with no bed, where that scores higher", () => {
  const without = plan(thin(70)), withFour = plan(thin(70, RAINBOW));
  assertSound(without); assertSound(withFour);
  assert.ok(withFour.notes.some(n => n.startsWith('The Control Center never changes: Ash, Frost, Tachanka, Blitz')), withFour.notes.join(' / '));
  assert.ok(withFour.score > without.score, `${withFour.score.toFixed(0)} with the four, ${without.score.toFixed(0)} without`);
  for (const [i, shift] of withFour.shifts.entries()) {
    const cc = (shift.assignments.controlCenter ?? []).flatMap(x => x ? [x.operatorName] : []);
    assert.deepEqual(RAINBOW.filter(n => !cc.includes(n)), [], `shift ${i + 1}: the four are in the Control Center`);
    assert.equal(cc.length, 5, `shift ${i + 1}: and a fifth`);
    const beds = Object.entries(shift.assignments).filter(([id]) => kind.get(id) === 'dormitory').flatMap(([, s]) => s.flatMap(x => x ? [x.operatorName] : []));
    assert.deepEqual(beds.filter(n => cc.includes(n)), [], `shift ${i + 1}: none of the five takes a bed`);
  }
  // Five beds a change go to other workers: more of the base is staffed than the beds alone allow.
  assert.ok(working(withFour, 0).length > working(without, 0).length, `${working(withFour, 0).length} working with the four, ${working(without, 0).length} without`);
});

test('a roster without all four never gets the standing Control Center', () => {
  const result = plan(thin(70, ['Ash', 'Frost', 'Tachanka']));
  assertSound(result);
  assert.ok(!result.notes.some(n => n.startsWith('The Control Center never changes')));
});

test('a thin roster keeps a sound rotation whichever seed wins', () => {
  for (const count of [15, 40, 100]) assertSound(plan(thin(count)));
});
