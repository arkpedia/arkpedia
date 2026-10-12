import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recommendationsTellApart } from '../../lib/operators/skillRecommendation';

test('a skill recommendation is shown only where it tells the skills apart', () => {
  // Identical, unranked recommendations say nothing about any one skill.
  assert.equal(recommendationsTellApart([1, 2, 3].map(() => ({ recommendation: [{ mastery: 'm3', rating: 0 }] }))), false);
  assert.equal(recommendationsTellApart([{ recommendation: [] }, { recommendation: null }]), false);
  // Ranked, or one skill recommended and not another.
  assert.equal(recommendationsTellApart([{ recommendation: [{ mastery: 'm3', order: '1st' }] }, { recommendation: [{ mastery: 'm3', order: '2nd' }] }]), true);
  assert.equal(recommendationsTellApart([{ recommendation: [] }, { recommendation: [{ mastery: 'm3' }] }]), true);
});
