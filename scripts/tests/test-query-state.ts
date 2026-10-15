import assert from 'node:assert/strict';
import test from 'node:test';
import { leavesPage, pathOf } from '../../lib/hooks/useQueryState';

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
