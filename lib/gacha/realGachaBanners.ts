import { parseGameWindow } from '@/lib/schedule/gameWindow';
import { BannerConfig, BannerType, GachaItem } from './gachaTypes';
import { GachaIconPools } from './gachaIconPools';
import { HeadhuntingBanner } from './headhuntingBanners';
import { wasReleasedBy, getReleaseDate, ReleaseDateLookup } from '@/lib/operators/operatorReleaseDates';
import { buildOperatorSeriesMap, bannerSeriesFromName, OperatorSeries } from '@/lib/operators/operatorSeries';
import { wasInStandardPoolAsOf, KernelAdditionLookup } from '@/lib/operators/kernelAdditionDates';

import { HowToObtainInfo } from '@/lib/operators/operatorTypes';

export type HowToObtainLookup = Record<string, HowToObtainInfo>;

function findIcon(name: string, pool: GachaItem[]): GachaItem {
  const found = pool.find((item) => item.name === name);
  return found || { name, icon: null };
}

function without(pool: GachaItem[], featured: GachaItem[]): GachaItem[] {
  const featuredNames = new Set(featured.map((f) => f.name));
  return pool.filter((item) => !featuredNames.has(item.name));
}

export function parseBannerWindow(banner: HeadhuntingBanner) {
  const global = Boolean(banner.global_date);
  return parseGameWindow(global ? banner.global_date : banner.cn_date,
    global ? banner.global_window : banner.cn_window, global ? 'global' : 'cn',
    banner.pull_type === 'standard' || banner.pull_type === 'kernel');
}

export function parseBannerDate(banner: HeadhuntingBanner): Date | null {
  return parseBannerWindow(banner)?.start ?? null;
}

export function parseBannerEndDate(banner: HeadhuntingBanner): Date | null {
  return parseBannerWindow(banner)?.end ?? null;
}

// Welfare (free, story-clear rewards) and pure Recruitment operators are
// NEVER obtainable through any headhunting banner at all -- excluded
// from every pool universally, not just chronologically. The
// fundamental test is whether Standard, Kernel, or Limited Headhunting
// is ever "Yes" -- covers welfare-exclusive operators, recruitment-only
// operators, AND operators with no gacha availability whatsoever
// (howToObtain showing every field as "No", e.g. Amiya, Doc, Frost --
// story-given or otherwise non-gacha operators who still exist in the
// six-star pool data but were never actually pullable). Limited-
// exclusive operators (e.g. Dusk, Nian) legitimately have BOTH Standard
// and Kernel Headhunting set to "No" -- Limited is their only "Yes",
// so leaving it out of this check wrongly treated them the same as a
// genuinely non-gacha operator and dropped them from every pool,
// including their own series' off-banner rate-up pool and spark store.
function excludingNonHeadhuntingOperators(pool: GachaItem[], howToObtainLookup: HowToObtainLookup): GachaItem[] {
  return pool.filter((item) => {
    const obtain = howToObtainLookup[item.name];
    if (!obtain) return false;
    return obtain['Standard Headhunting'] === 'Yes' || obtain['Kernel Headhunting'] === 'Yes' || obtain['Limited'] === 'Yes';
  });
}

// Kernel Headhunting-exclusive operators never appear in any other
// banner type's pool -- UNLESS the banner predates when they were
// actually moved into Kernel-only status (many current Kernel
// exclusives originally debuted through Standard/Featured/Limited and
// only got moved later; an older banner shouldn't exclude them just
// because of their CURRENT obtain method).
function excludingKernelExclusives(pool: GachaItem[], bannerDate: Date | null, kernelLookup: KernelAdditionLookup, kernelExclusiveNames: Set<string>): GachaItem[] {
  return pool.filter((item) => {
    if (!kernelExclusiveNames.has(item.name)) return true;
    if (bannerDate && wasInStandardPoolAsOf(item.name, bannerDate, kernelLookup)) return true;
    return false;
  });
}

// Crossover six-stars are fully exclusive to their own single specific
// banner -- they never mix into any OTHER banner's pool, not even
// another Crossover banner's.
function excludingCrossoverExclusives(pool: GachaItem[], getSeries: (name: string) => OperatorSeries): GachaItem[] {
  return pool.filter((item) => getSeries(item.name) !== 'crossover');
}

// "unknown" (missing/unparseable howToObtain) is EXCLUDED from every
// pool, not assumed to be standard -- an operator we couldn't clearly
// classify could easily be a Welfare operator with unusual phrasing
// that the classifier's pattern matching missed, so the safe default
// is exclusion, not inclusion.
function seriesMatches(name: string, target: OperatorSeries, getSeries: (name: string) => OperatorSeries): boolean {
  const series = getSeries(name);
  if (series === 'unknown' || series === 'excluded') return false;
  return series === target;
}

