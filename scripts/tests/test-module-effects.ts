import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getModuleStageEffects } from '../../lib/operators/moduleEffects';
import { getAllOperators } from '../../lib/operators/operators';
import type { ModuleStage } from '../../lib/operators/operatorTypes';

const stage = (effectLabel: string | null, effectText: string): ModuleStage => ({ stage: null, attributesIncreased: null, effectLabel, effectText });

test('module levels retain the trait and replace the previous talent numbers', () => {
  const module = { stages: [stage('New trait', 'Hits 2 enemies'), stage('Power improved', 'Damage 120%'), stage('Power improved', 'Damage 150%')] };
  assert.deepEqual(getModuleStageEffects(module, 0).map(e => e.text), ['Hits 2 enemies']);
  assert.deepEqual(getModuleStageEffects(module, 1).map(e => e.text), ['Hits 2 enemies', 'Damage 120%']);
  assert.deepEqual(getModuleStageEffects(module, 2).map(e => e.text), ['Hits 2 enemies', 'Damage 150%']);
});

test('new talents and missing labels do not retain superseded descriptions', () => {
  for (const label of ['New talent: Power', null]) {
    const module = { stages: [stage('New trait', 'Hits 2 enemies'), stage(label, 'Damage 120%'), stage('Power improved', 'Damage 150%')] };
    assert.equal(getModuleStageEffects(module, 1).length, 2);
    assert.deepEqual(getModuleStageEffects(module, 2).map(e => e.text), ['Hits 2 enemies', 'Damage 150%']);
  }
});

test('later traits replace previous traits while independent effects are retained', () => {
  const module = { stages: [stage('New trait', 'Hits 2 enemies'), stage('Power improved', 'Damage 120%'), stage('Trait improved', 'Hits 3 enemies')] };
  assert.deepEqual(getModuleStageEffects(module, 2).map(e => e.text), ['Hits 3 enemies', 'Damage 120%']);
});

test('Botani and Angelina keep their module trait at Stage 3 without Stage 2 talent text', () => {
  for (const name of ['Botani', 'Angelina']) {
    const operator = getAllOperators().find(op => op.name === name)!;
    for (const module of operator.modules!.filter(m => m.type === 'Upgrade' && m.stages.length === 3)) {
      const effects = getModuleStageEffects(module, 2).map(e => e.text);
      assert.ok(effects.includes(module.stages[0].effectText!));
      assert.ok(effects.includes(module.stages[2].effectText!));
      if (module.stages[1].effectText !== module.stages[2].effectText) assert.ok(!effects.includes(module.stages[1].effectText!));
    }
  }
});
