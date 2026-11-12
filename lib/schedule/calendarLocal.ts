import { getAllEvents } from './schedule';
import { getEventCalendar } from '@/lib/home/frontPageContent';
import { getAllOperators } from '@/lib/operators/operators';
import { regionalTable } from '@/lib/time/regionalServer';
import { bannerScheduleEvents } from './bannerEvents';
import { resolveGachaSimulatorBanners } from '@/lib/gacha/gachaBannerWindows';
import { getAllHeadhuntingBanners } from '@/lib/gacha/headhuntingBannerData';
import { parseGameWindow } from './gameWindow';
import { modeReleaseRow } from './modeReleases';
import type { CalendarData } from './calendarFeed';

/** Development/test fallback only; Worker feeds read the current published schedule. */
export async function localCalendarData(): Promise<CalendarData> {
  const events = getAllEvents();
  const eventRows: CalendarData['eventRows'] = getEventCalendar().map(event => ({
    ...event, start: +event.start, end: +event.end, pullBanner: null, featuredOperators: [],
  }));
  for (const event of bannerScheduleEvents(resolveGachaSimulatorBanners(getAllHeadhuntingBanners()))) {
    events.push(event);
    const range = parseGameWindow(event.global.dateRange, event.global);
    if (range) eventRows.push({ name: event.name, bannerName: event.bannerName, poster: event.poster,
      dateRange: event.global.dateRange!, isPredicted: /estimated|predicted/i.test(event.global.note ?? ''),
      start: +range.start, end: +range.end, pullBanner: null, featuredOperators: [] });
  }
  for (const event of events) { const row = modeReleaseRow(event); if (row) eventRows.push(row); }
  const operators = getAllOperators().map(operator => ({
    name: operator.name, rarity: operator.rarity ?? null, basicInfo: operator.basicInfo ?? null,
  }));
  return { events, eventRows, operators, __contentTables: { 'regional-schedules': await regionalTable('/schedule') } };
}
