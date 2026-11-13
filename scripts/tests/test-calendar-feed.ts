import assert from 'node:assert/strict';
import test from 'node:test';
import { calendarFeed, foldCalendarLine, type CalendarData, type CalendarOptions } from '../../lib/schedule/calendarFeed';

const updated = '2026-11-12T12:00:00Z';
const now = Date.parse(updated);
const options: CalendarOptions = { server: 'en', predicted: true, birthdays: false, collabs: false };
const data = (): CalendarData => ({
  events: [
    { name: 'Confirmed event', year: 2026, poster: null, cn: { dateRange: '2026/05/01–2026/05/15', note: null }, tw: { dateRange: null, note: null }, global: { dateRange: '2026/11/16–2026/11/30', note: null, startAt: '2026-11-16T15:00:00Z', endAt: '2026-11-30T11:00:00Z' } },
    { name: 'Future event', year: 2026, poster: null, cn: { dateRange: '2026/06/01–2026/06/15', note: null }, tw: { dateRange: null, note: null }, global: { dateRange: null, note: null } },
  ],
  eventRows: [
    { name: 'Confirmed event', dateRange: '2026/11/16–2026/11/30', isPredicted: false, start: Date.parse('2026-11-16T15:00Z'), end: Date.parse('2026-11-30T11:00Z'), poster: null, pullBanner: null, featuredOperators: [] },
    { name: 'Future event', dateRange: '2026/12/01–2026/12/15', isPredicted: true, start: Date.parse('2026-12-01T15:00Z'), end: Date.parse('2026-12-15T11:00Z'), poster: null, pullBanner: null, featuredOperators: [] },
  ],
  operators: [{ name: 'Leap', rarity: 6, basicInfo: { 'Date of Birth': 'February 29th' } }],
});
const unfold = (feed: string) => feed.replace(/\r\n /g, '');
const blocks = (feed: string) => unfold(feed).split('BEGIN:VEVENT\r\n').slice(1).map(block => block.split('END:VEVENT')[0]);
const property = (block: string, name: string) => block.split('\r\n').find(line => line.startsWith(`${name}:`))?.slice(name.length + 1);

test('confirmed instants stay in UTC; CN predictions are tentative all-day dates with an exclusive end', () => {
  const result = blocks(calendarFeed(data(), options, updated, now));
  assert.match(result[0], /SUMMARY:\[Confirmed\] Confirmed event/);
  assert.match(result[0], /DTSTART:20261116T150000Z/);
  assert.match(result[0], /DTEND:20261130T110000Z/);
  assert.match(result[0], /STATUS:CONFIRMED/);
  assert.match(result[1], /SUMMARY:\[Predicted\] Future event \(CN estimate\)/);
  assert.match(result[1], /Estimated from the CN schedule/);
  assert.match(result[1], /DTSTART;VALUE=DATE:20261201/);
  assert.match(result[1], /DTEND;VALUE=DATE:20261216/);
  assert.match(result[1], /STATUS:TENTATIVE/);
});

test('confirmation and corrected dates update the same UID with a newer revision', () => {
  const source = data();
  const before = blocks(calendarFeed(source, options, updated, now))[1];
  source.eventRows[1] = { ...source.eventRows[1], dateRange: '2026/12/03–2026/12/17', isPredicted: false };
  const after = blocks(calendarFeed(source, options, '2026-11-13T12:00:00Z', now))[1];
  assert.equal(property(before, 'UID'), property(after, 'UID'));
  assert.ok(Number(property(after, 'SEQUENCE')) > Number(property(before, 'SEQUENCE')));
  assert.match(after, /SUMMARY:\[Confirmed\] Future event/);
  assert.match(after, /DTSTART;VALUE=DATE:20261203/);
  assert.equal(calendarFeed(source, options, updated, now), calendarFeed(source, options, updated, now + 1000));
});

