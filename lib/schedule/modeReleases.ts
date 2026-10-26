import { serverDayBoundary } from '@/lib/time/servers.mjs';
import type { ScheduleEvent } from './scheduleTypes';
import type { EventRow, EventRowView } from './eventRows';

const DAY = 86_400_000;
/** A launch occupies one calendar day; the permanent mode has no invented close. */
export function scheduleModeRelease(event: ScheduleEvent, gapDays: number): ScheduleEvent {
  if (!event.modeId) return event;
  const cnDate = event.cn.releaseDate;
  const predicted = !event.global.releaseDate && cnDate;
  const estimated = predicted ? new Date(Date.parse(`${cnDate.replaceAll('/', '-')}T00:00:00Z`) + gapDays * DAY).toISOString().slice(0, 10).replaceAll('-', '/') : null;
  const globalDate = event.global.releaseDate ?? estimated;
  const forCalendar = (region: ScheduleEvent['global'], date: string | null | undefined) => ({ ...region, dateRange: date ? `${date}–${date}` : null });
  return {
    ...event,
    cn: forCalendar(event.cn, cnDate),
    global: { ...forCalendar(event.global, globalDate), ...(predicted ? { releaseDate: globalDate!, note: 'ESTIMATED Global launch, not officially confirmed' } : {}) },
    tw: forCalendar(event.tw, event.tw.releaseDate),
  };
}
export function modeReleaseRow(event: ScheduleEvent): EventRow | null {
  if (!event.modeId || !event.global.releaseDate) return null;
  const date = event.global.releaseDate;
  // A forecast is a calendar day, with the same default launch hour as events.
  const start = event.global.startAt ? Date.parse(event.global.startAt) : serverDayBoundary(Date.parse(`${date.replaceAll('/', '-')}T00:00:00Z`), 'en', 'event');
  if (!Number.isFinite(start)) return null;
  return { name: event.name, poster: event.poster, dateRange: date, isPredicted: /estimated|predicted/i.test(event.global.note ?? ''), start, end: start + DAY, modeId: event.modeId, pullBanner: null, featuredOperators: [] };
}

/** Add only new permanent-mode identities. Never override a published window. */
export function mergeMissingModeLaunches<P extends { events: ScheduleEvent[]; eventRows: (EventRow | EventRowView)[] }>(props: P, launches: readonly ScheduleEvent[]): P {
  const ids = new Set(props.events.map(event => event.modeId));
  const names = new Set(props.events.map(event => event.name));
  const missing = launches.filter(event => event.modeId && !ids.has(event.modeId) && !names.has(event.name));
  if (!missing.length) return props;
  const rowIds = new Set(props.eventRows.map(row => row.modeId));
  const rowNames = new Set(props.eventRows.map(row => row.name));
  const rows = missing.flatMap(event => { const row = modeReleaseRow(event); return row && !rowIds.has(row.modeId) && !rowNames.has(row.name) ? [row] : []; });
  return { ...props, events: [...props.events, ...missing], eventRows: [...props.eventRows, ...rows].sort((a, b) => ('start' in a ? a.start : 0) - ('start' in b ? b.start : 0)) };
}
