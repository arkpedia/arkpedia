import eventRewards from '@/data/pull-event-rewards.json';
import { getAllEvents } from '@/lib/schedule/schedule';
import { PLAYABLE_EVENTS, type PullEventReward } from './pulls';
import { getAllEventListings } from '@/lib/home/frontPageContent';
import { getAllHeadhuntingBanners } from '@/lib/gacha/headhuntingBanners';
import { ALL_BANNERS, type UpcomingBanner } from './pulls';
import { pullArtworkUrl } from './artwork';
import { validPlanDate } from './plan';

export const pullBannerKey = (name: string) => name.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();

/** Rewards are generated separately, but their snapshot must not pin old banner
 * dates after the site's schedule is corrected. Resolve dates at page build/ISR.
 * Unknown windows are omitted instead of reviving a stale estimated date. */
export function resolvePullSchedule(rewards: readonly UpcomingBanner[], current: readonly { name: string; global_date: string | null; global_date_estimated?: boolean; global_window?: { timingSource?: string | null } }[]): UpcomingBanner[] {
  const byName = new Map(current.map(b => [pullBannerKey(b.name), b]));
  return rewards.flatMap(banner => {
    const latest = byName.get(pullBannerKey(banner.name));
    const dates = latest?.global_date?.split(/[–—]/).map(part => {
      const match = part.trim().match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
      return match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` : '';
    });
    if (!dates || dates.length !== 2 || !validPlanDate(dates[0]) || !validPlanDate(dates[1]) || dates[1] < dates[0]) return [];
    const [start, end] = dates;
    return [{
      ...banner,
      start,
      end,
      // A client/official timing source confirms the window. The legacy flag
      // remains accepted for old saved snapshots, but new data records exact
      // provenance in global_window instead of maintaining a second truth.
      datesEstimated: !latest?.global_window?.timingSource || latest?.global_date_estimated === true,
      days: (Date.parse(end) - Date.parse(start)) / 86400000,
    }];
  });
}
export function getPullSchedule(): UpcomingBanner[] {
  const estimated = new Set(getAllEventListings().filter(event => event.isPredicted).map(event => pullBannerKey(event.name)));
  return resolvePullSchedule(ALL_BANNERS, getAllHeadhuntingBanners()).map(banner => ({
    ...banner, image: pullArtworkUrl(banner.image), datesEstimated: banner.datesEstimated || (!!banner.event && estimated.has(pullBannerKey(banner.event))),
  }));
}

/** Resolve rewards against event windows, never banner windows. Missing or
 * invalid dates cannot silently resurrect the old reward snapshot's dates. */
export function resolvePullEventSchedule(current: ReturnType<typeof getAllEvents>): PullEventReward[] {
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
      inBacklog: PLAYABLE_EVENTS.some(known => plain(known.name) === plain(reward.event)),
      hasShop: reward.shopPermits > 0, shopPermits: reward.shopPermits,
      wishActId: reward.wishActId, wishDays: reward.wishDays, wishOrundum: reward.wishOrundum,
      legacyNames: ALL_BANNERS.filter(b => b.event === reward.event).map(b => b.name),
    }];
  }).sort((a,b) => a.start.localeCompare(b.start));
}
export function getPullEventSchedule(): PullEventReward[] {
  return resolvePullEventSchedule(getAllEvents());
}
