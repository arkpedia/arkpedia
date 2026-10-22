import assert from 'node:assert/strict';
import { test } from 'node:test';
import { redactSave } from '../../lib/account-import/rawSaveExport';

test('the downloadable save keeps every reward structure and none of the account\'s identity', () => {
  const user = {
    status: { uid: '123456789', nickName: 'NAME-DO-NOT-EXPORT', nickNumber: '4242', resume: 'BIO-DO-NOT-EXPORT', registerTs: 1580712160, level: 120 },
    friend: { list: [{ uid: '987654321' }] },
    activity: { CHECKIN_ACCESS: { act3access: { history: [0, 0, 1], lastTs: 1790000000 } }, CHECKIN_VIDEO: { act3video: { reward: 1 } } },
    mission: { missions: { MAIN: { main_1: { state: 3 } } } },
    note: 'player 1234567890 said hi',
  };
  const out = redactSave(user) as Record<string, any>;
  const raw = JSON.stringify(out);
  for (const secret of ['123456789', '987654321', 'NAME-DO-NOT-EXPORT', 'BIO-DO-NOT-EXPORT', '1234567890', '"4242"']) assert.ok(!raw.includes(secret), secret);
  assert.deepEqual(out.activity, user.activity, 'activity blocks kept whole (their timestamps included)');
  assert.deepEqual(out.mission, user.mission);
  assert.equal(out.status.registerTs, 1580712160, 'registration picks the beginner programme: kept');
  assert.equal(out.status.level, 120);
  assert.equal(out.friend, undefined);
});
