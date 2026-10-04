import assert from 'node:assert/strict';
import { test } from 'node:test';

import { operatorHref } from '../../lib/operators/operatorHref';

test('moving to another operator keeps the section the reader is on; the overview and the artwork are the page top', () => {
  assert.equal(operatorHref('Texas', 'baseSkills'), '/operators/Texas#baseSkills');
  assert.equal(operatorHref('Ch\'en the Holungday', 'voiceLines'), "/operators/Ch'en%20the%20Holungday#voiceLines");
  assert.equal(operatorHref('Texas', 'overview'), '/operators/Texas');
  assert.equal(operatorHref('Texas', 'artwork'), '/operators/Texas');
  assert.equal(operatorHref('Texas', null), '/operators/Texas');
});
