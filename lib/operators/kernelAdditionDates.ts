import { serverDayBoundary } from '@/lib/time/servers.mjs';
// Every operator with a specifically-recorded Kernel Addition Date so
// far shares the exact same date -- a strong signal this was one bulk
// migration event that moved many older operators into Kernel-only
// status at once, rather than many separate individual decisions. Used
// as a fallback for kernel-classified operators who don't (yet) have
// their own specific date recorded, rather than treating "no recorded
// date" as "was always Kernel-exclusive," which wrongly excludes them
// from every older Featured/Limited banner's pool.
const FALLBACK_BULK_MIGRATION_DATE = '2023/10/24';

/**
 * The instant a recorded Kernel Addition Date ("2026/10/09") took effect: that Global server
 * day's reset, 04:00 UTC-7, when the banner that moved the operators opened (the date convention
 * of scripts/sync/kernel-pool.mjs). Banner windows are instants too (parseGameWindow), so a
 * banner that opens that morning is after the move and one that closed at that reset is before
 * it, whatever the reader's time zone; a local midnight put a Kernel banner that ended the
 * morning of a move on both sides of it. Null for "N/A", a blank or anything unparseable.
 */
export function kernelMoveInstant(s: string | null | undefined): Date | null {
  if (!s) return null;
  const trimmed = s.trim();
  if (!trimmed || trimmed.toUpperCase() === 'N/A') return null;
  const strict = trimmed.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  const day = strict ? Date.UTC(Number(strict[1]), Number(strict[2]) - 1, Number(strict[3])) : Date.parse(`${trimmed} UTC`);
  return Number.isFinite(day) ? new Date(serverDayBoundary(day, 'en', 'reset')) : null;
}

export type KernelAdditionLookup = Record<string, string>;

/** Returns the operator's own recorded kernel-addition date if known
 * (from the lookup, built server-side from each operator's own
 * characterInfo['Kernel Addition Date']), otherwise the fallback
 * bulk-migration date as a best estimate. */
export function getKernelAdditionDate(name: string, lookup: KernelAdditionLookup): Date | null {
  return kernelMoveInstant(lookup[name] || FALLBACK_BULK_MIGRATION_DATE);
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

/** Whether a kernel-exclusive operator was in the Kernel pool at any time while a banner ran:
 *  moved before the banner closed (isEligibleForKernelBanner says why the close, not the
 *  opening). Without a known close, the opening decides. Same fallback date as above. */
export function wasInKernelPoolDuring(name: string, start: Date, end: Date | null, lookup: KernelAdditionLookup): boolean {
  const additionDate = getKernelAdditionDate(name, lookup);
  if (!additionDate) return false;
  return end ? additionDate < end : start >= additionDate;
}
