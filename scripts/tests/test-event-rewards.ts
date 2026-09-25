import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeRewardTotals, stockLimit, type ResolvedRewardStore } from '../../lib/events/rewardTotals';
import { loadAllEventYears, type EventRewardBlock } from '../../lib/events/loadEventsData';

/*
 * GE-15: an event store listing with unlimited stock printed "×0" in the All view.
 * The release writes unlimited as "∞" on six events and the page only skipped the
 * word "unlimited", so parseInt('∞') became 0 and LMD, Grindstone and friends showed
 * as zero on People, A People. A parse bug is caught best where the parse happens.
 */

const store = (items: [name: string, quantity: number | string, stock: string][]): ResolvedRewardStore => ({
  type: 'Events Store',
  name: 'Store',
  items: items.map(([name, quantity, stock]) => ({ name, quantity, stock, price: 10, currency: 'Coin', iconPath: null })),
});

test('every spelling of unlimited stock is unlimited, and only whole numbers are limits', () => {
  for (const spelling of ['∞', 'unlimited', 'Unlimited', '', ' ', '-', 'n/a']) {
    assert.equal(stockLimit(spelling), null, `"${spelling}" is not a count`);
  }
  assert.equal(stockLimit('5'), 5);
  assert.equal(stockLimit(' 12 '), 12);
});

test('an unlimited listing never becomes a zero total', () => {
  const totals = computeRewardTotals([store([
    ['LMD', '5K', '∞'],
    ['Grindstone', 1, '∞'],
    ['Orirock Cube', 2, 'unlimited'],
  ])]);
  assert.deepEqual(totals, [], 'a material with only unlimited listings has nothing finite to total');
});

test('a finite listing is totalled and an unlimited one beside it is left out', () => {
  const totals = computeRewardTotals([
    store([['LMD', '10K', '20'], ['Device', 1, '3']]),
    store([['LMD', '5K', '∞'], ['Device', 1, '2']]),
  ]);
  assert.deepEqual(totals.map((t) => [t.name, t.total]).sort(), [['Device', 5], ['LMD', 200000]]);
});

test('no event in the bundled data totals a reward to zero or NaN', () => {
  const events = loadAllEventYears() as { name: string; rewards?: EventRewardBlock | EventRewardBlock[] | null }[];
  let checked = 0;
  for (const event of events) {
    if (!event.rewards) continue;
    const blocks = Array.isArray(event.rewards) ? event.rewards : [event.rewards];
    const stores: ResolvedRewardStore[] = blocks.map((block) => ({
      type: block.type,
      name: block.name,
      items: block.items.map((item) => ({
        name: item.name,
        quantity: item.reward_quantity ?? 1,
        price: item.price ?? item.price_cork_stoppers ?? null,
        currency: block.currency || '',
        stock: item.stock ?? '1',
        iconPath: null,
      })),
    }));
    for (const total of computeRewardTotals(stores)) {
      checked += 1;
      assert.ok(Number.isFinite(total.total) && total.total > 0, `${event.name}: ${total.name} totals ${total.total}`);
    }
  }
  assert.ok(checked > 0, 'the bundled events carry reward stores');
});
