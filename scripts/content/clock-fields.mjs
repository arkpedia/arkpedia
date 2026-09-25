// Page data in a release is read for as long as that release is live, so it must not
// carry anything decided by the clock at export: a LIVE flag, a countdown, the day the
// export ran. Pages carry raw windows and decide at render from the request's `now`
// (lib/content/pageClock.ts). These are the fields the 2026-09-24 site sweep found
// frozen in releases, plus the clock fields contentPageClock owns. The export-worker
// clock guard (export-clock.mjs) stops new code computing them; this stops any that
// still reach a release, whatever produced it.
export const CLOCK_FIELDS = new Set([
  'now', // contentPageClock's, per request
  'buildDay', // contentPageClock's, per request (/stages/supplies)
  'asOf', // the music guesser's export date
  'isOngoing', // the Schedule's LIVE badge
  'pullBannerName', // the Schedule's "Add to Pull Planner", decided by an end date
  'pullBannerLinks', // the same lookup for the calendar panel
  'countdowns', // the Farming page's "NOW" / "N days" text
  'eventStoreCountdown',
  'lastBannerDate', // the Obtain Method last/next Limited split
  'nextScheduledDate',
]);

/** Every path in `value` whose key is a clock field, as "a.b[2].c". */
export function findClockFields(value, where = 'props') {
  if (Array.isArray(value)) return value.flatMap((item, i) => findClockFields(item, `${where}[${i}]`));
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, item]) => [
    ...(CLOCK_FIELDS.has(key) ? [`${where}.${key}`] : []),
    ...findClockFields(item, `${where}.${key}`),
  ]);
}