export const PULL_TYPE_TO_MECHANIC: Record<string, BannerType> = {
  featured: 'featured',
  limited: 'limited',
  special: 'crossover', // Special Headhunting banners are one-off, exclusive Crossover-style banners
  standard: 'standard',
  kernel: 'kernel',
  orienteering: 'orienteering',
  joint: 'joint',
  celebration: 'celebration',
  unknown: 'standard',
};

/** Builds a real, playable BannerConfig from an actual headhunting
 * banner's roster, using the same pull mechanics already defined for
 * each BannerType (featured/limited/standard/etc.) -- just with real
 * named operators instead of a randomly-shuffled generic pool.
 *
 * Pool eligibility now also respects each operator's actual series
 * (from their howToObtain): Festival/Celebration/Carnival banners only
 * draw "other" six-stars from that SAME series -- they never mix with
 * each other or with Standard. Crossover and Kernel-exclusive operators
 * never appear outside their own specific banner at all. Welfare and
 * pure Recruitment operators never appear in any banner pool.
 *
 * excludeSixStarNames: for Celebration banners, the operators the
 * player has marked as already-owned -- removed from the pool entirely,
 * matching the real game's behavior of not offering ones you already have. */
/** Determines which six-stars are the TRUE featured ones for display
 * purposes (e.g. the sidebar banner list) -- same logic buildRealBannerConfig
 * uses internally, extracted so both stay in sync rather than the UI
 * showing raw scraped order while the simulator uses the corrected one. */
export function getDisplayFeaturedSixStars(banner: HeadhuntingBanner, releaseLookup: ReleaseDateLookup): string[] {
  if (banner.pull_type === 'celebration') return [banner.name];
  const isLimitedCrossover = banner.pull_type === 'limited' && bannerSeriesFromName(banner.name) === 'crossover';
  if (banner.pull_type !== 'limited' || isLimitedCrossover) {
    return banner.six_stars;
  }
  const combined = [...banner.six_stars, ...(banner.rate_up_six_stars || [])];
  const sorted = combined
    .map((name) => ({ name, date: getReleaseDate(name, releaseLookup) }))
    .sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return b.date.getTime() - a.date.getTime();
    })
    .map((x) => x.name);
  return sorted.slice(0, 2);
}

/** Display-only wrapper around getDisplayFeaturedSixStars: appends
 * " Rerun" to each name when the banner is a rerun, so "Thorns"
 * reads as "Thorns Rerun" in banner lists. Kept separate from the
 * underlying function, which is also used for actual game logic
 * (e.g. celebrationExcludeNames) that needs the real, unmodified
 * operator name to match against the operator database -- appending
 * text there would break that matching. */
export function getDisplayFeaturedSixStarsWithRerunLabel(banner: HeadhuntingBanner, releaseLookup: ReleaseDateLookup): string[] {
  const names = getDisplayFeaturedSixStars(banner, releaseLookup);
  // Celebration's display value IS the banner's own name, which
  // already includes "Rerun" if it's a rerun -- appending again would
  // produce "... Rerun Rerun".
  if (banner.pull_type === 'celebration') return names;
  if (!/\bRerun\b/i.test(banner.name)) return names;
  return names.map((name) => `${name} (Rerun)`);
}

/** Determines the actual pull mechanic for a banner -- a Limited banner
 * without a Festival/Celebration/Carnival tag is Crossover, a Kernel
 * banner named "Kernel Locating #N" is its own choose-2-six/choose-3-five
 * mechanic, everything else follows PULL_TYPE_TO_MECHANIC directly.
 * Exported so any UI that needs to group/label banners by mechanic
 * (e.g. the category sidebar) uses the exact same logic the simulator
 * itself uses, rather than a second copy that can silently drift out
 * of sync. */
