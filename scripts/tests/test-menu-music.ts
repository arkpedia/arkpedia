import assert from 'node:assert/strict';
import test from 'node:test';
import { menuMusicId, accountMenuMusic } from '../../lib/music/menuMusic';
import { parseSettings } from '../../lib/settings/siteSettings';
import { accountFromGame, parseAccount } from '../../lib/account/accountStore';
import { musicFacetMatches } from '../../lib/music/songSearch';

test('menu selection follows the active imported account and safely falls back for old/unknown imports', () => {
  assert.equal(menuMusicId('default', 'customVideo'), '232202');
  assert.equal(menuMusicId('account', '', 'bg_yan_1'), '125094');
  assert.equal(menuMusicId('account', '', 'bg_rhodes_day'), '232202');
  assert.equal(menuMusicId('account', '', 'unknown'), '232202');
  assert.equal(menuMusicId('account', ''), '232202');
  assert.equal(accountMenuMusic('__proto__'), null);
  assert.equal(menuMusicId('custom', 'msr:048755', 'bg_yan_1'), 'msr:048755');
});
test('personal menu choices are bounded catalogue IDs, never arbitrary URLs', () => {
  assert.deepEqual(parseSettings({ values: { menuMusicSource: 'custom', menuMusicTrack: '727dDunuePM' } }).values, { menuMusicSource: 'custom', menuMusicTrack: '727dDunuePM' });
  assert.deepEqual(parseSettings({ values: { menuMusicSource: 'account', menuMusicTrack: 'msr:048755' } }).values, { menuMusicSource: 'account', menuMusicTrack: 'msr:048755' });
  assert.deepEqual(parseSettings({ values: { menuMusicSource: 'arbitrary', menuMusicTrack: 'https://example.com/audio' } }).values, {});
});
test('account import retains only a validated selected background, across storage and export', () => {
  const account = accountFromGame({ background: { selected: 'bg_yan_1', bgs: { private: 'discard' } } }, { version: 1, chars: {} }, 'en');
  assert.equal(account.homeBackground, 'bg_yan_1');
  assert.equal(parseAccount(JSON.stringify(account))?.homeBackground, 'bg_yan_1');
  assert.equal(parseAccount(JSON.stringify({ ...account, homeBackground: '../../bad' }))?.homeBackground, undefined);
  assert.equal(accountFromGame({}, { version: 1, chars: {} }, 'en').homeBackground, undefined);
  assert.equal('background' in account, false);
});
test('album and artist search matches game aliases alongside the chosen field', () => {
  assert.ok(musicFacetMatches('endfield', ['Talos-II'], ['endfield']));
  assert.ok(musicFacetMatches('ENDFIELD talos', ['Talos-II'], ['endfield']));
  assert.ok(musicFacetMatches('endfield starset', ['STARSET'], ['endfield', undefined]));
  assert.ok(!musicFacetMatches('endfield', ['Arknights OST'], [undefined]));
  assert.ok(!musicFacetMatches('endfield absent', ['Talos-II'], ['endfield']));
});
