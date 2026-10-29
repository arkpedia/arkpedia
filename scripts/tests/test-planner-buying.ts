import assert from 'node:assert/strict';
import { test } from 'node:test';
import baseFormulas from '../../data/base-formulas.json';
import battleRecords from '../../data/battle-records.json';
import catalogue from '../../data/material-catalogue.json';
import { createCraftTools, type Formula } from '../../lib/planner/craft';

/*
 * A Dualchip can be declared a craft (two Chip Packs and a Chip Catalyst at the Factory), and a
 * Chip Catalyst can be declared a purchase (Purchase Certificates at the store). Both are
 * declarations: the automatic walk still leaves Dualchips alone, and a purchase turns the
 * shortfall into the certificates it costs.
 */
const tools = createCraftTools(baseFormulas as unknown as Record<string, Formula>, battleRecords, catalogue.order);
const row = (rows: ReturnType<typeof tools.resolveNeeds>['rows'], name: string) => rows.find((r) => r.name === name)!;
const need = [{ name: 'Guard Dualchip', quantity: 2 }];

test('only a Dualchip is declarable beyond the walkable recipes', () => {
  assert.equal(tools.isDeclarable('Guard Dualchip'), true);
  assert.equal(tools.isCraftable('Guard Dualchip'), false, 'the automatic walk keeps leaving it alone');
  // MANUFACTURE also holds the Battle Records, Pure Gold and the Originium Shard.
  for (const name of ['Pure Gold', 'Originium Shard', 'Tactical Battle Record', 'Guard Chip Pack', 'Chip Catalyst']) {
    assert.equal(tools.isDeclarable(name), false, name);
  }
  assert.equal(tools.isDeclarable('Orirock Cluster'), true, 'a walkable recipe stays declarable');
});

test('a declared Dualchip is its Chip Packs and Chip Catalysts', () => {
  const plain = tools.resolveNeeds(need, {}, { incoming: null, autoCraft: false });
  assert.equal(row(plain.rows, 'Guard Dualchip').coverage, 'short');
  const crafted = tools.resolveNeeds(need, {}, { crafting: new Set(['Guard Dualchip']), incoming: null, autoCraft: false });
  assert.equal(row(crafted.rows, 'Guard Dualchip').coverage, 'crafting');
  assert.equal(row(crafted.rows, 'Guard Dualchip').fromCrafting, 2);
  assert.equal(row(crafted.rows, 'Guard Chip Pack').short, 4);
  assert.equal(row(crafted.rows, 'Chip Catalyst').short, 2);
  assert.deepEqual(crafted.made, { 'Guard Dualchip': 2 });
  const held = tools.resolveNeeds(need, { 'Guard Chip Pack': 4, 'Chip Catalyst': 2 }, { crafting: new Set(['Guard Dualchip']), incoming: null, autoCraft: false });
  assert.deepEqual(held.rows.filter((r) => r.short > 0), []);
  assert.deepEqual(held.stock, {}, 'the ingredients are spent');
});

test('a Chip Catalyst declared a purchase is the certificates it costs', () => {
  const opts = { crafting: new Set(['Guard Dualchip']), buying: new Set(['Chip Catalyst']), incoming: null, autoCraft: false };
  const bought = tools.resolveNeeds(need, {}, opts);
  const catalyst = row(bought.rows, 'Chip Catalyst');
  assert.equal(catalyst.coverage, 'buying');
  assert.equal(catalyst.fromBuying, 2);
  assert.equal(catalyst.short, 0);
  const certs = row(bought.rows, 'Purchase Certificate');
  assert.equal(certs.need, 180);
  assert.equal(certs.short, 180);
  assert.deepEqual(certs.forBuys, { 'Chip Catalyst': 180 });
  assert.equal(bought.rows.filter((r) => r.name === 'Purchase Certificate').length, 1, 'one row for the currency');

  const paid = tools.resolveNeeds(need, { 'Purchase Certificate': 200 }, opts);
  assert.equal(row(paid.rows, 'Purchase Certificate').short, 0);
  assert.equal(paid.stock['Purchase Certificate'], 20, 'what the purchase left');
});

test('a held Catalyst is not bought, and the part held covers first', () => {
  const opts = { crafting: new Set(['Guard Dualchip']), buying: new Set(['Chip Catalyst']), incoming: null, autoCraft: false };
  const res = tools.resolveNeeds(need, { 'Chip Catalyst': 1 }, opts);
  const catalyst = row(res.rows, 'Chip Catalyst');
  assert.equal(catalyst.fromDepot, 1);
  assert.equal(catalyst.fromBuying, 1);
  assert.equal(row(res.rows, 'Purchase Certificate').need, 90);
  const all = tools.resolveNeeds(need, { 'Chip Catalyst': 2 }, opts);
  assert.equal(all.rows.find((r) => r.name === 'Purchase Certificate'), undefined, 'nothing to buy, nothing to pay');
  assert.equal(row(all.rows, 'Chip Catalyst').coverage, 'have');
});

test('buying a material the store does not sell changes nothing', () => {
  const res = tools.resolveNeeds([{ name: 'Orirock', quantity: 5 }], {}, { buying: new Set(['Orirock']), incoming: null, autoCraft: false });
  assert.equal(row(res.rows, 'Orirock').coverage, 'short');
  assert.equal(row(res.rows, 'Orirock').short, 5);
});

test('a bought Catalyst is as short as its certificates', () => {
  const opts = { crafting: new Set(['Guard Dualchip']), buying: new Set(['Chip Catalyst']), incoming: null, autoCraft: false };
  const none = tools.shortShares(tools.resolveNeeds(need, {}, opts));
  assert.equal(none.get('Chip Catalyst'), 1);
  const partly = tools.shortShares(tools.resolveNeeds(need, { 'Purchase Certificate': 90 }, opts));
  assert.equal(partly.get('Chip Catalyst'), 0.5);
  const covered = tools.shortShares(tools.resolveNeeds(need, { 'Purchase Certificate': 180 }, opts));
  assert.equal(covered.get('Chip Catalyst'), 0);
});

test('the certificates sit right after the purchase they pay for', () => {
  const opts = { crafting: new Set(['Guard Dualchip']), buying: new Set(['Chip Catalyst']), incoming: null, autoCraft: false };
  const names = tools.resolveNeeds([...need, { name: 'Orirock Cube', quantity: 3 }, { name: 'Skill Summary - 1', quantity: 2 }], {}, opts).rows.map((r) => r.name);
  assert.equal(names[names.indexOf('Chip Catalyst') + 1], 'Purchase Certificate');
  assert.equal(new Set(names).size, names.length, 'no row twice');
});
