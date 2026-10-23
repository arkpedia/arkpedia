import { serverCalendarTime } from '@/lib/time/servers.mjs';
import { planningWindowEnd } from './planningWindows';
import type { BannerOdds } from './probability';
import type { UpcomingBanner } from './pulls';
import type { SkinCollection } from './skinCollections';

/** The /pull-planner props that change with the moment of reading. */
export interface PullPlanWindows {
  scheduledBanners: UpcomingBanner[];
  bannerOdds: Record<string, BannerOdds>;
  skinCollections: SkinCollection[];
}

/** The shops still open on `today` (YYYY-MM-DD, Global calendar): a shop is kept through its last day. */
export function openSkinCollections(collections: readonly SkinCollection[], today: string, now?: number): SkinCollection[] {
  return collections.filter(collection => now === undefined ? collection.end >= today : planningWindowEnd(collection) > now);
}

/**
 * Drops the banners and outfit shops that are over at `now`. The content export
 * keeps every one (it must not decide what "over" means once for a whole release);
 * this runs per request so the page ships only what the planner can still use, and
 * the server render lists the same shops the browser keeps (SkinPlan filters again
 * on the reader's day, so a longer server list would shrink under the reader).
 * A banner stays through the end of its last day, as the planner's own filter has it.
 */
export function currentPullPlan<P extends PullPlanWindows>(props: P, now: number): P {
  if ((props as P & { __contentTables?: Record<string, unknown> }).__contentTables?.['regional-schedules']) return props;
  const today = serverCalendarTime(new Date(now), 'en').toISOString().slice(0, 10);
  const scheduledBanners = props.scheduledBanners.filter(banner => planningWindowEnd(banner) > now);
  const names = new Set(scheduledBanners.map(banner => banner.name));
  return {
    ...props,
    scheduledBanners,
    bannerOdds: Object.fromEntries(Object.entries(props.bannerOdds).filter(([name]) => names.has(name))),
    skinCollections: openSkinCollections(props.skinCollections, today, now),
  };
}
