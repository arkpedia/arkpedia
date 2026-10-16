import assert from 'node:assert/strict';
import test from 'node:test';
import { rewardClaimsFromGame } from '../../lib/account/rewardClaims';
import { accountFromGame, parseAccount } from '../../lib/account/accountStore';
import { mergeImportedProgress } from '../../lib/pulls/importedProgress';
import { parsePastProgress, type PastProgress } from '../../lib/pulls/pastProgress';
import { backlogFromAccount, type BacklogSources } from '../../lib/pulls/pulls';
import { buildFreeRewards } from '../build/build-free-rewards.mjs';

// Synthetic protocol fixtures. Field shapes: Torappu PlayerCheckIn, PlayerActivity,
// PlayerOpenServer and PlayerGiftProgressPerData at bc6e6155ccb61f8028b1b09209919052e8a9704c.
const map = { version: 1 as const, chars: {}, beginnerPrograms: [{ id: 'old', startTs: 100 }, { id: 'current', startTs: 200 }] };
const fixture = {
  status: { registerTs: 250, level: 120, uid: 'fixture' },
  checkIn: { checkInGroupId: 'signin_test', checkInRewardIndex: 20, canCheckIn: 1, checkInHistory: [1, 0, 2, '1'], longTermRecvRecord: { milestone: 1 } },
  openServer: { checkIn: { isAvailable: true, history: [1, 0] }, chainLogin: { nowIndex: 20, history: [0, 1] } },
  activity: { CHECKIN_ONLY: { event_a: { history: [1, 0] } }, CHECKIN_ALL_PLAYER: { event_b: { history: [0, 1], personalRecord: { eligible: 99 } } },
    LOGIN_ONLY: { gift: { reward: 1 }, available_gift: { reward: 0 }, ambiguous: { reward: 2 } }, CHECKIN_VS: { voting: { signedCnt: 7, availSignCnt: 7 } } },
  shop: { GP: { level: { info: [{ id: 'GP_freeL_5', count: 1 }, { id: 'GP_freeL_10', count: 0 }, { id: 'GP_L_5', count: 1 }, { id: 'GP_freeL_15', count: '1' }], valid: ['GP_freeL_20'] } } },
};

test('received flags map to tracker identities; counters, eligibility, malformed and paid entries do not', () => {
  const claims = rewardClaimsFromGame(fixture, map.beginnerPrograms);
  assert.deepEqual(claims.claimed, ['free:GP_freeL_5', 'free:current:chainLoginData:2', 'free:current:checkInData:1',
    'free:event_a:1', 'free:event_b:2', 'free:gift', 'free:milestone', 'free:signin_test:1']);
  for (const id of ['free:signin_test:2', 'free:event_a:2', 'free:event_b:1', 'free:available_gift', 'free:GP_freeL_10']) {
    assert(claims.known.includes(id)); assert(!claims.claimed.includes(id));
  }
  for (const id of ['free:signin_test:3', 'free:signin_test:4', 'free:GP_L_5', 'free:GP_freeL_15', 'free:GP_freeL_20', 'free:ambiguous', 'free:voting:1']) assert(!claims.known.includes(id));
  assert.deepEqual(rewardClaimsFromGame(fixture, map.beginnerPrograms), claims);
});

test('beginner programmes use the account registration schedule; missing evidence remains unknown', () => {
  assert(rewardClaimsFromGame({ ...fixture, status: { registerTs: 150 } }, map.beginnerPrograms).claimed.includes('free:old:checkInData:1'));
  for (const status of [{}, { registerTs: 50 }, { registerTs: '250' }]) {
    assert(!rewardClaimsFromGame({ ...fixture, status }, map.beginnerPrograms).known.some(id => /:(checkInData|chainLoginData):/.test(id)));
  }
  assert.deepEqual(rewardClaimsFromGame({}), { known: [], claimed: [] });
  assert.deepEqual(rewardClaimsFromGame({ checkIn: [], activity: null, shop: 'bad', openServer: [] }), { known: [], claimed: [] });
  assert(!accountFromGame(fixture, map, 'jp').rewardClaims?.known.some(id => id.startsWith('free:current:')));
});

