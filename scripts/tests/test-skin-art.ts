import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getAllSkins, skinImagePath } from '../../lib/skins/skins';

/* On Vercel a page the content release does not publish yet builds with no data/ on disk, so
 * no operator records and no rarity to pick an outfit's folder by: the Skin Planner showed
 * "Artwork unavailable" for 361 of 395 outfits (2026-10-02). The art must not depend on it. */
test('an outfit\'s art is found without its operator\'s rarity, in whichever folder holds it', () => {
  const skins = getAllSkins().filter((skin) => skin.model && skin.image && !skin.image.startsWith('https://'));
  assert.ok(skins.length > 300);
  for (const skin of skins.slice(0, 200)) {
    assert.equal(skinImagePath(skin.model!, skin.name, null), skin.image, `${skin.model} / ${skin.name}`);
  }
  assert.equal(skinImagePath('Nobody', 'Nothing', null), null);
});
