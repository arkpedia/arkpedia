import assert from 'node:assert/strict';
import test from 'node:test';
import { accountFromGame } from '../../lib/account/accountStore';
import { freeRewardsForAccount, importClaimedBeginner, type FreeReward } from '../../lib/pulls/freeRewards';

/*
 * The Reward Tracker's Beginner rewards, ticked from an import. The catalogue is the one
 * arkpedia-data's importer builds out of the Global open_server_table (its
 * scripts/tests/test-reward-beginner-imports.ts holds it to those tables), inlined as a release
 * carries it: both programmes' rows, the older one's last. The saves are synthetic syncData
 * users in the Torappu shapes (MissionPlayerData, PlayerOpenServer at torappu-excel bc6e6155),
 * not captures of a real account.
 */
const catalogue = [
  { id: 'free:openserver_1_1', group: 'Beginner rewards', name: 'Clear Main Storyline0-1', rewards: [{ id: '4003', name: 'Orundum', count: 600, orundum: 600 }], beginner: { id: 'openseverTaskGroup2', startTs: 1733227200, endTs: 1881658799, current: true }, forecast: true },
  { id: 'free:openserver_2_1', group: 'Beginner rewards', name: 'Player reaches Lv.8', rewards: [{ id: '4003', name: 'Orundum', count: 600, orundum: 600 }], beginner: { id: 'openseverTaskGroup2', startTs: 1733227200, endTs: 1881658799, current: true }, forecast: true },
  { id: 'free:openserver_3_1', group: 'Beginner rewards', name: 'Clear Main Storyline1-12', rewards: [{ id: '4003', name: 'Orundum', count: 600, orundum: 600 }], beginner: { id: 'openseverTaskGroup2', startTs: 1733227200, endTs: 1881658799, current: true }, forecast: true },
  { id: 'free:openserver_4_1', group: 'Beginner rewards', name: 'Own a Lv.2 Control Center', rewards: [{ id: '4003', name: 'Orundum', count: 600, orundum: 600 }], beginner: { id: 'openseverTaskGroup2', startTs: 1733227200, endTs: 1881658799, current: true }, forecast: true },
  { id: 'free:openseverTaskGroup2:checkInData:1', group: 'Beginner rewards', name: 'Cumulative sign-in · Day 1', rewards: [{ id: '4001', name: 'LMD', count: 20000 }], beginner: { id: 'openseverTaskGroup2', startTs: 1733227200, endTs: 1881658799, current: true }, forecast: true },
  { id: 'free:openseverTaskGroup2:checkInData:2', group: 'Beginner rewards', name: 'Cumulative sign-in · Day 2', rewards: [{ id: '2003', name: 'Reward item', count: 20 }], beginner: { id: 'openseverTaskGroup2', startTs: 1733227200, endTs: 1881658799, current: true }, forecast: true },
  { id: 'free:openseverTaskGroup2:chainLoginData:7', group: 'Beginner rewards', name: 'Consecutive sign-in · Day 7', rewards: [{ id: 'voucher_item_4pick1_5301', name: 'Reward item', count: 1 }], beginner: { id: 'openseverTaskGroup2', startTs: 1733227200, endTs: 1881658799, current: true }, forecast: true },
  { id: 'free:welcome-mail', group: 'Beginner rewards', name: 'Welcome mail', rewards: [{ id: '4003', name: 'Orundum', count: 3800, orundum: 3800 }], forecast: true },
  { id: 'free:openserver_1', group: 'Beginner rewards', name: 'Clear Main Storyline0-1', rewards: [{ id: '4003', name: 'Orundum', count: 600, orundum: 600 }], beginner: { id: 'openseverTaskGroup1', startTs: 1533898800, endTs: 1733227199, current: false }, forecast: true },
  { id: 'free:openserver_2', group: 'Beginner rewards', name: 'Own at least 1 Lv.2 Control Center', rewards: [{ id: '4003', name: 'Orundum', count: 600, orundum: 600 }], beginner: { id: 'openseverTaskGroup1', startTs: 1533898800, endTs: 1733227199, current: false }, forecast: true },
  { id: 'free:openserver_3', group: 'Beginner rewards', name: 'Clear Main Storyline1-12', rewards: [{ id: '4003', name: 'Orundum', count: 600, orundum: 600 }], beginner: { id: 'openseverTaskGroup1', startTs: 1533898800, endTs: 1733227199, current: false }, forecast: true },
  { id: 'free:openserver_4', group: 'Beginner rewards', name: 'Player reaches Lv.8', rewards: [{ id: '4003', name: 'Orundum', count: 600, orundum: 600 }], beginner: { id: 'openseverTaskGroup1', startTs: 1533898800, endTs: 1733227199, current: false }, forecast: true },
  { id: 'free:openseverTaskGroup1:checkInData:1', group: 'Beginner rewards', name: 'Cumulative sign-in · Day 1', rewards: [{ id: '4001', name: 'LMD', count: 5000 }], beginner: { id: 'openseverTaskGroup1', startTs: 1533898800, endTs: 1733227199, current: false }, forecast: true },
  { id: 'free:openseverTaskGroup1:checkInData:14', group: 'Beginner rewards', name: 'Cumulative sign-in · Day 14', rewards: [{ id: '4001', name: 'LMD', count: 50000 }], beginner: { id: 'openseverTaskGroup1', startTs: 1533898800, endTs: 1733227199, current: false }, forecast: true },
  { id: 'free:openseverTaskGroup1:chainLoginData:1', group: 'Beginner rewards', name: 'Consecutive sign-in · Day 1', rewards: [{ id: '4003', name: 'Orundum', count: 600, orundum: 600 }], beginner: { id: 'openseverTaskGroup1', startTs: 1533898800, endTs: 1733227199, current: false }, forecast: true },
  { id: 'free:openseverTaskGroup1:chainLoginData:7', group: 'Beginner rewards', name: 'Consecutive sign-in · Day 7', rewards: [{ id: 'char_173_slchan', rarity: 5, name: 'Cliffheart', count: 1 }], beginner: { id: 'openseverTaskGroup1', startTs: 1533898800, endTs: 1733227199, current: false }, forecast: true },
] as unknown as FreeReward[];

/* The map as the content run builds it (arkpedia-data's importer, scripts/build/build-game-account-map.ts),
   and as a release built before it kept the programmes' missions. */
const schedule = [{ id: 'openseverTaskGroup1', startTs: 1533898800, endTs: 1733227199 }, { id: 'openseverTaskGroup2', startTs: 1733227200, endTs: 1881658799 }];
const missionIds: Record<string, string[]> = {
  openseverTaskGroup1: ['openserver_1', 'openserver_2', 'openserver_3', 'openserver_4'],
  openseverTaskGroup2: ['openserver_1_1', 'openserver_2_1', 'openserver_3_1', 'openserver_4_1'],
};
const map = { version: 1 as const, chars: {}, beginnerPrograms: schedule.map(row => ({ ...row, missionIds: missionIds[row.id] })) };
const olderMap = { version: 1 as const, chars: {}, beginnerPrograms: schedule };

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
