import eventRewards from '@/data/pull-event-rewards.json';
import { getAllEvents } from '@/lib/schedule/schedule';
import type { BacklogSources, PullEventReward } from './pulls';
import { getAllEventListings } from '@/lib/home/frontPageContent';
import { getAllHeadhuntingBanners } from '@/lib/gacha/headhuntingBanners';
import type { UpcomingBanner } from './pulls';
import { ALL_BANNERS } from './sources';
import { pullArtworkUrl } from './artwork';
import { validPlanDate } from './plan';
import { resolvePullBannerWindows } from './bannerWindows';

export const pullBannerKey = (name: string) => name.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();

/** Rewards are generated separately, but their snapshot must not pin old banner
 * dates after the site's schedule is corrected. Resolve dates at page build/ISR.
 * Unknown windows are omitted instead of reviving a stale estimated date. */
type CurrentPullBanner = { name: string; aliases?: string[]; global_date: string | null; global_date_estimated?: boolean;
  global_window?: { timingSource?: string | null }; category?: string; six_stars?: string[]; rate_up_six_stars?: string[];
  banner_image?: string | null; linked_event?: string | null; cnPoolId?: string;
};
export function resolvePullSchedule(rewards: readonly UpcomingBanner[], current: readonly CurrentPullBanner[]): UpcomingBanner[] {
  const byName = new Map(rewards.flatMap(b => [b.name, ...(b.aliases ?? [])].map(name => [pullBannerKey(name), b] as const)));
  return current.flatMap(latest => {
    const banner = [latest.name, ...(latest.aliases ?? [])].map(name => byName.get(pullBannerKey(name))).find(Boolean);
    const dates = latest.global_date?.split(/[–—]/).map(part => {
      const match = part.trim().match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
      return match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` : '';
    });
    if (!dates || dates.length !== 2 || !validPlanDate(dates[0]) || !validPlanDate(dates[1]) || dates[1] < dates[0]) return [];
    const [start, end] = dates;
    const featured = latest.six_stars ?? banner?.sixStars ?? [];
    return [{
      rerun: false,
      op: 0, opSource: 'none' as const, cnAct: null, inBacklog: false, ruleType: null,
      freeDaily: 0, freeTicket: 0, freePulls: 0, wishActId: null, wishDays: 0, wishOrundum: 0, hasShop: false,
      ...banner,
      name: latest.name, aliases: latest.aliases ?? [], start, end,
      category: latest.category ?? banner?.category ?? 'standard',
      sixStars: featured,
      alsoRatedUp: (latest.rate_up_six_stars ?? banner?.alsoRatedUp ?? []).filter(name => !featured.includes(name)),
      image: latest.banner_image === undefined ? banner?.image ?? null : latest.banner_image,
      event: latest.linked_event === undefined ? banner?.event ?? null : latest.linked_event,
      poolId: latest.cnPoolId ?? banner?.poolId ?? null,
      datesEstimated: !latest.global_window?.timingSource || latest.global_date_estimated === true,
      days: (Date.parse(end) - Date.parse(start)) / 86400000,
    }];
  });
}
export function getPullSchedule(): UpcomingBanner[] {
  const estimated = new Set(getAllEventListings().filter(event => event.isPredicted).map(event => pullBannerKey(event.name)));
  return resolvePullSchedule(ALL_BANNERS, resolvePullBannerWindows(getAllHeadhuntingBanners())).map(banner => ({
    ...banner, image: pullArtworkUrl(banner.image), datesEstimated: banner.datesEstimated || (!!banner.event && estimated.has(pullBannerKey(banner.event))),
  }));
}

/** Resolve rewards against event windows, never banner windows. Missing or
 * invalid dates cannot silently resurrect the old reward snapshot's dates.
 * `inBacklog` is marked against the backlog the page itself ships, so an event
 * skipped here is always one `remainingBacklog` counts. */
export function resolvePullEventSchedule(current: ReturnType<typeof getAllEvents>, backlog: BacklogSources): PullEventReward[] {
  const byName = new Map(current.map(event => [pullBannerKey(event.name), event]));
  const plain = (name: string) => pullBannerKey(name.replace(/^\[[^\]]*\]\s*/, '').replace(/\s+rerun$/i, ''));
  return eventRewards.flatMap(reward => {
    const event = byName.get(pullBannerKey(reward.event));
    const dates = event?.global.dateRange?.split(/[–—]/).map(date => date.trim().replaceAll('/', '-'));
    if (!dates || dates.length !== 2 || !dates.every(validPlanDate) || dates[1] < dates[0]) return [];
    if (!reward.op && !reward.shopPermits && !reward.wishOrundum) return [];
    return [{
      name: reward.event, event: reward.event, start: dates[0], end: dates[1],
      rerun: /rerun/i.test(reward.event), op: reward.op, opSource: 'cn' as const,
      inBacklog: backlog.playable.some(known => plain(known.name) === plain(reward.event)),
      hasShop: reward.shopPermits > 0, shopPermits: reward.shopPermits,
      wishActId: reward.wishActId, wishDays: reward.wishDays, wishOrundum: reward.wishOrundum,
      legacyNames: ALL_BANNERS.filter(b => b.event === reward.event).map(b => b.name),
    }];
  }).sort((a,b) => a.start.localeCompare(b.start));
}
export function getPullEventSchedule(backlog: BacklogSources): PullEventReward[] {
  return resolvePullEventSchedule(getAllEvents(), backlog);
}
