import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseGameWindow, windowCountdown } from '@/lib/schedule/gameWindow';
import { parseBannerDate, parseBannerEndDate } from '@/lib/gacha/realGachaBanners';
import { getAllHeadhuntingBanners } from '@/lib/gacha/headhuntingBannerData';
import { getHomeGachaBanners, getOngoingGachaBanners, getOngoingEvents, loadGameEvents } from '@/lib/home/frontPageContent';

const start = new Date('2026-09-16T15:00:00Z');
const end = new Date('2026-09-30T11:00:00Z');
/* An event and its banner announced for 08:00 PDT on the 16th, closing at the 04:00
   reset on the 30th -- People, A People and Rage of The Many, as fixtures, since the
   live records are renamed and re-timed by the daily refresh. */
const official = { startAt: '2026-09-16T15:00:00.000Z', endAt: '2026-09-30T11:00:00.000Z', timingSource: 'https://www.arknights.global/news/4635' };
const eventWindow = parseGameWindow('2026/09/16–2026/09/30', official)!;
const event = { name: '[Side Story] Fixture', poster: '', year: 2026, dateRange: '2026/09/16–2026/09/30', ...official, start: eventWindow.start, end: eventWindow.end } as ReturnType<typeof loadGameEvents>[number];
const banner = { name: 'Fixture banner', category: 'featured', pull_type: 'featured', year: 2026, cn_date: null, global_date: '2026/09/16–2026/09/30', global_window: official, six_stars: [], five_stars: [], four_stars: [] } as unknown as ReturnType<typeof getAllHeadhuntingBanners>[number];
test('an event and its banner share the announced opening, not midnight or reset', () => {
  assert.deepEqual(event.start, start);
  assert.deepEqual(event.end, end);
  assert.deepEqual(parseBannerDate(banner), start);
  assert.deepEqual(parseBannerEndDate(banner), end);
  for (const now of ['2026-09-16T00:00:00Z', '2026-09-16T11:00:00Z', '2026-09-16T14:59:59Z']) {
    assert.equal(getOngoingEvents(new Date(now), [event]).length, 0);
    assert.equal(getOngoingGachaBanners(new Date(now), [banner]).length, 0);
    assert.equal(getHomeGachaBanners(new Date(now), [banner])[0].name, banner.name);
  }
  assert.equal(getOngoingEvents(start, [event]).length, 1);
  assert.equal(getOngoingGachaBanners(start, [banner]).length, 1);
  assert.equal(getOngoingEvents(end, [event]).length, 0);
  assert.equal(getOngoingGachaBanners(end, [banner]).length, 0);
  assert.equal(getHomeGachaBanners(start, [{ ...banner, global_date: null, global_window: undefined }]).length, 0);
});

test('countdown crosses opening and closing without stale labels or negative time', () => {
  assert.deepEqual(windowCountdown(start, end, new Date(+start - 1000)), { label: 'Starts in', remaining: 1000 });
  assert.deepEqual(windowCountdown(start, end, start), { label: 'Ends in', remaining: +end - +start });
  assert.deepEqual(windowCountdown(start, end, new Date(+end - 1000)), { label: 'Ends in', remaining: 1000 });
  for (const now of [end, new Date(+end + 1000)]) assert.deepEqual(windowCountdown(start, end, now), { label: 'Ended', remaining: 0 });
});

test('date-only fallback is timezone-independent, with exact maintenance hours taking precedence', () => {
  const before = process.env.TZ;
  try {
    for (const tz of ['UTC', 'America/Los_Angeles', 'Asia/Tokyo', 'Europe/Zurich']) {
      process.env.TZ = tz;
      assert.deepEqual(parseGameWindow('2026/09/16–2026/09/30'), { start, end });
      assert.equal(parseGameWindow('2026/09/16–2026/09/30', {}, 'global', true)?.start.toISOString(), '2026-09-16T11:00:00.000Z');
      assert.equal(parseGameWindow('2026/09/16–2026/09/30', {}, 'cn', true)?.start.toISOString(), '2026-09-15T20:00:00.000Z');
      assert.equal(parseGameWindow('2026/09/16–2026/09/30', { startAt: '2026-09-16T10:00:00-07:00' })?.start.toISOString(), '2026-09-16T17:00:00.000Z');
    }
  } finally { if (before === undefined) delete process.env.TZ; else process.env.TZ = before; }
  assert.equal(parseGameWindow('2026/02/30–2026/03/15'), null);
  assert.equal(parseGameWindow('2026/09/16–2026/09/30', { startAt: '2026-09-16T15:00:00' }), null);
  assert.equal(parseGameWindow('2026/09/30–2026/09/16'), null);
});

