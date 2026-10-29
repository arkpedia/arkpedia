// Page data in a release is read for as long as that release is live, so it must not
// carry anything decided by the clock at export: a LIVE flag, a countdown, the day the
// export ran. Pages carry raw windows and decide at render from the request's `now`
// (lib/content/pageClock.ts). These are the fields the 2026-09-24 site sweep found
// frozen in releases, plus the clock fields contentPageClock owns. The export-worker
// clock guard (export-clock.mjs) stops new code computing them, and the build scripts
// export.mjs runs are held to the same guard (export-build.mjs); this stops any that
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

/*
 * Where a clock field is a builder's decision rather than a record's own field. A name alone
 * cannot tell them apart below the top level: page props also carry records copied from
 * arkpedia-data (the calendar's events, the tables in __contentTables), and a record that
 * one day gains a field called 'now' or 'isOngoing' must not block the daily release. So:
 *
 * - every clock field among a page's own top-level props, which are the route's view model
 *   and never a copied record;
 * - below that, only the derived places the sweep found, per route. '[]' is any list item,
 *   '*' any key.
 */
export const DERIVED_CLOCK_PATHS = {
  '/schedule': ['eventRows[].isOngoing', 'eventRows[].pullBannerName'],
  '/obtain-method': ['limitedBannerInfo.*.lastBannerDate', 'limitedBannerInfo.*.nextScheduledDate'],
  '/operators': ['limitedBannerInfo.*.lastBannerDate', 'limitedBannerInfo.*.nextScheduledDate'],
};

/*
 * The release's public JSON that a build script writes as its own object
 * (scripts/content/export.mjs runs them): their top-level keys are the script's choice, as
 * a page's props are. The rest of release/public is records (stage and enemy details,
 * lyrics, planner data) and is not searched by name.
 */
export const BUILD_OUTPUTS = ['music-catalogue.json', 'operator-search.json', 'site-search.json', 'stage-guesser/catalogue.json', 'stage-guesser/manifest.json'];

const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const topLevel = (value, where) => (plain(value) ? Object.keys(value).filter(key => CLOCK_FIELDS.has(key)).map(key => `${where}.${key}`) : []);

/** Every place `path` ("a[].b.*.c") reaches in `value` that holds a value, as "a[2].b.x.c". */
function reach(value, steps, where) {
  if (!steps.length) return [where];
  const [step, ...rest] = steps;
  if (step === '[]') return Array.isArray(value) ? value.flatMap((item, i) => reach(item, rest, `${where}[${i}]`)) : [];
  if (!plain(value)) return [];
  if (step === '*') return Object.entries(value).flatMap(([key, item]) => reach(item, rest, `${where}.${key}`));
  return Object.hasOwn(value, step) ? reach(value[step], rest, `${where}.${step}`) : [];
}
const parse = path => path.split(/\.|(?=\[\])/).flatMap(part => (part.endsWith('[]') && part !== '[]' ? [part.slice(0, -2), '[]'] : [part])).filter(Boolean);

/** The clock-derived values in one page's props, as "props.a.b". `route` is the page's
 * concrete route (the manifest's key), which names its derived paths. */
export function findClockFields(props, route) {
  if (typeof route !== 'string' || !route.startsWith('/')) throw new Error(`findClockFields needs the page's route, got ${route}`);
  return [
    ...topLevel(props, 'props'),
    ...(DERIVED_CLOCK_PATHS[route] ?? []).flatMap(path => reach(props, parse(path), 'props')),
  ];
}

/** The clock-derived values in one release/public file (its name under public/), or none
 * for a file that holds records. */
export function findPublicClockFields(value, file) {
  return BUILD_OUTPUTS.includes(file) ? topLevel(value, file) : [];
}
