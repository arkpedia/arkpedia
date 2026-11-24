import { pageCatalogue } from '@/lib/routes/catalogue.cjs';
import { serverWeekday } from '@/lib/time/servers.mjs';

/** Presentation clocks belong to the request, not to a versioned game record.
 *
 * A page listed here receives `now` (and /stages/supplies `buildDay`) on every
 * request, so it can export raw windows and decide "ongoing", "released" or
 * "N days" at render. Anything decided in the data builder instead is decided
 * once, at content export, and stays that way until the next release: the
 * export-worker clock guard (scripts/content/export-clock.mjs) refuses it.
 */
const clocks = new Map(pageCatalogue.flatMap(page =>
  page.key && page.clock ? [[page.key, { unit: page.clock, serverDay: page.serverDay }] as const] : []));

export const CLOCK_ROUTES: readonly string[] = [...clocks.keys()];

/** The props contentPageClock owns. A page's data builder never sets them. */
export type PageClockField = 'now' | 'buildDay';

/** Either the moment of this request, or an export, which must stay clock-free. */
export type PageClockMoment = { now: number } | { exporting: true };

export function contentPageClock<P extends object>(route: string, props: P, moment: PageClockMoment): P {
  const clock = clocks.get(route);
  if (!clock) return props;
  // Clone: cached payloads and concurrent requests must remain independent.
  const result = { ...props } as P & { now?: number; buildDay?: string };
  if ('exporting' in moment) {
    delete result.now;
    if (clock.serverDay) delete result.buildDay;
  } else {
    const { now } = moment;
    result.now = clock.unit === 'second' ? Math.floor(now / 1000) : Math.floor(now / 60_000) * 60_000;
    if (clock.serverDay) result.buildDay = serverWeekday(new Date(now));
  }
  return result;
}
