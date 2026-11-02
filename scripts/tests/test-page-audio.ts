import assert from 'node:assert/strict';
import test from 'node:test';
import { eventMusicId, HOME_MUSIC_CID } from '../../lib/music/pageMusic';
import { pageMusicTable } from '../../lib/music/pageMusicServer';
import { parseSettings, SETTINGS_DEFAULTS, SETTINGS_KEY, SETTINGS_VERSION } from '../../lib/settings/siteSettings';
import { validateCloudData } from '../../lib/cloud-account/data';
import { getAllPlayerSongs } from '../../lib/music/albumsData';
import { projectMusicCatalogue } from '../../lib/music/musicCatalogue';

test('only reviewed lobby recordings match calendar tags, punctuation and reruns', () => {
  const table = pageMusicTable();
  assert.equal(eventMusicId('[Side Story – Celebration] Near Light', table), '125091');
  assert.equal(eventMusicId('[Rerun] Near Light Rerun', table), '125091');
  assert.equal(eventMusicId('[Intermezzo] Babel', table), '779480');
  assert.equal(eventMusicId('An event with no reviewed lobby recording', table), null);
  assert.equal(eventMusicId('[side story] Yet Another Wave', table), '306864');
  assert.equal(eventMusicId('[Side Story] 昨日海', table), '306864');
  assert.equal(eventMusicId('Near Light battle', table), null);
  assert.equal(eventMusicId('Contingency Contract Obliteration', table), '697687');
  assert.equal(eventMusicId('[Story Collection] Bolívar Diagnosed', table), '125021');
  assert.equal(eventMusicId('[Side Story – Carnival] Till the Lands Become an Orange', table), '232219');
  assert.equal(eventMusicId('[Side Story – Crossover] Thunder in the Azure Dream', table), 'ADn4S1ajMAI');
  assert.equal(eventMusicId('[Rerun] A Flurry to the Flame Rerun', table), 'p1fEV6QbCww');
  const catalogue = projectMusicCatalogue(getAllPlayerSongs());
  assert.equal(catalogue.songs.find(song => song.cid === HOME_MUSIC_CID)?.title, '生命流');
});

test('audio settings default off, reject malformed values and follow personal-sync consent', () => {
  assert.equal(SETTINGS_DEFAULTS.backgroundMusic, false);
  assert.equal(SETTINGS_DEFAULTS.eventMusic, false);
  const values = { backgroundMusic: true, eventMusic: false };
  assert.deepEqual(parseSettings({ values: { greeting: 'owned', greetingOperator: 'Amiya' } }).values, {});
  const data = { [SETTINGS_KEY]: { version: SETTINGS_VERSION, values } };
  assert.deepEqual(validateCloudData(data, false, true)[SETTINGS_KEY], data[SETTINGS_KEY]);
  assert.throws(() => validateCloudData(data, true, false), /permission/);
  assert.deepEqual(parseSettings({ values: { backgroundMusic: 'yes', eventMusic: 'yes', greeting: 'always', greetingOperator: '../secret' } }).values, {});
});

test('crossover recordings have no invented MSR IDs, respect stream-safe and do not duplicate newer releases', async () => {
  const { withCrossoverPageMusic } = await import('../../lib/music/crossoverPageMusic');
  const { songAllowed } = await import('../../lib/music/songFilter');
  const songs = withCrossoverPageMusic([]);
  assert.deepEqual(songs.map(song => song.id), ['p1fEV6QbCww', 'ADn4S1ajMAI']);
  assert.ok(songs.every(song => !song.cid && !songAllowed({ excludeCopyrighted: true, includeEndfield: false }, song)));
  const newer = { ...songs[0], title: 'Updated title' };
  assert.deepEqual(withCrossoverPageMusic([newer]), [newer, songs[1]]);
});
