import bannersData from '@/data/headhunting_banners.json';
import { withArtVersion } from '@/lib/art/artVersion';

export interface HeadhuntingBanner {
  name: string;
  category: string;
  cn_date: string | null;
  global_date: string | null;
  banner_image?: string | null;
  six_stars: string[]; // for Limited banners, only the first 2 (true featured)
  rate_up_six_stars?: string[]; // Limited banners only: the remaining "off-banner rate-up" 6-stars
  five_stars: string[];
  four_stars?: string[]; // featured 4-stars -- 50% chance when a 4-star is rolled, shared 50% among everyone else
  pull_type: 'featured' | 'limited' | 'special' | 'standard' | 'kernel' | 'orienteering' | 'joint' | 'celebration' | 'unknown';
  year: number | string;
  linked_event: string | null; // computed once at scrape time against events.json
}

// banner_image is versioned here, at the single point every consumer reads
// banners from, because sync-banner-art.py overwrites the art in place while
// the URL stays put -- see lib/art/artVersion.ts. Safe at this layer: every
// banner_image consumer feeds it to <Image>, none resolves it on disk.
const ALL_BANNERS = (bannersData as HeadhuntingBanner[]).map((b) => ({
  ...b,
  banner_image: withArtVersion(b.banner_image, b.name),
}));

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\brerun\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function parseStartDate(range: string | null | undefined): number | null {
  if (!range) return null;
  const start = range.split('–')[0];
  const m = start.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
}

export function getAllHeadhuntingBanners(): HeadhuntingBanner[] {
  return ALL_BANNERS;
}

/** Banners sorted newest-first by Global date start, for the Gacha
 * page's banner picker. */
export function getBannersSortedByDate(): HeadhuntingBanner[] {
  function startDate(b: HeadhuntingBanner): number {
    return parseStartDate(b.global_date || b.cn_date) || 0;
  }
  return [...ALL_BANNERS].sort((a, b) => startDate(b) - startDate(a));
}

/** Finds the headhunting banner matching a schedule event, if any --
 * used to show "pullable operators" for that event. Tries, in order:
 *   1. The scraper's own persisted linked_event field (most reliable,
 *      computed once and inspectable directly in the JSON).
 *   2. Fuzzy name matching, for banners scraped before that field existed.
 *   3. Same start date -- Featured/Limited banners that share an
 *      event's exact start date are related to it even when their
 *      names don't line up well (crossover/collab banners especially). */
export function getBannerForEvent(eventName: string, eventGlobalDateRange?: string | null, banners: HeadhuntingBanner[] = ALL_BANNERS): HeadhuntingBanner | null {
  const target = normalize(eventName);

  if (target) {
    const explicitMatch = banners.find((b) => b.linked_event && normalize(b.linked_event) === target);
    if (explicitMatch) return explicitMatch;

    for (const banner of ALL_BANNERS) {
      const normName = normalize(banner.name);
      if (normName === target || normName.includes(target) || target.includes(normName)) {
        return banner;
      }
    }
  }

  const eventStart = parseStartDate(eventGlobalDateRange);
  if (eventStart) {
    const dateMatch = banners.find(
      (b) => (b.pull_type === 'featured' || b.pull_type === 'limited') && parseStartDate(b.global_date) === eventStart
    );
    if (dateMatch) return dateMatch;
  }

  return null;
}