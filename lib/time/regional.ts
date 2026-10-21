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

/** Missing regional evidence is unavailable, never Global in a different timezone. */
export function regionalEvents<T extends ScheduleEvent>(events: readonly T[], schedule: RegionalSchedule | undefined, server: GameServer): T[] {
  if (server === 'en') return [...events];
  return events.map(event => {
    const time = schedule?.events?.[event.name];
    const { art: _art, ...timing } = time ?? {};
    const global = time ? { ...timing, dateRange: time.modeId && time.releaseDate ? `${time.releaseDate}–${time.releaseDate}` : regionalRange(time, server), note: null }
      : { dateRange: null, note: `${server.toUpperCase()} schedule not announced` };
    const art = event.bannerName ? schedule?.banners?.[event.bannerName] : time;
    return { ...event, global, poster: regionalArt(art, event.poster, server) };
  });
}
export function regionalBanners<T extends HeadhuntingBanner>(banners: readonly T[], schedule: RegionalSchedule | undefined, server: GameServer): T[] {
  if (server === 'en') return [...banners];
  return banners.flatMap(banner => {
    const time = schedule?.banners?.[banner.name];
    if (!time) return [];
    return [{ ...banner, banner_image: regionalArt(time, banner.banner_image ?? null, server), timingServer: server, global_date: regionalRange(time, server), global_window: time,
      global_date_estimated: false, globalLineupPending: false,
      globalScheduleStatus: time.status === 'announced' ? 'announced' as const : 'datamined' as const }];
  });
}
export function regionalPullBanners(banners: readonly UpcomingBanner[], schedule: RegionalSchedule | undefined, server: GameServer): UpcomingBanner[] {
  if (server === 'en') return [...banners];
  return banners.flatMap(banner => {
    const time = schedule?.banners?.[banner.name];
    return time ? [{ ...banner, image: regionalArt(time, banner.image, server), startAt: time.startAt, endAt: time.endAt, server, start: regionalDate(time.startAt, server), end: regionalDate(time.endAt, server), datesEstimated: time.status !== 'announced' }] : [];
  });
}
export function regionalPullEvents(events: readonly PullEventReward[], schedule: RegionalSchedule | undefined, server: GameServer): PullEventReward[] {
  if (server === 'en') return [...events];
  return events.flatMap(event => {
    const time = (event.event ? schedule?.events?.[event.event] : undefined);
    return time ? [{ ...event, ...time, start: regionalDate(time.startAt, server), end: regionalDate(time.endAt, server) }] : [];
  });
}
export function regionalCards<T extends Pick<StageModeCard, 'id' | 'start' | 'end'>>(cards: readonly T[], schedule: RegionalSchedule | undefined, server: GameServer): T[] {
  if (server === 'en') return [...cards];
  return cards.map(card => ({ ...card, start: schedule?.contents?.[card.id]?.[0] ?? null, end: schedule?.contents?.[card.id]?.[1] ?? null }));
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
 * Regional official shop windows are published separately by ingestion; missing inventories
 * are kept unscheduled rather than offered under Global opening/closing instants. Global keeps
 * its catalogue windows and adds the sales its own official posts list (sync-regional-schedules
 * englishNoticeSkinWindows): the anniversary store's new and re-edition outfits, 2026-10-14,
 * were in Global's post but in no catalogue window, so Global's home showed 3 of 28. */
export function regionalSkinWindows(windows: readonly SkinWindow[], schedule: RegionalSchedule | undefined, server: GameServer): SkinWindow[] {
  if (server === 'en') return [...windows, ...(schedule?.skinWindows ?? [])];
  return schedule?.skinWindows ?? [];
}
export function regionalSkinCollections(collections: readonly SkinCollection[], schedule: RegionalSchedule | undefined, server: GameServer): SkinCollection[] {
  if (server === 'en') return [...collections];
  return regionalSkinWindows([], schedule, server).filter(window => window.kind === 'shop').map(window => ({
    id: `${server}/${window.event}/${window.label}/${window.startAt}`, name: `${window.event} · ${window.label}`,
    start: regionalDate(window.startAt, server), end: regionalDate(new Date(Date.parse(window.endAt) - 1).toISOString(), server),
    startAt: window.startAt, endAt: window.endAt, estimated: !!window.estimated, skinIds: window.skinIds,
    featuredIds: window.newRelease ? window.skinIds : [], source: window.source, sourceRegion: server,
  }));
}

export function regionalGameEvents<T extends { name: string; poster: string | null; dateRange: string; start: string; end: string; shopEndAt?: string }>(events: readonly T[], schedule: RegionalSchedule | undefined, server: GameServer): T[] {
  if (server === 'en') return [...events];
  return events.flatMap(event => {
    const time = schedule?.events?.[event.name];
    // The window's own fields are timings; its art is the poster's, not a field of the event.
    const { art: _art, ...timing } = time ?? {};
    return time ? [{ ...event, ...timing, poster: regionalArt(time, event.poster, server), shopEndAt: time.shopEndAt ?? time.endAt, dateRange: regionalRange(time, server), start: time.startAt, end: time.endAt }] : [];
  });
}


export function regionalFreeRewards<T extends { id: string; startAt?: number; endAt?: number }>(rewards: readonly T[], schedule: RegionalSchedule | undefined, server: GameServer): T[] {
  if (server === 'en') return [...rewards];
  return rewards.flatMap(reward => {
    if (!reward.startAt && !reward.endAt) return [reward];
    const time = schedule?.rewardWindows?.[reward.id];
    return time ? [{ ...reward, startAt: Date.parse(time.startAt), endAt: Date.parse(time.endAt) }] : [];
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
