import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Node publication scripts are plain JavaScript.
import { checkCompleteness } from '../content/check-completeness.mjs';
import { emptyCatalogue } from './fixtures/catalogue';

/* A store in the shape of the People, A People one, renamed from the CN tables. The renaming
   itself is arkpedia-data's importer (its scripts/tests/test-reward-names.ts); what the
   release then makes of a renamed reward is here. */
const store = (items: object[]) => ({ type: 'Events Store', name: 'Snow-soaked Campfire', currency: 'Broken Poetry Verse', items });
const item = (name: string, extra: object = {}) => ({ name, type: 'material', reward_quantity: 1, stock: '1', price: 40, icon: 'white_square', ...extra });

test('publication fails when a renamed reward would render without an icon', () => {
  // Only the Chinese-named icon is published here, whatever the live index holds: once the
  // image sync publishes the English copy, the renamed item drops iconName and shows that.
  const assets = new Set(['material-icons/制式木盆.webp', 'material-icons/Headhunting Permit.webp', 'four-star-icons/Ethan - Infiltrator.webp']);
  const withRewards = (...items: object[]) => checkCompleteness(emptyCatalogue({ events: [{ name: '[Side Story] People, A People', rewards: store(items) }], assets })).join('\n');
  assert.equal(withRewards(item('Standard Wooden Basin', { cnName: '制式木盆', iconName: '制式木盆' })), '');
  assert.match(withRewards(item('Standard Wooden Basin', { cnName: '制式木盆' })),
    /\[Side Story\] People, A People: 1 reward icon not published: material-icons\/Standard Wooden Basin\.webp/);
  // Unrenamed items and outfits pass on their own published icons (test-reward-icons.ts holds
  // every reward to its icon, renamed or not).
  assert.equal(withRewards(item('Headhunting Permit'), item('Infiltrator', { type: 'skin', cnName: '潜行者' })), '');
});
