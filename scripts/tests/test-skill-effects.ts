import test from 'node:test';
import assert from 'node:assert/strict';
import { getAllOperators } from '../../lib/operators/operators';
import { calcDroneRate } from '../../lib/base/baseProductivity';
import { buffFamily, typedEffects, TYPED_FAMILIES } from '../../lib/base/skillEffects';

// Every operator record, released or not: a family moves to typed effects only while every skill in it has the
// shape the family promises and gives the value the calculator read from the text before.
const skills = getAllOperators().flatMap(op => (op.baseSkills ?? []).map(skill => ({ op: op.name, skill })));

test('every skill of a typed family has typed effects', () => {
  for (const family of TYPED_FAMILIES) {
    const members = skills.filter(x => buffFamily(x.skill.buffId) === family);
    assert.ok(members.length > 0, `${family} has no skills`);
    for (const { op, skill } of members) assert.ok(typedEffects(skill), `${op} ${skill.name} (${skill.buffId}): text does not fit ${family}: ${skill.description}`);
  }
});

test('typed drone recharge equals what the Power Plant read from the skill text', () => {
  const members = skills.filter(x => buffFamily(x.skill.buffId) === 'power_rec_spd');
  for (const { op, skill } of members) {
    const typed = typedEffects(skill)!.filter(e => e.kind === 'droneRecharge').reduce((n, e) => n + e.value, 0);
    assert.equal(typed, calcDroneRate([skill.description ?? null]), `${op} ${skill.name}`);
  }
});

test('a skill outside the typed families has none', () => {
  const other = skills.find(x => !TYPED_FAMILIES.includes(buffFamily(x.skill.buffId)))!;
  assert.equal(typedEffects(other.skill), null);
  assert.equal(buffFamily('power_rec_spd[010]'), 'power_rec_spd');
});
