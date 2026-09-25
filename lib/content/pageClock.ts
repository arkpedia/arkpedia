import { serverWeekday } from '@/lib/time/serverDay';

/** Presentation clocks belong to the request, not to a versioned game record.
 *
 * A page listed here receives `now` (and /stages/supplies `buildDay`) on every
 * request, so it can export raw windows and decide "ongoing", "released" or
 * "N days" at render. Anything decided in the data builder instead is decided
 * once, at content export, and stays that way until the next release: the
 * export-worker clock guard (scripts/content/export-clock.mjs) refuses it.
 */
const CLOCK_UNITS: Record<string, number> = {
  '/operators': 60_000,
  '/skins': 60_000,
  '/stages': 1000,
  '/stages/all': 1000,
  '/stages/browse': 1000,
  '/stages/regular': 1000,
  '/schedule': 60_000,
  '/farming': 60_000,
  '/obtain-method': 60_000,
  '/enemies': 60_000,
  '/games/color-palette': 60_000,
  '/games/music-guesser': 60_000,
};

/** The props contentPageClock owns. A page's data builder never sets them. */
export type PageClockField = 'now' | 'buildDay';

/** Either the moment of this request, or an export, which must stay clock-free. */
export type PageClockMoment = { now: number } | { exporting: true };

export function contentPageClock<P extends object>(route: string, props: P, moment: PageClockMoment): P {
  const unit = CLOCK_UNITS[route];
  const supplies = route === '/stages/supplies';
  if (!unit && !supplies) return props;
  // Clone: cached payloads and concurrent requests must remain independent.
  const result = { ...props } as P & { now?: number; buildDay?: string };
  if ('exporting' in moment) {
    delete result.now;
    if (supplies) delete result.buildDay;
  } else {
    const { now } = moment;
    if (unit) result.now = unit === 1000 ? Math.floor(now / 1000) : Math.floor(now / unit) * unit;
    if (supplies) result.buildDay = serverWeekday(new Date(now));
  }
  return result;
}
