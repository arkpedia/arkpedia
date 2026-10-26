import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFreeRewards } from '../build/build-free-rewards.mjs';
import { rewardClaimsFromGame } from '../../lib/account/rewardClaims';
import { accountFromGame } from '../../lib/account/accountStore';
import { allFreeRewards, freeOperatorsToClaim, freeRewardsForAccount, obtainableWelfare, rosterClaimedWelfare, rosterOperatorIds, welfareCardFacts, type FreeReward } from '../../lib/pulls/freeRewards';

/*
 * Excerpts of the Global EN tables as the content run reads them (ArknightsAssets/ArknightsGamedata,
 * 2026-10-21): the ids, windows and shapes are the client's own, trimmed to the rows that matter.
 * The account is a synthetic syncData user in the Torappu shapes (PlayerMission, PlayerCheckIn,
 * PlayerActivity, PlayerOpenServer, PlayerRetro at torappu-excel bc6e6155), carrying one claim of
 * every kind the tracker imports.
 */
const item = (id: string, count: number, type = 'MATERIAL') => ({ id, count, type });
const mission = (id: string, type: string, missionGroup: string, description: string, rewards: unknown[]) => ({ id, type, missionGroup, description, rewards });
const signIn = (order: number, itemList: unknown[]) => ({ order, itemList, isDynItem: false });
const celebrationDays = [[item('LIMITED_TKT_GACHA_10_7301', 1, 'LIMITED_TKT_GACHA_10'), item('ap_supply_lt_120', 1, 'AP_SUPPLY')], [item('char_4227_gallus', 1, 'CHAR'), item('7001', 5, 'TKT_RECRUIT')]];