test('confirmed-only filters predictions, including regional Global fallbacks', () => {
  assert.equal(blocks(calendarFeed(data(), { ...options, predicted: false }, updated, now)).length, 1);
  assert.equal(blocks(calendarFeed(data(), { ...options, server: 'jp', predicted: false }, updated, now)).length, 0);
  const jp = blocks(calendarFeed(data(), { ...options, server: 'jp' }, updated, now));
  assert.match(jp[0], /\[Predicted\].*Global fallback/);
  assert.match(jp[1], /\[Predicted\].*CN estimate/);
  const source = data();
  source.__contentTables = { 'regional-schedules': { version: 1, servers: { jp: { sources: {}, events: { 'Future event': { startAt: '2026-12-02T07:00:00Z', endAt: '2026-12-16T19:00:00Z', timingSource: 'official' } } } } } };
  const confirmed = blocks(calendarFeed(source, { ...options, server: 'jp', predicted: false }, updated, now));
  assert.equal(confirmed.length, 1);
  assert.match(confirmed[0], /SUMMARY:\[Confirmed\] Future event/);
  assert.match(confirmed[0], /DTSTART:20261202T070000Z/);
});

test('withdrawn and expired predictions are omitted, birthdays recur, duplicate rows are not repeated', () => {
  const source = data();
  source.eventRows.push(source.eventRows[0]);
  source.eventRows[1] = { ...source.eventRows[1], dateRange: 'Global date unannounced' };
  const result = blocks(calendarFeed(source, { ...options, birthdays: true }, updated, now));
  assert.equal(result.length, 2);
  assert.match(result[1], /DTSTART;VALUE=DATE:20000229/);
  assert.match(result[1], /DTEND;VALUE=DATE:20000301/);
  assert.match(result[1], /RRULE:FREQ=YEARLY/);
  assert.equal(blocks(calendarFeed(data(), options, updated, Date.parse('2027-01-01'))).length, 1);
});

test('iCalendar text escaping and UTF-8 line folding preserve text without injecting properties', () => {
  const name = '雷'.repeat(70) + ',;\\\r\nSTATUS:CANCELLED';
  const source = data();
  source.eventRows[0] = { ...source.eventRows[0], name };
  const feed = calendarFeed(source, options, updated, now);
  for (const line of feed.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, line);
  assert.equal(feed.replace(/\r\n/g, '').includes('\n'), false);
  assert.match(unfold(feed), /\\,\\;\\\\\\nSTATUS:CANCELLED/);
  assert.doesNotMatch(unfold(feed), /\r\nSTATUS:CANCELLED/);
  const long = 'SUMMARY:' + 'é雷'.repeat(100);
  assert.equal(unfold(foldCalendarLine(long)), long);
});

test('external-game collabs share source dates across servers and do not become CN predictions', () => {
  const global = blocks(calendarFeed(data(), { ...options, predicted: false, collabs: true }, updated, now));
  const jp = blocks(calendarFeed(data(), { ...options, server: 'jp', predicted: false, collabs: true }, updated, now));
  const collabs = global.filter(block => block.includes('CATEGORIES:External game collaborations'));
  assert.equal(collabs.length, 6);
  assert.deepEqual(collabs, jp.filter(block => block.includes('CATEGORIES:External game collaborations')));
  const arcaea = collabs.find(block => block.includes('Arcaea × Arknights'))!;
  assert.match(arcaea, /DTSTART;VALUE=DATE:20261117/);
  assert.match(arcaea, /DTEND;VALUE=DATE:20280318/);
  assert.match(arcaea, /STATUS:CONFIRMED/);
  assert.match(arcaea, /URL:https:\/\/x.com\/arcaea_en\/status\//);
  assert.doesNotMatch(arcaea, /Predicted|CN estimate|Global server/);
  const cytus = collabs.find(block => block.includes('Cytus II ×'))!;
  assert.match(cytus, /DTSTART;VALUE=DATE:20211216/);
  assert.match(cytus, /DTEND;VALUE=DATE:20211217/);
  assert.match(collabs.find(block => block.includes('Garena events'))!, /Garena service/);
});

test('existing subscriptions include collaborations by default; opting out excludes only them', () => {
  const { collabs: _collabs, ...existingOptions } = options;
  const defaults = blocks(calendarFeed(data(), existingOptions, updated, now));
  assert.equal(defaults.filter(block => block.includes('CATEGORIES:External game collaborations')).length, 6);
  assert.equal(blocks(calendarFeed(data(), options, updated, now)).length, 2);
});
