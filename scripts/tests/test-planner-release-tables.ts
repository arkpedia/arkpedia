import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkItemSortIds, inGameOrder, MATERIAL_SORT_ORDER } from '../../lib/farming/materialSortOrder';
import type { FarmingTier } from '../../lib/farming/farmingTypes';
import { createCraftTools } from '../../lib/planner/craft';
import { checkImportAliases, parseForeign, type ImportAliases } from '../../lib/planner/foreignImport';
import { computeLevelCost, computeLevelCostRemaining, type LevelTable } from '../../lib/planner/plannerLogic';
import { createSourceTools } from '../../lib/planner/sources';

/*
 * The planner answers from the tables its page props carry, not from copies compiled
 * into its chunk. Each case hands in a made-up release table that says something the
 * deployed data/ does not, and expects the answer to follow it.
 */

test('a stage the release\'s farming guide names is where the planner sends you', () => {
  const guide: FarmingTier[] = [{ tier: 3, materials: [{ name: 'Release Material', icon: '/material-icons/Release Material.webp', stages: [{ label: 'RL-1', kind: 'efficient' }, { label: 'Event Store', kind: 'plain' }] }] }];
  const { formulaFor } = createCraftTools();
  const tools = createSourceTools({}, formulaFor, guide);
  assert.deepEqual(tools.sourceFor('Release Material'), { kind: 'farm', stages: ['RL-1'] });
  assert.deepEqual(tools.stagesToRun(['Release Material']), { codes: ['RL-1'], covers: 1 });
  // A guide without it: the same material has nowhere listed.
  assert.equal(createSourceTools({}, formulaFor, []).sourceFor('Release Material').kind, 'unknown');
});

test('level costs come from the release\'s level table', () => {
  const levels: LevelTable = { Elite0: { 2: { EXP: 100, LMD: 10 }, 3: { EXP: 200, LMD: 20 } } };
  assert.deepEqual(computeLevelCost(levels, 3, 0, 3), { exp: 300, lmd: 30 });
  assert.deepEqual(computeLevelCostRemaining(levels, 3, 0, 2, 0, 3), { exp: 200, lmd: 20 });
  assert.deepEqual(computeLevelCost({ Elite0: {} }, 3, 0, 3), { exp: 0, lmd: 0 });
});

test('the depot follows the release\'s in-game order, and a missing sortId fails where the table is read', () => {
  const holdable = MATERIAL_SORT_ORDER.filter(name => name !== 'EXP');
  const reversed = Object.fromEntries(holdable.map((name, i) => [name, holdable.length - i]));
  assert.deepEqual(inGameOrder(reversed), [...holdable].reverse());
  assert.equal(checkItemSortIds(reversed), reversed);
  const { LMD: _lmd, ...withoutLmd } = reversed;
  assert.throws(() => checkItemSortIds(withoutLmd), /no sortId for LMD/);
  // In the browser the same gap only sorts last; it never throws there.
  assert.equal(inGameOrder(withoutLmd).at(-1), 'LMD');
});

test('another planner\'s export reads with the release\'s item ids, and a disagreeing table fails where it is read', () => {
  const holdable = MATERIAL_SORT_ORDER.filter(name => name !== 'EXP');
  const aliases: ImportAliases = { byItemId: Object.fromEntries(holdable.map((name, i) => [`id${i}`, name])), byArkgraph: { 'X-1': holdable[0] } };
  const csv = ['itemId,itemName,owned,needed', 'id0,Whatever,7,0'].join('\n');
  assert.deepEqual(parseForeign(csv, aliases)?.depot, { [holdable[0]]: 7 });
  assert.equal(parseForeign(csv, { byItemId: {}, byArkgraph: {} }), null);
  assert.equal(checkImportAliases(aliases), aliases);
  assert.throws(() => checkImportAliases({ ...aliases, byArkgraph: { 'X-1': 'Not A Material' } }), /Maps a name the sort order does not have: Not A Material/);
});