function tables(overrides: { missions?: Record<string, unknown> } = {}) {
  return {
    handbook: { handbookStageData: {} },
    characters: { char_4226_veen: { name: 'Viy', rarity: 'TIER_6' }, char_4223_botany: { name: 'Botani', rarity: 'TIER_5' }, char_4227_gallus: { name: 'GALLUS²', rarity: 'TIER_1' },
      char_333_sidero: { name: 'Sideroca', rarity: 'TIER_5' }, char_345_folnic: { name: 'Folinic', rarity: 'TIER_5' }, char_131_flameb: { name: 'Flamebringer', rarity: 'TIER_5' } },
    items: { items: { '4001': { name: 'LMD' }, '4003': { name: 'Orundum' }, '7001': { name: 'Recruitment Permit' } } },
    missions: { missions: overrides.missions ?? {
      main_1: mission('main_1', 'MAIN', 'main_1', 'Clear 0-1', [item('4001', 1000, 'GOLD')]),
      guide_1: mission('guide_1', 'GUIDE', 'guide_g_1', 'Pinboard 1', [item('4003', 100, 'DIAMOND_SHD')]),
      act4mainssPermanent_4: mission('act4mainssPermanent_4', 'RETRO', 'permanent_main_3_One_Day_More', 'Clear 17-12', [item('31103', 3)]),
      act4mainssPermanent_5: mission('act4mainssPermanent_5', 'RETRO', 'permanent_main_3_One_Day_More', 'Clear 17-13', [item('char_4226_veen', 1, 'CHAR')]),
    }, missionGroups: { guide_g_1: { id: 'guide_g_1', type: 'GUIDE', title: 'Phase 1', rewards: [item('7003', 1, 'TKT_GACHA')] } } },
    openServer: {
      schedule: [{ id: 'openseverTaskGroup1', startTs: 1533898800, endTs: 1733227199 }, { id: 'openseverTaskGroup2', startTs: 1733227200, endTs: 1881658799 }],
      dataMap: {
        openseverTaskGroup1: { openServerMissionData: [{ id: 'openserver_1', description: 'Clear Main Storyline0-1', rewards: [item('4003', 600)] }],
          checkInData: [{ order: 1, item: item('4001', 20000) }], chainLoginData: [{ order: 7, item: item('char_173_slchan', 1, 'CHAR') }] },
        openseverTaskGroup2: { openServerMissionData: [{ id: 'openserver_1_1', description: 'Clear Main Storyline0-1', rewards: [item('4003', 600)] }],
          checkInData: [{ order: 1, item: item('4001', 20000) }, { order: 2, item: item('4003', 200) }], chainLoginData: [{ order: 1, item: item('4001', 5000) }] },
      },
      constant: { firstDiamondShardMailCount: 3800 },
      longTermCheckInData: { groupList: [{ groupId: 'signin_1', days: 180, level: 80, rewardList: [item('4003', 600)] }] },
    },
    checkin: { groups: { signin82: { groupId: 'signin82', title: 'October', signStartTime: 1790852400, signEndTime: 1793530799, items: [item('4001', 2000), item('2001', 10), item('7001', 1)] } } },
    activity: {
      basicInfo: {
        act4mainss: { id: 'act4mainss', name: 'Critical Phase Transition', startTime: 1791979200, endTime: 1793185199, rewardEndTime: 1793789999 },
        act51side: { id: 'act51side', name: 'People, A People', startTime: 1789570800, endTime: 1790765999, rewardEndTime: 1791370799 },
        act59sign: { id: 'act59sign', name: 'Celebration Login Event', startTime: 1791979200, endTime: 1793185199, rewardEndTime: 1793185199 },
        act4d0: { id: 'act4d0', name: 'Code of Brawl', startTime: 1600000000, endTime: 1601000000, rewardEndTime: 1601500000 },
      },
      activity: {
        CHECKIN_ONLY: { act59sign: { checkInList: { 0: signIn(1, celebrationDays[0]), 1: signIn(2, celebrationDays[1]) } } },
        TYPE_ACT4D0: { act4d0: { mileStoneItemList: [{ item: item('char_131_flameb', 1, 'CHAR') }] } },
      },
      missionData: [
        mission('act4mainssActivity_1', 'ACTIVITY', 'act4mainss', 'Clear 17-2', [item('act4mainss_token', 40, 'ACTIVITY_ITEM')]),
        mission('51sideActivity_4', 'ACTIVITY', 'act51side', 'Clear PA-4', [item('char_4223_botany', 1, 'CHAR')]),
      ],
      activityTemplateMissionStyles: {
        act4mainss: { bigRewardType: 'ILLUST_CHAR_REWARD', bigRewardParamList: ['char_4226_veen', 'Clear 17-13 to obtain this Operator'] },
        permanent_main_3_One_Day_More: { bigRewardType: 'ILLUST_CHAR_REWARD', bigRewardParamList: ['char_4226_veen', 'Clear 17-13 to obtain this Operator'] },
        act51side: { bigRewardType: 'ILLUST_CHAR_REWARD', bigRewardParamList: ['char_4223_botany', 'Clear PA-4 to obtain this Operator'] },
      },
    },
    retro: {
      retroActList: {
        permanent_main_3_One_Day_More: { retroId: 'permanent_main_3_One_Day_More', linkedActId: ['act4mainss'], customActId: 'act4mainss', startTime: 1793185200, trailStartTime: -1, name: 'Critical Phase Transition' },
        permanent_sub_1_Darknights_Memoir: { retroId: 'permanent_sub_1_Darknights_Memoir', linkedActId: [], customActId: null, startTime: 1660000000, trailStartTime: 1669395600, name: 'Darknights Memoir' },
        permanent_sidestory_4_Twilight_Of_Wolumonde: { retroId: 'permanent_sidestory_4_Twilight_Of_Wolumonde', linkedActId: [], customActId: null, startTime: 1625137200, trailStartTime: 1675443600, name: 'Twilight of Wolumonde' },
      },
      // The client reuses Darknights Memoir's trail reward id for Twilight of Wolumonde's.
      retroTrailList: {
        permanent_sub_1_Darknights_Memoir: { trailStartTime: 1669395600, trailRewardList: [{ trailRewardId: 'trailReward_sub_1_1', starCount: 12, rewardItem: item('char_333_sidero', 1, 'CHAR') }, { trailRewardId: 'trailReward_sub_1_2', starCount: 20, rewardItem: item('4003', 100) }] },
        permanent_sidestory_4_Twilight_Of_Wolumonde: { trailStartTime: 1675443600, trailRewardList: [{ trailRewardId: 'trailReward_sub_1_1', starCount: 12, rewardItem: item('char_345_folnic', 1, 'CHAR') }] },
      },
    },
    shops: { shopGPDataDict: { GP_freeL_5: { displayName: 'Free pack' } } },
    eventRewards: { events: { '[Celebration] Critical Phase Transition': { activity: 'act4mainss', groups: [
      { kind: 'login', title: '2026 CELEBRATION SIGN-IN EVENT OPEN', region: 'Global', start: '2026-10-14T15:00:00.000Z', end: '2026-10-28T10:59:00.000Z', days: 2,
        items: [], daily: [[{ name: 'Emergency Sanity Concentrate', count: 1 }, { name: 'A Sealed Vow Headhunting Permit', count: 1 }], [{ name: 'Recruitment Permit', count: 5 }, { name: 'GALLUS²', count: 1 }]] },
      { kind: 'missions', title: 'Event missions', source: 'activity_table missionData act4mainss', items: [{ name: "'Factory scrip'", count: 400, kind: 'event-item', id: 'act4mainss_token' }] },
    ] }, '[Side Story] People, A People': { activity: 'act51side', groups: [] } } },
  };
}

