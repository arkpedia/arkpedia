import assert from 'node:assert/strict';
import { test } from 'node:test';
import WEB_EVENTS from '../../config/community-web-events.json';
import { currentWebEvents } from '../../lib/community/worldDirectory';

test('regional campaign links and deadlines match the official event rules', () => {
  assert.deepEqual(WEB_EVENTS.map(event => new URL(event.url).hostname), ['footprints.arknights.global', 'footprints.arknights.kr', 'footprints.arknights.jp']);
  for (const event of WEB_EVENTS) {
    assert.equal(Date.parse(event.expiresAt), Date.parse(`${event.end}T${event.region === 'Global (EN)' ? '20:00:00-07:00' : '12:00:00+09:00'}`));
  }
});

test('web campaigns stay visible through the final minute and disappear at expiry', () => {
  assert.equal(currentWebEvents(WEB_EVENTS, Date.parse('2026-10-07T23:59:00Z')).length, 0);
  assert.equal(currentWebEvents(WEB_EVENTS, Date.parse('2026-10-09T00:00:00Z')).length, 3);
  assert.equal(currentWebEvents(WEB_EVENTS, Date.parse('2026-11-08T02:59:00Z')).length, 3);
  assert.equal(currentWebEvents(WEB_EVENTS, Date.parse('2026-11-08T03:00:00Z')).length, 0);
});
