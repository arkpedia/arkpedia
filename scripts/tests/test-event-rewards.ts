import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeRewardTotals, parseRewardQuantity, stockLimit, totalRewards, type ResolvedRewardStore } from '../../lib/events/rewardTotals';
import { loadAllEventYears, wikiStoreBlocks, type EventRewardBlock, type EventStoresFile } from '../../lib/events/loadEventsData';
import { tableRewardStores, type EventRewardsFile } from '../../lib/events/tableRewards';
import { materialOrderFor } from '../../lib/farming/materialSortOrder';
import { checkMaterialCatalogue } from '../../lib/farming/materialCatalogue.mjs';
import catalogue from '../../data/material-catalogue.json';
import eventStoresFile from '../../data/event-stores.json';
import eventRewardsFile from '../../data/event-rewards.json';

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
  ])], ['Orirock Cube']);
  assert.deepEqual(totals, [], 'a material with only unlimited listings has nothing finite to total');
});

test('a finite listing is totalled and an unlimited one beside it is left out', () => {
  const totals = computeRewardTotals([
    store([['LMD', '10K', '20'], ['Device', 1, '3']]),
    store([['LMD', '5K', '∞'], ['Device', 1, '2']]),
  ], ['Device']);
  assert.deepEqual(totals.map((t) => [t.name, t.total]).sort(), [['Device', 5], ['LMD', 200000]]);
});

test('totals list what the catalogue does not know (skins) first, then materials in its order', () => {
  const totals = computeRewardTotals([store([
    ['Orirock Cube', 1, '1'], ['Device', 1, '1'], ['Zeta Skin', 1, '1'], ['Alpha Skin', 1, '1'],
  ])], ['Orirock Cube', 'Device']);
  assert.deepEqual(totals.map((t) => t.name), ['Alpha Skin', 'Zeta Skin', 'Orirock Cube', 'Device']);
});

test('a reward in several blocks keeps the first icon any of them has, and a zero total is no tile', () => {
  // The milestone names a Duel Trophy by its furniture id and so has its icon; the wiki store's row
  // is a name only. The All row took the icon of whichever block came last, so the store's empty
  // icon replaced the milestone's (the reward card's own copy of this loop had been fixed alone).
  const blocks: ResolvedRewardStore[] = [
    { type: 'Milestones', name: 'Track', items: [{ name: 'Duel Trophy', quantity: 1, price: null, currency: '', stock: '1', iconPath: '/material-icons/furni_enemyduel_diceAll_01.webp' }] },
    { type: 'Events Store', name: 'Store', items: [{ name: 'Duel Trophy', quantity: 1, price: 10, currency: 'Token', stock: '1', iconPath: null }, { name: 'Mystery', quantity: '?', price: 10, currency: 'Token', stock: '3', iconPath: null }] },
  ];
  assert.deepEqual(computeRewardTotals(blocks, []), [{ name: 'Duel Trophy', iconPath: '/material-icons/furni_enemyduel_diceAll_01.webp', total: 2 }]);
  assert.deepEqual(totalRewards([...blocks].reverse()).map((t) => [t.name, t.iconPath]), [['Duel Trophy', '/material-icons/furni_enemyduel_diceAll_01.webp']], 'whichever block comes first');
});

/*
 * The bundled data, every source the event page lists and totals: the store as the wiki lists it
 * (data/event-stores.json, read first), the event record's own one-off import (the six legacy
 * events, where the wiki has no store), and the game tables' sign-ins, gifts, missions and first
 * clears (data/event-rewards.json). The totals leave a zero out rather than draw "×0", so a
 * quantity the parse misreads would vanish from the All card without a word: each listing's
 * quantity is read here itself, and each source must have listings to read, or the check passes
 * on nothing.
 */
const resolved = (blocks: EventRewardBlock[]): ResolvedRewardStore[] => blocks.map((block) => ({
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

/** Every finite listing reads as a positive quantity and every total is positive; the listings
 *  checked, for the caller's non-empty assertion. */
function checkListings(event: string, stores: ResolvedRewardStore[]): number {
  let checked = 0;
  for (const store of stores) {
    for (const item of store.items) {
      if (stockLimit(item.stock) === null) continue;
      checked += 1;
      const quantity = parseRewardQuantity(item.quantity);
      assert.ok(Number.isFinite(quantity) && quantity > 0, `${event}: ${store.name}: ${item.name} reads as ${quantity} from ${JSON.stringify(item.quantity)}`);
    }
  }
  const order = materialOrderFor(checkMaterialCatalogue(catalogue), stores.flatMap((s) => s.items.map((item) => item.name)));
  for (const total of computeRewardTotals(stores, order)) {
    assert.ok(Number.isFinite(total.total) && total.total > 0, `${event}: ${total.name} totals ${total.total}`);
  }
  return checked;
}

test('no store the wiki lists (data/event-stores.json) has a listing that reads as zero or NaN', () => {
  const { events } = eventStoresFile as EventStoresFile;
  let checked = 0;
  for (const [name, { stores }] of Object.entries(events)) checked += checkListings(name, resolved(wikiStoreBlocks(stores)));
  assert.ok(checked > 0, 'data/event-stores.json carries store listings');
});

test('no event record\'s own reward import totals a reward to zero or NaN', () => {
  const events = loadAllEventYears() as { name: string; rewards?: EventRewardBlock | EventRewardBlock[] | null }[];
  let checked = 0;
  for (const event of events) {
    if (!event.rewards) continue;
    checked += checkListings(event.name, resolved(Array.isArray(event.rewards) ? event.rewards : [event.rewards]));
  }
  assert.ok(checked > 0, 'the bundled events carry reward stores');
});

test('no table reward (data/event-rewards.json) the page lists, and no pack it shows, is zero or NaN', () => {
  const { events } = eventRewardsFile as EventRewardsFile;
  let checked = 0, packed = 0;
  for (const [name, { groups }] of Object.entries(events)) {
    // As the page takes them: tokens dropped, a group with no tab (a draw login, packs) no block.
    checked += checkListings(name, tableRewardStores(groups, () => null));
    // A pack's contents are no total, but its tab prints each one's ×count.
    for (const pack of groups.flatMap((group) => group.packs ?? [])) {
      for (const item of pack.contents) {
        packed += 1;
        assert.ok(Number.isFinite(item.count) && item.count > 0, `${name}: ${pack.name}: ${item.name} ×${item.count}`);
      }
    }
  }
  assert.ok(checked > 0, 'data/event-rewards.json carries listed rewards');
  assert.ok(packed > 0, 'data/event-rewards.json carries pack contents');
});
