import type { HeadhuntingBanner } from '@/lib/gacha/headhuntingBanners';
import type { ScheduleEvent } from './scheduleTypes';
import { parseGameWindow } from './gameWindow';

/** Joint Operation and Orienteering runs share the calendar, without pretending to
 * be stage events. Call with the resolved Global preview, never the raw CN record. */
export function bannerScheduleEvents(banners: readonly HeadhuntingBanner[]): ScheduleEvent[] {
  return banners.flatMap(banner => {
    if (!['joint', 'orienteering'].includes(banner.pull_type)) return [];
    if (!banner.globalForecastWithdrawn && (!banner.global_date || !parseGameWindow(banner.global_date))) return [];
    return [{
      name: banner.name, bannerName: banner.name,
      poster: banner.banner_image ?? null,
      year: Number((banner.global_date ?? banner.cn_date ?? '2026').slice(0, 4)),
      cn: { dateRange: banner.cn_date, note: null },
      global: { ...banner.global_window, dateRange: banner.global_date, note: banner.globalForecastWithdrawn ? 'Global date unannounced; the previous estimate was withdrawn.' : banner.global_date_estimated ? 'Estimated Global dates; awaiting Global confirmation.' : null },
      tw: { dateRange: null, note: null },
    }];
  });
}
