import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFreeRewards } from '../build/build-free-rewards.mjs';
import { accountFromGame } from '../../lib/account/accountStore';
import { allFreeRewards, freeRewardsForAccount, importClaimedBeginner, type FreeReward } from '../../lib/pulls/freeRewards';

/*
 * The Reward Tracker's Beginner rewards, ticked from an import. The tables are an excerpt of the
 * Global open_server_table (ArknightsAssets/ArknightsGamedata, 2026-10-21): both programmes'
 * ids, windows and mission groups as the client has them, a few of their sign-in days. The saves
 * are synthetic syncData users in the Torappu shapes (MissionPlayerData, PlayerOpenServer at
 * torappu-excel bc6e6155), not captures of a real account.
 */
const item = (id: string, count: number, type = 'MATERIAL') => ({ id, count, type });
const openServer = {
  schedule: [{ id: 'openseverTaskGroup1', startTs: 1533898800, endTs: 1733227199 }, { id: 'openseverTaskGroup2', startTs: 1733227200, endTs: 1881658799 }],
  dataMap: {
    openseverTaskGroup1: {
      openServerMissionGroup: { id: 'openseverTaskGroup1', type: 'OPENSERVER', missionIds: ['openserver_1', 'openserver_2', 'openserver_3', 'openserver_4'] },
      openServerMissionData: ['Clear Main Storyline0-1', 'Own at least 1 Lv.2 Control Center', 'Clear Main Storyline1-12', 'Player reaches Lv.8']
        .map((description, index) => ({ id: `openserver_${index + 1}`, description, rewards: [item('4003', 600, 'DIAMOND_SHD')] })),
      checkInData: [{ order: 1, item: item('4001', 5000, 'GOLD') }, { order: 14, item: item('4001', 50000, 'GOLD') }],
      chainLoginData: [{ order: 1, item: item('4003', 600, 'DIAMOND_SHD') }, { order: 7, item: item('char_173_slchan', 1, 'CHAR') }],
    },
    openseverTaskGroup2: {
      openServerMissionGroup: { id: 'openseverTaskGroup2', type: 'OPENSERVER', missionIds: ['openserver_1_1', 'openserver_2_1', 'openserver_3_1', 'openserver_4_1'] },
      openServerMissionData: ['Clear Main Storyline0-1', 'Player reaches Lv.8', 'Clear Main Storyline1-12', 'Own a Lv.2 Control Center']
        .map((description, index) => ({ id: `openserver_${index + 1}_1`, description, rewards: [item('4003', 600, 'DIAMOND_SHD')] })),
      checkInData: [{ order: 1, item: item('4001', 20000, 'GOLD') }, { order: 2, item: item('2003', 20, 'CARD_EXP') }],
      chainLoginData: [{ order: 7, item: item('voucher_item_4pick1_5301', 1, 'VOUCHER_PICK') }],
    },
  },
  constant: { firstDiamondShardMailCount: 3800 },
};
const catalogue = allFreeRewards(buildFreeRewards({
  handbook: { handbookStageData: {} }, missions: { missions: {}, missionGroups: {} }, checkin: { groups: {} }, openServer,
  items: { items: { '4001': { name: 'LMD' }, '4003': { name: 'Orundum' } } }, shops: { shopGPDataDict: {} },
  characters: { char_173_slchan: { name: 'Cliffheart', rarity: 'TIER_5' } }, activity: { activity: {}, basicInfo: {}, missionData: [] },
} as never));
/* The map as the content run builds it (scripts/build/build-game-account-map.ts), and as a
   release built before it kept the programmes' missions. */
const map = { version: 1 as const, chars: {}, beginnerPrograms: openServer.schedule.map(row => ({ ...row, missionIds: openServer.dataMap[row.id as keyof typeof openServer.dataMap].openServerMissionGroup.missionIds })) };
const olderMap = { version: 1 as const, chars: {}, beginnerPrograms: openServer.schedule };

function settled(user: Record<string, unknown>, accountMap: typeof map | typeof olderMap = map) {
  const account = accountFromGame(user, accountMap, 'en');
  const shown = freeRewardsForAccount(catalogue, account).filter((row: FreeReward) => row.group === 'Beginner rewards');
  return { account, shown: shown.map(row => row.id), locked: Object.fromEntries(importClaimedBeginner(shown, account.rewardClaims)) };
}

