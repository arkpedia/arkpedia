import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recommendationsTellApart, hasMasteryGuidance, hasMasteryPriority } from '../../lib/operators/skillRecommendation';

test('a skill recommendation is shown only where it tells the skills apart', () => {
  // Identical, unranked recommendations say nothing about any one skill.
  assert.equal(recommendationsTellApart([1, 2, 3].map(() => ({ recommendation: [{ mastery: 'm3', rating: 0 }] }))), false);
  assert.equal(recommendationsTellApart([{ recommendation: [] }, { recommendation: null }]), false);
  // Ranked, or one skill recommended and not another.
  assert.equal(recommendationsTellApart([{ recommendation: [{ mastery: 'm3', order: '1st' }] }, { recommendation: [{ mastery: 'm3', order: '2nd' }] }]), true);
  assert.equal(recommendationsTellApart([{ recommendation: [] }, { recommendation: [{ mastery: 'm3' }] }]), true);
});


test('mastery-only placeholders stay out of priority badges and the guide', () => {
  for (const entry of [{}, { mastery: 'm3', priority: null, order: null, explanation: '' }, { explanation: '  ' }]) {
    assert.equal(hasMasteryPriority(entry), false);
    assert.equal(hasMasteryGuidance(entry), false);
  }
  for (const entry of [{ priority: 'main' }, { priority: 'sub' }, { order: '2nd' }]) {
    assert.equal(hasMasteryPriority(entry), true);
    assert.equal(hasMasteryGuidance(entry), true);
  }
  const note = { priority: null, explanation: "There's no masteries to consider here... (sad face)" };
  assert.equal(hasMasteryGuidance(note), true);
  assert.equal(hasMasteryPriority(note), false);
});
