import { loadAllEventYears } from './events/loadEventsData';
import { getBannersSortedByDate, HeadhuntingBanner } from './gacha/headhuntingBanners';
import { parseBannerDate, parseBannerEndDate } from './gacha/realGachaBanners';
import { bannerSeriesFromName } from './operators/operatorSeries';
import { getAllSkins } from './skins/skins';
import { Skin } from './skins/skinTypes';
import { getSkinsForEvent } from './schedule/scheduleSkinMatch';
import { FARMING_TIERS } from './farming/farmingConfig';
import { FarmingMaterial } from './farming/farmingTypes';
import { withArtVersion } from '@/lib/art/artVersion';

export interface GameEvent {
  name: string;
  poster: string;
  year: number;
  dateRange: string;
  start: Date;
  end: Date;
}

/**
 * Parses a "YYYY/MM/DD–YYYY/MM/DD" range using the fixed convention:
 * events open at the global server's reset, 04:00 UTC-7 on the start
 * date (= 11:00 UTC), and close at 03:59 UTC-7 on the end date. The
 * start hour used to be assumed as 23:00 SGT (15:00 UTC), which made
 * the home page count down for four hours while the Terminal -- whose
 * window comes from the client's own activity_table -- already said
 * "open now" about the same event. The client data settled the hour.
 *
 * Only used for events data below -- gacha banners use parseBannerDate/
 * parseBannerEndDate instead (see getOngoingGachaBanners), since those
 * are the same, more lenient parsers the Gacha page's own "Upcoming"
 * category already relies on.
 */
function parseEventWindow(dateRange: string): { start: Date; end: Date } | null {
  const parts = dateRange.split(/[\u2013-]/).map((s) => s.trim());
  if (parts.length !== 2) return null;

  function parseYMD(s: string): { y: number; m: number; d: number } | null {
    const m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
    if (!m) return null;
    return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  }

  const startYMD = parseYMD(parts[0]);
  const endYMD = parseYMD(parts[1]);
  if (!startYMD || !endYMD) return null;

  const start = new Date(Date.UTC(startYMD.y, startYMD.m - 1, startYMD.d, 11, 0, 0));
  const end = new Date(Date.UTC(endYMD.y, endYMD.m - 1, endYMD.d, 11, 0, 0));
  return { start, end };
}

interface RawEvent {
  name: string;
  poster: string;
  year: number;
  global?: { dateRange: string | null; note: string | null } | null;
  cn?: { dateRange: string | null; note: string | null } | null;
}

function loadGameEvents(): GameEvent[] {
  const raw = loadAllEventYears() as RawEvent[];
  const events: GameEvent[] = [];
  for (const e of raw) {
    const dateRange = e.global?.dateRange;
    if (!dateRange) continue;
    const window = parseEventWindow(dateRange);
    if (!window) continue;
    events.push({ name: e.name, poster: withArtVersion(e.poster, e.name), year: e.year, dateRange, start: window.start, end: window.end });
  }
  return events;
}

export function getOngoingEvents(now: Date = new Date()): GameEvent[] {
  return loadGameEvents()
    .filter((e) => e.start <= now && now <= e.end)
    .sort((a, b) => a.end.getTime() - b.end.getTime());
}

/** The single soonest upcoming event -- guarantees there's always at
 * least one banner to show, even with zero ongoing events. */
export function getNextUpcomingEvent(now: Date = new Date()): GameEvent | null {
  const upcoming = loadGameEvents()
    .filter((e) => e.start > now)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  return upcoming[0] || null;
}

export interface GachaBannerWithWindow extends HeadhuntingBanner {
  start: Date;
  end: Date;
}

const KERNEL_LOCATING_PATTERN = /^Kernel Locating #\d+/i;

function isCrossoverLimited(banner: HeadhuntingBanner): boolean {
  return banner.pull_type === 'limited' && bannerSeriesFromName(banner.name) === 'crossover';
}

function isKernelLocating(banner: HeadhuntingBanner): boolean {
  return banner.pull_type === 'kernel' && KERNEL_LOCATING_PATTERN.test(banner.name);
}

/**
 * Home page's own banner display order (separate from the Gacha page's
 * default newest-first ordering): Limited, then Crossover, then
 * Featured, then Joint Operation, then Kernel Locating, then Standard,
 * then Kernel. Anything that doesn't fit one of those seven buckets
 * (Orienteering, Celebration, unclassified/"special") trails at the
 * very end rather than breaking the requested order.
 */
function bannerCategoryRank(banner: HeadhuntingBanner): number {
  if (banner.pull_type === 'limited' && !isCrossoverLimited(banner)) return 0; // Limited
  if (isCrossoverLimited(banner)) return 1; // Crossover
  if (banner.pull_type === 'featured') return 2; // Featured
  if (banner.pull_type === 'joint') return 3; // Joint Operation
  if (isKernelLocating(banner)) return 4; // Kernel Locating
  if (banner.pull_type === 'standard') return 5; // Standard Headhunting
  if (banner.pull_type === 'kernel') return 6; // Kernel Headhunting (non-locating)
  return 7; // Orienteering, Celebration, special, unknown
}