test('every supported imported claim resolves to an identity emitted by the reward catalogue producer', () => {
  const item = { id: '4003', count: 100 };
  const days = [{ order: 1, itemList: [item] }, { order: 2, itemList: [item] }];
  const info = (name: string) => ({ name, startTime: 1, rewardEndTime: 9999 });
  const built = buildFreeRewards({ handbook: { handbookStageData: {} }, characters: {}, items: { items: { '4003': { name: 'Orundum' } } },
    missions: { missions: {}, missionGroups: {} },
    openServer: { schedule: map.beginnerPrograms, dataMap: { current: { openServerMissionData: [],
      checkInData: days.map(day => ({ order: day.order, item })), chainLoginData: days.map(day => ({ order: day.order, item })) } },
      constant: { firstDiamondShardMailCount: 3800 }, longTermCheckInData: { groupList: [{ groupId: 'milestone', days: 30, level: 10, rewardList: [item] }] } },
    checkin: { groups: { signin_test: { groupId: 'signin_test', title: 'Monthly', items: [item, item], signStartTime: 1, signEndTime: 9999 } } },
    activity: { activity: { CHECKIN_ONLY: { event_a: { checkInList: days } }, CHECKIN_ALL_PLAYER: { event_b: { checkInList: days } }, LOGIN_ONLY: { gift: { itemList: [item] } } },
      basicInfo: { event_a: info('A'), event_b: info('B'), gift: info('Gift') } },
    shops: { shopGPDataDict: { GP_freeL_5: { displayName: 'Free pack' } } } });
  const ids = new Set(built.rewards.map((reward: { id: string }) => reward.id));
  for (const id of rewardClaimsFromGame(fixture, map.beginnerPrograms).claimed) assert(ids.has(id), `Imported claim has no catalogue row: ${id}`);
});

test('first-clear rewards require three stars, while ordinary account clears retain two-star progress', () => {
  const account = accountFromGame({ ...fixture, dungeon: { stages: { partial: { state: 2 }, complete: { state: 3 }, mem_trial: { state: 3 }, unopened: { state: 0 } } } }, map, 'en');
  assert.deepEqual(account.cleared, ['complete', 'mem_trial', 'partial']);
  assert.deepEqual(account.rewardCleared, ['complete', 'mem_trial']);
  assert.deepEqual(parseAccount(JSON.stringify(account)), account);
  const sources = { chapters: [{ id: 'chapter', op: 2, stages: ['partial', 'complete'] }], playable: [], resources: [], annihilation: [],
    paradox: [{ id: 'paradox:mem_trial', amount: 200 }], originiteByStageType: {}, annihilationOrundum: 0 } as unknown as BacklogSources;
  const remaining = backlogFromAccount(sources, new Set(account.rewardCleared), null);
  assert.equal(remaining.sources.chapters[0].op, 1);
  assert(!remaining.doneKeys.has('chapter')); assert(remaining.doneKeys.has('paradox:mem_trial'));
  assert.equal(accountFromGame({}, map, 'en').rewardCleared, undefined);
});

const progress: PastProgress = { doneKeys: ['manual-chapter', 'free:welcome-mail', 'free:event_a:2'], doneEvents: ['manual-event'], annihilationDone: true, ticksFrom: '' };
const completed = { doneKeys: new Set(['auto-chapter']), doneEvents: new Set(['auto-event']) };
const account = (user = fixture, at = '2026-10-16T00:00:00Z') => accountFromGame(user, map, 'en', new Date(at));

test('import adds verified claims, preserves manual marks, round-trips provenance, and is idempotent', () => {
  const next = mergeImportedProgress(progress, account(), completed);
  for (const key of progress.doneKeys) assert(next.doneKeys.includes(key));
  assert(next.doneKeys.includes('auto-chapter')); assert(next.doneKeys.includes('free:event_a:1'));
  assert(next.doneEvents.includes('manual-event')); assert(next.doneEvents.includes('auto-event')); assert(next.annihilationDone);
  assert(!next.importedDoneKeys?.includes('free:event_a:2'), 'manual mark remains manual despite an explicit unreceived flag');
  assert.deepEqual(parsePastProgress(JSON.stringify(next)), next);
  assert.deepEqual(mergeImportedProgress(next, account(), completed), next);
  const partial = account({ status: fixture.status } as typeof fixture, '2026-10-17T00:00:00Z');
  const again = mergeImportedProgress(next, partial, { doneKeys: new Set(), doneEvents: new Set() });
  assert.deepEqual(again.doneKeys, next.doneKeys, 'missing fields do not erase earlier confirmed or manual claims');
});

test('explicit negative claims replace only prior automatic marks; another account never inherits automatic progress', () => {
  const next = mergeImportedProgress(progress, account(), completed);
  const unreceived = account({ ...fixture, activity: { ...fixture.activity, CHECKIN_ONLY: { event_a: { history: [0, 0] } } } }, '2026-10-17T00:00:00Z');
  const again = mergeImportedProgress(next, unreceived, completed);
  assert(!again.doneKeys.includes('free:event_a:1')); assert(again.doneKeys.includes('free:event_a:2'));
  const other = account({ status: { uid: 'other' } } as typeof fixture, '2026-10-18T00:00:00Z');
  const switched = mergeImportedProgress(next, other, { doneKeys: new Set(), doneEvents: new Set() });
  assert.deepEqual(switched.doneKeys, [...progress.doneKeys].sort()); assert.deepEqual(switched.doneEvents, progress.doneEvents);
});