export function getMechanicType(banner: HeadhuntingBanner): BannerType {
  if (banner.pull_type === 'kernel' && /^Kernel Locating #\d+/.test(banner.name)) return 'kernelLocating';
  if (/^The Front That Was #\d+/i.test(banner.name)) return 'trio';
  const isLimitedCrossover = banner.pull_type === 'limited' && bannerSeriesFromName(banner.name) === 'crossover';
  return isLimitedCrossover ? 'crossover' : PULL_TYPE_TO_MECHANIC[banner.pull_type] || 'standard';
}

export function buildRealBannerConfig(
  banner: HeadhuntingBanner,
  pools: GachaIconPools,
  excludeSixStarNames: string[] = [],
  kernelLookup: KernelAdditionLookup = {},
  releaseLookup: ReleaseDateLookup = {},
  kernelExclusiveNames: Set<string> = new Set(),
  howToObtainLookup: HowToObtainLookup = {},
  operatorSeriesMap: Record<string, OperatorSeries> = {}
): BannerConfig {
  const getSeries = (name: string): OperatorSeries => operatorSeriesMap[name] || 'unknown';
  // A Limited banner without a Festival/Celebration/Carnival tag is
  // Crossover -- its own genuinely different mechanic (120-pull
  // guarantee, completion-guaranteed 5-star pair, no 300-pull system).
  const mechanicType = getMechanicType(banner);
  const excludeSet = new Set(excludeSixStarNames);
  const bannerDate = parseBannerDate(banner);

  let featuredSixNames = banner.six_stars.filter((name) => !excludeSet.has(name));
  let rateUpSixNames = (banner.rate_up_six_stars || []).filter((name) => !excludeSet.has(name));

  if (mechanicType === 'limited') {
    const combined = [...featuredSixNames, ...rateUpSixNames];
    const featured = getDisplayFeaturedSixStars(banner, releaseLookup).filter((name) => !excludeSet.has(name));
    featuredSixNames = featured;
    rateUpSixNames = combined.filter((name) => !featured.includes(name));
  }

  const sixStarFeatured = featuredSixNames
    .filter((name) => (mechanicType === 'kernel' || mechanicType === 'kernelLocating' ? kernelEligible(name) : true))
    .map((name) => findIcon(name, pools.six));
  const rateUpSixStars = rateUpSixNames.map((name) => findIcon(name, pools.six));

  // Of the 2 Limited-featured six-stars, only the one whose OWN
  // howToObtain doesn't ALSO say Standard Headhunting is the true
  // Limited-exclusive one -- the other co-debuts but returns to the
  // standard pool eventually. The 300-pull guarantee must target the
  // former, not just blindly assume a fixed array index.
  const limitedExclusiveSixStar = mechanicType === 'limited'
    ? sixStarFeatured.find((item) => !historicallyStandard(item.name)) || sixStarFeatured[0]
    : undefined;

  const fiveStarFeatured = (
    banner.five_stars.length > 0
      ? banner.five_stars.filter((name) => (mechanicType === 'kernel' || mechanicType === 'kernelLocating' ? kernelEligible(name) : true))
      : []
  ).map((name) => findIcon(name, pools.five));
  // Celebration banners legitimately have zero featured five-stars --
  // only fall back to a placeholder for banner types that always
  // genuinely need one, where an empty list means a real data gap
  // rather than "this banner just doesn't have one."
  const fiveStarFeaturedFinal = fiveStarFeatured.length > 0 || mechanicType === 'celebration'
    ? fiveStarFeatured
    : [findIcon(pools.five[0]?.name || 'Featured 5★', pools.five)]; // fallback if a banner listed no valid 5-star at all

  // Limited banners specifically require an operator to have existed
  // for at least 10 months before they're eligible to show up in a
  // SUBSEQUENT Limited banner's off-banner pool -- not just "released
  // at some point before this banner," but released with real
  // breathing room ahead of it.
  function chronologicallyAvailable(pool: GachaItem[]): GachaItem[] {
    if (!bannerDate) return pool; // unknown date -- don't wrongly exclude everyone
    return pool.filter((item) => {
      if (mechanicType !== 'limited') return wasReleasedBy(item.name, bannerDate, releaseLookup);
      const releaseDate = getReleaseDate(item.name, releaseLookup);
      if (!releaseDate) return false;
      const eligibleFrom = new Date(releaseDate);
      eligibleFrom.setMonth(eligibleFrom.getMonth() + 10);
      return eligibleFrom <= bannerDate;
    });
  }

  let rawOtherSixStarPool = without(pools.six, [...sixStarFeatured, ...rateUpSixStars]);
  let rawOtherFiveStarPool = without(pools.five, fiveStarFeaturedFinal);

  // Series matching: Limited banners draw "other" six-stars from their
  // OWN series (Festival stays with Festival, etc.) PLUS the general
  // standard pool -- not exclusively their own series alone. Standard/
  // Featured-type banners only draw from the "standard" series. Kernel
  // banners draw ONLY from the "kernel" series -- pure Kernel
  // Headhunting, no Limited/Standard operators allowed in either the
  // featured roster OR the "other" pool. Celebration has no "other"
  // pool at all (handled separately below).
  // A currently Kernel-classified operator still counts as "standard"
  // for an OLDER banner, if that banner predates when they were
  // actually moved into Kernel-only status.
  function historicallyStandard(name: string): boolean {
    const obtain = howToObtainLookup[name];
    if (!obtain) return false;
    return obtain['Standard Headhunting'] === 'Yes';
  }

  // Kernel-eligible: obtainable via Kernel Headhunting at all. If the
  // operator is ALSO Standard Headhunting: Yes (e.g. 3-star/4-star
  // operators that exist in both pools simultaneously once released),
  // no date-gating applies -- they're not "exclusive" to kernel, so
  // there's no addition-date transition to check. Date-gating only
  // applies to genuinely kernel-EXCLUSIVE operators.
  function kernelEligible(name: string): boolean {
    const obtain = howToObtainLookup[name];
    if (!obtain) return false;
    if (obtain['Kernel Headhunting'] !== 'Yes') return false;
    if (obtain['Standard Headhunting'] === 'Yes') return true;
    if (!bannerDate) return true;
    return !wasInStandardPoolAsOf(name, bannerDate, kernelLookup);
  }

  function applySeriesFilter(pool: GachaItem[]): GachaItem[] {
    if (mechanicType === 'limited') {
      const bannerSeries = bannerSeriesFromName(banner.name);
      // Crossover never participates in the growing-off-banner-pool
      // behavior that Festival/Celebration/Carnival get -- each
      // crossover banner is fully standalone. A 'limited'-pull_type
      // banner whose name doesn't carry one of the three real series
      // tags falls through to bannerSeriesFromName's 'crossover'
      // default, which would otherwise wrongly let seriesMatches pull
      // in every crossover-series operator here.
      if (bannerSeries === 'crossover') {
        return pool.filter((item) => historicallyStandard(item.name));
      }
      return pool.filter((item) => seriesMatches(item.name, bannerSeries, getSeries) || historicallyStandard(item.name));
    }
    if (mechanicType === 'kernel') {
      return pool.filter((item) => kernelEligible(item.name));
    }
    if (mechanicType === 'celebration') {
      return pool;
    }
    return pool.filter((item) => historicallyStandard(item.name));
  }
  rawOtherSixStarPool = applySeriesFilter(rawOtherSixStarPool);
  rawOtherFiveStarPool = applySeriesFilter(rawOtherFiveStarPool);

  const applyUniversalExclusions = (pool: GachaItem[]) =>
    mechanicType === 'kernel' ? pool : excludingCrossoverExclusives(excludingKernelExclusives(excludingNonHeadhuntingOperators(pool, howToObtainLookup), bannerDate, kernelLookup, kernelExclusiveNames), getSeries);

  const otherSixStarPool = chronologicallyAvailable(applyUniversalExclusions(rawOtherSixStarPool));
  const otherFiveStarPool = chronologicallyAvailable(applyUniversalExclusions(rawOtherFiveStarPool));

  const fourStarFeatured = (banner.four_stars || []).map((name) => findIcon(name, pools.four));
  const rawOtherFourStarPool = without(pools.four, fourStarFeatured);
  const otherFourStarPool = chronologicallyAvailable(rawOtherFourStarPool);

  const base = {
    label: banner.name,
    description: '',
    sixStarFeatured,
    fiveStarFeatured: fiveStarFeaturedFinal,
    fourStarFeatured: fourStarFeatured.length > 0 ? fourStarFeatured : undefined,
    fourStarPool: otherFourStarPool,
    threeStarPool: chronologicallyAvailable(pools.three),
  };

  switch (mechanicType) {
    case 'joint':
    case 'orienteering':
      // No other 6★/5★ can appear -- matches the Joint/Orienteering
      // mechanic already defined, just with the banner's real roster.
      return { ...base, type: mechanicType, otherSixStarPool: [], otherFiveStarPool: [] };
    case 'kernelLocating':
      // Player chooses 2 of the six-star candidates and 3 of the
      // five-star candidates; the UI overrides sixStarFeatured/
      // fiveStarFeatured with the chosen subset AND computes the
      // non-chosen candidates as the off-banner "other" pool (50%
      // shared among the chosen, 50% shared among the rest) -- this
      // base config is just the pre-selection placeholder, empty until
      // the player actually picks.
      return { ...base, type: mechanicType, otherSixStarPool: [], otherFiveStarPool: [] };
    case 'celebration':
      // Every listed 6-star shares equally -- no six-star "others" pool
      // at all, and no rate-up tier either (that's Limited-specific).
      // Five-stars are different: there's no featured five-star
      // category for Celebration at all, so the "others" pool being
      // populated is the only way ANY five-star is obtainable -- they
      // all share the chance equally amongst themselves.
      return { ...base, type: mechanicType, otherSixStarPool: [], otherFiveStarPool };
    case 'limited':
      return { ...base, type: mechanicType, otherSixStarPool, otherFiveStarPool, rateUpSixStars, limitedExclusiveSixStar };
    case 'crossover':
      return { ...base, type: mechanicType, otherSixStarPool, otherFiveStarPool };
    case 'trio':
      // The Front That Was series: exactly 3 featured six-stars and 3
      // featured five-stars, no player choice, fully self-contained --
      // no other pool at all, and no guarantee beyond the universal
      // first-10 one (no 150/120/300-pull system in play here).
      return { ...base, type: mechanicType, otherSixStarPool: [], otherFiveStarPool: [] };
    default:
      return { ...base, type: mechanicType, otherSixStarPool, otherFiveStarPool };
  }
}