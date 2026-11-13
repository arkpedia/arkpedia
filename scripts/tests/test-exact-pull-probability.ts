import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateOdds } from '../../lib/pulls/exactProbability';
import { simulateOdds, type BannerOdds, type OddsRequest } from '../../lib/pulls/probability';
const op = (name: string, rarity: 5 | 6, share: number, spark?: number) => ({ name, rarity, share, kind: 'featured' as const, icon: null, spark });
const orchid: BannerOdds = { id: 'LINKAGE_74_0_1', type: 'crossover', sources: [], operators: [op('Orchid', 6, .5), op('Catapult', 5, .5)] };
const pair: BannerOdds = { id: 'pair', type: 'crossover', sources: [], operators: [op('Six', 6, .5), op('Five A', 5, .25), op('Five B', 5, .25)] };
const limited: BannerOdds = { id: 'limited', type: 'limited', sources: [], bonus: 'Six A', operators: [op('Six A', 6, .35, 300), op('Six B', 6, .35, 300), op('Five', 5, .5, 75)] };
const near = (actual: number, expected: number, tolerance = 1e-11) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} differs from ${expected}`);
const request = (rules: BannerOdds, pulls: number, copies: number[]): OddsRequest => ({ rules, pulls, targets: copies.map((copies, index) => ({ name: rules.operators[index].name, copies })), spark: false });

test('reported Orchid case is calculated exactly and adding Catapult never raises success', () => {
  const alone = calculateOdds(request(orchid, 230, [6]));
  const both = calculateOdds(request(orchid, 230, [6, 1]));
  // Independently evaluated six-star pity / 120-pull-reset recurrence.
  near(alone.all.probability, .0712918727955598);
  near(both.all.probability, .0712918697960694);
  assert.equal(alone.method, 'exact'); assert.equal(alone.samples, 0);
  assert.ok(both.all.probability <= alone.all.probability);
  assert.deepEqual(both.copies[0], alone.copies[0]);
});

test('exact one-pull and first-ten probabilities match closed forms', () => {
  const result = calculateOdds(request(limited, 1, [1, 1, 1]));
  near(result.copies[0][0].probability, .007);
  near(result.copies[1][0].probability, .007);
  near(result.copies[2][0].probability, .04);
  assert.equal(result.all.probability, 0);
  const fiveOnly: BannerOdds = { id: 'five', type: 'limited', sources: [], operators: [op('Five', 5, 1)] };
  near(calculateOdds(request(fiveOnly, 10, [1])).all.probability, 1 - .92 ** 10 + .9 ** 10);
});

test('paired crossover guarantee contributes the exact two-pull joint probability', () => {
  const result = calculateOdds({ rules: pair, pulls: 2, targets: [{ name: 'Five A', copies: 1 }, { name: 'Five B', copies: 1 }], spark: false });
  near(result.all.probability, .04 * .08);
  assert.ok(result.all.probability > result.copies[0][0].probability * result.copies[1][0].probability);
});

test('limited shared spark wallet, 300-pull gift and ordered goals are handled jointly', () => {
  const base = request(limited, 75, [1, 1, 1]);
  const both = calculateOdds(base);
  const reversed = calculateOdds({ ...base, targets: [...base.targets].reverse() });
  near(reversed.all.probability, both.all.probability);
  assert.deepEqual(reversed.copies, [...both.copies].reverse());
  assert.ok(calculateOdds({ ...base, spark: true }).all.probability >= both.all.probability);
  const gift = calculateOdds({ ...request(limited, 300, [2, 1]), spark: true });
  assert.equal(gift.copies[0][1].certain, true);
  assert.equal(gift.all.certain, false, 'one wallet cannot buy both missing six-stars');
  assert.ok(gift.all.probability < 1);
});

test('normal three-target crossover agrees with an independent sampler without using it for results', () => {
  const input = request(pair, 80, [1, 1, 1]);
  const exact = calculateOdds(input);
  const sampled = simulateOdds(input, 50000);
  near(sampled.all.probability, exact.all.probability, .008);
  for (let i = 0; i < 3; i++) for (let n = 0; n < 6; n++) near(sampled.copies[i][n].probability, exact.copies[i][n].probability, .008);
  const stronger = calculateOdds(request(pair, 80, [2, 1, 1]));
  assert.ok(stronger.all.probability <= exact.all.probability);
});

test('zero budget is impossible and a larger budget never lowers an exact chance', () => {
  assert.equal(calculateOdds(request(orchid, 0, [1])).all.impossible, true);
  let previous = 0;
  for (const pulls of [1, 9, 10, 11, 50, 51, 120]) {
    const result = calculateOdds(request(orchid, pulls, [1, 1]));
    assert.ok(result.all.probability >= previous - 1e-12);
    previous = result.all.probability;
  }
});

test('oversized combinations fail explicitly instead of silently switching to sampled odds', () => {
  const rules: BannerOdds = { id: 'many', type: 'limited', sources: [], operators: Array.from({ length: 20 }, (_, i) => op(`Returner ${i}`, 6, .01)) };
  assert.throws(() => calculateOdds({ rules, pulls: 100, targets: rules.operators.map(op => ({ name: op.name, copies: 6 })), spark: false }), /exact calculation limit/);
});

test('Standard safety-net calculation agrees with the reference sampler after 150 pulls', () => {
  const single: BannerOdds = { ...orchid, type: 'single', id: 'single' };
  const input = request(single, 200, [2]);
  const exact = calculateOdds(input);
  const sampled = simulateOdds(input, 50000);
  for (let n = 0; n < 6; n++) near(sampled.copies[0][n].probability, exact.copies[0][n].probability, .008);
});

test('Orienteering uses the chosen pool and roster order does not change calculated odds', () => {
  const rules: BannerOdds = { id: 'orienteering', type: 'orienteering', sources: [], operators: [
    ...['A', 'B', 'C'].map(name => op(name, 6, 0)), ...['D', 'E', 'F'].map(name => op(name, 5, 0)),
  ] };
  const input = { ...request(rules, 1, [1]), roster: rules.operators.map(op => op.name) };
  near(calculateOdds(input).all.probability, .02 / 3);
  assert.deepEqual(calculateOdds({ ...input, roster: [...input.roster].reverse() }), calculateOdds(input));
  const five = { ...input, targets: [{ name: 'D', copies: 1 }] };
  near(calculateOdds(five).all.probability, .08 * .2);
});
