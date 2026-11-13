import assert from 'node:assert/strict';
import test from 'node:test';
import { validSupporterSnapshot } from '../../lib/patreon/supporters';

test('supporter responses accept only public names, tiers and an update instant', () => {
  const value = { updatedAt: '2026-11-13T04:17:00Z', 'supporter-tier': [{ id: '10', name: 'Cookie Supporters', supporters: ['Public Name'] }] };
  assert.equal(validSupporterSnapshot(value), true);
  for (const extra of [{ access_token: 'PRIVATE' }, { refresh_token: 'PRIVATE' }, { email: 'PRIVATE' }, { members: [] }]) assert.equal(validSupporterSnapshot({ ...value, ...extra }), false);
  assert.equal(validSupporterSnapshot({ ...value, 'supporter-tier': [{ ...value['supporter-tier'][0], users: ['PRIVATE'] }] }), false);
  assert.equal(validSupporterSnapshot({ ...value, updatedAt: 'invalid' }), false);
  assert.equal(validSupporterSnapshot({ ...value, 'supporter-tier': [null] }), false);
  assert.equal(validSupporterSnapshot({ ...value, 'supporter-tier': [{ id: '10', name: 'Cookies', supporters: ['bad\u0000name'] }] }), false);
});
