import { serverDay, type GameServer } from './servers.mjs';
import { REGIONAL_MATERIAL } from '@/lib/i18n/regionalMaterial';
import type { GameWindowTimes } from '@/lib/schedule/gameWindow';
import type { ScheduleEvent } from '@/lib/schedule/scheduleTypes';
import type { HeadhuntingBanner } from '@/lib/gacha/headhuntingBanners';
import type { UpcomingBanner, PullEventReward } from '@/lib/pulls/pulls';
import type { StageModeCard } from '@/lib/stages/stageTypes';
import type { SkinWindow } from '@/lib/skins/skinAvailability';
import type { SkinCollection } from '@/lib/pulls/skinCollections';
import { SERVER_TIME, serverWeekday } from './servers.mjs';

export interface RegionalWindow extends GameWindowTimes {
  startAt: string; endAt: string; timingSource: string;
  activityId?: string; poolId?: string; releaseDate?: string; modeId?: string; localName?: string; status?: string;
  /** The server's own key art for the event or banner, from its in-game board (or KR's official site
   *  headline): the address on the official host and the hash the poller recorded
   *  (scripts/sync/regional-board.mjs). JP and KR only. */
  art?: { url: string; sha1: string };
}
export interface RegionalSchedule {
  sources: Record<string, string>;
  farming?: import('@/lib/farming/eventFarming').EventFarmingDrop[];
  rewardWindows?: Record<string, RegionalWindow>;
  activities?: Record<string, RegionalWindow>;
  events?: Record<string, RegionalWindow>;
  banners?: Record<string, RegionalWindow>;
  contents?: Record<string, number[]>;
  weekly?: Record<string, number[]>;
  forceOpen?: (RegionalWindow & { contentIds: string[] })[];
  annihilation?: { stageId: string; slug: string; contentId: string | null; start: number; end: number }[];
  sss?: { id: string; number: number; name: string; start: number; end: number; contentIds: string[]; replicated: string[] }[];
  skinWindows?: SkinWindow[];
  skinReleases?: Record<string, { at: string; localName: string | null; timingSource: string }>;
  releases?: Record<string, number>;
}
export interface RegionalSchedules { version: 1; servers: Partial<Record<GameServer, RegionalSchedule>> }

/**
 * The regional table cut down to one page's own events and banners, for a page about one event.
 * The route's table (regionalServer.ts) holds every server's every event and banner window, about
 * 600 kB with the boards' art (#598): shipped on each of the hundreds of event pages, it ran the
 * dev build out of memory on the NAS runner (2026-10-21) and made each event page that much
 * heavier to load. A page about one event reads only its own window and its banner's.
 */
export function regionalScheduleSlice(table: RegionalSchedules, keep: { events: readonly string[]; banners: readonly string[] }): RegionalSchedules {
  const pick = <T,>(rows: Record<string, T> | undefined, names: readonly string[]) =>
    rows ? Object.fromEntries(names.filter(name => Object.hasOwn(rows, name)).map(name => [name, rows[name]])) : rows;
  return { ...table, servers: Object.fromEntries(Object.entries(table.servers ?? {}).map(([server, schedule]) => [server, schedule && {
    ...schedule,
    ...(schedule.events ? { events: pick(schedule.events, keep.events) } : {}),
    ...(schedule.banners ? { banners: pick(schedule.banners, keep.banners) } : {}),
  }])) as RegionalSchedules['servers'] };
}
/** The table without each window's `timingSource`: the provenance link to the game's own table,
 *  kept for the content run and the schedule's CN rows, which the browser never reads from this
 *  table. On the home page it was 1,450 raw.githubusercontent.com links, 250 kB of the 720 kB
 *  table (2026-10-27). Clock-free, so it can run per request on a release's table. Every
 *  server's rows stay: JP and KR read their own windows from the same shape. */