const at = (iso: string) => Date.parse(iso);

test('welfare operators come from the tables that give them: event missions, permanent missions, Record Restoration', () => {
  const built = buildFreeRewards(tables());
  const welfare = Object.fromEntries(built.rewards.filter(row => row.group === 'Welfare operators').map(row => [row.id, row]));
  // Viy: no event mission gives her; the permanent mission act4mainssPermanent_5 does, from the event's start, with no end.
  const viy = welfare['free:act4mainssPermanent_5'];
  assert.equal(viy?.name, 'Viy · Event missions (permanent): Clear 17-13');
  assert.equal(viy.event, 'Critical Phase Transition');
  assert.equal(viy.startAt, 1791979200 * 1000);
  assert.equal(viy.endAt, undefined);
  // ...and says so: a permanent mission, whose event closes on 2026-10-28 (basicInfo endTime).
  assert.deepEqual([viy.source, viy.eventEndAt], ['retro', (1793185199 + 1) * 1000]);
  assert.equal(viy.href, `/events/${encodeURIComponent('[Celebration] Critical Phase Transition')}`);
  assert.deepEqual(viy.rewards.map(reward => [reward.id, reward.rarity]), [['char_4226_veen', 6]]);
  // A side story's operator: its missions, while its stages are open.
  const botani = welfare['free:51sideActivity_4'];
  assert.equal(botani?.name, 'Botani · Event missions: Clear PA-4');
  assert.deepEqual([botani.startAt, botani.endAt, botani.source], [1789570800 * 1000, (1790765999 + 1) * 1000, 'event']);
  // Record Restoration, keyed by story as well as reward: the two share trailReward_sub_1_1.
  assert.equal(welfare['free:trail:permanent_sub_1_Darknights_Memoir:trailReward_sub_1_1']?.name, 'Sideroca · Record Restoration: 12 stars');
  assert.equal(welfare['free:trail:permanent_sub_1_Darknights_Memoir:trailReward_sub_1_1'].source, 'trail');
  assert.equal(welfare['free:trail:permanent_sidestory_4_Twilight_Of_Wolumonde:trailReward_sub_1_1']?.name, 'Folinic · Record Restoration: 12 stars');
  assert.ok(!Object.keys(welfare).some(id => id.includes('trailReward_sub_1_2')), 'only the operator of a trail is a welfare row');
  // An event's own data (milestones): manual, while its stages were open.
  assert.equal(welfare['free:welfare:act4d0:char_131_flameb']?.name, 'Flamebringer · Event rewards');
  assert.equal(welfare['free:welfare:act4d0:char_131_flameb'].source, 'extra');
  // A sign-in's operator stays a day of its sign-in, not a second welfare row.
  assert.ok(!Object.values(welfare).some(row => row.rewards.some(reward => reward.id === 'char_4227_gallus')));
  // Obtainable on 2026-10-21: Viy (a permanent main-story mission), and the Archives' operators. Not
  // GALLUS² (a sign-in's day), not Botani (her event closed on 2026-09-30, no Archive yet).
  const open = freeOperatorsToClaim(built.rewards, new Set(), at('2026-10-21T06:00:00Z')).map(({ operator }) => operator.name);
  assert.deepEqual(open, ['Viy', 'Folinic', 'Sideroca']);
  assert.deepEqual(freeOperatorsToClaim(built.rewards, new Set(['free:act4mainssPermanent_5']), at('2026-10-21T06:00:00Z')).map(({ operator }) => operator.name), ['Folinic', 'Sideroca']);
  // Once Critical Phase Transition closes, Viy's permanent mission is still claimable in the
  // game (main-story event missions stay), so she stays listed.
  assert.deepEqual(freeOperatorsToClaim(built.rewards, new Set(), at('2026-10-28T12:00:00Z')).map(({ operator }) => operator.name), ['Viy', 'Folinic', 'Sideroca']);
});

