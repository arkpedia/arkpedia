import { parseGameWindow } from '@/lib/schedule/gameWindow';
import eventRewards from '@/data/pull-event-rewards.json';
import clearMedals from '@/data/rerun-clear-medals.json';
import { getAllEvents } from '@/lib/schedule/schedule';
import { rerunBacklogEvent, type BacklogSources, type PullEventReward } from './pulls';
import { estimateBannerFromCn, waitsForGlobal, globalBannerPreview } from '@/lib/gacha/bannerSchedule';
import { getEventCalendar, PREDICTED_GAP_DAYS } from '@/lib/home/frontPageContent';
import { getAllHeadhuntingBanners } from '@/lib/gacha/headhuntingBannerData';
import type { UpcomingBanner } from './pulls';
import { ALL_BANNERS } from './sources';
import { pullArtworkUrl } from './artwork';
import { validPlanDate } from './plan';
import { resolvePullBannerWindows } from './bannerWindows';

export const pullBannerKey = (name: string) => name.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();

/** Rewards are generated separately, but their snapshot must not pin old banner
 * dates after the site's schedule is corrected. Resolve dates at page build/ISR.
 * Unknown windows are omitted instead of reviving a stale estimated date. */
type CurrentPullBanner = { pull_type?: string; globalPoolId?: string; globalLineupPending?: boolean; name: string; aliases?: string[]; global_date: string | null; global_date_estimated?: boolean;
  global_window?: { startAt?: string; endAt?: string; timingSource?: string | null }; category?: string; six_stars?: string[]; rate_up_six_stars?: string[];
  banner_image?: string | null; linked_event?: string | null; cnPoolId?: string;
};
export function resolvePullSchedule(rewards: readonly UpcomingBanner[], current: readonly CurrentPullBanner[]): UpcomingBanner[] {
  const byName = new Map(rewards.flatMap(b => [b.name, ...(b.aliases ?? [])].map(name => [pullBannerKey(name), b] as const)));
  return current.map(globalBannerPreview).flatMap(latest => {
    const banner = [latest.name, ...(latest.aliases ?? [])].map(name => byName.get(pullBannerKey(name))).find(Boolean);
    const dates = latest.global_date?.split(/[–—]/).map(part => {
      const match = part.trim().match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
      return match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` : '';
    });
    if (!dates || dates.length !== 2 || !validPlanDate(dates[0]) || !validPlanDate(dates[1]) || dates[1] < dates[0]) return [];
    const [start, end] = dates;
    const window = parseGameWindow(latest.global_date, { startAt: latest.global_window?.startAt, endAt: latest.global_window?.endAt }, 'global', latest.pull_type === 'standard' || latest.pull_type === 'kernel');
    if (!window) return [];
    const featured = latest.six_stars ?? banner?.sixStars ?? [];
    return [{
      rerun: false,
      op: 0, opSource: 'none' as const, cnAct: null, inBacklog: false, ruleType: null,
      freeDaily: 0, freeTicket: 0, freePulls: 0, wishActId: null, wishDays: 0, wishOrundum: 0, hasShop: false,
      ...banner,
      name: latest.name, aliases: latest.aliases ?? [], start, end, startAt: window.start.toISOString(), endAt: window.end.toISOString(),
      category: latest.category ?? banner?.category ?? 'standard',
      sixStars: featured,
      ...(waitsForGlobal(latest) ? { globalLineupPending: true, ruleType: null, freeDaily: 0, freeTicket: 0, freePulls: 0 } : {}),
      alsoRatedUp: (latest.rate_up_six_stars ?? banner?.alsoRatedUp ?? []).filter(name => !featured.includes(name)),
      image: latest.banner_image === undefined ? banner?.image ?? null : latest.banner_image,
      event: latest.linked_event === undefined ? banner?.event ?? null : latest.linked_event,
      poolId: waitsForGlobal(latest) ? null : latest.cnPoolId ?? banner?.poolId ?? null,
      datesEstimated: !latest.global_window?.timingSource || latest.global_date_estimated === true,
      days: (Date.parse(end) - Date.parse(start)) / 86400000,
    }];
  });
}
export function getPullSchedule(): UpcomingBanner[] {
  const estimated = new Set(getEventCalendar().filter(event => event.isPredicted).map(event => pullBannerKey(event.name)));
  const current = resolvePullBannerWindows(getAllHeadhuntingBanners())
    .map(banner => waitsForGlobal(banner) ? estimateBannerFromCn(banner, PREDICTED_GAP_DAYS) : banner);
  return resolvePullSchedule(ALL_BANNERS, current).map(banner => ({
    ...banner, image: pullArtworkUrl(banner.image), datesEstimated: banner.datesEstimated || (!!banner.event && estimated.has(pullBannerKey(banner.event))),
  }));
}

/** Resolve rewards against event windows, never banner windows. Missing or
 * invalid dates cannot silently resurrect the old reward snapshot's dates.
 * `inBacklog` is marked against the backlog the page itself ships, so an event
 * skipped here is always one `remainingBacklog` counts. */
export function resolvePullEventSchedule(current: ReturnType<typeof getAllEvents>, backlog: BacklogSources): PullEventReward[] {
  const byName = new Map(current.map(event => [pullBannerKey(event.name), event]));
  return eventRewards.flatMap(reward => {
    const event = byName.get(pullBannerKey(reward.event));
    const dates = event?.global.dateRange?.split(/[–—]/).map(date => date.trim().replaceAll('/', '-'));
    if (!dates || dates.length !== 2 || !dates.every(validPlanDate) || dates[1] < dates[0]) return [];
    if (!reward.op && !reward.shopPermits && !reward.wishOrundum) return [];
    const window = event ? parseGameWindow(event.global.dateRange, event.global) : null;
    if (!window) return [];
    return [{
      name: reward.event, event: reward.event, start: dates[0], end: dates[1], startAt: window.start.toISOString(), endAt: window.end.toISOString(),
      rerun: /rerun/i.test(reward.event), op: reward.op, opSource: 'cn' as const,
      inBacklog: rerunBacklogEvent({ name: reward.event, event: reward.event }, backlog.playable) !== undefined,
      hasShop: reward.shopPermits > 0, shopPermits: reward.shopPermits,
      wishActId: reward.wishActId, wishDays: reward.wishDays, wishOrundum: reward.wishOrundum,
      legacyNames: ALL_BANNERS.filter(b => b.event === reward.event).map(b => b.name),
      ...(reward.cnAct ? { cnAct: reward.cnAct, clearMedal: rerunClearMedal(reward.cnAct) } : {}),
    }];
  }).sort((a,b) => a.start.localeCompare(b.start));
}
/**
 * The medal that marks the event a rerun returns as cleared on an account: its set's "complete
 * all stages with 3-star ratings" medal (data/rerun-clear-medals.json, built from the published
 * medal catalogue by scripts/build/build-rerun-clear-medals.mjs). An import cannot see a closed
 * event's stage clears (the game's save keeps records only for stages still in the client), but
 * it carries the account's medals (AccountProfile.medalCollection), and these stay. A rerun's
 * game id names its event's set: "act42sre" runs act42side, whose set is
 * medalGroupActivity42side. Older reruns (act5sre, of act11d0) name no set and get null.
 * Server-side only: the table reaches the browser on each event (PullEventReward.clearMedal).
 */
export function rerunClearMedal(cnAct: string | null | undefined): string | null {
  if (!cnAct || !/^act.+sre$/.test(cnAct)) return null;
  return (clearMedals as Record<string, string>)[cnAct.replace(/^act/, '').replace(/sre$/, 'side')] ?? null;
}
/** The release's events with each one's game activity id (`cnAct`) and clear medal filled from
 *  the deployment's own tables where the release has none: a release exported before they were
 *  kept, so the planner can tick a cleared event's rerun (rerunsClearedByTicks) from the first
 *  deploy. */
export function fillRerunActivities(events: readonly PullEventReward[]): PullEventReward[] {
  const byEvent = new Map(eventRewards.map(reward => [pullBannerKey(reward.event), reward.cnAct]));
  return events.map(event => {
    const cnAct = event.cnAct ?? byEvent.get(pullBannerKey(event.event ?? event.name)) ?? null;
    if (!cnAct) return event;
    const clearMedal = event.clearMedal === undefined ? rerunClearMedal(cnAct) : event.clearMedal;
    return event.cnAct === cnAct && event.clearMedal === clearMedal ? event : { ...event, cnAct, clearMedal };
  });
}
export function getPullEventSchedule(backlog: BacklogSources): PullEventReward[] {
  return resolvePullEventSchedule(getAllEvents(), backlog);
}