// A Global account registered 2020-02-03, under the older programme, years after it closed:
// its mission group complete, no OPENSERVER record left, the sign-in histories emptied.
const veteran = {
  status: { registerTs: 1580712160, uid: 'fixture-veteran', level: 120 },
  mission: { missions: { MAIN: {}, GUIDE: {}, OPENSERVER: {} }, missionGroups: { openseverTaskGroup1: 1, guide_g_1: 1 } },
  openServer: { checkIn: { isAvailable: false, history: [] }, chainLogin: { isAvailable: false, nowIndex: 0, history: [] } },
  troop: { chars: { 1: { charId: 'char_173_slchan', skin: 'char_173_slchan#1' } } },
};

test('an older account ticks the beginner missions from their mission group, and nothing from its roster', () => {
  const { shown, locked } = settled(veteran);
  assert.ok(shown.includes('free:openserver_1') && !shown.includes('free:openserver_1_1'), 'the programme it registered under');
  assert.deepEqual(locked, {
    'free:openserver_1': 'game', 'free:openserver_2': 'game', 'free:openserver_3': 'game', 'free:openserver_4': 'game',
  });
  // What the save cannot speak to stays the reader's: the welcome mail, and every sign-in day,
  // the 7th too: Cliffheart is in the roster, but she is also in the headhunting pool.
  for (const id of ['free:welcome-mail', 'free:openseverTaskGroup1:checkInData:1', 'free:openseverTaskGroup1:checkInData:14', 'free:openseverTaskGroup1:chainLoginData:1', 'free:openseverTaskGroup1:chainLoginData:7']) {
    assert.ok(shown.includes(id), id);
    assert.ok(!(id in locked), `${id} stays manual`);
  }
});

test('a save that does not show the beginner rewards received leaves them manual', () => {
  // The group not complete, no OPENSERVER record.
  const { account, locked } = settled({ ...veteran, mission: { missions: {}, missionGroups: { openseverTaskGroup1: 0 } }, troop: { chars: {} } });
  assert.deepEqual(locked, {});
  assert.ok(!account.rewardClaims!.known.some(id => /^free:openserver_/.test(id)), 'an uncomplete group marks nothing unclaimed');
  // A release built before the map kept the programmes' missions: the group cannot be read.
  assert.deepEqual(settled({ ...veteran, troop: { chars: {} } }, olderMap).locked, {});
  // A mission record of its own still decides, whatever the group says.
  assert.deepEqual(settled({ ...veteran, troop: { chars: {} }, mission: { missions: { OPENSERVER: { openserver_2: { state: 3, progress: [] } } }, missionGroups: { openseverTaskGroup1: 0 } } }).locked,
    { 'free:openserver_2': 'game' });
});

test('a newer account ticks only the days and missions its save records as received', () => {
  const { account, shown, locked } = settled({
    status: { registerTs: 1740787200, uid: 'fixture-new', level: 30 },
    mission: { missions: { OPENSERVER: { openserver_1_1: { state: 3, progress: [] }, openserver_2_1: { state: 2, progress: [] } } }, missionGroups: { openseverTaskGroup2: 0 } },
    openServer: { checkIn: { isAvailable: true, history: [0, 1] }, chainLogin: { isAvailable: true, nowIndex: 0, history: [1, 1, 1, 1, 1, 1, 1] } },
    troop: { chars: {} },
  });
  assert.ok(shown.includes('free:openserver_1_1') && !shown.includes('free:openserver_1'));
  assert.deepEqual(locked, { 'free:openserver_1_1': 'game', 'free:openseverTaskGroup2:checkInData:1': 'game' });
  // Known unclaimed is not locked: the reader can still claim day 2 in game, then tick it.
  for (const id of ['free:openserver_2_1', 'free:openseverTaskGroup2:checkInData:2', 'free:openseverTaskGroup2:chainLoginData:7']) {
    assert.ok(account.rewardClaims!.known.includes(id), id); assert.ok(!(id in locked), id);
  }
});

test('only a received beginner row locks, whatever the roster holds', () => {
  const rows: FreeReward[] = [{ id: 'free:p:chainLoginData:7', group: 'Beginner rewards', name: 'Day 7', rewards: [{ id: 'char_173_slchan', name: 'Cliffheart', count: 1, rarity: 5 }], forecast: true }];
  assert.deepEqual([...importClaimedBeginner(rows, { claimed: [] })], []);
  assert.deepEqual([...importClaimedBeginner(rows, undefined)], []);
  assert.deepEqual([...importClaimedBeginner(rows, { claimed: [rows[0].id] })], [[rows[0].id, 'game']]);
  // Only the beginner group: a welfare row has its own rule (rosterClaimedWelfare).
  assert.deepEqual([...importClaimedBeginner([{ ...rows[0], group: 'Welfare operators' }], { claimed: [rows[0].id] })], []);
});