test('an operator the event mission page features without a row stops the build', () => {
  const { act4mainssPermanent_5: _viy, ...missions } = tables().missions.missions as Record<string, unknown>;
  assert.throws(() => buildFreeRewards(tables({ missions })), /Welfare operator without a row: char_4226_veen featured by act4mainss/);
});

test('an official post of the client sign-in under its own title is that sign-in, not a second one', () => {
  const built = buildFreeRewards(tables());
  const signIns = built.rewards.filter(row => row.group === 'Event sign-in and gifts');
  assert.deepEqual(signIns.map(row => row.id), ['free:act59sign:1', 'free:act59sign:2']);
  // Another post (other counts) still has its rows.
  const other = tables();
  other.eventRewards.events['[Celebration] Critical Phase Transition'].groups[0].daily![1] = [{ name: 'Orundum', count: 600 }];
  assert.equal(buildFreeRewards(other).rewards.filter(row => row.id.startsWith('free:announcement:')).length, 2);
});

// A Global account registered 2025-03-01, mid-way through its claims.
const user = {
  status: { registerTs: 1740787200, uid: 'fixture', level: 90 },
  mission: {
    missions: {
      MAIN: { main_1: { state: 3, progress: [{ target: 1, value: 1 }] } },
      GUIDE: { guide_1: { state: 2, progress: [{ target: 1, value: 1 }] } },
      OPENSERVER: { openserver_1_1: { state: 3, progress: [{ target: 1, value: 1 }] } },
      ACTIVITY: { act4mainssActivity_1: { state: 3, progress: [] }, '51sideActivity_4': { state: 3, progress: [] } },
      RETRO: { act4mainssPermanent_4: { state: 3, progress: [] }, act4mainssPermanent_5: { state: 3, progress: [] } },
      DAILY: { daily_1: { state: 3, progress: [] } },
    },
    missionGroups: { guide_g_1: 1 },
  },
  checkIn: { canCheckIn: 0, checkInGroupId: 'signin82', checkInRewardIndex: 2, checkInHistory: [1, 1, 0], longTermRecvRecord: { signin_1: 1 } },
  openServer: { checkIn: { isAvailable: true, history: [0, 1] }, chainLogin: { isAvailable: true, nowIndex: 1, history: [0] } },
  activity: { CHECKIN_ONLY: { act59sign: { history: [0, 0], extraHistory: [] } } },
  retro: { coin: 0, supplement: 0, block: {}, trail: { permanent_sub_1_Darknights_Memoir: { trailReward_sub_1_1: 1 }, permanent_sidestory_4_Twilight_Of_Wolumonde: {} }, lst: 0, nst: 0, rewardPerm: [] },
  shop: { GP: { level: { info: [{ id: 'GP_freeL_5', count: 1 }] } } },
};

test('an import ticks every row the account has claimed, welfare operators included, and nothing it has not', () => {
  const built = buildFreeRewards(tables());
  const map = { version: 1 as const, chars: {}, beginnerPrograms: tables().openServer.schedule };
  const account = accountFromGame(user, map, 'en');
  const shown = freeRewardsForAccount(allFreeRewards(built), account);
  const ids = new Set(allFreeRewards(built).map(row => row.id));
  const claimed = new Set(account.rewardClaims!.claimed);
  // Every claim is a row the catalogue has, but the missions that give no free reward row
  // (an event token, a permanent mission's materials)...
  for (const id of claimed) if (!/^free:(act4mainssActivity_1|act4mainssPermanent_4)$/.test(id)) assert(ids.has(id), `claim without a row: ${id}`);
  // ...and every row the account evidences is ticked.
  assert.deepEqual(shown.filter(row => claimed.has(row.id)).map(row => row.id).sort(), [
    'free:51sideActivity_4', 'free:GP_freeL_5', 'free:act4mainssPermanent_5', 'free:act59sign:1', 'free:act59sign:2',
    'free:guide_g_1', 'free:main_1', 'free:openserver_1_1', 'free:openseverTaskGroup2:chainLoginData:1', 'free:openseverTaskGroup2:checkInData:1',
    'free:signin82:1', 'free:signin82:2', 'free:signin_1', 'free:trail:permanent_sub_1_Darknights_Memoir:trailReward_sub_1_1',
  ]);
  // Known but unclaimed stays open: a completed, uncollected pinboard mission is not a claim.
  for (const id of ['free:guide_1', 'free:signin82:3', 'free:openseverTaskGroup2:checkInData:2']) {
    assert(account.rewardClaims!.known.includes(id)); assert(!claimed.has(id));
  }
  assert(!account.rewardClaims!.known.some(id => id.includes('daily_1')), 'daily missions are not free-reward claims');
  assert(!account.rewardClaims!.known.includes('free:trail:permanent_sidestory_4_Twilight_Of_Wolumonde:trailReward_sub_1_1'), 'no trail record stays unknown');
  // So nothing the account claimed is left in the welfare list.
  assert.deepEqual(freeOperatorsToClaim(shown, claimed, at('2026-10-21T06:00:00Z')).map(({ operator }) => operator.name), ['Folinic']);
});

