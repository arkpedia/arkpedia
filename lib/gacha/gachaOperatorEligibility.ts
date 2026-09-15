/**
 * Gacha pool eligibility, derived entirely from each operator's own
 * howToObtain flags plus their release date and (if applicable) kernel
 * addition date -- no separate classification file needed.
 *
 * The rules, as specified:
 * 1. An operator can appear in a KERNEL banner only if Kernel
 *    Headhunting is "Yes", and only once they've actually released.
 * 2. An operator with BOTH Standard Headhunting and Kernel Headhunting
 *    set to "Yes" exists in both banner types simultaneously, with no
 *    date transition involved beyond having released -- Kernel
 *    Addition Date genuinely doesn't apply to them (that's why it
 *    shows up as "N/A" in the data for operators like this).
 * 3. An operator can appear in a NON-kernel banner if Standard
 *    Headhunting is "Yes" and they've released.
 * 4. An operator who is Kernel Headhunting: "Yes" but Standard
 *    Headhunting: "No" (genuinely kernel-EXCLUSIVE) can still appear
 *    in non-kernel banners, but only for banners dated BEFORE their
 *    Kernel Addition Date -- i.e. banners that ran while they were
 *    still in the standard pool, before they were moved to
 *    kernel-only status.
 */

import { HowToObtainInfo, HowToObtainValue } from '@/lib/operators/operatorTypes';

// Re-exported under this file's original name so nothing importing
// HowToObtain from here needs to change -- this now just aliases the
// single shared definition in operatorTypes.ts instead of maintaining
// a second, separately-typed copy of the same real-world shape (which
// is exactly how this file's version drifted out of sync with the new
// Welfare object schema in the first place).
export type HowToObtain = HowToObtainInfo;

/**
 * Parses a date string robustly -- tries strict, unambiguous
 * YYYY/MM/DD or YYYY-MM-DD first, falls back to JS's native flexible
 * parser for other formats (e.g. "October 24, 2023"), and validates
 * the result before trusting it. Returns null for "N/A", empty
 * strings, or anything that doesn't parse to a real date, rather than
 * silently producing an Invalid Date that would make every downstream
 * comparison quietly return false.
 */
export function parseOperatorDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const trimmed = s.trim();
  if (!trimmed || trimmed.toUpperCase() === 'N/A') return null;

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

function isYes(value: HowToObtainValue | undefined): boolean {
  return value === 'Yes';
}

/**
 * Whether this operator would have released by the given date.
 * Unknown release date -> not eligible, rather than assumed always
 * available.
 */
export function hasReleasedBy(releaseDate: Date | null, asOf: Date | null): boolean {
  if (!releaseDate) return false;
  if (!asOf) return true; // unknown banner date -- don't wrongly exclude everyone
  return releaseDate <= asOf;
}

/**
 * Rule 1 & 2: eligible for a KERNEL-type banner if Kernel Headhunting
 * is "Yes" and the operator has released by the banner's date. No
 * distinction needed here between exclusive-kernel and dual-pool
 * operators -- both are simply eligible once released.
 */
export function isEligibleForKernelBanner(
  obtain: HowToObtain,
  releaseDate: Date | null,
  kernelAdditionDate: Date | null,
  bannerDate: Date | null
): boolean {
  if (!isYes(obtain['Kernel Headhunting'])) return false;
  if (!hasReleasedBy(releaseDate, bannerDate)) return false;

  // Dual-pool operators (also Standard Headhunting eligible) aren't
  // exclusive to Kernel, so there's no addition-date transition to
  // check -- they're just always eligible once released, same as the
  // non-kernel-banner path treats them.
  if (isYes(obtain['Standard Headhunting'])) return true;

  // Genuinely kernel-exclusive: only eligible for THIS kernel banner
  // once it actually ran on or after the date they were added to the
  // Kernel pool -- an older kernel banner shouldn't show operators who
  // hadn't been moved into that pool yet, even if they'd already
  // released through some other pool by then.
  if (!kernelAdditionDate) return false; // no known transition date -- can't confirm they'd been added yet
  if (!bannerDate) return true; // unknown banner date -- don't wrongly exclude
  return bannerDate >= kernelAdditionDate;
}