export function stripRegionalTimingSources(table: RegionalSchedules): RegionalSchedules {
  const windows = <T extends { timingSource?: string }>(rows: Record<string, T> | undefined) =>
    rows && Object.fromEntries(Object.entries(rows).map(([key, { timingSource: _source, ...rest }]) => [key, rest]));
  return { ...table, servers: Object.fromEntries(Object.entries(table.servers ?? {}).map(([server, schedule]) => [server, schedule && {
    ...schedule,
    ...(schedule.events ? { events: windows(schedule.events) } : {}),
    ...(schedule.banners ? { banners: windows(schedule.banners) } : {}),
    ...(schedule.activities ? { activities: windows(schedule.activities) } : {}),
    ...(schedule.rewardWindows ? { rewardWindows: windows(schedule.rewardWindows) } : {}),
    ...(schedule.skinReleases ? { skinReleases: windows(schedule.skinReleases) } : {}),
    ...(schedule.forceOpen ? { forceOpen: schedule.forceOpen.map(({ timingSource: _source, ...rest }) => rest) } : {}),
  }])) as RegionalSchedules['servers'] } as RegionalSchedules;
}
/** A page's props with its regional table stripped (stripRegionalTimingSources), for a
 *  withContentPage finalize; props without the table pass through. */
export function withLightRegionalTable<P extends object>(props: P): P {
  const tables = (props as P & { __contentTables?: Record<string, unknown> }).__contentTables;
  const table = tables?.['regional-schedules'] as RegionalSchedules | undefined;
  return table ? { ...props, __contentTables: { ...tables, 'regional-schedules': stripRegionalTimingSources(table) } } : props;
}
export const regionalDate = (instant: string, server: GameServer) => serverDay(Date.parse(instant) / 1000, SERVER_TIME[server].offset).replaceAll('/', '-');
export const regionalRange = (window: RegionalWindow, server: GameServer) => `${regionalDate(window.startAt, server).replaceAll('-', '/')}–${regionalDate(window.endAt, server).replaceAll('-', '/')}`;

/** The art a page shows for an event or a banner on the site's server: that server's own, from its
 *  in-game board, else Global's (`global`, the image repository's). Every picture the regional
 *  helpers below hand out is this one, so a list and the event's own page cannot disagree. */
export function regionalArt(window: RegionalWindow | undefined, global: string | null, server: GameServer): string | null {
  // Global's art on every server until the site has JP/KR languages (lib/i18n/regionalMaterial.ts).
  if (server === 'en' || !REGIONAL_MATERIAL) return global;
  return window?.art?.url ?? global;
}

/*
 * JP and KR show Global's lists one to one: the same items in the same order, only the dates
 * change. Every helper below maps and never drops: an item the server's schedule has a window
 * for takes that window; any other keeps Global's own date or prediction (CN-based ones
 * included), marked as an estimate the way Global marks one. They once dropped such items or
 * blanked their dates, so JP and KR lost every upcoming event, every CN-predicted banner and
 * Global's order (2026-10-21). Which items are over or live is then decided by the page's own
 * Global logic on these dates, so a known-ended JP/KR window ends an item as Global's would.
 * scripts/tests/test-regional-parity.ts holds every helper to it.
 */
const notAnnounced = (server: GameServer) => `Estimated from Global's dates; ${server.toUpperCase()} schedule not announced`;
const isEstimateNote = (note: string | null | undefined) => /estimated|predicted|unannounced|withdrawn/i.test(note ?? '');

