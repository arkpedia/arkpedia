import assert from 'node:assert/strict';
import test from 'node:test';
import { rewardClaimsFromGame } from '../../lib/account/rewardClaims';
import { accountFromGame } from '../../lib/account/accountStore';
import { allFreeRewards, freeOperatorsToClaim, freeRewardsForAccount, obtainableWelfare, rosterClaimedWelfare, rosterOperatorIds, welfareCardFacts, type FreeReward } from '../../lib/pulls/freeRewards';

/*
 * The free-reward catalogue as a release carries it, written out of the Global EN tables of
 * 2026-10-21. arkpedia-data's importer builds it and holds every row to those tables (its
 * scripts/tests/test-reward-welfare-imports.ts); what a reader's save and roster then tick on
 * the rows is here. The account is a synthetic syncData user in the Torappu shapes
 * (PlayerMission, PlayerCheckIn, PlayerActivity, PlayerOpenServer, PlayerRetro at torappu-excel
 * bc6e6155), carrying one claim of every kind the tracker imports.
 */
const beginnerPrograms = [{ id: 'openseverTaskGroup1', startTs: 1533898800, endTs: 1733227199 }, { id: 'openseverTaskGroup2', startTs: 1733227200, endTs: 1881658799 }];
const catalogue = {
  rewards: [
    { id: 'free:main_1', group: 'Main and side missions', name: 'Clear 0-1', rewards: [{ id: '4001', name: 'LMD', count: 1000 }], forecast: true },
    { id: 'free:guide_1', group: 'Pinboard missions', name: 'Pinboard 1', rewards: [{ id: '4003', name: 'Orundum', count: 100, orundum: 100 }], forecast: true },
    { id: 'free:guide_g_1', group: 'Pinboard missions', name: 'Phase 1', rewards: [{ id: '7003', name: 'Reward item', count: 1, permits: 1 }], forecast: true },
    { id: 'free:openserver_1_1', group: 'Beginner rewards', name: 'Clear Main Storyline0-1', rewards: [{ id: '4003', name: 'Orundum', count: 600, orundum: 600 }], beginner: { id: 'openseverTaskGroup2', startTs: 1733227200, endTs: 1881658799, current: true }, forecast: true },
    { id: 'free:openseverTaskGroup2:checkInData:1', group: 'Beginner rewards', name: 'Cumulative sign-in · Day 1', rewards: [{ id: '4001', name: 'LMD', count: 20000 }], beginner: { id: 'openseverTaskGroup2', startTs: 1733227200, endTs: 1881658799, current: true }, forecast: true },
    { id: 'free:openseverTaskGroup2:checkInData:2', group: 'Beginner rewards', name: 'Cumulative sign-in · Day 2', rewards: [{ id: '4003', name: 'Orundum', count: 200, orundum: 200 }], beginner: { id: 'openseverTaskGroup2', startTs: 1733227200, endTs: 1881658799, current: true }, forecast: true },
    { id: 'free:openseverTaskGroup2:chainLoginData:1', group: 'Beginner rewards', name: 'Consecutive sign-in · Day 1', rewards: [{ id: '4001', name: 'LMD', count: 5000 }], beginner: { id: 'openseverTaskGroup2', startTs: 1733227200, endTs: 1881658799, current: true }, forecast: true },
    { id: 'free:welcome-mail', group: 'Beginner rewards', name: 'Welcome mail', rewards: [{ id: '4003', name: 'Orundum', count: 3800, orundum: 3800 }], forecast: true },
    { id: 'free:signin_1', group: 'Sign-in milestones', name: '180 sign-in days · Doctor Lv.80', rewards: [{ id: '4003', name: 'Orundum', count: 600, orundum: 600 }], forecast: false },
    { id: 'free:signin82:1', group: 'Monthly sign-in', name: 'October · Day 1', rewards: [{ id: '4001', name: 'LMD', count: 2000 }], startAt: 1790852400000, endAt: 1793530800000, forecast: false },
    { id: 'free:signin82:2', group: 'Monthly sign-in', name: 'October · Day 2', rewards: [{ id: '2001', name: 'Reward item', count: 10 }], startAt: 1790852400000, endAt: 1793530800000, forecast: false },
    { id: 'free:signin82:3', group: 'Monthly sign-in', name: 'October · Day 3', rewards: [{ id: '7001', name: 'Recruitment Permit', count: 1 }], startAt: 1790852400000, endAt: 1793530800000, forecast: false },
    { id: 'free:act59sign:1', group: 'Event sign-in and gifts', name: 'Celebration Login Event · Day 1', rewards: [{ id: 'LIMITED_TKT_GACHA_10_7301', name: 'Reward item', count: 1, restricted: true }, { id: 'ap_supply_lt_120', name: 'Reward item', count: 1 }], startAt: 1791979200000, endAt: 1793185200000, forecast: false },
    { id: 'free:act59sign:2', group: 'Event sign-in and gifts', name: 'Celebration Login Event · Day 2', rewards: [{ id: 'char_4227_gallus', rarity: 1, name: 'GALLUS²', count: 1 }, { id: '7001', name: 'Recruitment Permit', count: 5 }], startAt: 1791979200000, endAt: 1793185200000, forecast: false },
    { id: 'free:51sideActivity_4', group: 'Welfare operators', name: 'Botani · Event missions: Clear PA-4', rewards: [{ id: 'char_4223_botany', rarity: 5, name: 'Botani', count: 1 }], startAt: 1789570800000, endAt: 1790766000000, event: 'People, A People', href: '/events/%5BSide%20Story%5D%20People%2C%20A%20People', source: 'event', forecast: false },
    { id: 'free:act4mainssPermanent_5', group: 'Welfare operators', name: 'Viy · Event missions (permanent): Clear 17-13', rewards: [{ id: 'char_4226_veen', rarity: 6, name: 'Viy', count: 1 }], startAt: 1791979200000, event: 'Critical Phase Transition', href: '/events/%5BCelebration%5D%20Critical%20Phase%20Transition', source: 'retro', eventEndAt: 1793185200000, forecast: false },
    { id: 'free:trail:permanent_sub_1_Darknights_Memoir:trailReward_sub_1_1', group: 'Welfare operators', name: 'Sideroca · Record Restoration: 12 stars', rewards: [{ id: 'char_333_sidero', rarity: 5, name: 'Sideroca', count: 1 }], startAt: 1669395600000, event: 'Darknights Memoir', source: 'trail', forecast: false },
    { id: 'free:trail:permanent_sidestory_4_Twilight_Of_Wolumonde:trailReward_sub_1_1', group: 'Welfare operators', name: 'Folinic · Record Restoration: 12 stars', rewards: [{ id: 'char_345_folnic', rarity: 5, name: 'Folinic', count: 1 }], startAt: 1675443600000, event: 'Twilight of Wolumonde', source: 'trail', forecast: false },
    { id: 'free:welfare:act4d0:char_131_flameb', group: 'Welfare operators', name: 'Flamebringer · Event rewards', rewards: [{ id: 'char_131_flameb', rarity: 5, name: 'Flamebringer', count: 1 }], startAt: 1600000000000, endAt: 1601000001000, event: 'Code of Brawl', source: 'extra', forecast: false },
    { id: 'free:GP_freeL_5', group: 'Free level-up packs', name: 'Free pack', rewards: [{ id: 'GP_freeL_5', name: 'Free pack', count: 1 }], forecast: false },
  ],
  beginnerRewards: [
    { id: 'free:openserver_1', group: 'Beginner rewards', name: 'Clear Main Storyline0-1', rewards: [{ id: '4003', name: 'Orundum', count: 600, orundum: 600 }], beginner: { id: 'openseverTaskGroup1', startTs: 1533898800, endTs: 1733227199, current: false }, forecast: true },
    { id: 'free:openseverTaskGroup1:checkInData:1', group: 'Beginner rewards', name: 'Cumulative sign-in · Day 1', rewards: [{ id: '4001', name: 'LMD', count: 20000 }], beginner: { id: 'openseverTaskGroup1', startTs: 1533898800, endTs: 1733227199, current: false }, forecast: true },
    { id: 'free:openseverTaskGroup1:chainLoginData:7', group: 'Beginner rewards', name: 'Consecutive sign-in · Day 7', rewards: [{ id: 'char_173_slchan', name: 'Reward item', count: 1 }], beginner: { id: 'openseverTaskGroup1', startTs: 1533898800, endTs: 1733227199, current: false }, forecast: true },
  ],
} as unknown as { rewards: FreeReward[]; beginnerRewards: FreeReward[] };

