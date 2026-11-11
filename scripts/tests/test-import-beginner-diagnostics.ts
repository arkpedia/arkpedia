import assert from 'node:assert/strict';
import { test } from 'node:test';
import { beginnerDiagnostics } from '../../lib/account-import/beginnerDiagnostics';
import { createConnectionDiagnostics } from '../../lib/account-import/connectionDiagnostics';

// A synthetic save in the Torappu shapes (MissionPlayerData, PlayerOpenServer, PlayerStatus),
// carrying identity and dates the report must never repeat.
const user = {
  status: { registerTs: 1580712160, uid: 'UID-DO-NOT-EXPORT', nickName: 'NAME-DO-NOT-EXPORT', nickNumber: '4242', lastOnlineTs: 1790000000 },
  mission: {
    missions: { OPENSERVER: { openserver_1: { state: 3, progress: [{ target: 1, value: 1 }] }, openserver_2: { state: 2, progress: [] }, 'NAME-DO-NOT-EXPORT': { state: 3 } }, MAIN: { main_1: { state: 3 } } },
    missionGroups: { openseverTaskGroup1: 1, openseverTaskGroup2: 0, guide_g_1: 1, main_1: 1 },
  },
  openServer: { checkIn: { isAvailable: false, history: [] }, chainLogin: { isAvailable: false, nowIndex: 3, history: [1, 1, 0] } },
  activity: { CHECKIN_ONLY: { act59sign: { history: [1, 1, 0, 0], extra: 'NAME-DO-NOT-EXPORT' } }, LOGIN_ONLY: { act1login: { reward: 1 } }, TYPE_ACT: {} },
  checkIn: { checkInGroupId: 'signin84', checkInHistory: [1, 1, 1, 0], longTermRecvRecord: { signin_1: 1 } },
  retro: { trail: { permanent_sidestory_1: { trailReward_1: 1, trailReward_2: 0 } } },
};

test('the beginner summary keeps the four facts and nothing that identifies the account', () => {
  assert.deepEqual(beginnerDiagnostics(user), {
    programmeGroups: { openseverTaskGroup1: 1, openseverTaskGroup2: 0 },
    openServerMissions: { openserver_1: 3, openserver_2: 2 },
    checkIn: { isAvailable: false, historyLength: 0 },
    chainLogin: { isAvailable: false, historyLength: 3 },
    registered: 'before-2024-12-03',
    sources: {
      missions: { OPENSERVER: { count: 3, states: { 3: 2, 2: 1 } }, MAIN: { count: 1, states: { 3: 1 } } },
      activityTypes: { CHECKIN_ONLY: 1, LOGIN_ONLY: 1, TYPE_ACT: 0 },
      eventSignIns: { act59sign: { days: 4, received: 2 } },
      loginOnly: { act1login: 1 },
      monthly: { days: 4, received: 3, longTermRecords: 1 },
      retroTrail: { stories: 1, received: 1 },
    },
  });
  const raw = JSON.stringify(beginnerDiagnostics(user));
  for (const secret of ['UID-DO-NOT-EXPORT', 'NAME-DO-NOT-EXPORT', '4242', '1580712160', '1790000000', 'main_1', 'guide_g_1', 'nowIndex', 'trailReward_1', 'permanent_sidestory_1']) assert.ok(!raw.includes(secret), secret);
});

test('a save without the fields says so, and the changeover falls on the newer programme', () => {
  assert.deepEqual(beginnerDiagnostics({}), { programmeGroups: {}, openServerMissions: null, checkIn: null, chainLogin: null, registered: 'unknown',
    sources: { missions: {}, activityTypes: {}, eventSignIns: {}, loginOnly: {}, monthly: null, retroTrail: { stories: 0, received: 0 } } });
  assert.deepEqual(beginnerDiagnostics({ mission: [], openServer: 'bad', status: { registerTs: '1' } }), { programmeGroups: {}, openServerMissions: null, checkIn: null, chainLogin: null, registered: 'unknown',
    sources: { missions: {}, activityTypes: {}, eventSignIns: {}, loginOnly: {}, monthly: null, retroTrail: { stories: 0, received: 0 } } });
  assert.equal(beginnerDiagnostics({ status: { registerTs: 1733227199 } }).registered, 'before-2024-12-03');
  assert.equal(beginnerDiagnostics({ status: { registerTs: 1733227200 } }).registered, 'on-or-after-2024-12-03');
  assert.deepEqual(beginnerDiagnostics({ openServer: { checkIn: { history: 'x' } } }).checkIn, { isAvailable: null, historyLength: null });
});

test('the copyable report carries the summary next to the connection attempts, until a new import drops it', () => {
  const diagnostic = createConnectionDiagnostics();
  assert.equal(diagnostic.snapshot(), '');
  diagnostic.setBeginner(beginnerDiagnostics(user));
  const report = JSON.parse(diagnostic.snapshot());
  assert.deepEqual(report.attempts, []);
  assert.equal(report.beginner.registered, 'before-2024-12-03');
  diagnostic.setBeginner(null);
  assert.equal(diagnostic.snapshot(), '');
});

test('Paradox diagnostics retain completion flags for the reported stages without identity, timestamps or arbitrary fields', () => {
  const report = beginnerDiagnostics({ ...user, troop: { addon: {
    char_183_skgoat: { stage: { mem_skgoat_1: { state: 3, completeTimes: 1, fts: 1790000000, secret: 'DO-NOT-EXPORT' } } },
    char_272_strong: { stage: { mem_strong_1: { state: 0, completeTimes: 0, fts: 0 } } },
    unknown: { stage: { 'PRIVATE-STAGE-ID': { state: 2, completeTimes: 3 }, mem_crow_1: { state: '3', completeTimes: '1' } } },
  } } });
  assert.deepEqual(report.sources.paradox, { stages: 4, states: { 0: 1, 2: 1, 3: 1, '-1': 1 }, samples: {
    mem_skgoat_1: { state: 3, completeTimes: 1, hasFts: true, hasRts: false },
    mem_strong_1: { state: 0, completeTimes: 0, hasFts: false, hasRts: false },
    mem_crow_1: { state: null, completeTimes: null, hasFts: false, hasRts: false },
  } });
  const text = JSON.stringify(report);
  for (const privateValue of ['DO-NOT-EXPORT', 'PRIVATE-STAGE-ID', 'char_183_skgoat', '1790000000', 'UID-DO-NOT-EXPORT']) assert(!text.includes(privateValue));
});
