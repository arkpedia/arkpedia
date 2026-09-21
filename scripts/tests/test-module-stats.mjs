import assert from 'node:assert/strict';
import test from 'node:test';
import { formatModuleAttributes, reconcileOperatorModuleStats } from '../sync/sync-module-stats.mjs';

test('formats the client stat keys in the site module order', () => {
  assert.equal(formatModuleAttributes([{ key: 'max_hp', value: 125 }, { key: 'atk', value: 29 }]), 'HP +125 , ATK +29');
});

test('replaces stale module stats without changing editorial module text', () => {
  const operator = { name: 'Botani', modules: [{ type: 'Original', stages: [] }, { type: 'Upgrade', name: 'RIT-X: Yesterday', stages: [
    { attributesIncreased: 'ATK +30 , DEF +27', effectText: 'Keep me' },
  ] }] };
  const equip = { module: { uniEquipId: 'module', type: 'ADVANCED', typeName1: 'RIT', typeName2: 'X', charEquipOrder: 1 } };
  const battle = { module: { phases: [{ attributeBlackboard: [{ key: 'max_hp', value: 125 }, { key: 'atk', value: 29 }] }] } };
  const changes = reconcileOperatorModuleStats(operator, ['module'], equip, battle);
  assert.equal(operator.modules[1].stages[0].attributesIncreased, 'HP +125 , ATK +29');
  assert.equal(operator.modules[1].stages[0].effectText, 'Keep me');
  assert.equal(changes.length, 1);
});
