import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { recommendationsTellApart } from '../../lib/operators/skillRecommendation';

test('a skill recommendation is shown only where it tells the skills apart', () => {
  // Pepe: every skill M3 with no order says nothing about any one of them.
  assert.equal(recommendationsTellApart([1, 2, 3].map(() => ({ recommendation: [{ mastery: 'm3', rating: 0 }] }))), false);
  assert.equal(recommendationsTellApart([{ recommendation: [] }, { recommendation: null }]), false);
  // Ranked, or one skill recommended and not another.
  assert.equal(recommendationsTellApart([{ recommendation: [{ mastery: 'm3', order: '1st' }] }, { recommendation: [{ mastery: 'm3', order: '2nd' }] }]), true);
  assert.equal(recommendationsTellApart([{ recommendation: [] }, { recommendation: [{ mastery: 'm3' }] }]), true);
  const pepe = JSON.parse(fs.readFileSync('data/operators-6star/Pepe.json', 'utf8'));
  assert.equal(recommendationsTellApart(pepe.skills.skillList), false);
});
