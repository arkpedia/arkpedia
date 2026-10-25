import test from 'node:test';
import assert from 'node:assert/strict';
import { recoverPilotRelease } from '../deploy/pilot-recover.mjs';
const source = 'a'.repeat(40);
const version = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const previous = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
function fixture() {
  const calls = [];
  const owner = { source, previousVersion: previous };
  const provider = { observe: () => ({ id: version }), owner: () => owner,
    recover: async (value, expected) => { calls.push({ value, expected }); return { action: 'rolled-back', version: previous }; } };
  return { provider, calls, owner };
}
test('manual acceptance recovery binds to the exact receipt source and current version', async () => {
  const f = fixture();
  const result = await recoverPilotRelease({ expectedSource: source, expectedVersion: version, provider: f.provider });
  assert.deepEqual(f.calls, [{ value: f.owner, expected: version }]);
  assert.equal(result.restoredVersion, previous);
  assert.equal(result.failedSource, source);
});
test('changed version, foreign source and unowned legacy never authorize manual rollback', async () => {
  for (const patch of [
    { observe: () => ({ id: previous }) },
    { owner: () => ({ source: 'c'.repeat(40) }) },
    { owner: () => null },
  ]) {
    const f = fixture(); Object.assign(f.provider, patch);
    await assert.rejects(() => recoverPilotRelease({ expectedSource: source, expectedVersion: version, provider: f.provider }), /Pilot recovery refused:/);
    assert.deepEqual(f.calls, []);
  }
});
test('malformed manual inputs fail before any provider access', async () => {
  const provider = { observe: () => assert.fail('no provider access expected') };
  await assert.rejects(() => recoverPilotRelease({ expectedSource: 'main', expectedVersion: version, provider }), /explicit source/);
  await assert.rejects(() => recoverPilotRelease({ expectedSource: source, expectedVersion: 'latest', provider }), /explicit source/);
});
