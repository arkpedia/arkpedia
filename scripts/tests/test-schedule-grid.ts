import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGameRangeDays, parseGameWindow } from '@/lib/schedule/gameWindow';
import { parseDateRange, scheduleBarSources } from '@/lib/schedule/scheduleDates';
import { getEventCalendar } from '@/lib/home/frontPageContent';
import { getAllEvents } from '@/lib/schedule/schedule';

/* /schedule's calendar grid and its Events list read the same records, and once disagreed on
   which ranges parse: the grid split on the dash alone, so all 23 Global events of 2022, written
   "2022/03/17–2022/03/31; 181 days after CN", were in the list and missing from the grid. Both
   now read the text with parseGameRangeDays; these hold them to it. */

/* The reader's timezone moves local midnights, never the day a bar sits on: UTC, ahead of it,
   behind it, and the two ends of the clock. */
const ZONES = ['UTC', 'Asia/Seoul', 'America/Los_Angeles', 'Pacific/Kiritimati', 'Pacific/Pago_Pago'];
function inZones(run: (zone: string) => void) {
  const before = process.env.TZ;
  try {
    for (const zone of ZONES) {
      process.env.TZ = zone;
      run(zone);
    }
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
}
const localDay = (date: Date) => ({ year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() });

test('the grid reads every range shape the events list reads, on the days it names', () => {
  const ranges: [string, [number, number, number], [number, number, number]][] = [
    ['2022/03/17–2022/03/31; 181 days after CN', [2022, 3, 17], [2022, 3, 31]],
    ['2022/11/03–2022/11/24 ; 186 days after CN', [2022, 11, 3], [2022, 11, 24]],
    ['2026/07/16 – 2026/08/06', [2026, 7, 16], [2026, 8, 6]],
    ['2026/09/16-2026/09/30', [2026, 9, 16], [2026, 9, 30]],
    ['2026/1/5–2026/1/19', [2026, 1, 5], [2026, 1, 19]],
    ['2022/12/27–2023/01/10; 201 days after CN', [2022, 12, 27], [2023, 1, 10]],
  ];
  inZones((zone) => {
    for (const [text, [sy, sm, sd], [ey, em, ed]] of ranges) {
      assert.ok(parseGameWindow(text), `${text}: the events list reads it`);
      const range = parseDateRange(text);
      assert.ok(range, `${text}: the grid reads it too (${zone})`);
      assert.deepEqual(localDay(range.start), { year: sy, month: sm, day: sd }, `${text}: starts on its first day in ${zone}`);
      assert.deepEqual(localDay(range.end), { year: ey, month: em, day: ed }, `${text}: ends on its last day in ${zone}`);
      assert.equal(range.start.getHours(), 0, `${text}: a local midnight in ${zone}`);
    }
  });
  for (const text of [null, '', 'TBA', '2026/07/16', '2026/02/30–2026/03/15', 'Concurrent with Mansfield Break']) {
    assert.equal(parseDateRange(text), null, `${text}: not a range`);
    assert.equal(parseGameRangeDays(text), null, `${text}: not a range`);
  }
});

test('the grid draws a bar for every event in the events list with a Global range on record', () => {
  const records = new Map(getAllEvents().map((event) => [event.name, event]));
  /* Rows from a recorded Global range, confirmed or noted as an estimate; a CN-only record's
     row is a guess the list makes (PREDICTED_GAP_DAYS) and the grid does not draw. A record
     timed by explicit instants alone, with no range the text parser reads, is the grid's to
     miss by design (it draws days), so it is left out here rather than failing a content run. */
  const rows = getEventCalendar().filter((row) => {
    const record = records.get(row.name);
    return record?.global?.dateRange === row.dateRange && parseGameRangeDays(row.dateRange) !== null;
  });
  assert.ok(rows.filter((row) => row.dateRange.startsWith('2022/')).length >= 20, 'the 2022 Global events are among them');
  inZones((zone) => {
    const bars = new Map(scheduleBarSources([...records.values()]).map((bar) => [bar.key, bar]));
    const missing = rows.filter((row) => !bars.has(row.name)).map((row) => `${row.name} (${row.dateRange})`);
    assert.deepEqual(missing, [], `every event in the list has a bar on the grid (${zone})`);
    for (const row of rows) {
      const days = parseGameRangeDays(row.dateRange)!;
      const bar = bars.get(row.name)!;
      assert.deepEqual(localDay(bar.start), days.start, `${row.name}: its bar starts on ${row.dateRange} in ${zone}`);
      assert.deepEqual(localDay(bar.end), days.end, `${row.name}: its bar ends on ${row.dateRange} in ${zone}`);
    }
  });
});