/**
 * Rules 3 & 4: eligible for a NON-kernel banner if:
 * - Standard Headhunting is "Yes" and released, OR
 * - Kernel Headhunting is "Yes" (and Standard Headhunting is NOT
 *   "Yes", i.e. genuinely kernel-exclusive) and released, AND the
 *   banner's date is before this operator's Kernel Addition Date
 *   (meaning the banner ran before they were moved to kernel-only).
 */
export function isEligibleForNonKernelBanner(
  obtain: HowToObtain,
  releaseDate: Date | null,
  kernelAdditionDate: Date | null,
  bannerDate: Date | null
): boolean {
  const released = hasReleasedBy(releaseDate, bannerDate);
  if (!released) return false;

  if (isYes(obtain['Standard Headhunting'])) return true;

  const isKernelExclusive = isYes(obtain['Kernel Headhunting']) && !isYes(obtain['Standard Headhunting']);
  if (isKernelExclusive) {
    if (!kernelAdditionDate) return false; // no known transition date -- can't confirm they predate it
    if (!bannerDate) return true; // unknown banner date -- don't wrongly exclude
    return bannerDate < kernelAdditionDate;
  }

  return false;
}

/**
 * Whether this operator is obtainable through headhunting/gacha at
 * all -- excludes Welfare-only and Recruitment-only operators, who
 * never appear in any headhunting pool regardless of date.
 */
export function isHeadhuntingEligible(obtain: HowToObtain): boolean {
  if (isYes(obtain['Standard Headhunting']) || isYes(obtain['Kernel Headhunting'])) return true;
  return false;
}

/**
 * Single entry point: is this operator eligible for a banner of the
 * given mechanic, as of the given date. `isKernelMechanic` should be
 * true for kernel / kernelLocating banner types, false for everything
 * else (standard, featured, limited, celebration, etc.).
 */
export function isEligibleForBanner(
  obtain: HowToObtain,
  releaseDate: Date | null,
  kernelAdditionDate: Date | null,
  bannerDate: Date | null,
  isKernelMechanic: boolean
): boolean {
  if (!isHeadhuntingEligible(obtain)) return false;
  return isKernelMechanic
    ? isEligibleForKernelBanner(obtain, releaseDate, kernelAdditionDate, bannerDate)
    : isEligibleForNonKernelBanner(obtain, releaseDate, kernelAdditionDate, bannerDate);
}

export interface GachaItemLike {
  name: string;
  icon: string | null;
}

/**
 * Filters a full rarity pool down to operators eligible for this
 * specific banner, using the rules above -- excludes any names already
 * handled separately (e.g. the banner's own featured six-stars), so
 * this is meant for building the "everyone else" pool, not the
 * featured slots themselves.
 */
export function buildEligiblePool<T extends GachaItemLike>(
  fullPool: T[],
  obtainLookup: Record<string, HowToObtain>,
  releaseLookup: Record<string, string>,
  kernelAdditionLookup: Record<string, string>,
  bannerDate: Date | null,
  isKernelMechanic: boolean,
  excludeNames: Set<string> = new Set()
): T[] {
  return fullPool.filter((item) => {
    if (excludeNames.has(item.name)) return false;
    const obtain = obtainLookup[item.name];
    if (!obtain) return false; // no howToObtain data at all -- can't determine eligibility
    const releaseDate = parseOperatorDate(releaseLookup[item.name]);
    const kernelAdditionDate = parseOperatorDate(kernelAdditionLookup[item.name]);
    return isEligibleForBanner(obtain, releaseDate, kernelAdditionDate, bannerDate, isKernelMechanic);
  });
}