import { nextSssEnd, type SssCycle } from './sssCycle';

// Reminder logic for the top-of-site announcement ticker: Annihilation
// (weekly), SSS (4-weekly), and daily chip-shop availability.
//
// CONFIRMED: every daily reset -- not just the weekly one -- happens at
// 19:00 SGT. The global server states it as 04:00 UTC-7, which is the
// same instant: neither UTC-7 nor SGT observes daylight saving, so the
// gap is a fixed 15 hours all year and the SGT hour never moves. The
// Monday reset is that same daily one; it is only called the weekly
// reset because the weekly counters roll over on it too. This was the
// only reading that made "available 24 hours each day" literally true
// for every named day, and it now has the server's own time behind it.

const SGT_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const RESET_HOUR_SGT = 19; // 7pm

const WEEKDAY = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 } as const;

// The SSS cycle is data (data/sss-cycle.json, lib/schedule/sssCycle.ts): the release carries
// it in the home page's props, so a new cycle needs no redeploy.

export interface Reminder {
  id: string;
  text: string;
}

/** Shifts a real Date so its UTC getters read as SGT wall-clock fields. */
function toSGTView(date: Date): Date {
  return new Date(date.getTime() + SGT_OFFSET_MS);
}

/** Converts SGT wall-clock fields back into the real (UTC-based) Date instant. */
function fromSGTWallClock(year: number, month: number, day: number, hour: number, minute: number): Date {
  // month here is 1-indexed to match how callers write it; Date.UTC wants 0-indexed.
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - SGT_OFFSET_MS);
}

/** Next occurrence (today if still ahead, else next week) of a given
 * SGT weekday + time. weekday uses JS's Sun=0..Sat=6 convention. */
function nextWeekdayTimeSGT(now: Date, weekday: number, hour: number, minute = 0): Date {
  const sgtNow = toSGTView(now);
  const todayWeekday = sgtNow.getUTCDay();
  let daysAhead = (weekday - todayWeekday + 7) % 7;

  const candidateSameDay = fromSGTWallClock(
    sgtNow.getUTCFullYear(),
    sgtNow.getUTCMonth() + 1,
    sgtNow.getUTCDate(),
    hour,
    minute
  );

  if (daysAhead === 0 && candidateSameDay.getTime() > now.getTime()) {
    return candidateSameDay;
  }
  if (daysAhead === 0) daysAhead = 7; // today's slot already passed -- roll to next week

  const target = new Date(candidateSameDay.getTime() + daysAhead * DAY_MS);
  return target;
}

/**
 * The next daily reset instant strictly after `now`.
 *
 * Strictly after, so the moment the clock reaches 19:00 SGT the countdown rolls to a
 * full 24 hours instead of sitting on zero or going negative.
 *
 * Adding a flat DAY_MS is exact here in a way it would not be for a local timezone:
 * both SGT and the server's stated UTC-7 are fixed offsets, so a day is always 24
 * hours and no reset is ever skipped or repeated across a DST boundary.
 */
export function getNextDailyReset(now: Date): Date {
  const sgtNow = toSGTView(now);
  const todaysReset = fromSGTWallClock(
    sgtNow.getUTCFullYear(),
    sgtNow.getUTCMonth() + 1,
    sgtNow.getUTCDate(),
    RESET_HOUR_SGT,
    0
  );
  if (todaysReset.getTime() > now.getTime()) return todaysReset;
  return new Date(todaysReset.getTime() + DAY_MS);
}

/** The server's wall clock as HH:MM. Zero-padded, so the string never changes width. */
/**
 * The offset the server's own clock is on, and the one the game shows a player.
 *
 * NOT SGT. Everything else in this file is built on 19:00 SGT and stays right, because
 * 19:00 SGT and 04:00 UTC-7 are the same instant -- neither observes daylight saving,
 * so the gap is a fixed 15 hours all year. Same instant, different CLOCK: as a time of
 * day the two are fifteen hours apart, and the nav is showing a time of day. It read
 * 21:53 while the game read 06:53, which is exactly UTC+8 against UTC-7.
 */
const SERVER_OFFSET_MS = -7 * 60 * 60 * 1000;
/** 04:00, the hour the server states its reset at. Only used by the check below. */
const RESET_HOUR_SERVER = 4;

/*
 * The invariant that keeps the two offsets honest: the reset must be the SAME INSTANT
 * described either way, or one of them has been edited without the other and the clock
 * and the countdown are telling a player two different stories. Both sides are
 * constants, so this either always throws or never does -- which means it fails at
 * build time, on the first import, rather than quietly on someone's phone.
 */
if (RESET_HOUR_SGT * 3_600_000 - SGT_OFFSET_MS !== RESET_HOUR_SERVER * 3_600_000 - SERVER_OFFSET_MS) {
  throw new Error(
    'opsSchedules: the SGT reset and the server-time reset are no longer the same instant. '
    + `19:00 SGT is ${(RESET_HOUR_SGT * 3_600_000 - SGT_OFFSET_MS) / 3_600_000}:00 UTC, `
    + `04:00 server is ${(RESET_HOUR_SERVER * 3_600_000 - SERVER_OFFSET_MS) / 3_600_000}:00 UTC.`,
  );
}

