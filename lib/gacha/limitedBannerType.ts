import type { HeadhuntingBanner } from './headhuntingBanners';

/* Pure: the page's browser half uses dateStringValue and classifyLimitedBanner, so this
   module must not reach the banner list itself. The lookups take the banners the
   caller already holds -- getStaticProps passes getAllHeadhuntingBanners() from
   headhuntingBannerData.ts, which the content export runs against the release. */

export type LimitedBannerType = 'Celebration' | 'Festival' | 'Carnival' | 'Crossover';

const KNOWN_TYPES = new Set<string>(['Celebration', 'Festival', 'Carnival', 'Crossover']);

/**
 * Which of the four Limited sub-types a banner belongs to. The type
 * lives as a bracketed prefix in the banner's own name -- e.g.
 * "[Celebration] Cremation Last Wish", "[Festival] Earthborn Metals" --
 * NOT in the `category` field, which is just the generic string
 * "limited" for every Limited banner regardless of sub-type.
 *
 * A handful of crossover-collab banners use a franchise-specific
 * bracket label instead of the generic "[Crossover]" tag (e.g.
 * "[Elite Tactical] ... Rerun" for the Rainbow Six Siege collab,
 * "[Dungeon Adventure] ..." for the Delicious in Dungeon collab), and
 * a couple of reruns have no bracket at all. Every one of these
 * observed cases in the real data is a themed crossover collab, so
 * any bracket label outside the four known ones -- and any banner
 * with no bracket at all -- defaults to Crossover rather than being
 * silently left unclassified.
 */
export function classifyLimitedBanner(banner: HeadhuntingBanner): LimitedBannerType {
  const match = banner.name.match(/^\[([^\]]+)\]/);
  if (match && KNOWN_TYPES.has(match[1])) return match[1] as LimitedBannerType;
  return 'Crossover';
}

// Duplicated from headhuntingBanners.ts's own (unexported) parseStartDate
// rather than modifying that file's exports -- same start-of-range
// parsing logic, applied to global_date specifically.
function parseGlobalStartDate(banner: HeadhuntingBanner): string | null {
  const range = banner.global_date;
  if (!range) return null;
  const start = range.split('\u2013')[0];
  const m = start.match(/^(\d{4}\/\d{1,2}\/\d{1,2})/);
  return m ? m[1] : null;
}

export function dateStringValue(s: string): number {
  const [y, m, d] = s.split('/').map(Number);
  return new Date(y, m - 1, d).getTime();
}

export interface LimitedOperatorInfo {
  type: LimitedBannerType;
  // "YYYY/MM/DD" strings (not Date objects -- getStaticProps can't
  // serialize those), kept raw so the page can compute day-counts
  // client-side at render time and stay accurate between deploys.
  lastBannerDate: string | null; // most recent PAST appearance
  nextScheduledDate: string | null; // earliest known FUTURE appearance, if any -- an actually-announced rerun, not an estimate
}

/**
 * Operator name -> their Limited sub-type, most recent past
 * appearance, and earliest known future (already-scheduled) rerun if
 * one exists in the data -- built in one pass over every Limited
 * banner's featured lineup (both six_stars slots, any off-banner
 * rate_up_six_stars, and any featured five_stars/four_stars). The
 * type is taken from the FIRST banner an operator is found in --
 * reruns of the same operator's original banner classify to the same
 * sub-type in every case checked against the real data, even when a
 * rerun uses a different bracket label. lastBannerDate tracks the
 * LATEST past appearance; nextScheduledDate tracks the EARLIEST
 * future one, if the data actually contains an announced rerun --
 * these are genuinely different things, especially for Crossover
 * operators, whose reruns depend on external collab agreements rather
 * than a predictable internal calendar, so there's no reasonable
 * basis for estimating one the way there is for Celebration/Festival/
 * Carnival.
 */
export function getLimitedBannerInfoLookup(banners: readonly HeadhuntingBanner[]): Record<string, LimitedOperatorInfo> {
  const lookup: Record<string, LimitedOperatorInfo> = {};
  const limitedBanners = banners.filter((b) => b.pull_type === 'limited');
  const todayValue = (() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t.getTime();
  })();

  for (const banner of limitedBanners) {
    const type = classifyLimitedBanner(banner);
    const date = parseGlobalStartDate(banner);
    const isFuture = date ? dateStringValue(date) > todayValue : false;
    const names = [
      ...(banner.six_stars || []),
      ...(banner.rate_up_six_stars || []),
      ...(banner.five_stars || []),
      ...(banner.four_stars || []),
    ];
    for (const name of names) {
      const existing = lookup[name];
      if (!existing) {
        lookup[name] = {
          type,
          lastBannerDate: isFuture ? null : date,
          nextScheduledDate: isFuture ? date : null,
        };
        continue;
      }
      if (!date) continue;
      if (isFuture) {
        if (!existing.nextScheduledDate || dateStringValue(date) < dateStringValue(existing.nextScheduledDate)) {
          existing.nextScheduledDate = date;
        }
      } else if (!existing.lastBannerDate || dateStringValue(date) > dateStringValue(existing.lastBannerDate)) {
        existing.lastBannerDate = date;
      }
    }
  }

  return lookup;
}

/**
 * Every known Celebration banner's start date, sorted ascending
 * (oldest first), covering both past and any future/announced ones
 * in the data. Celebration reruns aren't tied to a fixed calendar date
 * the way Festival/Carnival are -- they follow the actual banner
 * schedule (roughly twice a year, but not on fixed dates), so
 * estimating a Celebration operator's next rerun means looking at
 * this real schedule directly rather than projecting a fixed date.
 */
export function getCelebrationBannerDates(banners: readonly HeadhuntingBanner[]): string[] {
  const dates: string[] = [];
  const celebrations = banners.filter((b) => b.pull_type === 'limited' && classifyLimitedBanner(b) === 'Celebration');
  for (const banner of celebrations) {
    const date = parseGlobalStartDate(banner);
    if (date) dates.push(date);
  }
  dates.sort((a, b) => dateStringValue(a) - dateStringValue(b));
  return dates;
}