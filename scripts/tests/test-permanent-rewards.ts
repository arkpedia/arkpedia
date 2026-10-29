import assert from 'node:assert/strict';
import { test } from 'node:test';
import permanentRewards from '../../data/permanent-rewards.json';
import { buildPermanentRewards, MODES } from '../build/build-permanent-rewards.mjs';
import { parsePermanentClaims, permanentClaimsFromGame } from '../../lib/account/permanentClaims';

/*
 * The permanent modes' rewards (scripts/build/build-permanent-rewards.mjs) and the save's claims
 * (lib/account/permanentClaims.ts) the Farming method subtracts from them.
 */
const byItemId = { 30012: 'Orirock Cube', 30013: 'Orirock Cluster', mod_unlock_token: 'Module Data Block' };
const empty = { roguelike_topic_table: {}, sandbox_perm_table: {}, climb_tower_table: {} };

test('milestones, challenge days, base levels and season missions become rewards by the id the save claims', () => {
  const en = {
    roguelike_topic_table: { details: { rogue_2: { milestones: [
      { id: 'bp_level_1', itemType: 'CHAR', itemID: 'char_1', itemCount: 1 },
      { id: 'bp_level_2', itemType: 'MATERIAL', itemID: '30012', itemCount: 4 },
      { id: 'bp_level_3', itemType: 'MATERIAL', itemID: '99999', itemCount: 4 },
    ] } } },
    sandbox_perm_table: { detail: { SANDBOX_V2: { sandbox_1: { challengeModeData: { challengeModeRewardData: {
      challenge_1: { rewardId: 'challenge_1', rewardItemList: [{ id: 'x_tokencoin', count: 9, type: 'SANDBOX_TOKEN' }, { id: '30013', count: 2, type: 'MATERIAL' }] },
    } } } } } },
    climb_tower_table: { missionData: { m1: { id: 'tower_season1_1', rewards: [{ type: 'MATERIAL', id: 'mod_unlock_token', count: 1 }, { type: 'GOLD', id: '4001', count: 5 }] } } },
  };
  const cn = {
    roguelike_topic_table: { details: { rogue_6: { milestones: [{ id: 'bp_level_2', itemType: 'MATERIAL', itemID: '30012', itemCount: 7 }] } } },
    sandbox_perm_table: { detail: { SANDBOX_V3: { sandbox_2: { basementUpdateDatas: [{ baseLevelId: 'baselevel_2', rewards: [{ id: '30013', count: 3, type: 'MATERIAL' }] }, { baseLevelId: 'baselevel_9', rewards: [{ id: '4001', count: 1, type: 'GOLD' }] }] } } } },
    climb_tower_table: { missionData: { m1: { id: 'tower_season1_1', rewards: [{ type: 'MATERIAL', id: 'mod_unlock_token', count: 1 }] }, m2: { id: 'tower_season13_1', rewards: [{ type: 'MATERIAL', id: '30012', count: 6 }] } } },
  };
  const { modes, dropped } = buildPermanentRewards({ tables: { en: { ...empty, ...en }, cn: { ...empty, ...cn } }, byItemId });
  const by = (id: string) => modes.find((mode) => mode.id === id)!;
  assert.deepEqual(by('is-2').rewards, [{ id: 'bp_level_2', materials: { 'Orirock Cube': 4 } }], 'a character and an unknown item are not materials');
  assert.equal(by('is-2').global, true);
  assert.deepEqual(by('is-6'), { id: 'is-6', label: 'IS6', kind: 'is', topic: 'rogue_6', global: false, rewards: [{ id: 'bp_level_2', cn: true, materials: { 'Orirock Cube': 7 } }] });
  assert.deepEqual(by('ra-2').rewards, [{ id: 'challenge_1', materials: { 'Orirock Cluster': 2 } }], 'a sandbox token is not a material');
  assert.deepEqual(by('ra-3').rewards, [{ id: 'baselevel_2', cn: true, materials: { 'Orirock Cluster': 3 } }], 'gold is not a material');
  assert.deepEqual(by('sss').rewards.map((r) => [r.id, !!r.cn]), [['tower_season1_1', false], ['tower_season13_1', true]], 'Global\'s first; CN adds only what Global lacks');
  assert.deepEqual(dropped, ['99999']);
});

test('the committed table lists every mode, with counts and ids the save can claim', () => {
  const table = permanentRewards as unknown as { modes: { id: string; global: boolean; rewards: { id: string; materials: Record<string, number> }[] }[] };
  assert.deepEqual(table.modes.map((m) => m.id), MODES.map((m) => m.id));
  for (const mode of table.modes) {
    assert.ok(mode.rewards.length > 0, `${mode.id} has rewards`);
    assert.equal(new Set(mode.rewards.map((r) => r.id)).size, mode.rewards.length, `${mode.id}: a reward id is listed once`);
    for (const reward of mode.rewards) {
      assert.match(reward.id, /^[a-zA-Z0-9_:-]{1,120}$/);
      // Names are not checked against the material catalogue: it is a release table regenerated every
      // content run, and a CN-only material it drops is harmless here (a plan cannot cost it).
      for (const [name, count] of Object.entries(reward.materials)) { assert.ok(name.length > 0); assert.ok(count > 0, `${mode.id}/${reward.id}: ${name}`); }
    }
  }
  assert.ok(table.modes.find((m) => m.id === 'is-2')!.global && !table.modes.find((m) => m.id === 'is-6')!.global, 'IS2 is on Global, IS6 is not yet');
});

test('a save\'s claims: Integrated Strategies by milestone, Stationary Security Service by collected mission', () => {
  const user = {
    rlv2: { outer: { rogue_2: { bp: { reward: { bp_level_1: 1, bp_level_2: 1, bp_level_3: 0 } } }, rogue_3: {} } },
    mission: { missions: { TOWERSEASON: { tower_season1_1: { state: 3 }, tower_season1_2: { state: 2 } }, MAIN: { main_1: { state: 3 } } } },
  };
  const got = permanentClaimsFromGame(user);
  assert.deepEqual(got.claimed, ['is-2:bp_level_1', 'is-2:bp_level_2', 'sss:tower_season1_1']);
  assert.deepEqual(got.modes, ['is-2', 'is-3', 'sss'], 'a mode with a record and no claims is known to have none');
  // A save with none of them says nothing, rather than that everything is claimed.
  assert.deepEqual(permanentClaimsFromGame({}), { modes: [], claimed: [] });
  assert.deepEqual(permanentClaimsFromGame({ rlv2: 'x', mission: { missions: { A: 'y' } } }), { modes: [], claimed: [] });
});

test('stored claims are untrusted', () => {
  assert.equal(parsePermanentClaims(null), undefined);
  assert.equal(parsePermanentClaims({ modes: 'x', claimed: [] }), undefined);
  assert.deepEqual(parsePermanentClaims({ modes: ['is-2', 7, '../x'], claimed: ['is-2:bp_level_1', 'bad id', 5, 'is-2:bp_level_1'] }), { modes: ['is-2'], claimed: ['is-2:bp_level_1'] });
});
