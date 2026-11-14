import assert from 'node:assert/strict';
import test from 'node:test';
import { accountFromGame, parseAccount } from '../../lib/account/accountStore';
import { musicFacetMatches } from '../../lib/music/songSearch';

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
