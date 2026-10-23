import { isReleasedAt, type ReleaseMarker } from '@/lib/operators/operatorAvailability';
import type { TimelineOperator } from '@/lib/operators/operatorTypes';
import type { ScheduleEvent } from './scheduleTypes';
import { parseGameWindow } from './gameWindow';

/** Confirmed, finished events from the complete calendar data, newest first.
 * Current rows are deliberately pruned from page props; the archive must not use them. */
export function pastScheduleEvents(events: readonly ScheduleEvent[], now: number) {
  return events.flatMap(event => {
    if (event.bannerName || event.modeId || /estimated|predicted|unannounced/i.test(event.global.note ?? '')) return [];
    const range = parseGameWindow(event.global.dateRange, event.global);
    return range && +range.end <= now ? [{ name: event.name, poster: event.poster, dateRange: event.global.dateRange ?? `${range.start.toISOString()} – ${range.end.toISOString()}`, start: +range.start, end: +range.end }] : [];
  }).sort((a, b) => b.start - a.start || a.name.localeCompare(b.name));
}

/**
 * The Schedule page's Events list, split into what the content export may decide
 * (every event's window, its linked banner) and what only the moment of reading can
 * (is it over, is it live, is its banner still in the pull planner). The export used
 * to decide both, so a LIVE badge outlived its event until the next release.
 */

/** One calendar event as exported: its Global window as epoch ms, end exclusive. */
export interface EventRow {
  name: string;
  /** Permanent-mode launch; its row window covers launch day only. */
  modeId?: string;
  bannerName?: string;
  poster: string | null;
  dateRange: string;
  isPredicted: boolean;
  start: number;
  end: number;
  /** The pull-planner banner linked to the event, with the instant it leaves the planner. */
  pullBanner: { name: string; end: number } | null;
  featuredOperators: { name: string; rarity: 6 | 5 }[];
}

/** A row as it reads now. A release exported before rows carried their window
 * already has this shape, decided at its export. */
export interface EventRowView {
  name: string;
  /** Permanent-mode launch; its row window covers launch day only. */
  modeId?: string;
  bannerName?: string;
  poster: string | null;
  dateRange: string;
  isPredicted: boolean;
  isOngoing: boolean;
  pullBannerName: string | null;
  featuredOperators: { name: string; rarity: 6 | 5 }[];
}

const hasWindow = (row: EventRow | EventRowView): row is EventRow => typeof (row as EventRow).end === 'number';

/** The ongoing and upcoming rows at `now`, in the exported (start) order. */
export function currentEventRows(rows: readonly (EventRow | EventRowView)[], now: number): EventRowView[] {
  return rows.flatMap((row): EventRowView[] => {
    if (!hasWindow(row)) return [row];
    if (row.bannerName && row.isPredicted && row.start <= now) {
      return [{ name: row.name, bannerName: row.bannerName, poster: row.poster, dateRange: 'Global date unannounced', isPredicted: false, isOngoing: false, pullBannerName: null, featuredOperators: [] }];
    }
    if (row.end <= now) return [];
    const { start, end: _end, pullBanner, ...rest } = row;
    return [{ ...rest, isOngoing: start <= now && !(row.bannerName && row.isPredicted), pullBannerName: pullBanner && pullBanner.end > now ? pullBanner.name : null }];
  });
}

/** The page data a request still needs at `now`: the export carries every event and
 * banner, and dropping the ones that are over keeps the page as light as when the
 * export pruned them itself. Rendering then filters with the same `now`, so this only
 * saves bytes and never changes what is shown. */
export function pruneScheduleProps<P extends { eventRows: (EventRow | EventRowView)[]; pullBanners?: PullBannerWindows; now: number }>(props: P): P {
  if ((props as P & { __contentTables?: Record<string, unknown> }).__contentTables?.['regional-schedules']) return props;
  const { now } = props;
  return {
    ...props,
    eventRows: props.eventRows.filter(row => !hasWindow(row) || row.end > now || !!row.bannerName && row.isPredicted),
    ...(props.pullBanners ? { pullBanners: Object.fromEntries(Object.entries(props.pullBanners).filter(([, banner]) => banner.end > now)) } : {}),
  };
}

/** Pull-planner banners by lower-cased name, with the instant each leaves the planner. */
export type PullBannerWindows = Record<string, { name: string; end: number }>;

/** The banners still in the planner at `now`, as the old export-time lookup had them. */
export function currentPullBannerLinks(windows: PullBannerWindows | undefined, legacy: Record<string, string> | undefined, now: number): Record<string, string> {
  if (!windows) return legacy ?? {};
  return Object.fromEntries(Object.entries(windows).filter(([, banner]) => banner.end > now).map(([key, banner]) => [key, banner.name]));
}

/** A timeline operator as exported: its release marker, not a released/unreleased verdict. */
export interface ExportedTimelineOperator extends Omit<TimelineOperator, 'isFuture'> {
  release?: ReleaseMarker;
  /** Only in releases exported before markers existed, decided at their export. */
  isFuture?: boolean;
}

export function timelineOperatorsAt(operators: readonly ExportedTimelineOperator[], now: number): TimelineOperator[] {
  return operators.map(({ release, isFuture, ...op }) => ({ ...op, isFuture: release ? !isReleasedAt(release, now) : isFuture === true }));
}
