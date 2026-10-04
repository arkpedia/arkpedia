import assert from 'node:assert/strict';
import { test } from 'node:test';
// @ts-expect-error Node scripts are plain JavaScript.
import { parseStores, storePage } from '../sync/sync-event-stores.mjs';

/*
 * Event stores from arknights.wiki.gg (scripts/sync/sync-event-stores.mjs): a rerun's from its
 * /Rerun page, every listing kind the {{Event store cell}} template takes.
 */
test('an original run\'s store is on its page, a rerun\'s on its /Rerun page', () => {
  assert.equal(storePage('[Side Story – Festival] Invitation to Wine'), 'Invitation to Wine');
  assert.equal(storePage('[Rerun] Path of Life Rerun'), 'Path of Life/Rerun');
  assert.equal(storePage("[Rerun] The Masses' Travels Rerun"), "The Masses' Travels/Rerun");
});

test('a store\'s listings, as the template writes them (Path of Life Rerun)', () => {
  const wikitext = [
    '==="Emergency Supplies" Blueprint Chip===',
    '===[[Materianomicon Moderatrix]]===',
    '{{Event store head}}',
    "{{Event store cell|item=Underflow's Token,1|price=Emergency Supplies Blueprint Chip,200|stock=1}}",
    '{{Event store cell|item=Headhunting Permit,1|price=Emergency Supplies Blueprint Chip,150|stock=3}}',
    '{{Event store cell|furniture=Stable Surgical Gimbal|cert=155|price=Emergency Supplies Blueprint Chip,90|stock=1}}',
    '{{Event store cell|outfit=Unseen Terrain|price=Emergency Supplies Blueprint Chip,2000|stock=1}}',
    '{{Event store cell|item=LMD,1,000|price=Emergency Supplies Blueprint Chip,10|stock=∞}}',
    '{{Event store end}}',
  ].join('\n');
  const [store] = parseStores(wikitext);
  assert.equal(store.name, 'Materianomicon Moderatrix');
  assert.equal(store.currency, 'Emergency Supplies Blueprint Chip');
  assert.deepEqual(store.items.map((i: { name: string; type: string; quantity: number; price: number; stock: string }) => [i.name, i.type, i.quantity, i.price, i.stock]), [
    ["Underflow's Token", 'material', 1, 200, '1'],
    ['Headhunting Permit', 'material', 1, 150, '3'],
    ['Stable Surgical Gimbal', 'furniture', 1, 90, '1'],
    ['Unseen Terrain', 'skin', 1, 2000, '1'],
    ['LMD', 'material', 1000, 10, 'unlimited'],
  ]);
  assert.equal(store.items[2].ambience, 155);
  assert.deepEqual(parseStores('no store here'), []);
});
