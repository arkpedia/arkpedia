import assert from 'node:assert/strict';
import test from 'node:test';
import { eventMusicCid, HOME_MUSIC_CID } from '../../lib/music/pageMusic';
import { pageMusicTable } from '../../lib/music/pageMusicServer';
import { parseSettings, SETTINGS_DEFAULTS, SETTINGS_KEY } from '../../lib/settings/siteSettings';
import { validateCloudData } from '../../lib/cloud-account/data';
import { getAllPlayerSongs } from '../../lib/music/albumsData';
import { projectMusicCatalogue } from '../../lib/music/musicCatalogue';

test('only reviewed lobby recordings match calendar tags, punctuation and reruns', () => {
  const table = pageMusicTable();
  assert.equal(eventMusicCid('[Side Story – Celebration] Near Light', table), '125091');
  assert.equal(eventMusicCid('[Rerun] Near Light Rerun', table), '125091');
  assert.equal(eventMusicCid('[Intermezzo] Babel', table), '779480');
  assert.equal(eventMusicCid('An event with no reviewed lobby recording', table), null);
  assert.equal(eventMusicCid('Near Light battle', table), null);
  const catalogue = projectMusicCatalogue(getAllPlayerSongs());
  assert.equal(catalogue.songs.find(song => song.cid === HOME_MUSIC_CID)?.title, '生命流');
});

test('audio settings default off, reject malformed values and follow personal-sync consent', () => {
  assert.equal(SETTINGS_DEFAULTS.backgroundMusic, false);
  assert.equal(SETTINGS_DEFAULTS.greeting, 'off');
  const values = { backgroundMusic: true, greeting: 'owned', greetingOperator: 'Amiya' };
  const data = { [SETTINGS_KEY]: { version: 1, values } };
  assert.deepEqual(validateCloudData(data, false, true)[SETTINGS_KEY], data[SETTINGS_KEY]);
  assert.throws(() => validateCloudData(data, true, false), /permission/);
  assert.deepEqual(parseSettings({ values: { backgroundMusic: 'yes', greeting: 'always', greetingOperator: '../secret' } }).values, {});
});
