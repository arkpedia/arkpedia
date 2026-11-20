import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventStartRows, gameEventStartCard, startCardCaption, type ClockFormat } from '../../lib/home/eventStartTimes';
import type { GameEvent } from '../../lib/home/frontPageContent';

const localTime = (iso: string, place: string, format: ClockFormat = '12h') => {
  const row = eventStartRows(Date.parse(iso), format).find(item => item.places.includes(place));
  assert.ok(row, place);
  return row;
};

test('start times group real local clocks, including half-hour offsets and the following day', () => {
  const start = '2026-11-16T15:00:00Z';
  assert.equal(localTime(start, 'Hawaii').time, '5:00 AM');
  assert.deepEqual(localTime(start, 'Arizona (Phoenix)').places, ['Arizona (Phoenix)']);
  assert.ok(localTime(start, 'Germany').places.includes('Switzerland'));
  assert.equal(localTime(start, 'UK').time, '3:00 PM');
  assert.equal(localTime(start, 'India').time, '8:30 PM');
  assert.equal(localTime(start, 'Japan').key, '2026-11-17T00:00');
  assert.equal(localTime(start, 'Wellington').date, '17 Nov');
  assert.equal(localTime('2026-01-01T00:15:00Z', 'Hawaii').key, '2025-12-31T14:15');
});

test('24-hour time uses leading zeros and keeps the same date and grouping at midnight', () => {
  const start = '2026-11-16T15:00:00Z';
  assert.equal(localTime(start, 'Hawaii', '24h').time, '05:00');
  assert.equal(localTime(start, 'India', '24h').time, '20:30');
  assert.equal(localTime(start, 'Santiago', '24h').time, '12:00');
  assert.deepEqual(localTime(start, 'Japan', '24h'), { ...localTime(start, 'Japan'), time: '00:00' });
});

test('locations group only on dates when their clocks agree', () => {
  const summer = '2026-07-16T15:00:00Z';
  const winter = '2026-11-16T15:00:00Z';
  assert.ok(localTime(summer, 'Arizona (Phoenix)').places.includes('California & Washington'));
  assert.ok(!localTime(winter, 'Arizona (Phoenix)').places.includes('California & Washington'));
  assert.ok(!localTime(winter, 'Germany').places.includes('South Africa'));
  assert.ok(localTime(summer, 'Germany').places.includes('South Africa'));
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
