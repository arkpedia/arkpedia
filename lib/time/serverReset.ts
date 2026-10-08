/** Fixed server offsets: EN UTC−7, JP/KR UTC+9; daily reset 04:00. */
export function serverClockAt(now: Date, server: string = 'en') {
  const offset = server === 'jp' || server === 'kr' ? 9 : -7;
  const local = new Date(now.getTime() + offset * 3_600_000);
  const reset = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 4) - offset * 3_600_000;
  return { clock: local.toISOString().slice(11, 16), reset: reset > now.getTime() ? reset : reset + 86_400_000, offset };
}
