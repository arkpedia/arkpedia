import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStageDiagnostics, stageDiagnosticsAvailable, stageMetadata } from '../../lib/account-import/stageDiagnostics';

const user = { status: { uid: 'private-user', nickName: 'private-name' }, dungeon: { stages: {
  main_01_07: { state: 3, completeTimes: 12, replayVersion: 2, hasReplay: true, replayId: 'opaque-private-value', secret: 'secret-value', token: 'token-value', uid: 999, nested: { email: 'private-email' } },
} } };

test('stage metadata retains marker values and schema without account or credential data', () => {
  const report = stageMetadata(user, 'en');
  assert.deepEqual(report.stages.main_01_07.values, { state: 3, completeTimes: 12, replayVersion: 2, hasReplay: true });
  assert.equal(report.stages.main_01_07.fields.replayId, 'string');
  assert.equal(report.stages.main_01_07.fields.nested, 'object');
  assert.doesNotMatch(JSON.stringify(report), /private|secret|token|uid|999|nickName/);
  user.dungeon.stages.main_01_07.state = 1;
  assert.equal(report.stages.main_01_07.values.state, 3, 'no raw account references retained');
});

test('capture is opt-in, server-specific, one-shot and capped at three samples', () => {
  const store = createStageDiagnostics();
  store.capture(user, 'en');
  assert.equal(store.snapshot().count, 0);
  store.arm('en'); store.capture(user, 'jp');
  assert.equal(store.snapshot().armed, 'en');
  store.capture(user, 'en');
  const captured = store.snapshot();
  assert.equal(captured.armed, null);
  store.capture(user, 'en');
  assert.equal(store.snapshot(), captured);
  for (let i = 0; i < 4; i++) { store.arm('en'); store.capture(user, 'en'); }
  assert.equal(store.snapshot().count, 3);
  store.clear();
  assert.deepEqual(store.snapshot(), { armed: null, count: 0, report: '' });
});

test('cancel prevents capture and malformed stage data is harmless', () => {
  const store = createStageDiagnostics();
  store.arm('en'); store.cancel(); store.capture(user, 'en');
  assert.equal(store.snapshot().count, 0);
  assert.deepEqual(stageMetadata(null, 'en').stages, {});
  assert.deepEqual(stageMetadata({ dungeon: { stages: { invalid: null, list: [] } } }, 'en').stages, {});
});

test('diagnostic controls require explicit URL opt-in on Preview', () => {
  assert.equal(stageDiagnosticsAvailable('preview.arkpedia.net', '?stageDiagnostics=1'), true);
  for (const host of ['arkpedia.net', 'www.arkpedia.net', 'preview.arkpedia.net.attacker.example']) assert.equal(stageDiagnosticsAvailable(host, '?stageDiagnostics=1'), false);
  assert.equal(stageDiagnosticsAvailable('preview.arkpedia.net', ''), false);
});