test('the beginner programme follows registration, the same for the import and the list, at the 2024-12-03 changeover', () => {
  const built = buildFreeRewards(tables());
  const map = { version: 1 as const, chars: {}, beginnerPrograms: tables().openServer.schedule };
  for (const [registerTs, programme] of [[1733227199, 'openseverTaskGroup1'], [1733227200, 'openseverTaskGroup2'], [1580712160, 'openseverTaskGroup1'], [1740787200, 'openseverTaskGroup2']] as const) {
    const account = accountFromGame({ ...user, status: { ...user.status, registerTs } }, map, 'en');
    const shown = freeRewardsForAccount(allFreeRewards(built), account).filter(row => row.beginner);
    assert.deepEqual([...new Set(shown.map(row => row.beginner!.id))], [programme], `registered ${registerTs}`);
    assert(rewardClaimsFromGame({ ...user, status: { registerTs } }, map.beginnerPrograms).known.includes(`free:${programme}:checkInData:1`));
  }
  // Without a registration date (an old backup) or off Global, the current programme.
  assert.deepEqual([...new Set(freeRewardsForAccount(allFreeRewards(built), null).filter(row => row.beginner).map(row => row.beginner!.id))], ['openseverTaskGroup2']);
});

/* The overview's rule, on one row of each source as the live catalogue has them (2026-10-21). */
const row = (id: string, group: string, char: string, extra: Partial<FreeReward>): FreeReward =>
  ({ id, group, name: id, rewards: [{ id: char, name: char, count: 1, rarity: 5 }], forecast: false, ...extra });
const NOW = at('2026-10-21T06:00:00Z');
const rows = {
  // A collab's operator (Senshi, Delicious On Terra, act36side): no Archive, closed 2025-03-24.
  collab: row('free:36sideActivity_4', 'Welfare operators', 'char_4144_senshi', { source: 'event', startAt: at('2025-03-10T08:00:00Z'), endAt: at('2025-03-24T04:00:00Z') }),
  // A past main-story event's permanent missions, its event closed: still claimable, so still listed.
  pastRetro: row('free:actXmainssPermanent_5', 'Welfare operators', 'char_x_past', { source: 'retro', startAt: at('2025-10-14T08:00:00Z'), eventEndAt: at('2025-10-28T04:00:00Z') }),
  trail: row('free:trail:permanent_sidestory_4_Twilight_Of_Wolumonde:trailReward_sub_1_1', 'Welfare operators', 'char_345_folnic', { source: 'trail', startAt: at('2023-02-03T00:00:00Z') }),
  current: row('free:act4mainssPermanent_5', 'Welfare operators', 'char_4226_veen', { source: 'retro', startAt: at('2026-10-14T08:00:00Z'), eventEndAt: at('2026-10-28T04:00:00Z') }),
  currentEvent: row('free:52sideActivity_4', 'Welfare operators', 'char_y_now', { source: 'event', startAt: at('2026-10-20T08:00:00Z'), endAt: at('2026-11-03T04:00:00Z') }),
  signIn: row('free:act59sign:2', 'Event sign-in and gifts', 'char_4227_gallus', { startAt: at('2026-10-14T08:00:00Z'), endAt: at('2026-10-28T11:00:00Z') }),
  beginner: row('free:openseverTaskGroup1:chainLoginData:7', 'Beginner rewards', 'char_173_slchan', {}),
};

