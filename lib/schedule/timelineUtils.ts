import { InGameEvent, OperatorBirthday } from './timelineTypes';
import { CommunityEvent } from './eventTypes';

export interface DayCell {
  date: Date;
  dateKey: string; // YYYY-MM-DD
  inMonth: boolean;
}

export interface MonthGrid {
  year: number;
  month: number; // 0-11
  label: string;
  weeks: DayCell[][];
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function makeCell(date: Date, inMonth: boolean): DayCell {
  return { date, dateKey: toDateKey(date), inMonth };
}

/** Generates `count` months of calendar grids starting from the given date's month.
 * Every cell (including padding days from adjacent months) gets a real date,
 * so week-spanning event bars can be computed correctly across the whole grid. */
export function generateMonths(start: Date, count: number): MonthGrid[] {
  const months: MonthGrid[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);

  for (let i = 0; i < count; i++) {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startWeekday = firstOfMonth.getDay(); // 0 = Sunday

    const cells: DayCell[] = [];
    for (let lead = startWeekday; lead > 0; lead--) {
      const d = new Date(year, month, 1 - lead);
      cells.push(makeCell(d, false));
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(makeCell(new Date(year, month, d), true));
    }
    let trailing = 1;
    while (cells.length % 7 !== 0) {
      cells.push(makeCell(new Date(year, month + 1, trailing), false));
      trailing++;
    }

    const weeks: DayCell[][] = [];
    for (let i3 = 0; i3 < cells.length; i3 += 7) {
      weeks.push(cells.slice(i3, i3 + 7));
    }

    months.push({
      year,
      month,
      label: firstOfMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      weeks,
    });

    cursor.setMonth(cursor.getMonth() + 1);
  }

  return months;
}

function addDays(dateKey: string, days: number): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return dt;
}



export interface WeekEventSource {
  key: string;
  name: string;
  start: Date;
  end: Date; // inclusive
  colorClass: 'timeline-pill-ingame' | 'timeline-pill-community';
}

export interface WeekBar extends WeekEventSource {
  colStart: number; // 0-6
  colEnd: number; // 0-6, inclusive
  lane: number;
}

function daysBetween(a: Date, b: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((utcB - utcA) / msPerDay);
}

/** Lays out spanning bars for one week, assigning each overlapping event
 * to the lowest free "lane" (row) so overlapping events stack instead of
 * colliding, and clips each bar to this week's 7-day range. */
export function computeWeekBars(week: DayCell[], sources: WeekEventSource[]): WeekBar[] {
  const weekStart = week[0].date;
  const weekEnd = week[6].date;

  const overlapping = sources.filter((s) => s.end >= weekStart && s.start <= weekEnd);

  const bars: WeekBar[] = overlapping
    .map((s) => {
      const colStart = Math.max(0, daysBetween(weekStart, s.start));
      const colEnd = Math.min(6, daysBetween(weekStart, s.end));
      return { ...s, colStart, colEnd, lane: 0 };
    })
    .sort((a, b) => a.colStart - b.colStart || a.colEnd - b.colEnd);

  const laneEnds: number[] = []; // laneEnds[lane] = last occupied column in that lane
  for (const bar of bars) {
    let lane = 0;
    while (lane < laneEnds.length && laneEnds[lane] >= bar.colStart) lane++;
    bar.lane = lane;
    laneEnds[lane] = bar.colEnd;
  }

  return bars;
}