import type { ScheduleEvent } from './scheduleTypes';
import type { EventRow } from './eventRows';

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
  const start = Date.parse(event.global.startAt ?? `${date.replaceAll('/', '-')}T15:00:00Z`);
  if (!Number.isFinite(start)) return null;
  return { name: event.name, poster: event.poster, dateRange: date, isPredicted: /estimated|predicted/i.test(event.global.note ?? ''), start, end: start + DAY, modeId: event.modeId, pullBanner: null, featuredOperators: [] };
}
