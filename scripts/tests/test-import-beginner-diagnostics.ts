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
};

test('the beginner summary keeps the four facts and nothing that identifies the account', () => {
  assert.deepEqual(beginnerDiagnostics(user), {
    programmeGroups: { openseverTaskGroup1: 1, openseverTaskGroup2: 0 },
    openServerMissions: { openserver_1: 3, openserver_2: 2 },
    checkIn: { isAvailable: false, historyLength: 0 },
    chainLogin: { isAvailable: false, historyLength: 3 },
    registered: 'before-2024-12-03',
  });
  const raw = JSON.stringify(beginnerDiagnostics(user));
  for (const secret of ['UID-DO-NOT-EXPORT', 'NAME-DO-NOT-EXPORT', '4242', '1580712160', '1790000000', 'main_1', 'guide_g_1', 'nowIndex']) assert.ok(!raw.includes(secret), secret);
});

test('a save without the fields says so, and the changeover falls on the newer programme', () => {
  assert.deepEqual(beginnerDiagnostics({}), { programmeGroups: {}, openServerMissions: null, checkIn: null, chainLogin: null, registered: 'unknown' });
  assert.deepEqual(beginnerDiagnostics({ mission: [], openServer: 'bad', status: { registerTs: '1' } }), { programmeGroups: {}, openServerMissions: null, checkIn: null, chainLogin: null, registered: 'unknown' });
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
