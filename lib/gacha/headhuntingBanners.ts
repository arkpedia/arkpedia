import type { GameWindowTimes } from '@/lib/schedule/gameWindow';
import bannersData from '@/data/headhunting_banners.json';
import { publishedArt } from '@/lib/art/artVersion';

/** Where a banner's featured lineup came from, as scripts/sync/catalogue-model.mjs and
 *  sync-recurring-banners.mjs record it: the wiki's row, the six-stars the game client
 *  names (five-stars still unknown), or nothing yet -- 'pending' ships with empty
 *  lineup arrays until the wiki has a row for the banner's window. Hand-kept records
 *  carry none. */
export type BannerLineupSource = 'wiki' | 'client' | 'pending';

/** Which name the record carries: the client's Chinese one while the wiki has none,
 *  the wiki's community English one, or the official Global one. Undefined -- every
 *  hand-kept and recurring record -- means official. Community names are shown as
 *  they are, unlabelled (maintainer decision). */
export type BannerNameStatus = 'cn-official' | 'en-unofficial' | 'en-official';

export interface HeadhuntingBanner {
  name: string;
  /** Names the record had before the catalogue renamed it, for matching old links. */
  aliases?: string[];
  category: string;
  cn_date: string | null;
  global_date: string | null;
  global_date_estimated?: boolean;
  schedule_anchor?: string;
  cnPoolId?: string;
  globalPoolId?: string;
  lineupSource?: BannerLineupSource;
  nameStatus?: BannerNameStatus;
  global_window?: GameWindowTimes;
  cn_window?: GameWindowTimes;
  banner_image?: string | null;
  six_stars: string[]; // for Limited banners, only the first 2 (true featured)
  rate_up_six_stars?: string[]; // Limited banners only: the remaining "off-banner rate-up" 6-stars
  five_stars: string[];
  four_stars?: string[]; // featured 4-stars -- 50% chance when a 4-star is rolled, shared 50% among everyone else
  pull_type: 'featured' | 'limited' | 'special' | 'standard' | 'kernel' | 'orienteering' | 'joint' | 'celebration' | 'unknown';
  year: number | string;
  linked_event: string | null; // computed once at scrape time against the per-year event records
}

// banner_image is resolved here, at the single point every consumer reads
// banners from: null while the image repository has not published the art (a
// banner can go out before it), and versioned once it has, because
// sync-banner-art.py overwrites the art in place while the URL stays put -- see
// lib/art/artVersion.ts. Safe at this layer: every banner_image consumer feeds
// it to <Image>, none resolves it on disk.
const ALL_BANNERS = (bannersData as HeadhuntingBanner[]).map((b) => ({
  ...b,
  banner_image: publishedArt(b.banner_image, b.name),
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

/** An event's Global date range as evidence for getBannerForEvent: null while it is only
 * an estimate (the note says so -- the test getAllEventListings uses for isPredicted). */
export function confirmedGlobalRange(global: { dateRange?: string | null; note?: string | null } | null | undefined): string | null {
  return /estimated|predicted/i.test(global?.note || '') ? null : global?.dateRange ?? null;
}

/** Finds the headhunting banner of a schedule event, if any -- used to show "pullable
 * operators" for that event. Only explicit evidence links the two, in order:
 *   1. The banner's persisted linked_event field (computed at scrape time and
 *      inspectable directly in the JSON).
 *   2. The same Global opening day: the one Featured or Limited banner whose Global
 *      window opens on the day the event's Global window does, and only when there is
 *      one; a banner flagged global_date_estimated is skipped. Pass null for an
 *      estimated event date (confirmedGlobalRange, or a listing's isPredicted); a test
 *      holds every page's call to that.
 * A banner the catalogue created from the CN client under its Chinese name
 * (nameStatus 'cn-official') is CN-only, so it is never matched by date either.
 *
 * Names are not compared. Banner titles are not event titles -- in the 2026-09 data no
 * event matched a banner by name -- and the old substring match on normalised names
 * matched a Chinese-named banner, which normalises to "", to every event: the day a CN
 * pool reached the client before the wiki had a row for it, that CN-only banner became
 * the headhunting banner of every Global event page that has none. */
export function getBannerForEvent(eventName: string, eventGlobalDateRange?: string | null, banners: HeadhuntingBanner[] = ALL_BANNERS): HeadhuntingBanner | null {
  const target = normalize(eventName);
  if (target) {
    const explicitMatch = banners.find((b) => b.linked_event && normalize(b.linked_event) === target);
    if (explicitMatch) return explicitMatch;
  }

  const eventStart = parseStartDate(eventGlobalDateRange);
  if (!eventStart) return null;
  const sameDay = banners.filter((b) => (b.pull_type === 'featured' || b.pull_type === 'limited')
    && b.nameStatus !== 'cn-official' && !b.global_date_estimated && parseStartDate(b.global_date) === eventStart);
  return sameDay.length === 1 ? sameDay[0] : null;
}