export function regionalEvents<T extends ScheduleEvent>(events: readonly T[], schedule: RegionalSchedule | undefined, server: GameServer): T[] {
  if (server === 'en') return [...events];
  return events.map(event => {
    const time = schedule?.events?.[event.name];
    const { art: _art, ...timing } = time ?? {};
    const dated = !!(event.global.dateRange || event.global.releaseDate);
    const global = time ? { ...timing, dateRange: time.modeId && time.releaseDate ? `${time.releaseDate}–${time.releaseDate}` : regionalRange(time, server), note: null }
      : { ...event.global, note: dated && !isEstimateNote(event.global.note) ? notAnnounced(server) : event.global.note };
    const art = event.bannerName ? schedule?.banners?.[event.bannerName] : time;
    return { ...event, global, poster: regionalArt(art, event.poster, server) };
  });
}
export function regionalBanners<T extends HeadhuntingBanner>(banners: readonly T[], schedule: RegionalSchedule | undefined, server: GameServer): T[] {
  if (server === 'en') return [...banners];
  return banners.map(banner => {
    const time = schedule?.banners?.[banner.name];
    if (!time) return { ...banner, global_date_estimated: banner.global_date_estimated || !!banner.global_date };
    return { ...banner, banner_image: regionalArt(time, banner.banner_image ?? null, server), timingServer: server, global_date: regionalRange(time, server), global_window: time,
      global_date_estimated: false, globalLineupPending: false,
      globalScheduleStatus: time.status === 'announced' ? 'announced' as const : 'datamined' as const };
  });
}
export function regionalPullBanners(banners: readonly UpcomingBanner[], schedule: RegionalSchedule | undefined, server: GameServer): UpcomingBanner[] {
  if (server === 'en') return [...banners];
  return banners.map(banner => {
    const time = schedule?.banners?.[banner.name];
    return time ? { ...banner, image: regionalArt(time, banner.image, server), startAt: time.startAt, endAt: time.endAt, server, start: regionalDate(time.startAt, server), end: regionalDate(time.endAt, server), datesEstimated: time.status !== 'announced' }
      : { ...banner, datesEstimated: true };
  });
}
export function regionalPullEvents(events: readonly PullEventReward[], schedule: RegionalSchedule | undefined, server: GameServer): PullEventReward[] {
  if (server === 'en') return [...events];
  return events.map(event => {
    const time = (event.event ? schedule?.events?.[event.event] : undefined);
    return time ? { ...event, ...time, start: regionalDate(time.startAt, server), end: regionalDate(time.endAt, server) } : { ...event };
  });
}
export function regionalCards<T extends Pick<StageModeCard, 'id' | 'start' | 'end'>>(cards: readonly T[], schedule: RegionalSchedule | undefined, server: GameServer): T[] {
  if (server === 'en') return [...cards];
  return cards.map(card => {
    const window = schedule?.contents?.[card.id];
    return window ? { ...card, start: window[0] ?? null, end: window[1] ?? null } : { ...card };
  });
}
export const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
/** Exact force-open campaigns override the ordinary reset-day rotation, separately per region. */
export function supplyDays(id: string, schedule: RegionalSchedule | undefined, fallback: readonly string[]): string[] {
  return schedule?.weekly?.[id]?.map(day => WEEKDAY_NAMES[day - 1]).filter(Boolean) ?? [...fallback];
}
export function supplyOpen(id: string, now: number, schedule: RegionalSchedule | undefined, server: GameServer, pickedDay?: string): boolean {
  const today = serverWeekday(new Date(now), server);
  if ((!pickedDay || pickedDay === today) && schedule?.forceOpen?.some(window => window.contentIds.includes(id) && Date.parse(window.startAt) <= now && now < Date.parse(window.endAt))) return true;
  return supplyDays(id, schedule, []).includes(pickedDay ?? today);
}

/** Shop windows need evidence for their own close. A chapter's stage close is not its shop close.
 * Global keeps its catalogue windows and adds the sales its own official posts list (sync-regional-schedules
 * englishNoticeSkinWindows): the anniversary store's new and re-edition outfits, 2026-10-14,
 * were in Global's post but in no catalogue window, so Global's home showed 3 of 28.
 * JP and KR take Global's list (call them with the 'en' result) and move each window onto the
 * server's own official sale of the same outfits where it has one (regionalSale). A window
 * without one keeps Global's dates and flags: marking a confirmed Global sale estimated would
 * take its outfits off "Available now" (computeSkinCountdowns), and the list keeps Global's items. */
export function regionalSkinWindows(windows: readonly SkinWindow[], schedule: RegionalSchedule | undefined, server: GameServer): SkinWindow[] {
  if (server === 'en') {
    const official = schedule?.skinWindows ?? [];
    // The same notice can correct a sale after an earlier release (or a hand-entered
    // confirmation). Replace that outfit's old window, never add two competing clocks.
    const retained = windows.flatMap(window => {
      const skinIds = window.skinIds.filter(id => !official.some(sale => !sale.estimated && sale.kind === window.kind && sale.skinIds.includes(id)
        && ((!!sale.source && sale.source === window.source)
          || (Date.parse(sale.startAt) < Date.parse(window.endAt) && Date.parse(window.startAt) < Date.parse(sale.endAt)))));
      return skinIds.length ? [{ ...window, skinIds }] : [];
    });
    return [...retained, ...official];
  }
  return windows.map(window => {
    const sale = regionalSale(window, schedule);
    return sale ? { ...window, startAt: sale.startAt, endAt: sale.endAt, estimated: !!sale.estimated, source: sale.source ?? window.source } : { ...window };
  });
}
/** Global's shop collections, each on the server's own sale of its outfits where it has one, else
 *  on Global's dates marked estimated (the planner only labels them). Global itself included: its
 *  collections come from the catalogue (CN's shops, projected), and its own official posts list
 *  the same sales (englishNoticeSkinWindows), so a matched one takes the post's dates and is no
 *  estimate. The anniversary store's returning outfits, 2026-10-14, were "CN-based estimate" in
 *  the planner while Global's post and /skins had them confirmed through 2026-11-11. */