/**
 * Uses parseBannerDate/parseBannerEndDate (from realGachaBanners.ts) --
 * the SAME functions the Gacha page's own "Upcoming" category already
 * uses to correctly identify currently-active banners.
 */
export function getOngoingGachaBanners(now: Date = new Date()): GachaBannerWithWindow[] {
  const banners = getBannersSortedByDate();
  const result: GachaBannerWithWindow[] = [];
  for (const b of banners) {
    const start = parseBannerDate(b);
    const end = parseBannerEndDate(b);
    if (!start || !end) continue;
    if (start <= now && now <= end) {
      result.push({ ...b, start, end });
    }
  }
  return result.sort((a, b) => {
    const rankDiff = bannerCategoryRank(a) - bannerCategoryRank(b);
    if (rankDiff !== 0) return rankDiff;
    return a.end.getTime() - b.end.getTime(); // soonest-ending first within the same category
  });
}

/** Skins tied to a currently-ongoing event, via each skin's own
 * "release" field matching that event's name. */
export function getOngoingSkins(now: Date = new Date()): Skin[] {
  const ongoingEvents = getOngoingEvents(now);
  const allSkins = getAllSkins();
  /* Every event name, not just the ongoing ones: the point of the list is to let a
     release be recognised as belonging to some OTHER event than this one. */
  const allEventNames = loadGameEvents().map((e) => e.name);
  const seen = new Set<string>();
  const result: Skin[] = [];
  for (const event of ongoingEvents) {
    for (const skin of getSkinsForEvent(event.name, allSkins, allEventNames)) {
      if (seen.has(skin.name)) continue;
      seen.add(skin.name);
      result.push(skin);
    }
  }
  return result;
}

/** Materials with at least one stage marked "eventActive" -- the
 * existing marker for "currently boosted/farmable due to an active
 * event," already tracked in the farming data. */
export function getCurrentFarmableMaterials(): FarmingMaterial[] {
  const result: FarmingMaterial[] = [];
  for (const tier of FARMING_TIERS) {
    for (const material of tier.materials) {
      if (material.stages.some((s) => s.kind === 'eventActive')) {
        result.push(material);
      }
    }
  }
  return result;
}

// --- Full events listing, for the standalone /events pages ---------

export interface GameEventListing extends GameEvent {
  isOngoing: boolean;
  isPredicted: boolean; // true when there's no confirmed Global date yet -- start/end are estimated from the CN date plus a fixed average localization gap
}

// Average CN-to-Global localization gap, in days -- used ONLY to
// estimate a release window for events that have a CN date but no
// confirmed Global date yet. This is a rough approximation (Arknights
// Global has historically trailed CN by roughly 5-6 months); adjust
// PREDICTED_GAP_DAYS if you have a more precise figure to use instead.
const PREDICTED_GAP_DAYS = 175;

function formatDateRange(start: Date, end: Date): string {
  function fmt(d: Date): string {
    return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`;
  }
  return `${fmt(start)}\u2013${fmt(end)}`;
}

/** Every currently-ongoing or future event, including a best-effort
 * predicted window (see PREDICTED_GAP_DAYS) for events that only have
 * a CN date on record so far. Powers the /events list and detail
 * pages -- broader than getOngoingEvents/getNextUpcomingEvent above,
 * which only ever surface real, Global-confirmed dates. */
export function getAllEventListings(now: Date = new Date()): GameEventListing[] {
  const raw = loadAllEventYears() as RawEvent[];
  const result: GameEventListing[] = [];

  for (const e of raw) {
    const globalRange = e.global?.dateRange;
    if (globalRange) {
      const window = parseEventWindow(globalRange);
      if (!window) continue;
      result.push({
        name: e.name,
        poster: withArtVersion(e.poster, e.name),
        year: e.year,
        dateRange: globalRange,
        start: window.start,
        end: window.end,
        isOngoing: window.start <= now && now <= window.end,
        isPredicted: false,
      });
      continue;
    }

    // No confirmed Global date -- estimate one from CN's, if known.
    const cnRange = e.cn?.dateRange;
    if (!cnRange) continue; // no date info at all -- nothing to show or predict from
    const cnWindow = parseEventWindow(cnRange);
    if (!cnWindow) continue;
    const predictedStart = new Date(cnWindow.start.getTime() + PREDICTED_GAP_DAYS * 86400000);
    const predictedEnd = new Date(cnWindow.end.getTime() + PREDICTED_GAP_DAYS * 86400000);
    if (predictedEnd.getTime() < now.getTime()) continue; // predicted window already passed -- likely just a missing/stale Global entry rather than a genuinely future event

    result.push({
      name: e.name,
      poster: withArtVersion(e.poster, e.name),
      year: e.year,
      dateRange: formatDateRange(predictedStart, predictedEnd),
      start: predictedStart,
      end: predictedEnd,
      isOngoing: predictedStart <= now && now <= predictedEnd,
      isPredicted: true,
    });
  }

  return result
    .filter((e) => e.end.getTime() >= now.getTime())
    .sort((a, b) => a.start.getTime() - b.start.getTime());
}