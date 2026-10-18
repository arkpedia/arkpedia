import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getAllHeadhuntingBanners } from '../../lib/gacha/headhuntingBannerData';
import { resolveGachaSimulatorBanners } from '../../lib/gacha/gachaBannerWindows';
import { bannerScheduleEvents } from '../../lib/schedule/bannerEvents';
import { currentEventRows } from '../../lib/schedule/eventRows';

test('special headhunting dates reach the calendar without claiming a stage event or live forecast', () => {
  const previews = resolveGachaSimulatorBanners(getAllHeadhuntingBanners());
  const calendar = bannerScheduleEvents(previews);
  const joint = calendar.find(e => e.bannerName === '[jo] Joint Operation 23')!;
  assert.ok(joint);
  assert.equal(joint.global.dateRange, '2027/02/09–2027/02/23');
  assert.match(joint.global.note!, /Estimated/);
  assert.equal(joint.poster, null);
  assert.ok(calendar.every(e => e.bannerName && (e.global.dateRange || /unannounced/.test(e.global.note ?? ''))));
  assert.ok(!calendar.some(e => e.name.includes('Persona 3 Reload')));
  const start = Date.parse('2027-02-09T00:00:00Z');
  const row = { name: joint.name, bannerName: joint.bannerName, poster: null, dateRange: joint.global.dateRange!, isPredicted: true,
    start, end: start + 14 * 86400000, pullBanner: null, featuredOperators: [] };
  assert.equal(currentEventRows([row], start + 86400000)[0].isOngoing, false);
  assert.equal(currentEventRows([{ ...row, isPredicted: false }], start + 86400000)[0].isOngoing, true);
  assert.equal(currentEventRows([row], row.end)[0].dateRange, 'Global date unannounced');
  assert.deepEqual(currentEventRows([{ ...row, isPredicted: false }], row.end), []);
});
