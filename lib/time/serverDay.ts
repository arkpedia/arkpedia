/**
 * The Arknights Global server's own day, which is not the reader's.
 *
 * The server rolls over at 04:00 UTC-7, which is 11:00 UTC and never shifts: the game
 * does not observe daylight saving. So for eleven hours of every UTC day the server is
 * still on the previous one, and anywhere ahead of UTC-7 a reader can be well into
 * Sunday while the game is still running Saturday's rotation. That is a real report,
 * not a hypothetical, and it made the Supplies page name the wrong open operation.
 *
 * Everything that answers "what day is it in the game" has to come through here. The
 * same constant is written out in prose in lib/home/frontPageContent.ts, which parses event
 * windows against it.
 */

/** Hours the server's day runs behind UTC. 04:00 UTC-7 is 11:00 UTC. */
const SERVER_DAY_OFFSET_HOURS = 11;

/** Monday first, matching WEEKDAYS in lib/stages/stageTypes.ts. */
const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/**
 * The moment shifted back to where the server's clock is, so ordinary UTC getters read
 * out the server's own date and weekday.
 */
export function toServerTime(now: Date = new Date()): Date {
  return new Date(now.getTime() - SERVER_DAY_OFFSET_HOURS * 3600 * 1000);
}

/**
 * The game's calendar date, YYYY-MM-DD, for comparing against the Global release
 * dates records carry (a group or event dated "2026-10-14" is out once the server's
 * 2026-10-14 begins, not at the reader's or UTC midnight).
 */
export function serverDate(now: Date): string {
  return toServerTime(now).toISOString().slice(0, 10);
}

/**
 * The weekday the game is on, as a name from WEEKDAYS.
 *
 * getUTCDay, not getDay: the shifted moment is only meaningful read in UTC, and reading
 * it in the reader's zone would put their offset back in on top of the server's.
 */
export function serverWeekday(now: Date = new Date()): string {
  const shifted = toServerTime(now);
  /* getUTCDay is Sunday-first and WEEKDAYS is Monday-first. */
  return WEEKDAY_NAMES[(shifted.getUTCDay() + 6) % 7];
}
