// Every operator with a specifically-recorded Kernel Addition Date so
// far shares the exact same date -- a strong signal this was one bulk
// migration event that moved many older operators into Kernel-only
// status at once, rather than many separate individual decisions. Used
// as a fallback for kernel-classified operators who don't (yet) have
// their own specific date recorded, rather than treating "no recorded
// date" as "was always Kernel-exclusive," which wrongly excludes them
// from every older Featured/Limited banner's pool.
const FALLBACK_BULK_MIGRATION_DATE = '2023/10/24';

function parseDate(s: string): Date | null {
  if (!s) return null;
  const trimmed = s.trim();

  const strict = trimmed.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (strict) {
    const [, y, m, d] = strict;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    if (!isNaN(date.getTime())) return date;
  }

  const fallback = new Date(trimmed);
  if (!isNaN(fallback.getTime())) return fallback;

  return null;
}

export type KernelAdditionLookup = Record<string, string>;

/** Returns the operator's own recorded kernel-addition date if known
 * (from the lookup, built server-side from each operator's own
 * characterInfo['Kernel Addition Date']), otherwise the fallback
 * bulk-migration date as a best estimate. */
export function getKernelAdditionDate(name: string, lookup: KernelAdditionLookup): Date | null {
  const raw = lookup[name] || FALLBACK_BULK_MIGRATION_DATE;
  return raw ? parseDate(raw) : null;
}

/** Whether this operator would still have been eligible for the
 * standard pool as of the given banner date. Falls back to the bulk
 * migration date estimate when no specific date is recorded for this
 * operator, rather than assuming they were always Kernel-exclusive --
 * many current Kernel-exclusive operators debuted through Standard/
 * Featured/Limited banners and only got moved later, so an older
 * banner shouldn't exclude them just because of their CURRENT status. */
export function wasInStandardPoolAsOf(name: string, bannerDate: Date, lookup: KernelAdditionLookup): boolean {
  const additionDate = getKernelAdditionDate(name, lookup);
  if (!additionDate) return false;
  return bannerDate < additionDate;
}