const at = (iso: string) => Date.parse(iso);

test('the welfare operators a release lists are the ones still obtainable, soonest to close first', () => {
  // Obtainable on 2026-10-21: Viy (a permanent main-story mission), and the Archives' operators.
  // Not GALLUS² (a sign-in's day), not Botani (her event closed on 2026-09-30, no Archive yet).
  const open = freeOperatorsToClaim(catalogue.rewards, new Set(), at('2026-10-21T06:00:00Z')).map(({ operator }) => operator.name);
  assert.deepEqual(open, ['Viy', 'Folinic', 'Sideroca']);
  assert.deepEqual(freeOperatorsToClaim(catalogue.rewards, new Set(['free:act4mainssPermanent_5']), at('2026-10-21T06:00:00Z')).map(({ operator }) => operator.name), ['Folinic', 'Sideroca']);
  // Once Critical Phase Transition closes, Viy's permanent mission is still claimable in the
  // game (main-story event missions stay), so she stays listed.
  assert.deepEqual(freeOperatorsToClaim(catalogue.rewards, new Set(), at('2026-10-28T12:00:00Z')).map(({ operator }) => operator.name), ['Viy', 'Folinic', 'Sideroca']);
});

test("a story restored without a trail lists its event's operator for good, from the restore date", () => {
  // The row the import writes for a story restored with no trail (I Portatori dei Velluti,
  // restored 2026-05-21): no end, so it is obtainable from that day on.
  const restored = { id: 'free:restore:permanent_sidestory_28_i_portatori_dei_velluti:38sideActivity_5', group: 'Welfare operators',
    name: 'Crownslayer · Record Restoration: Clear PV-5', rewards: [{ id: 'char_1502_crosly', rarity: 6, name: 'Crownslayer', count: 1 }],
    startAt: 1779361200000, event: 'I Portatori dei Velluti', source: 'trail', forecast: false } as unknown as FreeReward;
  const names = (iso: string) => freeOperatorsToClaim([restored], new Set(), at(iso)).map(({ operator }) => operator.name);
  assert.deepEqual(names('2026-05-20T00:00:00Z'), [], 'not before the restore');
  assert.deepEqual(names('2026-10-28T12:00:00Z'), ['Crownslayer'], 'obtainable after it, with no end');
  assert.equal(welfareCardFacts(restored, at('2026-10-28T12:00:00Z')).source, 'Record Restoration · I Portatori dei Velluti');
  // An imported roster that holds her ticks the row, as it does every welfare row.
  assert.ok(rosterClaimedWelfare([restored], new Set(['char_1502_crosly'])).has(restored.id));
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
  const map = { version: 1 as const, chars: {}, beginnerPrograms };
  const account = accountFromGame(user, map, 'en');
  const shown = freeRewardsForAccount(allFreeRewards(catalogue), account);
  const ids = new Set(allFreeRewards(catalogue).map(row => row.id));
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
  const map = { version: 1 as const, chars: {}, beginnerPrograms };
  for (const [registerTs, programme] of [[1733227199, 'openseverTaskGroup1'], [1733227200, 'openseverTaskGroup2'], [1580712160, 'openseverTaskGroup1'], [1740787200, 'openseverTaskGroup2']] as const) {
    const account = accountFromGame({ ...user, status: { ...user.status, registerTs } }, map, 'en');
    const shown = freeRewardsForAccount(allFreeRewards(catalogue), account).filter(row => row.beginner);
    assert.deepEqual([...new Set(shown.map(row => row.beginner!.id))], [programme], `registered ${registerTs}`);
    assert(rewardClaimsFromGame({ ...user, status: { registerTs } }, map.beginnerPrograms).known.includes(`free:${programme}:checkInData:1`));
  }
  // Without a registration date (an old backup) or off Global, the current programme.
  assert.deepEqual([...new Set(freeRewardsForAccount(allFreeRewards(catalogue), null).filter(row => row.beginner).map(row => row.beginner!.id))], ['openseverTaskGroup2']);
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
  const map = { version: 1 as const, chars: {}, beginnerPrograms };
  // Folinic in the roster (her Record Restoration has no claim record), and GALLUS² too.
  const account = accountFromGame({ ...user, troop: { chars: { 1: { charId: 'char_345_folnic', skin: 'char_345_folnic#1' }, 2: { charId: 'char_4227_gallus', skin: 'char_4227_gallus#1' } } } }, map, 'en');
  assert.deepEqual(account.operatorIds, ['char_345_folnic', 'char_4227_gallus']);
  const built = allFreeRewards(catalogue);
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
