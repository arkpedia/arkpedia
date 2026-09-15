import { HeadhuntingBanner } from '@/lib/gacha/headhuntingBanners';
import { HowToObtainInfo } from '@/lib/operators/operatorTypes';

export type OperatorSeries = 'kernel' | 'summer' | 'festival' | 'celebration' | 'carnival' | 'crossover' | 'standard' | 'excluded' | 'unknown';

/** Determines a Limited banner's own series from its name tag. Anything
 * without an explicit [Summer]/[Festival]/[Celebration]/[Carnival] tag
 * is Crossover -- per the rule that these are fully exclusive one-off
 * banners, never sharing a pool with anything else. */
export function bannerSeriesFromName(name: string): OperatorSeries {
  if (/^\[Summer\]/i.test(name)) return 'summer';
  if (/^\[Festival\]/i.test(name)) return 'festival';
  if (/^\[Celebration\]/i.test(name)) return 'celebration';
  if (/^\[Carnival\]/i.test(name)) return 'carnival';
  return 'crossover';
}

function parseDateStart(dateRange: string | null | undefined): Date | null {
  if (!dateRange) return null;
  const core = dateRange.split(';')[0].trim();
  const start = core.split(/\s*[–-]\s*/)[0].trim();
  const parsed = new Date(start.replace(/\//g, '-'));
  return isNaN(parsed.getTime()) ? null : parsed;
}

/** Builds a name -> series lookup by finding each operator's EARLIEST
 * pull_type='limited' banner appearance (as either a featured or
 * rate-up six-star, checked by global_date first, falling back to
 * cn_date only when Global isn't recorded -- same priority used
 * throughout the rest of this codebase for date comparisons) and
 * deriving their series from that banner's own name tag -- replaces a
 * manually-maintained static mapping entirely, so newly-added
 * operators are correctly classified automatically as soon as their
 * debuting banner is added to headhunting_banners.json, with nothing
 * else to update by hand.
 *
 * Only covers operators genuinely flagged Limited: Yes in their own
 * howToObtain -- everyone else (standard, kernel-exclusive, welfare,
 * or simply not yet appearing on any scraped banner) resolves to
 * 'unknown', which correctly excludes them from series-based pooling
 * elsewhere, matching the existing safe-exclusion principle for
 * anything that can't be clearly classified. */
export function buildOperatorSeriesMap(
  banners: HeadhuntingBanner[],
  howToObtainLookup: Record<string, HowToObtainInfo>
): Record<string, OperatorSeries> {
  const map: Record<string, OperatorSeries> = {};
  const earliestDate: Record<string, Date> = {};

  for (const banner of banners) {
    if (banner.pull_type !== 'limited') continue;
    const bannerDate = parseDateStart(banner.global_date || banner.cn_date);
    if (!bannerDate) continue;
    const series = bannerSeriesFromName(banner.name);
    const featured = [...(banner.six_stars || []), ...(banner.rate_up_six_stars || [])];
    for (const name of featured) {
      if (howToObtainLookup[name]?.['Limited'] !== 'Yes') continue;
      if (!earliestDate[name] || bannerDate < earliestDate[name]) {
        earliestDate[name] = bannerDate;
        map[name] = series;
      }
    }
  }

  return map;
}