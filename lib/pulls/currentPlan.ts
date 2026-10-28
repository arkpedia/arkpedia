import { serverCalendarTime, type GameServer } from '@/lib/time/servers.mjs';
import { regionalPullBanners, regionalScheduleSlice, regionalSkinCollections, type RegionalSchedules } from '@/lib/time/regional';
import { planningWindowEnd } from './planningWindows';
import type { BannerOdds } from './probability';
import type { PullEventReward, UpcomingBanner } from './pulls';
import type { SkinCollection } from './skinCollections';

/** The /pulls props that change with the moment of reading. */
export interface PullPlanWindows {
  scheduledBanners: UpcomingBanner[];
  bannerOdds: Record<string, BannerOdds>;
  skinCollections: SkinCollection[];
  scheduledEvents?: PullEventReward[];
  /** The release's tables; `regional-schedules` holds every server's windows (lib/time/regional.ts). */
  __contentTables?: Record<string, unknown>;
}

/** The shops still open on `today` (YYYY-MM-DD, Global calendar): a shop is kept through its last day. */
export function openSkinCollections(collections: readonly SkinCollection[], today: string, now?: number): SkinCollection[] {
  return collections.filter(collection => now === undefined ? collection.end >= today : planningWindowEnd(collection) > now);
}

/**
 * Drops the banners and outfit shops that are over at `now`, on every server. The content
 * export keeps every one (it must not decide what "over" means once for a whole release);
 * this runs per request so the page ships only what the planner can still use, and the
 * server render lists the same shops the browser keeps (SkinPlan filters again on the
 * reader's day, so a longer server list would shrink under the reader).
 * A banner stays through the end of its last day, as the planner's own filter has it, and
 * while any server's own window for it is still open: JP and KR read Global's list on their
 * own dates (regionalPullBanners, regionalSkinCollections), so a banner Global has finished
 * is still ahead for a KR reader until KR's window closes too. The release's regional table
 * then ships only the kept banners' and the listed events' windows: it held every server's
 * every window ever run, 388 kB of the planner's 1.2 MB (2026-10-28), for the ~16 the
 * planner lists.
 */
export function currentPullPlan<P extends PullPlanWindows>(props: P, now: number): P {
  const table = props.__contentTables?.['regional-schedules'] as RegionalSchedules | undefined;
  const servers = table ? (Object.keys(table.servers) as GameServer[]) : [];
  const today = serverCalendarTime(new Date(now), 'en').toISOString().slice(0, 10);
  const scheduledBanners = props.scheduledBanners.filter(banner => planningWindowEnd(banner) > now
    || servers.some(server => planningWindowEnd(regionalPullBanners([banner], table?.servers[server], server)[0]) > now));
  const names = new Set(scheduledBanners.map(banner => banner.name));
  const skinCollections = props.skinCollections.filter(collection => openSkinCollections([collection], today, now).length > 0
    || servers.some(server => openSkinCollections(regionalSkinCollections([collection], table?.servers[server], server), today, now).length > 0));
  return {
    ...props,
    scheduledBanners,
    bannerOdds: Object.fromEntries(Object.entries(props.bannerOdds).filter(([name]) => names.has(name))),
    skinCollections,
    ...(table ? { __contentTables: { ...props.__contentTables, 'regional-schedules': regionalScheduleSlice(table, {
      events: (props.scheduledEvents ?? []).flatMap(event => event.event ? [event.event] : []),
      banners: [...names],
    }) } } : {}),
  };
}
