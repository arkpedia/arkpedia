/* Pure date helpers for the schedule, apart from lib/schedule/schedule.ts, whose getAllEvents
   reads the events data: browser code imports these without pulling that data module into
   its graph (scripts/tests/test-client-game-tables.ts). */
import { parseGameRangeDays, type GameDay } from './gameWindow';
import type { ScheduleEvent } from './scheduleTypes';
import type { WeekEventSource } from './timelineUtils';
import type { EventRow, EventRowView } from './eventRows';
import { serverCalendarTime, type GameServer } from '@/lib/time/servers.mjs';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export interface OperatorBirthday {
  name: string;
  month: number; // 1-12
  day: number;
}

/** Parses "Date of Birth" values like "March 25th" -- returns null for
 * anything unparseable (e.g. "Unknown"), rather than throwing. */
function parseBirthdayText(text: string | undefined): { month: number; day: number } | null {
  if (!text) return null;
  const match = text.match(/([A-Za-z]+)\s+(\d{1,2})(st|nd|rd|th)?/);
  if (!match) return null;
  const monthIdx = MONTHS.findIndex((m) => m.toLowerCase() === match[1].toLowerCase());
  if (monthIdx === -1) return null;
  return { month: monthIdx + 1, day: parseInt(match[2], 10) };
}

// Matches both the full Operator's basicInfo (a generic string record)
// and TimelineOperator's already-trimmed { 'Date of Birth' } shape, so
// this function works with either without the caller needing a cast.
interface BirthdaySource {
  name: string;
  basicInfo?: Record<string, string> | { 'Date of Birth'?: string } | null;
}

export function getOperatorBirthdays(operators: BirthdaySource[]): OperatorBirthday[] {
  const birthdays: OperatorBirthday[] = [];
  for (const op of operators) {
    const parsed = parseBirthdayText(op.basicInfo?.['Date of Birth']);
    if (parsed) birthdays.push({ name: op.name, ...parsed });
  }
  return birthdays;
}

/**
 * A recorded range as the reader's own calendar days: local midnights, the model the /schedule
 * grid draws in (generateMonths, computeWeekBars), so a bar sits on the dates the record names in
 * every timezone. The text is read by parseGameRangeDays, the parser the events list and every
 * countdown use (parseGameWindow), "; note" tail included; null where that finds no range.
 */
export function parseDateRange(rangeStr: string | null): { start: Date; end: Date } | null {
  const days = parseGameRangeDays(rangeStr);
  if (!days) return null;
  const local = ({ year, month, day }: GameDay) => new Date(year, month - 1, day);
  return { start: local(days.start), end: local(days.end) };
}

/** The /schedule calendar's event bars: one per event with a Global range on record. */
export function scheduleBarSources(events: readonly Pick<ScheduleEvent, 'name' | 'global'>[], rows: readonly (EventRow | EventRowView)[] = [], server: GameServer = 'en', now = 0): WeekEventSource[] {
  const sources = new Map(events.flatMap((e): [string, WeekEventSource][] => {
    const range = parseDateRange(e.global.dateRange);
    return range ? [[e.name, { key: e.name, name: e.name, start: range.start, end: range.end, colorClass: 'timeline-pill-ingame' }]] : [];
  }));
  // The Events list owns forecasts and permanent-mode launches too. Calendar bars
  // must use those same windows rather than silently dropping CN-derived estimates.
  const day = (instant: number) => {
    const date = serverCalendarTime(new Date(instant), server);
    return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  };
  for (const row of rows) {
    if ('start' in row && row.bannerName && row.isPredicted && row.start <= now) { sources.delete(row.name); continue; }
    const range = parseDateRange(row.dateRange) ?? ('start' in row && Number.isFinite(row.start) && row.start < 8.64e15
      ? { start: day(row.start), end: day(row.modeId ? row.start : row.end - 1) } : null);
    if (!range) { sources.delete(row.name); continue; }
    sources.set(row.name, { key: row.name, name: row.name, ...range, colorClass: 'timeline-pill-ingame' });
  }
  return [...sources.values()];
}
