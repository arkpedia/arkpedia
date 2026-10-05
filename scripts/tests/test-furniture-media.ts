import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// @ts-expect-error Plain Node import scripts share their pure helpers with tests.
import { furnitureMedia } from '../sync/sync-catalogue.mjs';
import { getMaterialIconPath } from '../../lib/operators/operatorIconPaths';

/* Two Duel Channel seasons, each with its own trophy; a theme set whose store sells one piece by
   name; a CN-only piece; and a set piece no tile shows. */
function root() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'furniture-media-'));
  fs.mkdirSync(path.join(dir, 'data'));
  const piece = (name: string, id: string) => ({ name, id, obtain: null, comfort: null });
  fs.writeFileSync(path.join(dir, 'data/event-rewards.json'), JSON.stringify({ events: {
    'Duel Channel: Ivy Vine': { groups: [{ kind: 'milestones', title: 't', source: 's', items: [{ name: 'Duel Trophy', count: 1, kind: 'furniture', id: 'furni_enemyduel_diceAll_01' }] }] },
    'Duel Channel: Honeydew': { groups: [{ kind: 'milestones', title: 't', source: 's', items: [{ name: 'Duel Trophy', count: 1, kind: 'furniture', id: 'furni_enemyduel_guessRight_01' }] }] },
    '[Side Story] Test Set': { groups: [{ kind: 'furniture-set', title: 'Set', source: 's', items: [], pieces: [piece("'Frost'", 'furni_test_frost_01'), piece('Unshown Lamp', 'furni_test_lamp_01')] }] },
    '[Side Story] CN Only': { groups: [{ kind: 'missions', title: 't', source: 's', items: [{ name: '满载甜点桌', count: 1, kind: 'furniture', id: 'furni_cn_table_01' }] }] },
  } }));
  fs.writeFileSync(path.join(dir, 'data/event-stores.json'), JSON.stringify({ events: {
    '[Side Story] Test Set': { stores: [{ name: 'Store', currency: 'Token', items: [{ name: "'Frost'", type: 'furniture', quantity: 1, price: 10, stock: '1' }] }] },
  } }));
  return dir;
}

test('each reward furniture is asked of the wiki under its own id, narrowest file name first', () => {
  const media = furnitureMedia(root());
  assert.deepEqual(media.map((m: { path: string }) => m.path), [
    'material-icons/furni_enemyduel_diceAll_01.webp', 'material-icons/furni_enemyduel_guessRight_01.webp', 'material-icons/furni_test_frost_01.webp',
  ], 'the two seasons\' trophies apart; no CN-only piece; no piece only the set lists');
  assert.deepEqual(media[0].wikiFiles, ['Duel Trophy (Ivy Vine).png', 'Duel Trophy (Duel Channel: Ivy Vine).png', 'Duel Trophy (furniture).png', 'Duel Trophy.png']);
  // Without the game's quotes, and "(furniture)" before the bare name, which is the operator's art.
  assert.deepEqual(media[2].wikiFiles.slice(-2), ['Frost (furniture).png', 'Frost.png']);
  // The page asks for the same file: rewardIconPath's id path is getMaterialIconPath(id).
  assert.equal(getMaterialIconPath('furni_enemyduel_diceAll_01'), `/${media[0].path}`);
});
