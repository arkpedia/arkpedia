import assert from 'node:assert/strict';
import { test } from 'node:test';
import WEB_EVENTS from '../../config/community-web-events.json';
import { currentWebEvents, mergeWebEvents } from '../../lib/community/worldDirectory';

test('regional campaign links and deadlines match the official event rules', () => {
  assert.deepEqual(WEB_EVENTS.map(event => new URL(event.url).hostname), ['footprints.arknights.global', 'footprints.arknights.kr', 'footprints.arknights.jp']);
  for (const event of WEB_EVENTS) {
    assert.equal(Date.parse(event.expiresAt), Date.parse(`${event.end}T${event.region === 'Global (EN)' ? '20:00:00-07:00' : '12:00:00+09:00'}`));
  }
});

test('a newer content release can add campaigns and correct seeded dates without a deploy', () => {
  const corrected = { ...WEB_EVENTS[0], expiresAt: '2026-11-09T03:00:00Z' };
  const discovered = { ...WEB_EVENTS[0], name: 'A new campaign', url: 'https://new.arknights.global/' };
  const events = mergeWebEvents(WEB_EVENTS, [corrected, discovered]);
  assert.equal(events.length, 4);
  assert.equal(events.find(event => event.url === corrected.url)?.expiresAt, corrected.expiresAt);
  assert.ok(events.some(event => event.url === discovered.url));
  const legacy = { name: WEB_EVENTS[0].name, start: WEB_EVENTS[0].start, end: WEB_EVENTS[0].end, url: WEB_EVENTS[0].url };
  assert.equal(mergeWebEvents(WEB_EVENTS, [legacy])[0].image, WEB_EVENTS[0].image, 'older published entries retain the new artwork fallback');
  assert.equal(currentWebEvents(WEB_EVENTS, Date.parse('2026-10-08T06:59:00Z')).filter(event => event.region !== 'Korea (KR)').length, 0);
});

test('web campaigns stay visible through the final minute and disappear at expiry', () => {
  assert.equal(currentWebEvents(WEB_EVENTS, Date.parse('2026-10-07T23:59:00Z')).length, 0);
  assert.equal(currentWebEvents(WEB_EVENTS, Date.parse('2026-10-09T00:00:00Z')).length, 3);
  assert.equal(currentWebEvents(WEB_EVENTS, Date.parse('2026-11-08T02:59:00Z')).length, 3);
  assert.equal(currentWebEvents(WEB_EVENTS, Date.parse('2026-11-08T03:00:00Z')).length, 0);
});
