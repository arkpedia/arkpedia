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
  if (!unit) return props;
  // Clone: cached payloads and concurrent requests must remain independent.
  const result = { ...props } as P & { now?: number };
  if (exporting) delete result.now;
  else result.now = unit === 1000 ? Math.floor(now / 1000) : Math.floor(now / unit) * unit;
  return result;
}
