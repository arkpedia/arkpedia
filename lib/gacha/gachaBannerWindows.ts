import { PREDICTED_GAP_DAYS, getEventCalendar } from '@/lib/home/frontPageContent';
import { getAllEvents } from '@/lib/schedule/schedule';
import { resolvePullBannerWindows } from '@/lib/pulls/bannerWindows';
import { estimateBannerFromCn } from './bannerSchedule';
import { parseBannerDate } from './realGachaBanners';
import type { HeadhuntingBanner } from './headhuntingBanners';

/** Keep the simulator on the calendar's Global timeline, including forecasts.
 * Linked banners follow their event estimate; unlinked CN-only pools use the
 * calendar's localization-gap fallback. Confirmed Global windows always win. */
export function resolveGachaSimulatorBanners<T extends HeadhuntingBanner>(
  banners: readonly T[],
  events = getAllEvents(),
  calendar = getEventCalendar(),
): T[] {
  return resolvePullBannerWindows(banners, events, calendar)
    .map(banner => estimateBannerFromCn(banner, PREDICTED_GAP_DAYS))
    .sort((a, b) => (parseBannerDate(b)?.getTime() ?? 0) - (parseBannerDate(a)?.getTime() ?? 0));
}
