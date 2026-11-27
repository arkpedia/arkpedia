import assert from 'node:assert/strict';
import { test } from 'node:test';
import { legacySkinPlan, parseSkinPlan, resolveSkinPlan, skinPlanKeys } from '../../lib/skins/skinPlan';
import { PULL_PLAN_KEY } from '../../lib/pulls/plan';
import { pullSkinCatalogue, skinReservation } from '../../lib/pulls/skins';
import { withPlannerDynamicArt } from '../../lib/skins/dynamicArtFallback';
import skins from '../../data/skins.json';

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

test('the published catalogue carries a single OP outfit and its former wishlist key across a Global rename', async () => {
  const oldKey = 'Mon3tr / Sharpened Blades';
  const key = 'Mon3tr / Sharpened Claws';
  const gameId = 'char_4179_monstr@boc#11';
  const entries = skins.filter(skin => skin.skinId === gameId || `${skin.model} / ${skin.name}` === oldKey);
  assert.deepEqual(entries.map(skin => `${skin.model} / ${skin.name}`), [key]);
  const catalogue = pullSkinCatalogue(entries);
  assert.equal(catalogue[0]?.op, 21);
  assert.deepEqual(catalogue[0]?.searchAliases, [oldKey]);
  const previousRelease = await withPlannerDynamicArt({ catalogue: catalogue.map(({ searchAliases: _aliases, ...skin }) => skin) });
  for (const available of [catalogue, previousRelease.catalogue]) {
    const ids = resolveSkinPlan([oldKey, key, 'Sharpened Blades'], skinPlanKeys(available));
    assert.deepEqual(ids, [key]);
    assert.equal(skinReservation(ids, available, 0).reserved, 21);
  }
});

test('only a unique former key resolves, and a current key takes precedence', () => {
  const keys = skinPlanKeys([
    { id: 'A / New outfit', name: 'New outfit', searchAliases: ['A / Current outfit', 'A / Ambiguous', 'Search term'] },
    { id: 'A / Current outfit', name: 'Current outfit', searchAliases: ['A / Ambiguous'] },
  ]);
  assert.deepEqual(resolveSkinPlan(['A / Current outfit', 'A / Ambiguous', 'Ambiguous', 'Search term', 'unknown'], keys),
    ['A / Current outfit', 'A / Ambiguous', 'Ambiguous', 'Search term', 'unknown']);
});
