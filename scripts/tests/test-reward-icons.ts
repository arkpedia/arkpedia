import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { rewardIconPath } from '../../lib/events/rewardIcons';
import { buildSkinIconIndex } from '../../lib/skins/skinIconLookup';
// @ts-expect-error Node publication scripts are plain JavaScript.
import { checkCompleteness, reviewCompleteness } from '../content/check-completeness.mjs';
import { emptyCatalogue } from './fixtures/catalogue';

/* A made-up store in the shape of the Contingency Contract Obliteration listing that drew a
   broken image: an outfit, the wiki's missing-furniture placeholder, a CN-named furniture
   whose icon is not published yet, and a material that is. Nothing here reads data/, so the
   day's refresh cannot move a case. */
const published = new Set(['material-icons/Module Data Block.webp', 'material-icons/制式木盆.webp',
  'material-icons/furni_enemyduel_diceAll_01.webp', 'profile-avatars/avatar_activity_ed3.webp',
  'five-star-icons/Kestrel - Charm of The Tiles.webp', 'five-star-icons/Kestrel - Base.webp', 'four-star-icons/Ethan - Infiltrator.webp']);
const isPublished = (file: string) => published.has(file);
const folders = (folder: string) => [...published].filter(file => file.startsWith(`${folder}/`)).map(file => file.slice(folder.length + 1));
const outfits = buildSkinIconIndex(folders);
const outfitIcon = (name: string) => outfits.get(name.trim().toLowerCase()) ?? null;
const item = (name: string, extra: object = {}) => ({ name, type: 'material', reward_quantity: 1, stock: '1', price: 1800, id: null as string | null, ...extra });
const store = (items: object[]) => ({ type: 'Events Store', name: 'Crystallization Sanctuary', currency: 'Crystal Contract Bounty', items });

test('a reward icon the image repository has not published is left out instead of drawn broken', () => {
  assert.equal(rewardIconPath(item('Module Data Block'), outfitIcon, isPublished), '/material-icons/Module Data Block.webp');
  assert.equal(rewardIconPath(item('Furniture not found'), outfitIcon, isPublished), null);
  assert.equal(rewardIconPath(item('涤墨之旗'), outfitIcon, isPublished), null);
  // A reward renamed to its Global name shows the CN-named file it still has.
  assert.equal(rewardIconPath(item('Standard Wooden Basin', { iconName: '制式木盆' }), outfitIcon, isPublished), '/material-icons/制式木盆.webp');
  // Outfits resolve through the outfit lookup, and are held to the index the same way.
  assert.equal(rewardIconPath(item('Charm of the Tiles', { type: 'skin' }), outfitIcon, isPublished), '/five-star-icons/Kestrel - Charm of The Tiles.webp');
  assert.equal(rewardIconPath(item('Unseen Terrain', { type: 'skin' }), outfitIcon, isPublished), null);
  assert.equal(rewardIconPath(item('Unseen Terrain', { type: 'skin' }), () => '/five-star-skins/Scene - Unseen Terrain.webp', isPublished), null);
});

test('an outfit reward finds its icon in the rarity folders by outfit name, ignoring case', () => {
  assert.equal(outfitIcon('charm of the tiles'), '/five-star-icons/Kestrel - Charm of The Tiles.webp');
  assert.equal(outfitIcon('Infiltrator'), '/four-star-icons/Ethan - Infiltrator.webp');
  assert.equal(outfitIcon('Base'), '/five-star-icons/Kestrel - Base.webp', 'the rule is the file name, nothing more');
  assert.equal(outfitIcon('Unseen Terrain'), null);
});

test('the event page resolves every reward icon through rewardIconPath and the release asset index', () => {
  // The call site is the guard's whole point: one path helper used directly again would
  // draw a broken image for an unpublished icon, and nothing would say so.
  const page = fs.readFileSync(new URL('../../pages/events/[slug].tsx', import.meta.url), 'utf8');
  assert.match(page, /iconPath: rewardIconPath\(\{ \.\.\.item, id: .+ \}, .+, publicFileExists\)/);
  assert.doesNotMatch(page, /getMaterialIconPath|iconPath:\s*\n?\s*item\.type === 'skin'/);
  // And the outfit lookup reads the asset index, not public/, which holds no art.
  const lookup = fs.readFileSync(new URL('../../lib/skins/skinIconLookup.ts', import.meta.url), 'utf8');
  assert.match(lookup, /buildSkinIconIndex\(publicFiles\)/);
  assert.doesNotMatch(lookup, /readdirSync/);
});

test('a placeholder reward or an unpublished reward icon is quarantined, and the release still goes out', () => {
  const event = (items: object[]) => ({ name: 'Contingency Contract Obliteration', rewards: store(items) });
  const review = (...items: object[]) => reviewCompleteness(emptyCatalogue({ events: [event(items)], assets: published }));
  const complete = review(item('Module Data Block'), item('Charm of the Tiles', { type: 'skin' }), item('Standard Wooden Basin', { cnName: '制式木盆', iconName: '制式木盆' }));
  assert.deepEqual(complete, { errors: [], quarantine: [], allowed: [] });
  const held = review(item('Furniture not found'), item('涤墨之旗'), item('Unseen Terrain', { type: 'skin' }), item(''), item('?'), item('Module Data Block'));
  assert.deepEqual(held.errors, [], 'one bad item never blocks the release');
  assert.deepEqual(held.quarantine.map((entry: { key: string; action: string }) => [entry.key, entry.action]),
    Array(5).fill(['event:Contingency Contract Obliteration', 'published-partial']));
  assert.deepEqual(held.quarantine.map((entry: { reason: string }) => entry.reason), [
    'Contingency Contract Obliteration reward "Furniture not found": a placeholder, not an item name',
    'Contingency Contract Obliteration reward 涤墨之旗: missing asset material-icons/涤墨之旗.webp',
    'Contingency Contract Obliteration reward outfit Unseen Terrain: no published outfit icon',
    'Contingency Contract Obliteration reward "": a placeholder, not an item name',
    'Contingency Contract Obliteration reward "?": a placeholder, not an item name',
  ]);
  // The check and the page agree on which outfit icons exist.
  for (const name of ['Charm of the Tiles', 'INFILTRATOR', 'Unseen Terrain', 'Base']) {
    const heldOutfit = checkCompleteness(emptyCatalogue({ events: [event([item(name, { type: 'skin' })])], assets: published })).length > 0;
    assert.equal(heldOutfit, outfitIcon(name) === null, name);
  }
});

test('a reward with a game id finds its art by the id: a player icon in profile-avatars, a piece of furniture in its own file', () => {
  // Duel Channel: Ivy Vine's milestones: 'ALL IN!' and its Duel Trophy, both drawn as names before.
  assert.equal(rewardIconPath(item("Icon 'ALL IN!'", { id: 'avatar_activity_ED3' }), outfitIcon, isPublished), '/profile-avatars/avatar_activity_ed3.webp');
  assert.equal(rewardIconPath(item('Duel Trophy', { id: 'furni_enemyduel_diceAll_01' }), outfitIcon, isPublished), '/material-icons/furni_enemyduel_diceAll_01.webp');
  // Not by the name: another event's Duel Trophy is another piece.
  assert.equal(rewardIconPath(item('Duel Trophy', { id: 'furni_enemyduel_diceAll_02' }), outfitIcon, isPublished), null);
  assert.equal(rewardIconPath(item("Icon 'Perfect!'", { id: 'avatar_activity_ED2' }), outfitIcon, isPublished), null, 'held to the index like any icon');
});