test('the welfare list keeps only what is still obtainable: Record Restoration, permanent main-story missions, and an open event\'s operator', () => {
  const kept = Object.entries(rows).filter(([, reward]) => obtainableWelfare(reward, NOW)).map(([name]) => name);
  assert.deepEqual(kept, ['pastRetro', 'trail', 'current', 'currentEvent']);
  assert.deepEqual(freeOperatorsToClaim(Object.values(rows), new Set(), NOW).map(({ reward }) => reward.id),
    ['free:52sideActivity_4', 'free:act4mainssPermanent_5', 'free:actXmainssPermanent_5', rows.trail.id], 'soonest to close first, the permanent ones last, newest first');
  // A release built before `source`: a trail by its id, an event row by its end, a permanent mission as before.
  const old = (reward: FreeReward) => { const { source: _source, eventEndAt: _end, ...rest } = reward; return rest as FreeReward; };
  assert.ok(obtainableWelfare(old(rows.trail), NOW));
  assert.ok(!obtainableWelfare(old(rows.collab), NOW));
  assert.ok(obtainableWelfare(old(rows.current), NOW));
  assert.ok(!obtainableWelfare(old(rows.signIn), NOW));
});

test('an imported roster ticks every welfare row of an operator it holds, and nothing else', () => {
  const map = { version: 1 as const, chars: {}, beginnerPrograms: tables().openServer.schedule };
  // Folinic in the roster (her Record Restoration has no claim record), and GALLUS² too.
  const account = accountFromGame({ ...user, troop: { chars: { 1: { charId: 'char_345_folnic', skin: 'char_345_folnic#1' }, 2: { charId: 'char_4227_gallus', skin: 'char_4227_gallus#1' } } } }, map, 'en');
  assert.deepEqual(account.operatorIds, ['char_345_folnic', 'char_4227_gallus']);
  const built = allFreeRewards(buildFreeRewards(tables()));
  const owned = rosterClaimedWelfare(built, rosterOperatorIds(account));
  assert.deepEqual([...owned], ['free:trail:permanent_sidestory_4_Twilight_Of_Wolumonde:trailReward_sub_1_1']);
  // A sign-in day giving an owned operator keeps its own claim record (activity history), not the roster's.
  assert.ok(![...owned].some(id => id.startsWith('free:act59sign')));
  const shown = freeRewardsForAccount(built, account);
  const done = new Set([...account.rewardClaims!.claimed, ...owned]);
  assert.deepEqual(freeOperatorsToClaim(shown, done, NOW).map(({ operator }) => operator.name), []);
  // A record imported before operatorIds: its default outfits name the roster; a bought outfit does not.
  assert.deepEqual([...rosterOperatorIds({ skins: ['char_345_folnic#1', 'char_002_amiya#1+', 'char_4119_wanqin@winter#1'] })], ['char_345_folnic', 'char_002_amiya']);
  assert.equal(rosterOperatorIds(null).size, 0);
});

test('a welfare card says the same thing wherever it is shown: the task, the source, and when it closes or that it has', () => {
  const named = (reward: FreeReward, name: string, event: string) => ({ ...reward, name, event });
  assert.deepEqual(welfareCardFacts(named(rows.current, 'Viy · Event missions (permanent): Clear 17-13', 'Critical Phase Transition'), NOW),
    { task: 'Clear 17-13', source: 'Critical Phase Transition · permanent', status: { kind: 'open' } });
  assert.deepEqual(welfareCardFacts(named(rows.trail, 'Folinic · Record Restoration: 12 stars', 'Twilight of Wolumonde'), NOW),
    { task: 'Earn 12 stars from event stages', source: 'Record Restoration · Twilight of Wolumonde', status: { kind: 'open' } });
  assert.deepEqual(welfareCardFacts(named(rows.currentEvent, 'Y · Event missions: Clear PA-4', 'People, A People'), NOW),
    { task: 'Clear PA-4', source: 'People, A People', status: { kind: 'until', at: rows.currentEvent.endAt } });
  // The tab lists an event's operator that has no end of its own too: not obtainable now.
  const { endAt: _end, ...open } = rows.currentEvent;
  assert.deepEqual(welfareCardFacts(open, NOW).status, { kind: 'closed' });
  assert.deepEqual(welfareCardFacts(rows.currentEvent, at('2026-10-19T00:00:00Z')).status, { kind: 'upcoming', at: rows.currentEvent.startAt });
  // A name without a requirement has no task; with no event, the source is the row's name.
  const bare = row('free:trail:x', 'Welfare operators', 'char_z', {});
  assert.deepEqual(welfareCardFacts(bare, NOW), { task: undefined, source: 'Record Restoration · free:trail:x', status: { kind: 'open' } });
});
