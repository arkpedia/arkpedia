// The content export runs every page's data builder once and publishes the result
// until the next release. Anything a builder derives from the clock ("LIVE", "34
// days", the operators released so far) is therefore frozen at the export's moment
// and drifts from then on; the site sweep of 2026-09-24 found eight pages doing it.
// Pages export raw windows instead and decide at render from the request's `now`
// (lib/content/pageClock.ts). This guard makes a clock read by page code during
// export an error, so the class cannot come back unnoticed.

/**
 * Routes that still decide release state at export, each a known follow-up from the
 * sweep. A listed route that stops reading the clock fails too, so the list only
 * shrinks.
 */
export const KNOWN_EXPORT_CLOCK_READS = {
  '/operators/[name]': 'related-operator cards judge isFuture at export (pages/operators/[name].tsx)',
  '/planner': 'the operator picker keeps only operators released at export (pages/planner.tsx)',
};

/**
 * The same for the build scripts scripts/content/export.mjs runs before the pages, whose
 * public JSON the release publishes beside them (export-build.mjs runs each under this
 * guard). Each entry is a known follow-up; the list only shrinks.
 */
export const KNOWN_BUILD_CLOCK_READS = {
  'scripts/build/build-operator-search.ts': 'isFuture, which picks the header search icon folder, is judged when operator-search.json is built',
  'scripts/build/build-stage-guesser.ts': 'the catalogue keeps the stages released by the day it is built (lib/minigames/stageGuesserData.ts)',
};

/**
 * Replaces the global Date so that `Date.now()`, `new Date()` and `Date()` called from
 * page code are refused. `isPageFrame(frame)` decides from one stack frame whether the
 * caller is page code (the bundle, or with source maps the repo's own sources) rather
 * than Node or a dependency, whose own timing is none of this guard's business.
 * Reads are recorded as well as refused: a builder that catches the error must not
 * hide it. With `refuse: false` (a KNOWN_EXPORT_CLOCK_READS route) they are only
 * recorded. Returns the recorded reads and a function that restores Date.
 */
export function guardExportClock(isPageFrame, { refuse = true } = {}) {
  const RealDate = globalThis.Date;
  const reads = [];
  const check = () => {
    // [0] "Error", [1] check, [2] the Date entry point, [3] its caller.
    const frame = (new Error().stack ?? '').split('\n')[3]?.trim() ?? '';
    if (!isPageFrame(frame)) return;
    reads.push(frame);
    if (refuse) throw new Error(`Content export read the clock ${frame}. Export raw windows and decide at render from the request's \`now\` (lib/content/pageClock.ts).`);
  };
  function ExportDate(...args) {
    if (!new.target) { check(); return RealDate(); }
    if (args.length === 0) check();
    return Reflect.construct(RealDate, args, new.target);
  }
  Object.setPrototypeOf(ExportDate, RealDate);
  ExportDate.prototype = RealDate.prototype;
  ExportDate.now = function now() { check(); return RealDate.now(); };
  globalThis.Date = ExportDate;
  return { reads, restore: () => { globalThis.Date = RealDate; } };
}

/** The verdict for one build script (its path from the repository root), as for a route. */
export function buildClockVerdict(script, reads) {
  const known = Object.hasOwn(KNOWN_BUILD_CLOCK_READS, script);
  if (known && reads.length === 0) return `${script} no longer reads the clock at export: remove it from KNOWN_BUILD_CLOCK_READS in scripts/content/export-clock.mjs.`;
  if (known || reads.length === 0) return null;
  const sites = [...new Set(reads)];
  return `${script} read the clock ${reads.length} time(s) during content export, which freezes that moment into the release's public data:\n  ${sites.slice(0, 10).join('\n  ')}`;
}

/** The verdict for one route: an error message, or null when it is clean. */
export function exportClockVerdict(route, reads) {
  const known = Object.hasOwn(KNOWN_EXPORT_CLOCK_READS, route);
  if (known && reads.length === 0) return `${route} no longer reads the clock at export: remove it from KNOWN_EXPORT_CLOCK_READS in scripts/content/export-clock.mjs.`;
  if (known || reads.length === 0) return null;
  const sites = [...new Set(reads)];
  return `${route} read the clock ${reads.length} time(s) during content export, which freezes that moment into the release:\n  ${sites.slice(0, 10).join('\n  ')}`;
}
