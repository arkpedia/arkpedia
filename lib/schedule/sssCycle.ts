/**
 * The Stationary Security Service cycle the announcement ticker counts down to.
 *
 * data/sss-cycle.json, a record kept by hand in arkpedia-data and carried in the home page's
 * props (lib/content/tables.mjs), because the game data has only the four-month seasons. It was a date typed into lib/schedule/opsSchedules.ts, so a new or shifted cycle
 * needed a code change and a redeploy.
 */
export interface SssCycle {
  version: 1;
  /** The end of one cycle, as an ISO instant. Any cycle's end works; the rest follow from it. */
  cycleEnd: string;
  /** How long every cycle runs. */
  periodDays: number;
}

/** The shape, checked wherever the table is read from data/ (build prerender, content export). */
export function checkSssCycle<T>(value: T): T & SssCycle {
  const cycle = value as unknown as Partial<SssCycle>;
  if (cycle?.version !== 1 || typeof cycle.cycleEnd !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/.test(cycle.cycleEnd)
    || !Number.isFinite(Date.parse(cycle.cycleEnd)) || !Number.isInteger(cycle.periodDays) || (cycle.periodDays ?? 0) < 1) {
    throw new Error('data/sss-cycle.json is not {"version":1,"cycleEnd":"<ISO instant with offset>","periodDays":<whole days>}');
  }
  return value as T & SssCycle;
}

/** The next cycle end at or after `now`: the anchor itself while it is still ahead. */
export function nextSssEnd(now: Date, cycle: SssCycle): Date {
  const anchor = Date.parse(cycle.cycleEnd);
  const period = cycle.periodDays * 86_400_000;
  if (now.getTime() <= anchor) {
    // An anchor far ahead still names the cycle that ends first after now.
    return new Date(anchor - Math.floor((anchor - now.getTime()) / period) * period);
  }
  return new Date(anchor + Math.ceil((now.getTime() - anchor) / period) * period);
}
