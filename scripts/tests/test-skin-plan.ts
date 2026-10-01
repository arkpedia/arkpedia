import assert from 'node:assert/strict';
import { test } from 'node:test';
import { legacySkinPlan, parseSkinPlan } from '../../lib/skins/skinPlan';
import { PULL_PLAN_KEY } from '../../lib/pulls/plan';

const store = (items: Record<string, string>) => ({ getItem: (key: string) => items[key] ?? null });

test('the first read takes both old lists: the Pull Planner\'s outfits and the gallery\'s wishlist', () => {
  const ids = legacySkinPlan(store({
    [PULL_PLAN_KEY]: JSON.stringify({ version: 1, skinIds: ['Surtr / Liberté//Échec', 'Amiya / Newsgirl'] }),
    skinWishlist_v1: JSON.stringify(['Newsgirl', 'Summer Flowers', 'Not an outfit anywhere']),
  }), (name) => ({ Newsgirl: 'Amiya / Newsgirl', 'Summer Flowers': 'Skadi / Summer Flowers' } as Record<string, string>)[name]);
  // Once each, by key; a name the catalogue cannot place is kept as it is, not lost.
  assert.deepEqual(ids, ['Surtr / Liberté//Échec', 'Amiya / Newsgirl', 'Skadi / Summer Flowers', 'Not an outfit anywhere']);
  // Nothing stored, or nothing readable: an empty plan, not a throw.
  assert.deepEqual(legacySkinPlan(store({ [PULL_PLAN_KEY]: '{', skinWishlist_v1: '5' }), () => undefined), []);
});

test('a stored plan is a list of strings, deduplicated, or nothing', () => {
  assert.deepEqual(parseSkinPlan(JSON.stringify(['a / b', 'a / b', 'c / d'])), ['a / b', 'c / d']);
  for (const broken of [null, '', '{', '{"a":1}', '[1]']) assert.equal(parseSkinPlan(broken), null, String(broken));
});
