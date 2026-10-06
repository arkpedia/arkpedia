import { getEventCalendar } from '@/lib/home/frontPageContent';
import { getAllEvents } from '@/lib/schedule/schedule';
import { resolveBannerEventWindow, waitsForGlobal } from '@/lib/gacha/bannerSchedule';

interface BannerWindow {
  global_date: string | null;
  cn_date: string | null;
  global_date_estimated?: boolean;
  global_window?: { timingSource?: string | null };
  schedule_anchor?: string;
  linked_event?: string | null;
  pull_type?: string;
}

/** Use the calendar's resolved event dates, preserving each banner's CN offset
 * and duration. Never replace a confirmed Global window with a forecast, and never
 * forecast one for a banner that waits for Global's own (waitsForGlobal): it has no
 * Global window until Global dates it, so the Pull Planner leaves it out. */
export function resolvePullBannerWindows<T extends BannerWindow>(
  banners: readonly T[],
  events = getAllEvents(),
  calendar = getEventCalendar(),
): T[] {
  const windows = events.map(event => ({
    ...event,
    global: { ...event.global, dateRange: calendar.find(row => row.name === event.name)?.dateRange ?? event.global.dateRange },
  }));
  return banners.map(banner => {
    if (waitsForGlobal(banner)) return { ...banner, global_date: null, global_date_estimated: false };
    if (banner.global_window?.timingSource) return banner;
    const anchor = banner.schedule_anchor || banner.linked_event;
    if (!anchor) return banner;
    const event = calendar.find(row => row.name === anchor);
    if (banner.global_date && !banner.global_date_estimated && !event?.isPredicted) return banner;
    return resolveBannerEventWindow({ ...banner, global_date_estimated: true, schedule_anchor: anchor }, windows);
  });
}