/**
 * A gap in milliseconds as "7h 46m", rounded UP to the next whole minute.
 *
 * Up, not down, because the seconds are not shown. Truncating meant "0h 00m" sat on
 * screen for the whole final minute before anything happened, so the one number a
 * reader waits on was the one that lied. Rounding up, the last minute reads "0h 01m"
 * and "0h 00m" is the reset itself.
 *
 * This is a ceiling and not a flat +1: at exactly 7h 46m 00s left it still reads
 * 7h 46m, where adding a minute unconditionally would have said 7h 47m. Only a
 * part-minute gets rounded away.
 *
 * The widest this ever renders is "24h 00m" -- seven characters, the same as
 * "23h 59m" -- which shows for the first minute after a reset, when the gap to the
 * next one is a shade under a full day. .site-nav-clock-reset is sized for it.
 *
 * Floored at zero rather than allowed to run negative, in case a clock that is a
 * second or two fast crosses the target early.
 */
export function formatCountdown(ms: number): string {
  const totalMinutes = Math.ceil(Math.max(0, ms) / 60_000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

export function getAnnihilationNextEnd(now: Date): Date {
  return nextWeekdayTimeSGT(now, WEEKDAY.MON, RESET_HOUR_SGT);
}

/** When the current SSS cycle ends. The cycle is the release's (data/sss-cycle.json), handed
 *  in by the caller: required, so nothing falls back on a date compiled into the bundle. */
export function getSSSNextEnd(now: Date, cycle: SssCycle): Date {
  return nextSssEnd(now, cycle);
}

const REMINDER_WINDOW_MS = 3 * DAY_MS;

/** "3 days" / "1 hour" / "45 minutes" -- unit steps down once the
 * remaining time drops below the previous unit's threshold, per spec:
 * days while >=24h, hours while under a day, minutes once under an hour. */
export function formatRemaining(ms: number): string {
  if (ms >= DAY_MS) {
    const days = Math.ceil(ms / DAY_MS);
    return `${days} day${days === 1 ? '' : 's'}`;
  }
  if (ms >= 60 * 1000) {
    const hours = ms / (60 * 60 * 1000);
    if (hours >= 1) {
      const wholeHours = Math.ceil(hours);
      return `${wholeHours} hour${wholeHours === 1 ? '' : 's'}`;
    }
    const minutes = Math.max(1, Math.ceil(ms / (60 * 1000)));
    return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  }
  return 'under a minute';
}

// --- Chip shop schedule -----------------------------------------------
// Each pair lists the SGT weekdays whose 19:00-to-19:00 window it's
// available in. Canonical class order below is used to keep the
// combined "available right now" message stable regardless of which
// pairs happen to be active.
const CHIP_SCHEDULE: { classes: [string, string]; days: number[] }[] = [
  { classes: ['Medic', 'Defender'], days: [WEEKDAY.MON, WEEKDAY.THU, WEEKDAY.FRI, WEEKDAY.SUN] },
  { classes: ['Caster', 'Sniper'], days: [WEEKDAY.MON, WEEKDAY.TUE, WEEKDAY.FRI, WEEKDAY.SUN] },
  { classes: ['Vanguard', 'Support'], days: [WEEKDAY.WED, WEEKDAY.THU, WEEKDAY.SAT, WEEKDAY.SUN] },
  { classes: ['Guard', 'Specialist'], days: [WEEKDAY.TUE, WEEKDAY.WED, WEEKDAY.SAT, WEEKDAY.SUN] },
];

const CANONICAL_CLASS_ORDER = [
  'Medic',
  'Defender',
  'Caster',
  'Sniper',
  'Vanguard',
  'Support',
  'Guard',
  'Specialist',
];

/** Which weekday's 19:00-SGT-to-19:00-SGT reset window "now" falls in. */
export function getCurrentResetWindowWeekday(now: Date): number {
  const sgt = toSGTView(now);
  const weekday = sgt.getUTCDay();
  if (sgt.getUTCHours() >= RESET_HOUR_SGT) return weekday;
  return (weekday + 6) % 7; // still inside yesterday's window
}

export function getCurrentlyAvailableChipClasses(now: Date): string[] {
  const windowDay = getCurrentResetWindowWeekday(now);
  const active = new Set<string>();
  for (const pair of CHIP_SCHEDULE) {
    if (pair.days.includes(windowDay)) {
      pair.classes.forEach((c) => active.add(c));
    }
  }
  return CANONICAL_CLASS_ORDER.filter((c) => active.has(c));
}

/** What the ticker says at `now`, counting SSS down to the release's cycle. */
export function getActiveReminders(now: Date, sssCycle: SssCycle): Reminder[] {
  const reminders: Reminder[] = [];

  const annihilationEnd = getAnnihilationNextEnd(now);
  const annihilationDiff = annihilationEnd.getTime() - now.getTime();
  if (annihilationDiff > 0 && annihilationDiff <= REMINDER_WINDOW_MS) {
    reminders.push({ id: 'annihilation', text: `Annihilation ends in ${formatRemaining(annihilationDiff)}` });
  }

  const sssDiff = getSSSNextEnd(now, sssCycle).getTime() - now.getTime();
  if (sssDiff > 0 && sssDiff <= REMINDER_WINDOW_MS) {
    reminders.push({ id: 'sss', text: `SSS ends in ${formatRemaining(sssDiff)}` });
  }

  const availableClasses = getCurrentlyAvailableChipClasses(now);
  if (availableClasses.length > 0) {
    reminders.push({ id: 'chips', text: `${availableClasses.join(', ')} available right now!` });
  }

  return reminders;
}