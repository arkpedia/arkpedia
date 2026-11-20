import { test } from 'node:test';
import assert from 'node:assert/strict';
import { archiveEventStartCard, eventStartRows, gameEventStartCard, startCardCaption, type ClockFormat } from '../../lib/home/eventStartTimes';
import type { GameEvent } from '../../lib/home/frontPageContent';

const localTime = (iso: string, place: string, format: ClockFormat = '12h') => {
  const row = eventStartRows(Date.parse(iso), format).find(item => item.places.includes(place));
  assert.ok(row, place);
  return row;
};

test('start times group real local clocks, including half-hour offsets and the following day', () => {
  const start = '2026-11-16T15:00:00Z';
  assert.equal(localTime(start, 'Hawaii, USA').time, '5:00 AM');
  assert.deepEqual(localTime(start, 'Phoenix, USA').places, ['Phoenix, USA']);
  assert.ok(localTime(start, 'Germany').places.includes('Switzerland'));
  assert.equal(localTime(start, 'UK').time, '3:00 PM');
  assert.equal(localTime(start, 'India').time, '8:30 PM');
  assert.equal(localTime(start, 'Japan').key, '2026-11-17T00:00');
  assert.equal(localTime(start, 'Wellington, New Zealand').date, '17 Nov');
  assert.equal(localTime('2026-01-01T00:15:00Z', 'Hawaii, USA').key, '2025-12-31T14:15');
});

test('24-hour time uses leading zeros and keeps the same date and grouping at midnight', () => {
  const start = '2026-11-16T15:00:00Z';
  assert.equal(localTime(start, 'Hawaii, USA', '24h').time, '05:00');
  assert.equal(localTime(start, 'India', '24h').time, '20:30');
  assert.equal(localTime(start, 'Santiago, Chile', '24h').time, '12:00');
  assert.deepEqual(localTime(start, 'Japan', '24h'), { ...localTime(start, 'Japan'), time: '00:00' });
});

test('Indonesia has three separate local times, with the eastern date rolling over at midnight', () => {
  const start = '2026-11-23T15:00:00Z';
  assert.equal(localTime(start, 'Jakarta, Indonesia (WIB)', '24h').key, '2026-11-23T22:00');
  assert.equal(localTime(start, 'Makassar, Indonesia (WITA)', '24h').key, '2026-11-23T23:00');
  assert.equal(localTime(start, 'Jayapura, Indonesia (WIT)', '24h').key, '2026-11-24T00:00');
});

test('locations group only on dates when their clocks agree', () => {
  const summer = '2026-07-16T15:00:00Z';
  const winter = '2026-11-16T15:00:00Z';
  assert.ok(localTime(summer, 'Phoenix, USA').places.includes('California & Washington, USA'));
  assert.ok(!localTime(winter, 'Phoenix, USA').places.includes('California & Washington, USA'));
  assert.ok(!localTime(winter, 'Germany').places.includes('South Africa'));
  assert.ok(localTime(summer, 'Germany').places.includes('South Africa'));
});

test('the added countries use local rules for upcoming and archived launches', () => {
  const summer = '2026-07-16T15:00:00Z';
  assert.equal(localTime(summer, 'Morocco', '24h').time, '16:00');
  assert.equal(localTime('2026-03-01T15:00:00Z', 'Morocco', '24h').time, '15:00');
  assert.equal(localTime('2026-09-20T00:59:00Z', 'Morocco', '24h').time, '01:59');
  assert.equal(localTime('2026-09-20T01:00:00Z', 'Morocco', '24h').time, '01:00');
  assert.equal(localTime(summer, 'Paraguay', '24h').time, '12:00');
  assert.equal(localTime(summer, 'Belarus', '24h').time, '18:00');
  assert.equal(localTime(summer, 'Kazakhstan', '24h').time, '20:00');
  const archived = '2023-07-16T15:00:00Z';
  assert.equal(localTime(archived, 'Paraguay', '24h').time, '11:00');
  assert.equal(localTime(archived, 'Kazakhstan', '24h').time, '21:00');
});

test('time cards identify exact regional starts and label estimates and Global fallbacks', () => {
  const event: GameEvent = {
    name: '[Side Story] Sample Event', poster: null, year: 2026, dateRange: '2026/11/16–2026/11/30',
    start: new Date('2026-11-16T15:00:00Z'), end: new Date('2026-11-30T11:00:00Z'),
  };
  const estimate = gameEventStartCard(event, 'en');
  assert.equal(estimate.title, 'Sample Event');
  assert.match(startCardCaption(estimate, '12h'), /Global event · Estimated start · 16 Nov 2026, 3:00 PM UTC/);
  const globalStart = { ...event, startAt: '2026-11-16T08:00:00-07:00' };
  assert.match(startCardCaption(gameEventStartCard(globalStart, 'jp'), '12h'), /Global event · Start/);
  const forecast = gameEventStartCard({ ...globalStart, note: 'Predicted Global opening date' }, 'en');
  assert.equal(forecast.timing, 'estimated');
  const jp = gameEventStartCard(event, 'jp', { startAt: '2026-11-16T16:00:00+09:00', status: 'announced' });
  assert.equal(jp.timing, 'confirmed');
  assert.match(startCardCaption(jp, '24h'), /JP event · Start · 16 Nov 2026, 07:00 UTC/);
  const datamined = gameEventStartCard({ ...globalStart, note: 'Estimated Global start' }, 'en', {
    startAt: '2026-11-16T15:00:00Z', status: 'datamined',
  });
  assert.match(startCardCaption(datamined, '24h'), /Global event · Datamined start · 16 Nov 2026, 15:00 UTC/);
  const published = { ...globalStart, note: 'Estimated Global start', timingSource: 'https://www.arknights.global/news/4635' };
  const confirmed = gameEventStartCard(published, 'en', { startAt: '2026-11-16T16:00:00Z', status: 'datamined' });
  assert.match(startCardCaption(confirmed, '24h'), /Global event · Start · 16 Nov 2026, 15:00 UTC/);
});

test('archive cards preserve sourced times and mark date-only estimates', () => {
  const event = { name: 'Archived event', poster: null, dateRange: '2022/06/17–2022/07/01; archived' };
  const card = archiveEventStartCard(event, 'jp');
  assert.ok(card);
  assert.match(startCardCaption(card, '24h'), /Global event · Estimated start · 17 Jun 2022, 15:00 UTC/);
  const sourced = archiveEventStartCard(event, 'jp', { startAt: '2022-06-18T16:00:00+09:00', status: 'announced' });
  assert.ok(sourced);
  assert.match(startCardCaption(sourced, '24h'), /JP event · Start · 18 Jun 2022, 07:00 UTC/);
  assert.equal(archiveEventStartCard({ ...event, dateRange: 'Global launch unannounced' }, 'en'), null);
  assert.equal(archiveEventStartCard({ ...event, dateRange: '2022/06/17' }, 'en')?.instant, card.instant);
});
