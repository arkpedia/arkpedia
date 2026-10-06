/**
 * Reading an event record (data/events/events_<year>.json) the one way the event pipeline does:
 * its name without the bracketed kind, whether it is a rerun, and when it runs in a region.
 *
 * build-event-rewards.mjs, sync-event-stores.mjs and sync-reward-names.mjs each had their own
 * copy of these, and the copies had drifted: two exported globalStart()s, one in seconds from
 * the dateRange alone and one in milliseconds that honoured the client's startAt, a cnStart()
 * beside them, a fourth reading of the same dateRange that took neither region's offset, and
 * three tests of "is this a rerun" -- one of which took only the "[Rerun]" prefix, so a record
 * named "X Rerun" was a rerun to the store sync and an original run to the rewards build.
 */

const HOUR = 3_600_000;
/* The hour each region's calendar day starts, as an offset from UTC midnight: a Global date is
   a UTC-7 day (the server's), a CN date a UTC+8 one. */
const DAY_STARTS = { Global: 7 * HOUR, CN: -8 * HOUR };
/* An event closes at the server's daily reset, 04:00, on its last date: what the records' exact
   endAt says wherever they hold one (Global 11:00 UTC, CN 20:00 UTC the day before), and what the
   site's own countdowns take a date for (parseGameWindow, lib/schedule/gameWindow.ts). */
const RESET = 4 * HOUR;

/** The event's name without its "[Side Story]"-style prefix: "[Side Story – Festival] Invitation to Wine". */
export const eventTitle = name => String(name ?? '').replace(/^\s*\[[^\]]*\]\s*/, '').trim();

/** A rerun, by either way the records name one: the "[Rerun]" prefix or the " Rerun" suffix
 *  ("[Rerun] Path of Life Rerun", "Invitation to Wine Rerun"). */
export const isRerun = name => /^\s*\[Rerun\]/i.test(String(name ?? '')) || /\sRerun\s*$/.test(String(name ?? ''));

/**
 * When the event runs in `region` ('Global' or 'CN'), as { start, end } instants in
 * milliseconds, or null when the record gives that region no date. An exact instant the record
 * holds (startAt / endAt: the client's window, or the hour an official notice names) is taken as
 * it is; otherwise it starts the instant its first date starts in the region, and ends at the
 * reset on its last date. A dateRange of one date ends at the reset that closes that day. The end
 * was once the instant the last date started, four hours early: the store sync's `running` read an
 * event's last hours as over, and a store page missing then went unreported.
 */
export function eventWindow(event, region) {
  if (!(region in DAY_STARTS)) throw new Error(`eventWindow needs the region, 'Global' or 'CN': ${region}`);
  const record = region === 'Global' ? event?.global : event?.cn;
  const days = [...String(record?.dateRange ?? '').matchAll(/(\d{4})\/(\d{2})\/(\d{2})/g)]
    .map(m => Date.UTC(+m[1], +m[2] - 1, +m[3]) + DAY_STARTS[region]);
  const exact = value => (value && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null);
  const start = exact(record?.startAt) ?? days[0] ?? null;
  if (start === null) return null;
  const last = days.length > 1 ? days[1] + RESET : days.length ? days[0] + 24 * HOUR + RESET : start;
  return { start, end: exact(record?.endAt) ?? last };
}
