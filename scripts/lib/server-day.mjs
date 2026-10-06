/**
 * The calendar day a game server's clock reads at an instant, the way the catalogue dates
 * records ("2026/10/09"): CN runs on UTC+8, Global on UTC-7. Every server-day string the
 * catalogue writes or compares comes from here -- the CN announcements (scripts/build/cn-news.mjs),
 * which give their windows in CN hours, the client's activity and pool times
 * (scripts/sync/catalogue-model.mjs), and the client windows scripts/sync/sync-event-windows.mjs
 * copies onto the calendars -- so an announced window and the client's are one string for one
 * day (test-game-countdowns.ts holds every script to this one). This is the calendar date at the
 * server's offset, not the game's 04:00 rollover (lib/time/serverDay.ts, which the site's "what
 * day is it in the game" goes through).
 */

/** The server day of `ts` (Unix seconds), "YYYY/MM/DD", at `offset` hours from UTC (CN's +8 by default). */
export const serverDay = (ts, offset = 8) => new Date((ts + offset * 3600) * 1000).toISOString().slice(0, 10).replaceAll('-', '/');
