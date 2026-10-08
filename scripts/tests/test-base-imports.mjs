import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileBaseSkills } from '../imports/import-base-skills.mjs';
const building = { chars: { test: { buffChar: [{ buffData: [{ buffId: 'early', cond: { phase: 'PHASE_0', level: 30 } }, { buffId: 'late', cond: { phase: 'PHASE_2', level: 1 } }] }] } }, buffs: {
  early: { roomType: 'CONTROL', buffName: 'Early', description: 'Morale <@cc.vup>+0.05</>' },
  late: { roomType: 'TRADING', buffName: 'Late', description: 'Efficiency <@cc.vup>+10%</>' },
} };
test('base import retains a cross-facility upgrade as one immutable slot chain', () => {
  const skills = reconcileBaseSkills({ name: 'Test', internalName: 'test', baseSkills: [] }, building, 'Global');
  assert.deepEqual(skills.map(s => [s.buffId, s.slot, s.phase, s.level, s.facility, s.eliteLevel]), [
    ['early', 0, 0, 30, 'Control Center', 'Level 30'], ['late', 0, 2, 1, 'Trading Post', 'Elite 2'],
  ]);
  assert.equal(skills[1].description, 'Efficiency +10%');
});
test('CN additions require explicit translations, and never publish empty skills', () => {
  const op = { name: 'Test', internalName: 'test', baseSkills: [] };
  assert.throws(() => reconcileBaseSkills(op, building, 'CN'), /untranslated early/);
  const translations = { early: { name: 'Early translated', description: 'Translated morale' }, late: { name: 'Late translated', description: 'Translated efficiency' } };
  const actual = reconcileBaseSkills(op, building, 'CN', translations);
  assert.equal(actual.length, 2); assert.equal(actual[1].description, 'Translated efficiency');
  assert.deepEqual(op.baseSkills, []);
});
test('stable buff ID joins preserve icon names even when translations change', () => {
  const old = [{ name: 'Old spelling', description: 'Old text', icon: '/custom.webp', buffId: 'early', slot: 0, phase: 0, facility: 'Control Center' }];
  const partial = { ...building, chars: { test: { buffChar: [{ buffData: building.chars.test.buffChar[0].buffData.slice(0, 1) }] } } };
  const actual = reconcileBaseSkills({ name: 'Test', internalName: 'test', baseSkills: old }, partial, 'Global');
  assert.equal(actual[0].name, 'Old spelling'); assert.equal(actual[0].icon, '/custom.webp'); assert.equal(actual[0].description, 'Morale +0.05');
});
test('unmatched existing skills abort reconciliation rather than silently deleting them', () => {
  assert.throws(() => reconcileBaseSkills({ name: 'Test', internalName: 'test', baseSkills: [{ name: 'Unexpected', facility: 'Factory' }] }, building, 'Global'), /existing base skills have no source match/);
});
