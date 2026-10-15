import test from 'node:test';
import assert from 'node:assert/strict';
import albums from '../../data/albums.json';
import assetFolders from '../../config/asset-folders.json';
import type { RawAlbum } from '../../lib/music/albumsData';
import { discoverPageData, discoverForDisplay } from '../../lib/music/albumsDataServer';
import { publicFileExists, servedAssetExists } from '../../lib/assets/publicAssets';
import { CHARACTER_PORTRAITS, characterInitials, characterPortrait } from '../../lib/music/characterPortraits.mjs';
// @ts-expect-error Node publication scripts are plain JavaScript.
import { reviewCompleteness } from '../content/check-completeness.mjs';
import { emptyCatalogue } from './fixtures/catalogue';

/*
 * Discover's Browse by character drew an empty square for every character an album credits who
 * is not a playable operator: the Doctor, Theresis, Theresa, Kristen Wright, the "Rat King",
 * Touch, Misery, Sharp and eleven more (maintainer, 2026-10-14). Each now has the game's own art
 * (lib/music/characterPortraits.mjs) or, until it is published, initials.
 */

/** The folder the image repository publishes non-operator avatars in (arkpedia-image-assets #44).
 *  Until the site maps it, its files are skipped rather than drawn broken. */
const PENDING_FOLDER = 'npc-icons';

/** The characters the 2026-10-14 catalogue credits who are not operators: each has an entry. */
const NON_OPERATORS = ['Theresis', 'Doctor', 'Theresa', 'Kristen Wright', '"Rat King"', 'Touch', 'Misery', 'Sharp', '"Playwright"',
  '"Justice Knight"', 'Emperor', 'Faust', 'Mephisto', 'Alty', 'Aya', 'Dan', 'Frost (Alive Until Sunset)', 'FrostNova', 'Patriot'];

test('every character the catalogue credited without art has an entry', () => {
  for (const name of NON_OPERATORS) assert.ok(Object.hasOwn(CHARACTER_PORTRAITS, name), name);
});

/* Over the day's data, which npm test reads in the release job too: a NEW album's character
   with no art is not failed here (that would stop the release), it is held as published-partial
   by the completeness check (last test below) and drawn with initials. What is asserted is
   that no tile is ever blank: a served picture, or letters. */
test('no character tile in Browse by character is blank', () => {
  const { characters } = discoverForDisplay(discoverPageData(albums as RawAlbum[]));
  assert.ok(characters.length > 100);
  for (const c of characters) {
    if (c.artPath) assert.ok(servedAssetExists(decodeURIComponent(c.artPath)), `${c.name}: ${c.artPath} is published and served`);
    else assert.match(characterInitials(c.name), /^\p{L}{1,2}$/u, `${c.name} shows initials`);
  }
});

test('each portrait is published already, or waits in the folder the image repository is adding', () => {
  const served = new Set(Object.values(assetFolders).flatMap((value) => (Array.isArray(value) ? value : [])));
  for (const [name, files] of Object.entries(CHARACTER_PORTRAITS)) {
    assert.ok(files.length > 0, name);
    for (const file of files) {
      const folder = file.split('/')[0];
      if (folder === PENDING_FOLDER && !served.has(folder)) continue;
      assert.ok(publicFileExists(file), `${name}: ${file} is in the published index (a typo here is a blank tile)`);
    }
  }
  // Once the folder is mapped, the pending entries must be published too, or this test is stale.
  if (served.has(PENDING_FOLDER)) {
    for (const files of Object.values(CHARACTER_PORTRAITS)) for (const file of files) assert.ok(publicFileExists(file), file);
  }
});

test('the portraits that are published today are used, and an unserved one is skipped', () => {
  const { characters } = discoverPageData(albums as RawAlbum[]);
  const art = new Map(characters.map((c) => [c.name, c.artPath]));
  // Fought somewhere in the game, so their boss portraits are published.
  assert.equal(art.get('Kristen Wright'), '/enemies-icons/Kristen.webp');
  assert.equal(art.get('"Playwright"'), "/enemies-icons/'Playwright'.webp");
  assert.equal(art.get('"Justice Knight"'), '/one-star-icons/Justice Knight - Base.webp');
  // A file the folder config does not serve is never handed out, published or not.
  assert.equal(characterPortrait('Doctor', (file) => file === 'npc-icons/Doctor.webp'), '/npc-icons/Doctor.webp');
  assert.equal(characterPortrait('Theresis', (file) => file.startsWith('enemies-icons/')), '/enemies-icons/Theresis.webp');
  assert.equal(characterPortrait('Nobody', () => true), null);
  assert.throws(() => characterPortrait('Doctor', undefined as never));
});

test('names that are also operators\' are mapped deliberately', () => {
  // The story's Sarkaz king, not the operator Civilight Eterna, who has her own tile.
  assert.ok(CHARACTER_PORTRAITS.Theresa.every((file) => !file.includes('Civilight Eterna')));
  // The Alive Until Sunset guitarist, never the operator Frost.
  assert.ok(CHARACTER_PORTRAITS['Frost (Alive Until Sunset)'].every((file) => !/-star-icons\/Frost /.test(file)));
});

test('the deploy gives a portrait to a character an older release left without one', () => {
  const data = discoverPageData(albums as RawAlbum[]);
  const old = { ...data, characters: data.characters.map((c) => ({ ...c, artPath: c.name === 'Kristen Wright' ? null : c.artPath })) };
  assert.equal(discoverForDisplay(old).characters.find((c) => c.name === 'Kristen Wright')?.artPath, '/enemies-icons/Kristen.webp');
});

test('initials leave out quotes and notes', () => {
  assert.equal(characterInitials('Kristen Wright'), 'KW');
  assert.equal(characterInitials('"Rat King"'), 'RK');
  assert.equal(characterInitials('Frost (Alive Until Sunset)'), 'F');
  assert.equal(characterInitials('Doctor'), 'D');
  assert.equal(characterInitials('""'), '?');
});

test('the release holds a credited character with no portrait, and blocks nothing', () => {
  const album = { albumId: '1', albumName: 'Test', albumAltName: 'Test EP', releaseDate: '2026/09/03', characters: ['Doctor', 'Kristen Wright', 'Someone New'] };
  const { quarantine, errors } = reviewCompleteness(emptyCatalogue({ albums: [album], assets: new Set(['enemies-icons/Kristen.webp']) }));
  assert.deepEqual(errors, []);
  const held = (quarantine as { key: string; action: string }[]).filter((h) => h.key.startsWith('music-character:'));
  assert.deepEqual(held.map((h) => `${h.key} ${h.action}`), ['music-character:Doctor published-partial', 'music-character:Someone New published-partial']);
});
