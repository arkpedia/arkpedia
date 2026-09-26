import { parseGameWindow, type GameWindowTimes } from '@/lib/schedule/gameWindow';
import { loadAllEventYears } from '../events/loadEventsData';
import type { HeadhuntingBanner } from '../gacha/headhuntingBanners';
import { getBannersSortedByDate } from '../gacha/headhuntingBannerData';
import { parseBannerDate, parseBannerEndDate } from '../gacha/realGachaBanners';
import { bannerSeriesFromName } from '../operators/operatorSeries';
import { getAllSkins } from '../skins/skins';
import { Skin } from '../skins/skinTypes';
import { getSkinsForEvent } from '../schedule/scheduleSkinMatch';
import { publishedArt } from '@/lib/art/publishedArt';

export interface GameEvent extends GameWindowTimes {
  name: string;
  /** null while the image repository has not published it (see publishedArt). */
  poster: string | null;
  year: number;
  dateRange: string;
  start: Date;
  end: Date;
}

interface RawEvent {
  name: string;
  poster: string | null;
  year: number;
  global?: GameWindowTimes & { dateRange: string | null; note: string | null } | null;
  cn?: { dateRange: string | null; note: string | null } | null;
}

// Every "which events/banners/skins are current" helper below takes `now` without a
// default: the home page passes the request's clock (finalizeHome), and a defaulted
// clock is how the content export used to freeze its own moment into pages.
export function loadGameEvents(): GameEvent[] {
  const raw = loadAllEventYears() as RawEvent[];
  const events: GameEvent[] = [];
  for (const e of raw) {
    const dateRange = e.global?.dateRange;
    if (!dateRange) continue;
    const window = parseGameWindow(dateRange, e.global ?? {});
    if (!window) continue;
    events.push({ name: e.name, poster: publishedArt(e.poster), year: e.year, ...e.global, dateRange, start: window.start, end: window.end });
  }
  return events;
}

export function getOngoingEvents(now: Date, events = loadGameEvents()): GameEvent[] {
  return events
    .filter((e) => e.start <= now && now < e.end)
    .sort((a, b) => a.end.getTime() - b.end.getTime());
}

/** The single soonest upcoming event -- guarantees there's always at
 * least one banner to show, even with zero ongoing events. */
export function getNextUpcomingEvent(now: Date, events = loadGameEvents()): GameEvent | null {
  const upcoming = events
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
export function getOngoingGachaBanners(now: Date, banners = getBannersSortedByDate()): GachaBannerWithWindow[] {
  const result: GachaBannerWithWindow[] = [];
  for (const b of banners) {
    if (!b.global_date) continue; // CN-only pools are not active on Global.
    const start = parseBannerDate(b);
    const end = parseBannerEndDate(b);
    if (!start || !end) continue;
    if (start <= now && now < end) {
      result.push({ ...b, start, end });
    }
  }
  return result.sort((a, b) => {
    const rankDiff = bannerCategoryRank(a) - bannerCategoryRank(b);
    if (rankDiff !== 0) return rankDiff;
    return a.end.getTime() - b.end.getTime(); // soonest-ending first within the same category
  });
}

/** Keep the next Global banner visible with a start countdown. */
export function getHomeGachaBanners(now: Date, banners = getBannersSortedByDate()): GachaBannerWithWindow[] {
  const ongoing = getOngoingGachaBanners(now, banners);
  const next = banners.filter(banner => banner.global_date).map(banner => {
    const start = parseBannerDate(banner), end = parseBannerEndDate(banner);
    return start && end && start > now ? { ...banner, start, end } : null;
  }).filter((banner): banner is GachaBannerWithWindow => banner !== null)
    .sort((a, b) => a.start.getTime() - b.start.getTime())[0];
  return next ? [...ongoing, next] : ongoing;
}

/** Skins tied to a currently-ongoing event, via each skin's own
 * "release" field matching that event's name. */
export function getOngoingSkins(now: Date, allSkins = getAllSkins(), events = loadGameEvents()): Skin[] {
  const ongoingEvents = getOngoingEvents(now, events);
  /* Every event name, not just the ongoing ones: the point of the list is to let a
     release be recognised as belonging to some OTHER event than this one. */
  const allEventNames = events.map((e) => e.name);
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

// --- Full events listing, for the standalone /events pages ---------

/** One event on the Global calendar, confirmed or predicted. Clock-free: whether
 * it is ongoing, upcoming or over is a question for the moment of reading, never
 * something the content export decides once. */
export interface GameEventListing extends GameEvent {
  isPredicted: boolean; // true when there's no confirmed Global date yet -- start/end are estimated from the CN date plus a fixed average localization gap
}

// Average CN-to-Global localization gap, in days -- used ONLY to
// estimate a release window for events that have a CN date but no
// confirmed Global date yet. This is a rough approximation (Arknights
// Global has historically trailed CN by roughly 5-6 months); adjust
// PREDICTED_GAP_DAYS if you have a more precise figure to use instead.
export const PREDICTED_GAP_DAYS = 175;

function formatDateRange(start: Date, end: Date): string {
  function fmt(d: Date): string {
    return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`;
  }
  return `${fmt(start)}\u2013${fmt(end)}`;
}

/** Every event with a Global window, including a best-effort predicted
 * window (see PREDICTED_GAP_DAYS) for events that only have a CN date on
 * record so far, oldest first. Past events stay in: an event page exists for
 * as long as its record does, and "ongoing or upcoming" is decided at the
 * moment of reading (lib/schedule/eventRows.ts). Broader than
 * getOngoingEvents/getNextUpcomingEvent above, which only ever surface real,
 * Global-confirmed dates. */
export function getEventCalendar(): GameEventListing[] {
  const raw = loadAllEventYears() as RawEvent[];
  const result: GameEventListing[] = [];

  for (const e of raw) {
    const globalRange = e.global?.dateRange;
    if (globalRange) {
      const window = parseGameWindow(globalRange, e.global ?? {});
      if (!window) continue;
      result.push({
        name: e.name,
        poster: publishedArt(e.poster),
        year: e.year,
        dateRange: globalRange,
        start: window.start,
        end: window.end,
        isPredicted: /estimated|predicted/i.test(e.global?.note || ''),
      });
      continue;
    }

    // No confirmed Global date -- estimate one from CN's, if known.
    const cnRange = e.cn?.dateRange;
    if (!cnRange) continue; // no date info at all -- nothing to show or predict from
    const cnWindow = parseGameWindow(cnRange);
    if (!cnWindow) continue;
    const predictedStart = new Date(cnWindow.start.getTime() + PREDICTED_GAP_DAYS * 86400000);
    const predictedEnd = new Date(cnWindow.end.getTime() + PREDICTED_GAP_DAYS * 86400000);

    result.push({
      name: e.name,
      poster: publishedArt(e.poster),
      year: e.year,
      dateRange: formatDateRange(predictedStart, predictedEnd),
      start: predictedStart,
      end: predictedEnd,
      isPredicted: true,
    });
  }

  return result.sort((a, b) => a.start.getTime() - b.start.getTime());
}
