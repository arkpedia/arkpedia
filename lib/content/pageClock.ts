import { serverWeekday } from '@/lib/time/serverDay';

/** Presentation clocks belong to the request, not to a versioned game record. */
const CLOCK_UNITS: Record<string, number> = {
  '/operators': 60_000,
  '/skins': 60_000,
  '/stages': 1000,
  '/stages/all': 1000,
  '/stages/browse': 1000,
  '/stages/regular': 1000,
};

export function contentPageClock<P extends object>(route: string, props: P, exporting = false, now = Date.now()): P {
  const unit = CLOCK_UNITS[route];
  const supplies = route === '/stages/supplies';
  if (!unit && !supplies) return props;
  // Clone: cached payloads and concurrent requests must remain independent.
  const result = { ...props } as P & { now?: number; buildDay?: string };
  if (exporting) {
    delete result.now;
    if (supplies) delete result.buildDay;
  } else {
    if (unit) result.now = unit === 1000 ? Math.floor(now / 1000) : Math.floor(now / unit) * unit;
    if (supplies) result.buildDay = serverWeekday(new Date(now));
  }
  return result;
}
