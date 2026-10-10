import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Node importers are plain JavaScript.
import { reconcileCatalogueBaseSkills } from '../imports/import-base-skills.mjs';

test('an unsupported Base facility preserves existing skills and does not stop the next operator', () => {
  const skill = { name: 'Original', facility: 'Workshop', eliteLevel: 'Base', description: 'Previous valid translation' };
  const previous = [{ name: 'Old', internalName: 'old', baseSkills: [skill] }];
  const operators = [{ ...previous[0], baseSkills: [] }, { name: 'New', internalName: 'new', baseSkills: [] }, { name: 'Valid', internalName: 'valid', baseSkills: [] }];
  const source = { source: 'https://example.org/client', building: { chars: { old: { buffChar: [{ buffData: [{ buffId: 'recycle', cond: { phase: 'PHASE_0', level: 1 } }] }] }, new: { buffChar: [{ buffData: [{ buffId: 'recycle', cond: { phase: 'PHASE_0', level: 1 } }] }] }, valid: { buffChar: [] } }, buffs: { recycle: { roomType: 'RECYCLE' } } } };
  const problems = reconcileCatalogueBaseSkills(operators, previous, source, source);
  assert.deepEqual(operators[0].baseSkills, [skill]);
  assert.notEqual(operators[0].baseSkills, previous[0].baseSkills);
  assert.deepEqual(operators[1].baseSkills, []);
  assert.deepEqual(operators[2].baseSkills, []);
  assert.deepEqual(problems.map((p: { key: string; action: string }) => [p.key, p.action]), [['operator-base:old', 'kept-previous'], ['operator-base:new', 'published-partial']]);
  assert.ok(problems.every((p: { sourceRef: string }) => p.sourceRef.endsWith('/building_data.json')));
});
