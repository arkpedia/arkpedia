import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error JavaScript importer is also used directly by the refresh job.
import { localizeOperator } from '../sync/sync-operator-english.mjs';

const operator = {
  internalName: 'char_test', review: { official: '中文简介', editor: 'Keep the editorial review.' },
  files: [{ section: 'Archive File 1', unlock: 'Unlocked at 50 trust', description: '中文档案' }],
};
const handbook = { charID: 'char_test', storyTextAudio: [
  { storyTitle: 'Profile', stories: [{ storyText: 'Published English profile.' }] },
  { storyTitle: 'Archive File 1', stories: [{ storyText: 'Published English archive.' }] },
] };

test('official English replaces Chinese fallback by operator ID and exact archive section', () => {
  const next = localizeOperator(operator, handbook);
  assert.equal(next.review.official, 'Published English profile.');
  assert.equal(next.review.editor, operator.review.editor);
  assert.deepEqual(next.files[0], { ...operator.files[0], description: 'Published English archive.' });
  assert.equal(operator.review.official, '中文简介');
  assert.deepEqual(localizeOperator(next, handbook), next);
});

test('missing, untranslated, mismatched and conditional data cannot overwrite existing content', () => {
  assert.deepEqual(localizeOperator(operator, undefined), operator);
  assert.deepEqual(localizeOperator(operator, { ...handbook, charID: 'another_form' }), operator);
  for (const stories of [[{ storyText: '仍为中文' }], [{ storyText: 'First form' }, { storyText: 'Second form' }]]) {
    assert.deepEqual(localizeOperator(operator, { charID: 'char_test', storyTextAudio: [{ storyTitle: 'Profile', stories }] }), operator);
  }
  const english = { ...operator, review: { official: 'Existing English', editor: 'Editorial text' }, files: [] };
  assert.deepEqual(localizeOperator(english, handbook), english);
});
