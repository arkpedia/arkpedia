/** Explicit instants use ISO 8601 with a timezone; endAt is exclusive. */
export interface GameWindowTimes {
  startAt?: string;
  endAt?: string;
  timingSource?: string;
}

function instant(value: string | undefined): Date | null {
  if (!value || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

/** Date-only legacy records use a server-time estimate, never the host timezone.
 * Global event releases normally open at 08:00 UTC-7; routine pools at 04:00.
 * Exact announcement/client times always take precedence over those defaults.
 */
export function parseGameWindow(range: string | null | undefined, times: GameWindowTimes = {}, region: 'global' | 'cn' = 'global', routinePool = false): { start: Date; end: Date } | null {
  const match = range?.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})\s*[–-]\s*(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\s*;.*)?$/);
  const day = (offset: number, hour: number): Date | null => {
    if (!match) return null;
    const y = +match[offset], m = +match[offset + 1], d = +match[offset + 2];
    const midnight = new Date(Date.UTC(y, m - 1, d));
    if (midnight.getUTCFullYear() !== y || midnight.getUTCMonth() !== m - 1 || midnight.getUTCDate() !== d) return null;
    return new Date(midnight.getTime() + hour * 3600000);
  };
  // CN reset is 04:00 UTC+8, or 20:00 UTC on the preceding calendar day.
  const start = times.startAt ? instant(times.startAt) : day(1, region === 'global' ? (routinePool ? 11 : 15) : (routinePool ? -4 : 8));
  const end = times.endAt ? instant(times.endAt) : day(4, region === 'global' ? 11 : -4);
  return start && end && start < end ? { start, end } : null;
}

export function windowCountdown(start: Date, end: Date, now: Date): { label: 'Starts in' | 'Ends in' | 'Ended'; remaining: number } {
  if (now < start) return { label: 'Starts in', remaining: start.getTime() - now.getTime() };
  if (now < end) return { label: 'Ends in', remaining: end.getTime() - now.getTime() };
  return { label: 'Ended', remaining: 0 };
}
