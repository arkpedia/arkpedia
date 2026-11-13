import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withImageRevision, withAnimationRevision } from '../content/add-image-mirror-pin.mjs';

test('add an immutable image revision without losing live pins or duplicating it', () => {
  const live = [{ repository: 'arkpedia-data', revision: 'a'.repeat(40) }];
  const revision = 'b'.repeat(40);
  const result = withImageRevision(live, revision);
  assert.deepEqual(result, [...live, { repository: 'arkpedia-image-assets', revision }]);
  assert.equal(live.length, 1);
  assert.deepEqual(withImageRevision(result, revision), result);
});

test('reject branch names, malformed revisions and non-array plans', () => {
  for (const revision of [undefined, '', 'main', 'a'.repeat(39), 'A'.repeat(40), '../main']) {
    assert.throws(() => withImageRevision([], revision));
  }
  assert.throws(() => withImageRevision({}, 'a'.repeat(40)));
});

test('animation publication adds only the fixed animation repository and preserves existing pins', () => {
  const live = [{ repository: 'arkpedia-data', revision: 'a'.repeat(40) }, { repository: 'arkpedia-image-assets', revision: 'b'.repeat(40) }];
  const revision = 'c'.repeat(40), result = withAnimationRevision(live, revision);
  assert.deepEqual(result, [...live, { repository: 'arkpedia-l2d-assets', revision }]);
  assert.equal(live.length, 2);
  assert.deepEqual(withAnimationRevision(result, revision), result);
  for (const bad of [undefined, '', 'main', 'a'.repeat(39), 'A'.repeat(40), '../main']) assert.throws(() => withAnimationRevision(live, bad));
});
