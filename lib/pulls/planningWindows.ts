import { DAY_MS, parseInstant, serverDayBoundary, type GameServer } from '@/lib/time/servers.mjs';
import { parseGameRangeDays } from '@/lib/schedule/gameWindow';

/** Date-only planning labels are inclusive calendar dates in their owning server. */
export function planningDayEnd(day: string, server: GameServer = 'en'): number {
  const text = day.replaceAll('-', '/');
  const date = parseGameRangeDays(`${text}–${text}`)?.start;
  return date ? serverDayBoundary(Date.UTC(date.year, date.month - 1, date.day) + DAY_MS, server) : NaN;
}

/** Exact source closes are exclusive. Missing instants retain the legacy inclusive
 * day convention; a malformed supplied instant must not revive a closed window. */
export function planningWindowEnd(window: { end: string; endAt?: string; server?: GameServer }): number {
  return window.endAt === undefined ? planningDayEnd(window.end, window.server) : parseInstant(window.endAt)?.getTime() ?? NaN;
}

/** A goal on a banner's last date must forecast only until that banner actually closes. */
export function planningDeadline(window: { end: string; endAt?: string; server?: GameServer }, day: string): Date {
  return new Date(Math.min(planningDayEnd(day, window.server), planningWindowEnd(window)) - 1);
}
