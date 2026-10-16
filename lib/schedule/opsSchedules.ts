import { nextSssEnd, type SssCycle } from './sssCycle';

import { DAY_MS, getNextWeeklyReset, toServerTime, type GameServer } from '@/lib/time/servers.mjs';
export { getNextDailyReset } from '@/lib/time/servers.mjs';

const WEEKDAY = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 } as const;

export interface Reminder {
  id: string;
  text: string;
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

export function getAnnihilationNextEnd(now: Date, server: GameServer = 'en'): Date {
  return getNextWeeklyReset(now, server);
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
// Each pair lists the game weekdays whose 04:00-to-04:00 window it is
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

/** The selected server's daily-reset weekday, independent of the host clock. */
export function getCurrentResetWindowWeekday(now: Date, server: GameServer = 'en'): number {
  return toServerTime(now, server).getUTCDay();
}

export function getCurrentlyAvailableChipClasses(now: Date, server: GameServer = 'en'): string[] {
  const windowDay = getCurrentResetWindowWeekday(now, server);
  const active = new Set<string>();
  for (const pair of CHIP_SCHEDULE) {
    if (pair.days.includes(windowDay)) {
      pair.classes.forEach((c) => active.add(c));
    }
  }
  return CANONICAL_CLASS_ORDER.filter((c) => active.has(c));
}

/** What the ticker says at `now`, counting SSS down to the release's cycle. */
export function getActiveReminders(now: Date, sssCycle: SssCycle, server: GameServer = 'en'): Reminder[] {
  const reminders: Reminder[] = [];

  const annihilationEnd = getAnnihilationNextEnd(now, server);
  const annihilationDiff = annihilationEnd.getTime() - now.getTime();
  if (annihilationDiff > 0 && annihilationDiff <= REMINDER_WINDOW_MS) {
    reminders.push({ id: 'annihilation', text: `Annihilation ends in ${formatRemaining(annihilationDiff)}` });
  }

  const sssDiff = getSSSNextEnd(now, sssCycle).getTime() - now.getTime();
  if (sssDiff > 0 && sssDiff <= REMINDER_WINDOW_MS) {
    reminders.push({ id: 'sss', text: `${server === 'en' ? '' : 'Global '}SSS ends in ${formatRemaining(sssDiff)}` });
  }

  const availableClasses = getCurrentlyAvailableChipClasses(now, server);
  if (availableClasses.length > 0) {
    reminders.push({ id: 'chips', text: `${availableClasses.join(', ')} available right now!` });
  }

  return reminders;
}