test('sync retains exact hours even when calendar days are unchanged, and is idempotent', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'arkpedia-window-test-'));
  try {
    fs.mkdirSync(path.join(tmp, 'data/events'), { recursive: true });
    const year = new Date().getUTCFullYear() + 1;
    const range = `${year}/09/16–${year}/09/30`;
    const open = Date.UTC(year, 8, 16, 17) / 1000, close = Date.UTC(year, 8, 30, 11) / 1000;
    const eventFile = path.join(tmp, `data/events/events_${year}.json`), bannerFile = path.join(tmp, 'data/headhunting_banners.json');
    fs.writeFileSync(eventFile, JSON.stringify([{ name: 'Test event', global: { dateRange: range, note: 'Estimated' } }]));
    fs.writeFileSync(bannerFile, JSON.stringify([{ name: 'Test banner', global_date: range }]));
    for (const region of ['en', 'cn']) {
      const dir = path.join(tmp, region, 'gamedata/excel'); fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'activity_table.json'), JSON.stringify({ basicInfo: region === 'en' ? { test: { name: 'Test event', startTime: open, endTime: close - 1 } } : {} }));
      fs.writeFileSync(path.join(dir, 'gacha_table.json'), JSON.stringify({ gachaPoolClient: region === 'en' ? [{ gachaPoolName: 'Test banner', openTime: open, endTime: close }] : [] }));
    }
    const run = () => execFileSync(process.execPath, [path.resolve('scripts/sync/sync-event-windows.mjs')], { cwd: tmp, env: { ...process.env, ARKPEDIA_EN: 'en', ARKPEDIA_CN: 'cn' }, encoding: 'utf8' });
    run();
    const event = JSON.parse(fs.readFileSync(eventFile, 'utf8'))[0].global;
    const banner = JSON.parse(fs.readFileSync(bannerFile, 'utf8'))[0].global_window;
    assert.equal(event.startAt, `${year}-09-16T17:00:00.000Z`);
    assert.equal(event.endAt, `${year}-09-30T11:00:00.000Z`);
    assert.equal(event.note, null);
    assert.equal(banner.startAt, event.startAt);
    assert.equal(banner.endAt, event.endAt);
    const saved = fs.readFileSync(eventFile, 'utf8') + fs.readFileSync(bannerFile, 'utf8');
    run();
    assert.equal(fs.readFileSync(eventFile, 'utf8') + fs.readFileSync(bannerFile, 'utf8'), saved);
    // An official notice may announce maintenance hours that the mirror lacks.
    const official = { startAt: `${year}-09-16T15:00:00.000Z`, endAt: event.endAt, timingSource: 'https://www.arknights.global/news/4635' };
    fs.writeFileSync(eventFile, JSON.stringify([{ name: 'Test event', global: { dateRange: range, ...official } }]));
    fs.writeFileSync(bannerFile, JSON.stringify([{ name: 'Test banner', global_date: range, global_window: official }]));
    const announced = fs.readFileSync(eventFile, 'utf8') + fs.readFileSync(bannerFile, 'utf8');
    run();
    assert.equal(fs.readFileSync(eventFile, 'utf8') + fs.readFileSync(bannerFile, 'utf8'), announced);

    // A banner that carries its pool id takes that pool's window even when no name
    // matches, and a rerun takes its own pool rather than its original's.
    const later = Date.UTC(year, 9, 14, 11) / 1000;
    fs.writeFileSync(path.join(tmp, 'en/gamedata/excel/gacha_table.json'), JSON.stringify({ gachaPoolClient: [
      { gachaPoolId: 'SINGLE_EN_1', gachaPoolName: 'Official Name', openTime: open, endTime: close },
      { gachaPoolId: 'SINGLE_EN_2', gachaPoolName: 'Twice Run', openTime: open, endTime: close },
      { gachaPoolId: 'SINGLE_EN_3', gachaPoolName: 'Twice Run', openTime: later, endTime: later + 14 * 86400 },
    ] }));
    fs.writeFileSync(bannerFile, JSON.stringify([{ name: 'Community Name', global_date: null, globalPoolId: 'SINGLE_EN_1' },
      { name: 'Twice Run Rerun', global_date: range, globalPoolId: 'SINGLE_EN_3' }]));
    run();
    const [community, rerun] = JSON.parse(fs.readFileSync(bannerFile, 'utf8'));
    assert.deepEqual([community.global_date, community.global_window.startAt], [range, event.startAt]);
    assert.equal(rerun.global_window.startAt, new Date(later * 1000).toISOString());
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
