import assert from 'node:assert/strict';
import test from 'node:test';
import { applyPendingWrites, landedValue, leavesPage, pathOf } from '../../lib/hooks/useQueryState';

test('a pending URL write is dropped only by a navigation to another page', () => {
  // Discover's search, then the nav's Library link: the write must not send the reader back.
  assert.equal(leavesPage('/music/discover?q=a', '/music?view=library'), true);
  assert.equal(leavesPage('/operators?q=amiy', '/operators/Amiya'), true);
  // Another key's shallow write, or a link to the same page with another query, keeps it.
  assert.equal(leavesPage('/music/discover?q=a', '/music/discover?q=a&facet=artist%3AX'), false);
  assert.equal(leavesPage('/story?chapter=main_0', '/story?chapter=main_1'), false);
  assert.equal(leavesPage('/operators', '/operators#top'), false);
  assert.equal(pathOf('/music?view=player#x'), '/music');
  assert.equal(pathOf('?q=1'), '/');
});

test('each URL write carries the keys other hooks on the page still asked for', () => {
  // 1★ then Medic in the roster's Filters sheet: the class write fired before the router's
  // query showed the rarity one, and put the address back to no rarity.
  const pending = new Map([['rarity', '1'], ['class', 'Medic']]);
  assert.deepEqual(applyPendingWrites({ q: 'a' }, pending), { q: 'a', rarity: '1', class: 'Medic' });
  assert.deepEqual([...pending.keys()], ['rarity', 'class']);
  // Once the router shows a write, it is no longer carried; a removal is shown by absence.
  pending.set('faction', '');
  assert.deepEqual(applyPendingWrites({ rarity: '1', faction: 'Kjerag' }, pending), { rarity: '1', class: 'Medic' });
  assert.deepEqual([...pending.keys()], ['class', 'faction']);
  assert.deepEqual(applyPendingWrites({ rarity: '1', class: 'Medic' }, pending), { rarity: '1', class: 'Medic' });
  assert.equal(pending.size, 0);
});

test('a full navigation to the same page sets the key from its address; a shallow write or another page does not', () => {
  // The site search's "Endfield music" row, opened on Discover: the page keeps its state, and
  // read once at hydration, its search stayed what it was under the new address.
  assert.equal(landedValue('/music/discover', '/music/discover?q=endfield', false, 'q', ''), 'endfield');
  // A key the address lacks is its default: the link means "no search".
  assert.equal(landedValue('/music/discover', '/music/discover?facet=album%3A4527', false, 'q', ''), '');
  assert.equal(landedValue('/music/discover', '/music/discover?facet=album%3A4527', false, 'facet', ''), 'album:4527');
  // Each hook's own write is shallow: never read back (it would undo what was typed since).
  assert.equal(landedValue('/music/discover', '/music/discover?q=endf', true, 'q', ''), null);
  // Another page: this one is leaving.
  assert.equal(landedValue('/music/discover', '/music?view=library', false, 'q', ''), null);
});