export function regionalSkinCollections(collections: readonly SkinCollection[], schedule: RegionalSchedule | undefined, server: GameServer): SkinCollection[] {
  return collections.map(collection => {
    // A CN-projected shop carries calendar days only; its opening day is near enough to match on.
    const sale = regionalSale({ kind: 'shop', startAt: collection.startAt ?? `${collection.start}T00:00:00.000Z`, endAt: collection.endAt ?? `${collection.end}T00:00:00.000Z`, skinIds: collection.skinIds }, schedule);
    if (!sale) return server === 'en' ? { ...collection } : { ...collection, estimated: true };
    return { ...collection, start: regionalDate(sale.startAt, server), end: regionalDate(new Date(Date.parse(sale.endAt) - 1).toISOString(), server),
      startAt: sale.startAt, endAt: sale.endAt, estimated: !!sale.estimated, source: sale.source, sourceRegion: server === 'en' ? 'global' : server };
  });
}

const SALE_MATCH_DAYS = 28;
/** The server's own sale of a Global window's outfits: the same kind, opening within four weeks
 *  of it, sharing at least half of the two inventories' outfits (by Jaccard), the best such. JP
 *  names its sales in Japanese and KR in English, so the outfits are the key, not the event's
 *  name; the overlap rule keeps a 196-outfit Fashion Review off a 23-outfit returning shop. */
function regionalSale(window: Pick<SkinWindow, 'kind' | 'startAt' | 'endAt' | 'skinIds'>, schedule: RegionalSchedule | undefined): SkinWindow | undefined {
  const start = Date.parse(window.startAt), ids = new Set(window.skinIds);
  let best: SkinWindow | undefined, bestScore = 0.5;
  for (const sale of schedule?.skinWindows ?? []) {
    if (sale.kind !== window.kind || !(Math.abs(Date.parse(sale.startAt) - start) <= SALE_MATCH_DAYS * 86_400_000)) continue;
    const saleIds = new Set(sale.skinIds);
    const shared = [...saleIds].filter(id => ids.has(id)).length;
    const score = shared / (ids.size + saleIds.size - shared);
    if (score > bestScore || score === bestScore && !best) { best = sale; bestScore = score; }
  }
  return best;
}

export function regionalGameEvents<T extends { name: string; poster: string | null; dateRange: string; start: string; end: string; shopEndAt?: string }>(events: readonly T[], schedule: RegionalSchedule | undefined, server: GameServer): T[] {
  if (server === 'en') return [...events];
  return events.map(event => {
    const time = schedule?.events?.[event.name];
    // The window's own fields are timings; its art is the poster's, not a field of the event.
    const { art: _art, ...timing } = time ?? {};
    return time ? { ...event, ...timing, poster: regionalArt(time, event.poster, server), shopEndAt: time.shopEndAt ?? time.endAt, dateRange: regionalRange(time, server), start: time.startAt, end: time.endAt } : { ...event };
  });
}


export function regionalFreeRewards<T extends { id: string; startAt?: number; endAt?: number }>(rewards: readonly T[], schedule: RegionalSchedule | undefined, server: GameServer): T[] {
  if (server === 'en') return [...rewards];
  return rewards.map(reward => {
    const time = reward.startAt || reward.endAt ? schedule?.rewardWindows?.[reward.id] : undefined;
    return time ? { ...reward, startAt: Date.parse(time.startAt), endAt: Date.parse(time.endAt) } : { ...reward };
  });
}

/** ISR does not know the selected account. Keep a timed reward until every
 * evidenced region has closed it; the browser then applies its own window. */
export function currentRegionalFreeRewards<T extends { id: string; endAt?: number }>(rewards: readonly T[], schedules: RegionalSchedules | undefined, now: number): T[] {
  return rewards.filter(reward => !reward.endAt || reward.endAt > now
    || Object.values(schedules?.servers ?? {}).some(schedule => {
      const window = schedule?.rewardWindows?.[reward.id];
      return window && Date.parse(window.endAt) > now;
    }));
}
