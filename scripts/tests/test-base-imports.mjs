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

test('a CN Recycling Station skill imports, its reviewed translation replaces the Chinese text, and an unnamed facility fails by name', () => {
  // Homebound (char_4232_hbound, CN 2026-10): two RECYCLE skills the catalogue first stored in
  // Chinese under the raw roomType, and a Workshop one (issue #59, 2026-10-13).
  const recycle = {
    chars: { char_4232_hbound: { buffChar: [
      { buffData: [{ buffId: 'recycle_spd&cost[000]', cond: { phase: 'PHASE_0', level: 1 } }, { buffId: 'recycle_spd&cost[010]', cond: { phase: 'PHASE_2', level: 1 } }] },
      { buffData: [{ buffId: 'workshop_formula_device[080]', cond: { phase: 'PHASE_2', level: 1 } }] },
    ] } },
    buffs: {
      'recycle_spd&cost[000]': { roomType: 'RECYCLE', buffName: '拾荒者', description: '进驻回收站时，材料转化效率<@cc.vup>+20%</>' },
      'recycle_spd&cost[010]': { roomType: 'RECYCLE', buffName: '捡海人', description: '进驻回收站时，材料转化效率<@cc.vup>+30%</>' },
      'workshop_formula_device[080]': { roomType: 'WORKSHOP', buffName: '指尖的光', description: '进驻加工站加工手性屈光体或重相位对映体时，副产物的产出概率提升90%' },
    },
  };
  const stored = [
    { name: '拾荒者', facility: 'RECYCLE', eliteLevel: 'Base', description: '进驻回收站时，材料转化效率+20%', slot: 0, phase: 0, level: 1 },
    { name: '捡海人', facility: 'RECYCLE', eliteLevel: 'Elite 2', description: '进驻回收站时，材料转化效率+30%', slot: 0, phase: 2, level: 1 },
    { name: '指尖的光', facility: 'Workshop', eliteLevel: 'Elite 2', description: '进驻加工站加工手性屈光体或重相位对映体时，副产物的产出概率提升90%', slot: 1, phase: 2, level: 1 },
  ];
  const translations = {
    'recycle_spd&cost[000]': { name: 'Scavenger', description: 'When assigned to the Recycling Station, material conversion efficiency +20%.' },
    'recycle_spd&cost[010]': { name: 'Beachcomber', description: 'When assigned to the Recycling Station, material conversion efficiency +30%.' },
    'workshop_formula_device[080]': { name: 'Light at the Fingertips', description: 'When assigned to the Workshop to process Chiral Refractor or Rephasic Enantiomer, the production rate of byproduct increases by 90%.' },
  };
  const op = { name: 'Homebound', internalName: 'char_4232_hbound', baseSkills: stored };
  const skills = reconcileBaseSkills(op, recycle, 'CN', translations);
  assert.deepEqual(skills.map(s => [s.name, s.facility, s.eliteLevel, s.buffId]), [
    ['Scavenger', 'Recycling Station', 'Base', 'recycle_spd&cost[000]'],
    ['Beachcomber', 'Recycling Station', 'Elite 2', 'recycle_spd&cost[010]'],
    ['Light at the Fingertips', 'Workshop', 'Elite 2', 'workshop_formula_device[080]'],
  ]);
  assert.equal(skills[0].description, translations['recycle_spd&cost[000]'].description);
  // Once stored in English with buff IDs, the next run joins by ID and changes nothing.
  assert.deepEqual(reconcileBaseSkills({ ...op, baseSkills: skills }, recycle, 'CN', translations), skills);
  // Without a translation a CN skill still refuses to publish.
  assert.throws(() => reconcileBaseSkills({ ...op, baseSkills: [] }, recycle, 'CN', {}), /untranslated recycle_spd&cost\[000\]/);
  // A facility no one has named fails by its roomType, not as an "unknown buff".
  const unnamed = structuredClone(recycle);
  unnamed.buffs['recycle_spd&cost[000]'].roomType = 'GREENHOUSE';
  assert.throws(() => reconcileBaseSkills(op, unnamed, 'CN', translations), /recycle_spd&cost\[000\] is in facility GREENHOUSE, which scripts\/lib\/base-rooms\.mjs does not name/);
});
