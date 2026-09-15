import { loadAllEventYears } from '@/lib/events/loadEventsData';
import { ScheduleEvent } from './scheduleTypes';

export function getAllEvents(): ScheduleEvent[] {
  return loadAllEventYears() as ScheduleEvent[];
}

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

/** Parses a "YYYY/MM/DD–YYYY/MM/DD" range (en dash) into real Date objects. */
export function parseDateRange(rangeStr: string | null): { start: Date; end: Date } | null {
  if (!rangeStr) return null;
  const parts = rangeStr.split('–');
  if (parts.length !== 2) return null;

  function parseOne(s: string): Date | null {
    const match = s.trim().match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
    if (!match) return null;
    const [, y, m, d] = match;
    return new Date(Number(y), Number(m) - 1, Number(d));
  }

  const start = parseOne(parts[0]);
  const end = parseOne(parts[1]);
  if (!start || !end) return null;
  return { start, end };
}