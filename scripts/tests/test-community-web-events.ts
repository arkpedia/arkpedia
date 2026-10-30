import assert from 'node:assert/strict';
import { test } from 'node:test';
import RECORD from '../../data/community-web-events.json';
import { currentWebEvents, mergeWebEvents, webEventServer, type WorldWebEvent } from '../../lib/community/worldDirectory';

const ALL: WorldWebEvent[] = RECORD as WorldWebEvent[];
/** The three regional Footprints campaigns, as a copy of what the record held when these were
 *  written: the cases the merge and deadline tests below are written against. A copy and not a
 *  slice of the record, because the import rewrites that nightly and a corrected window there
 *  must not turn a test of this code red. */
const WEB_EVENTS: WorldWebEvent[] = [
  {
    name: 'Footprints', region: 'Global (EN)', start: '2026-10-08', end: '2026-11-07',
    opensAt: '2026-10-08T07:00:00.000Z', closingTime: '19:59 (UTC−7)', expiresAt: '2026-11-08T03:00:00.000Z',
    url: 'https://footprints.arknights.global/',
    image: 'https://webusstatic.yo-star.com/arknights-us/ark-footprints-h5-us/prod/arkfootprintsh5us/share.png',
    sourceUrl: 'https://cafe.naver.com/f-e/cafes/29703924/articles/1247947',
  },
  {
    name: '발자취 | 명일방주', region: 'Korea (KR)', start: '2026-10-08', end: '2026-11-08',
    closingTime: '11:59 (KST)', expiresAt: '2026-11-08T03:00:00.000Z',
    url: 'https://footprints.arknights.kr/',
    image: 'https://webusstatic.yo-star.com/arknights-kr/ark-footprints-h5-kr/prod/arkfootprintsh5kr/share.png',
    sourceUrl: 'https://cafe.naver.com/f-e/cafes/29703924/articles/1247947',
  },
  {
    name: '足跡', region: 'Japan (JP)', start: '2026-10-08', end: '2026-11-08',
    opensAt: '2026-10-08T07:00:00.000Z', closingTime: '11:59 (JST)', expiresAt: '2026-11-08T03:00:00.000Z',
    url: 'https://footprints.arknights.jp/',
    image: 'https://webusstatic.yo-star.com/arknights-jp/ark-footprints-h5-jp/prod/arkfootprintsh5jp/share.png',
    sourceUrl: 'https://cafe.naver.com/f-e/cafes/29703924/articles/1247947',
  },
];

test('every published campaign names its server and has an exact deadline', () => {
  assert.ok(ALL.length, 'the record has campaigns');
  // A record with no exact deadline reads as ended, and the deadline is an instant after
  // the day it opens. Checked on the record itself, so a bad editorial edit fails here.
  for (const event of ALL) {
    assert.ok(webEventServer(event), `${event.name} names a server`);
    assert.ok(Number.isFinite(Date.parse(event.expiresAt ?? '')), `${event.name} has an exact deadline`);
    assert.ok(Date.parse(event.expiresAt!) > Date.parse(event.opensAt ?? event.start), `${event.name} closes after it opens`);
    assert.equal(new URL(event.url).protocol, 'https:');
    // pages/community.tsx casts the JSON to WorldWebEvent, so the type cannot check this.
    assert.ok([undefined, 'social'].includes(event.kind), `${event.name}: kind is "social" or absent`);
  }
});

test('regional campaign links and deadlines match the official event rules', () => {
  assert.deepEqual(WEB_EVENTS.map(event => new URL(event.url).hostname), ['footprints.arknights.global', 'footprints.arknights.kr', 'footprints.arknights.jp']);
  for (const event of WEB_EVENTS) {
    assert.equal(Date.parse(event.expiresAt!), Date.parse(`${event.end}T${event.region === 'Global (EN)' ? '20:00:00-07:00' : '12:00:00+09:00'}`));
  }
});

test('a newer content release can add campaigns and correct published dates without a deploy', () => {
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
