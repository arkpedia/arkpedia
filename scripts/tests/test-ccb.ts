import { test } from 'node:test';
import assert from 'node:assert/strict';
import archive from '../../data/ccb/archive.json';
import { activeModifierSummaries, contractSummary, maximumContractScore, modifiedStats, replacementId, resolvedDescription, toggleContract } from '../../lib/ccb/modifiers';
import type { BattleplanSeason, Contract } from '../../lib/ccb/types';

const seasons = archive.seasons as unknown as BattleplanSeason[];
const arclight = seasons[3].maps.find(map => map.main)!;
const contracts = arclight.groups.flatMap(group => group.contracts);
const risk = (id: string): Contract => { const result = contracts.find(row => row.runeId === id || row.id === id); assert.ok(result, id); return result; };

test('archive preserves every season/map and valid contract graph references', () => {
  assert.equal(seasons.length, 4);
  assert.equal(seasons.flatMap(row => row.maps).length, 20);
  for (const season of seasons) for (const map of season.maps) {
    assert.equal(season.maps.filter(row => row.main).length, 1);
    const rows = map.groups.flatMap(group => group.contracts);
    assert.ok(map.groups.length && rows.length >= 15, `${map.id} must include its criteria, including ungrouped rotational trees`);
    assert.equal(new Set(rows.map(row => row.id)).size, rows.length);
    for (const row of rows) {
      assert.ok(row.effects.length);
      assert.ok(Number.isFinite(row.x) && Number.isFinite(row.y));
      assert.ok(row.adjacent.every(id => rows.some(other => other.id === id)), `${map.id}/${row.id}`);
      assert.ok(!resolvedDescription(row).includes('{'), `${map.id}/${row.id} has unresolved parameters`);
    }
  }
  assert.equal(seasons.flatMap(season => season.maps.flatMap(map => map.groups.flatMap(group => group.contracts))).length, 628);
});

test('CCB tiers with the same packed mutex key stack additively', () => {
  let selected = toggleContract([], risk('enemy_atk_1'), contracts);
  selected = toggleContract(selected, risk('enemy_atk_2'), contracts);
  assert.equal(selected.length, 2);
  assert.equal(modifiedStats({ atk: 290 }, selected.map(risk), { side: 'enemy', id: 'enemy_1325_cbgpro' }).atk, 580);
});

test('tile-dependent penalties add and do not leak to other tiles or enemies', () => {
  const selected = [risk('char_lowland_attribute_mul_1'), risk('char_lowland_attribute_mul_2'), risk('char_highland_attribute_mul_1')];
  assert.deepEqual(modifiedStats({ hp: 1000, atk: 100 }, selected, { side: 'operator', className: 'Guard', tile: 'ground' }), { hp: 500, atk: 100 });
  assert.deepEqual(modifiedStats({ hp: 1000, atk: 100 }, selected, { side: 'operator', className: 'Sniper', tile: 'high' }), { hp: 1000, atk: 80 });
  assert.deepEqual(modifiedStats({ hp: 1000, atk: 100 }, selected, { side: 'enemy' }), { hp: 1000, atk: 100 });
});

test('node exclusions replace alternatives, while deselecting removes only that node', () => {
  const grouped = contracts.filter(row => row.exclusion);
  const first = grouped.find(row => grouped.some(other => other.id !== row.id && other.exclusion === row.exclusion))!;
  const second = grouped.find(row => row.id !== first.id && row.exclusion === first.exclusion)!;
  const selected = toggleContract([first.id, risk('enemy_atk_1').id], second, contracts);
  assert.deepEqual(selected, [risk('enemy_atk_1').id, second.id]);
  assert.deepEqual(toggleContract(selected, second, contracts), [risk('enemy_atk_1').id]);
  assert.equal(maximumContractScore(arclight.groups.find(row => row.id === 'pack_3')!.contracts), 150);
});

test('enemy-specific modifiers stay scoped; replacement ids follow selected contracts', () => {
  const selected = [risk('gx_cbjedi_2'), risk('gx_cbjedi_3'), risk('enemy_atk_1')];
  assert.equal(replacementId('enemy_1328_cbjedi', selected), 'enemy_1328_cbjedi_2');
  assert.equal(modifiedStats({ atk: 100 }, selected, { side: 'enemy', id: 'enemy_1328_cbjedi_2' }).atk, 240);
  assert.equal(modifiedStats({ atk: 100 }, selected, { side: 'enemy', id: 'enemy_1325_cbgpro' }).atk, 140);
});

test('ASPD penalties change attack interval and combine with module ASPD', () => {
  const value = modifiedStats({ interval: 100 / 108, aspd: 108 }, [risk('gx_char_attackspeed_1')], { side: 'operator', className: 'Guard', tile: 'ground' });
  assert.ok(Math.abs(value.interval! - 100 / 88) < 1e-9);
});

test('class conditions and deployment durations are respected', () => {
  const selected = [risk('char_deploy_attribute_add_2'), risk('skill_cost_slow_7')];
  assert.equal(modifiedStats({ atk: 100, dp: 20 }, selected, { side: 'operator', className: 'Vanguard', elapsed: 0 }).atk, 25);
  assert.equal(modifiedStats({ atk: 100, dp: 20 }, selected, { side: 'operator', className: 'Vanguard', elapsed: 10 }).atk, 100);
  assert.equal(modifiedStats({ dp: 20 }, selected, { side: 'operator', className: 'Caster' }).dp, 40);
  assert.equal(modifiedStats({ dp: 20 }, selected, { side: 'operator', className: 'Guard' }).dp, 20);
});

test('damage reduction remains separate from DEF/RES; unknown stats remain unknown', () => {
  const selected = [risk('enemy_physical_reduction_1'), risk('enemy_physical_reduction_2')];
  assert.deepEqual(modifiedStats({ physicalTaken: 100, def: 500, res: null }, selected, { side: 'enemy' }), { physicalTaken: 40, def: 500, res: null });
  assert.match(contractSummary(risk('enemy_atk_1')), /ATK \+40%/);
});

test('active modifiers combine compatible tiers like the in-game summary', () => {
  const selected = [risk('enemy_atk_1'), risk('enemy_atk_2'), risk('char_lowland_attribute_mul_1'), risk('char_lowland_attribute_mul_2')];
  const summaries = activeModifierSummaries(selected);
  assert.equal(summaries.length, 2);
  assert.equal(summaries[0].text, 'All enemies: ATK +100%');
  assert.equal(summaries[0].score, 50);
  assert.equal(summaries[1].text, 'All operators on ground tiles: HP -50%');
});
