import assert from 'node:assert/strict';
import test from 'node:test';
import { filterValues, toggleFilter } from '../../lib/operators/rosterFilters';
test('single-value bookmarks remain valid and selecting another option retains existing selections', () => {
  let value = toggleFilter('6', '5');
  assert.deepEqual(filterValues(value), ['6', '5']);
  value = toggleFilter(value, '6');
  assert.deepEqual(filterValues(value), ['5']);
  assert.equal(toggleFilter(value, '5'), 'all');
  assert.deepEqual(filterValues('all'), []);
});
