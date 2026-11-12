import { createHash } from 'node:crypto';
import { parseGameRangeDays, parseGameWindow, type GameDay } from './gameWindow';
import type { EventRow, EventRowView, ExportedTimelineOperator } from './eventRows';
import type { ScheduleEvent } from './scheduleTypes';
import { getOperatorBirthdays } from './scheduleDates';
import type { RegionalSchedules } from '@/lib/time/regional';
import { serverCalendarTime } from '@/lib/time/servers.mjs';

export const CALENDAR_SERVERS = { en: 'Global', jp: 'Japan', kr: 'Korea' } as const;
export type CalendarServer = keyof typeof CALENDAR_SERVERS;
export interface CalendarOptions { server: CalendarServer; predicted: boolean; birthdays: boolean }
export interface CalendarData {
  events: ScheduleEvent[];
  eventRows: (EventRow | EventRowView)[];
  operators: ExportedTimelineOperator[];
  __contentTables?: { 'regional-schedules'?: RegionalSchedules };
}

const DAY = 86_400_000;
const stamp = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const dayStamp = (date: Date) => stamp(date).slice(0, 8);
const dateOf = ({ year, month, day }: GameDay) => new Date(Date.UTC(year, month - 1, day));
const text = (value: string) => value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
const uid = (identity: string) => `${createHash('sha256').update(identity).digest('hex')}@arkpedia.net`;

/** RFC 5545: 75 octets per physical line, including the continuation space.
 * Iterate code points so a fold never splits a UTF-8 character. */
export function foldCalendarLine(line: string): string {
  const encoder = new TextEncoder();
  let folded = '', part = '', bytes = 0;
  for (const character of line) {
    const size = encoder.encode(character).length;
    if (bytes + size > 75) { folded += `${part}\r\n`; part = ' '; bytes = 1; }
    part += character; bytes += size;
  }
  return folded + part;
}

/** A complete subscription snapshot. Identity never includes dates or confirmation status,
 * so confirmation/rescheduling updates the same calendar entry instead of duplicating it. */
export function calendarFeed(data: CalendarData, options: CalendarOptions, updatedAt: string, now = Date.now()): string {
  const updated = new Date(updatedAt);
  if (!Number.isFinite(+updated)) throw new Error('Calendar release timestamp unavailable');
  const serverName = CALENDAR_SERVERS[options.server];
  const revision = Math.max(0, Math.floor((+updated - Date.UTC(2000, 0, 1)) / 1000));
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Arkpedia//Schedule//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:Arkpedia ${serverName}`, 'REFRESH-INTERVAL;VALUE=DURATION:PT6H', 'X-PUBLISHED-TTL:PT6H'];
  const events = new Map(data.events.map(event => [event.name, event]));
  const regional = data.__contentTables?.['regional-schedules']?.servers[options.server];
  const seen = new Set<string>();
  for (const row of data.eventRows) {
    if (seen.has(row.name)) continue;
    seen.add(row.name);
    const event = events.get(row.name);
    const local = row.bannerName ? regional?.banners?.[row.bannerName] : regional?.events?.[row.name];
    const predicted = !local && (row.isPredicted || options.server !== 'en');
    if (predicted && !options.predicted) continue;
    const fromCN = row.isPredicted && !!(event?.cn.dateRange || event?.cn.releaseDate);
    const source = fromCN ? 'CN estimate' : options.server !== 'en' ? 'Global fallback' : 'schedule estimate';
    // Do not turn a withdrawn date or a missing date into a calendar appointment.
    if (!local && /unannounced|withdrawn/i.test(row.dateRange)) continue;
    const exact = local ?? (options.server === 'en' ? event?.global : undefined);
    const timed = !row.modeId && !predicted && exact?.startAt && exact.endAt
      ? parseGameWindow(null, exact, options.server) : null;
    const days = parseGameRangeDays(local ? `${serverCalendarTime(new Date(local.startAt), options.server).toISOString().slice(0, 10).replaceAll('-', '/')}–${serverCalendarTime(new Date(Date.parse(local.endAt) - 1), options.server).toISOString().slice(0, 10).replaceAll('-', '/')}` : row.dateRange);
    const fallback = 'start' in row && Number.isFinite(row.start) && row.start < 8.64e15
      ? serverCalendarTime(new Date(row.start), options.server) : null;
    const start = timed?.start ?? (days ? dateOf(days.start) : row.modeId ? fallback : null);
    const end = timed?.end ?? (days ? new Date(+dateOf(row.modeId ? days.start : days.end) + DAY) : start && row.modeId ? new Date(+start + DAY) : null);
    if (!start || !end || !Number.isFinite(+start) || !Number.isFinite(+end) || +start >= +end) continue;
    if (predicted && (+end <= now || row.bannerName && +start <= now)) continue;
    const label = predicted ? `[Predicted] ${row.name} (${source})` : `[Confirmed] ${row.name}`;
    const url = row.bannerName
      ? `https://www.arkpedia.net/pull-planner?banner=${encodeURIComponent(row.bannerName)}`
      : `https://www.arkpedia.net/events/${encodeURIComponent(row.name)}`;
    const description = [`${serverName} server.`, predicted
      ? `Predicted dates, not confirmed for ${serverName}. ${fromCN ? 'Estimated from the CN schedule.' : source === 'Global fallback' ? 'Uses Global dates until local dates are confirmed.' : 'Uses the current schedule estimate.'} Dates may change.`
      : `Confirmed ${serverName} dates.`, !timed ? 'All-day dates; exact opening/closing times are not provided in this entry.' : '', url].filter(Boolean).join('\n');
    lines.push('BEGIN:VEVENT', `UID:${uid(`${options.server}:event:${row.modeId ?? row.bannerName ?? row.name}`)}`,
      `DTSTAMP:${stamp(updated)}`, `LAST-MODIFIED:${stamp(updated)}`, `SEQUENCE:${revision}`,
      timed ? `DTSTART:${stamp(start)}` : `DTSTART;VALUE=DATE:${dayStamp(start)}`,
      timed ? `DTEND:${stamp(end)}` : `DTEND;VALUE=DATE:${dayStamp(end)}`,
      `SUMMARY:${text(label)}`, `DESCRIPTION:${text(description)}`, `URL:${url}`,
      `STATUS:${predicted ? 'TENTATIVE' : 'CONFIRMED'}`, 'TRANSP:TRANSPARENT', 'END:VEVENT');
  }
  if (options.birthdays) for (const birthday of getOperatorBirthdays(data.operators)) {
    const date = new Date(Date.UTC(2000, birthday.month - 1, birthday.day));
    if (date.getUTCMonth() !== birthday.month - 1 || date.getUTCDate() !== birthday.day) continue;
    lines.push('BEGIN:VEVENT', `UID:${uid(`birthday:${birthday.name}`)}`, `DTSTAMP:${stamp(updated)}`,
      `LAST-MODIFIED:${stamp(updated)}`, `SEQUENCE:${revision}`, `DTSTART;VALUE=DATE:${dayStamp(date)}`,
      `DTEND;VALUE=DATE:${dayStamp(new Date(+date + DAY))}`, 'RRULE:FREQ=YEARLY',
      `SUMMARY:${text(`${birthday.name}’s birthday`)}`, 'CATEGORIES:Operator birthdays', 'TRANSP:TRANSPARENT', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldCalendarLine).join('\r\n') + '\r\n';
}
