import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsePrivacy } from '../../lib/privacy/preferences';
const now = Date.UTC(2026, 9, 25);
const choices = (overrides = {}) => JSON.stringify({ version: 1, savedAt: now, analytics: true, externalMedia: true, ...overrides });
test('optional services are off for missing, malformed and unsupported choices', () => {
  for (const raw of [null, '{', 'null', choices({ version: 2 }), choices({ savedAt: 'today' }), choices({ savedAt: now + 1 })])
    assert.deepEqual(parsePrivacy(raw, now), { analytics: false, externalMedia: false });
});
test('consent categories are independent and only explicit booleans enable them', () => {
  assert.deepEqual(parsePrivacy(choices({ analytics: false }), now), { analytics: false, externalMedia: true });
  assert.deepEqual(parsePrivacy(choices({ externalMedia: false }), now), { analytics: true, externalMedia: false });
  assert.deepEqual(parsePrivacy(choices({ analytics: 'true', externalMedia: 1 }), now), { analytics: false, externalMedia: false });
});
test('choices expire after 180 days and cannot enable services with a future timestamp', () => {
  assert.deepEqual(parsePrivacy(choices(), now + 180 * 86400000), { analytics: false, externalMedia: false });
  assert.equal(parsePrivacy(choices(), now + 179 * 86400000).analytics, true);
});
