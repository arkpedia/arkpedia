import { useReleaseTable } from '@/lib/content/context';
import type { HeadhuntingBanner } from '@/lib/gacha/headhuntingBanners';
import { withContentPage } from '@/lib/content/server';
import { GetStaticProps } from 'next';
import Head from 'next/head';
import { getPullSchedule } from '@/lib/pulls/schedule';
import { useRouter } from 'next/router';
import Image from '@/components/content/ContentImage';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, CSSProperties } from 'react';
import { generateMonths, computeWeekBars, WeekEventSource } from '@/lib/schedule/timelineUtils';
import { getAllEvents } from '@/lib/schedule/schedule';
import { getOperatorBirthdays, parseDateRange, type OperatorBirthday } from '@/lib/schedule/scheduleDates';
import { getAllOperators } from '@/lib/operators/operators';
import { getOperatorIconPath } from '@/lib/operators/operatorIcon';
import { releaseMarker } from '@/lib/operators/operatorAvailability';
import { getAllSkins } from '@/lib/skins/skins';
import { getSkinsForEvent } from '@/lib/schedule/scheduleSkinMatch';
import { getEventMaterials } from '@/lib/schedule/eventMaterials';
import { confirmedGlobalRange, getBannerForEvent } from '@/lib/gacha/headhuntingBanners';
import { getAllHeadhuntingBanners } from '@/lib/gacha/headhuntingBannerData';
import { portraitStatus } from '@/lib/operators/operatorPortrait';
import { getEventCalendar } from '@/lib/home/frontPageContent';
import { currentEventRows, currentPullBannerLinks, pruneScheduleProps, timelineOperatorsAt, type EventRow, type EventRowView, type ExportedTimelineOperator, type PullBannerWindows } from '@/lib/schedule/eventRows';
import { toServerTime } from '@/lib/time/serverDay';
import { getDisplayFeaturedSixStars } from '@/lib/gacha/realGachaBanners';
import { isLineupPending, LINEUP_PENDING_NOTE } from '@/lib/gacha/bannerLineup';
import { publishedArt } from '@/lib/art/publishedArt';
import { ReleaseDateLookup } from '@/lib/operators/operatorReleaseDates';
import SkinZoomOverlay from '@/components/skins/SkinZoomOverlay';
import PageHeader from '@/components/ui/PageHeader';
import Tabs, { tabPanelProps } from '@/components/ui/Tabs';
import { useSwitchHold } from '@/components/ui/useSwitchHold';
import StyledSelect from '@/components/ui/StyledSelect';
import ScrollRow from '@/components/ui/ScrollRow';
import { getEventColor } from '@/lib/schedule/eventColors';
import { parsePrices, formatPrices } from '@/lib/skins/skinPrice';
import { ScheduleEvent } from '@/lib/schedule/scheduleTypes';
import { Skin } from '@/lib/skins/skinTypes';

interface Props {
  events: ScheduleEvent[];
  operators: ExportedTimelineOperator[];
  skins: Skin[];
  releaseLookup: ReleaseDateLookup;
  /** The Events list's rows: every calendar event with its window. Named apart from
   *  `events`, which is the calendar's schedule data and a different shape entirely.
   *  Which rows are ongoing or upcoming is decided at render, from `now`. */
  eventRows: (EventRow | EventRowView)[];
  pullBanners?: PullBannerWindows;
  /** Releases exported before pullBanners: the banners still in the planner then. */
  pullBannerLinks?: Record<string, string>;
  /** The request's clock (contentPageClock), shared by the server render and hydration. */
  now: number;
}

/** The two views. In the URL as ?view=, so a link can point at either. */
type ViewKey = 'calendar' | 'events';

function iconPathFor(name: string, rarity: 6 | 5): string {
  const folder = rarity === 6 ? 'six-star-icons' : 'five-star-icons';
  return `/${folder}/${name} - Base.webp`;
}

/** Parses a single "YYYY/MM/DD" date string, distinct from parseDateRange
 * which expects a "start–end" range. Used for fashionReviewDate, which is
 * always a single point in time (when a skin was first added to Fashion
 * Review), not a range. */
function parseSingleDate(s: string): Date | null {
  const match = s.trim().match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!match) return null;
  const [, y, m, d] = match;
  return new Date(Number(y), Number(m) - 1, Number(d));
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function SchedulePage({ events, operators: exportedOperators, skins, releaseLookup, eventRows: calendarRows, pullBanners, pullBannerLinks: legacyPullBannerLinks, now }: Props) {
  /* The release's tables, which the page's props always carry (lib/content/tables.mjs). The
     bundled copies behind them are gone: a page rendered from a newer release read them
     whenever a table was missing, and the banner list alone was 223 KB of the chunk. */
  const colors = useReleaseTable<typeof import('@/data/event_colors.json')>('event_colors');
  const materials = useReleaseTable<typeof import('@/data/event_materials.json')>('event_materials');
  const banners = useReleaseTable<HeadhuntingBanner[]>('headhunting_banners');
  const router = useRouter();
  /* Everything that depends on the moment comes from `now`, the request's clock, so
     the server render and hydration agree and a release never freezes it. */
  const operators = useMemo(() => timelineOperatorsAt(exportedOperators, now), [exportedOperators, now]);
  const eventRows = useMemo(() => currentEventRows(calendarRows, now), [calendarRows, now]);
  const pullBannerLinks = useMemo(() => currentPullBannerLinks(pullBanners, legacyPullBannerLinks, now), [pullBanners, legacyPullBannerLinks, now]);
  /* The game's day, not the host's: the server's rollover (lib/time/serverDay.ts), read
     with UTC getters so a reader in any timezone hydrates the same month and marker. */
  const today = useMemo(() => {
    const day = toServerTime(new Date(now));
    return { year: day.getUTCFullYear(), month: day.getUTCMonth(), key: day.toISOString().slice(0, 10) };
  }, [now]);

  /**
   * Which of the two views is showing, read from the URL rather than held in state.
   *
   * ?view=events is a link someone can send, and the back button steps between the two
   * the way a reader expects after clicking a tab. Derived during render instead of
   * mirrored into state, so there is no second render and no way for the two to drift.
   */
  const view: ViewKey = router.query.view === 'calendar' ? 'calendar' : 'events';
  const viewHold = useSwitchHold('schedule');
  const showView = (next: ViewKey) => {
    viewHold.capture();
    /* shallow: the data for both views is already here, so there is nothing to fetch.
       replace, not push: flipping a tab five times should not cost five presses of the
       back button to leave the page. */
    void router.replace(
      { pathname: '/schedule', query: next === 'events' ? {} : { view: next } },
      undefined,
      { shallow: true, scroll: false },
    );
  };
  const [year, setYear] = useState(today.year);
  const [showBirthdays, setShowBirthdays] = useState(false);
  const [showOfficialEvents, setShowOfficialEvents] = useState(true);
  const [month, setMonth] = useState(today.month); // 0-11
  const [selectedEvent, setSelectedEvent] = useState<ScheduleEvent | null>(null);
  // Keeps the last-viewed event's data around during the close animation,
  // so the panel's content doesn't vanish mid-slide-out -- only the
  // `selectedEvent !== null` check (used for the .open class) actually
  // controls the animation; this just avoids blank content while it plays.
  const [displayEvent, setDisplayEvent] = useState<ScheduleEvent | null>(null);
  const [activeSkin, setActiveSkin] = useState<Skin | null>(null);
  const [zooming, setZooming] = useState(false);

  useEffect(() => {
    if (!activeSkin) setZooming(false);
  }, [activeSkin]);
  const [showAllSkins, setShowAllSkins] = useState(false);
  const [showAllVisibleCount, setShowAllVisibleCount] = useState(20);

  const allBirthdays = useMemo(() => getOperatorBirthdays(operators), [operators]);
  const operatorByName = useMemo(() => new Map(operators.map((o) => [o.name, o])), [operators]);

  function birthdaysOn(m: number, d: number): OperatorBirthday[] {
    return allBirthdays.filter((b) => b.month === m + 1 && b.day === d);
  }

  /* Every year the events data mentions, and always next year as well.
     The list was the data's own years plus this one, so next year only appeared once
     some event had been dated into it -- and a calendar you cannot look forward in is
     missing the thing a calendar is for. Any month can be read whether or not anything
     is scheduled in it; an empty grid is a real answer. */
  const years = useMemo(() => {
    const ys = new Set(events.map((e) => e.year));
    ys.add(today.year);
    ys.add(today.year + 1);
    return Array.from(ys).sort((a, b) => a - b);
  }, [events, today]);

  const monthGrid = useMemo(() => generateMonths(new Date(year, month, 1), 1)[0], [year, month]);

  const barSources: WeekEventSource[] = useMemo(() => {
    if (!showOfficialEvents) return [];
    return events
      .map((e): WeekEventSource | null => {
        const range = parseDateRange(e.global.dateRange);
        if (!range) return null;
        return {
          key: e.name,
          name: e.name,
          start: range.start,
          end: range.end,
          colorClass: 'timeline-pill-ingame',
        };
      })
      .filter((s): s is WeekEventSource => s !== null);
  }, [events, showOfficialEvents]);

  const eventByName = useMemo(() => new Map(events.map((e) => [e.name, e])), [events]);
  const skinByName = useMemo(() => new Map(skins.map((s) => [s.name, s])), [skins]);
  const [showNewestOnly, setShowNewestOnly] = useState(false);

  const baseEventSkins = displayEvent
    ? displayEvent.linkedSkinNames && displayEvent.linkedSkinNames.length > 0
      ? displayEvent.linkedSkinNames.map((n) => skinByName.get(n)).filter((s): s is Skin => !!s)
      : getSkinsForEvent(displayEvent.name, skins, events.map((e) => e.name))
    : [];

  // Fashion Review is cumulative: once a skin is added, it stays available
  // in every later Celebration/Carnival/Festival event's Outfit Store too,
  // not just the one it debuted in. So for this event's Global start date,
  // pull in every skin whose own fashionReviewDate is on or before it --
  // in addition to (not instead of) this event's own newly-released skins.
  // Fashion Review is cumulative, but only within events that actually
  // host it -- every other event has nothing to do with it at all.
  const eventGlobalStart = displayEvent?.hasFashionReview && displayEvent?.global.dateRange
    ? parseSingleDate(displayEvent.global.dateRange.split(';')[0].split('–')[0].trim())
    : null;
  const baseEventSkinNames = new Set(baseEventSkins.map((s) => s.name));
  const fashionReviewSkins = eventGlobalStart
    ? skins
        .filter((s) => {
          if (!s.fashionReviewDate || baseEventSkinNames.has(s.name)) return false;
          const frDate = parseSingleDate(s.fashionReviewDate);
          return frDate !== null && frDate <= eventGlobalStart;
        })
        .sort((a, b) => (b.fashionReviewDate || '').localeCompare(a.fashionReviewDate || ''))
    : [];

  const panelSkins = showNewestOnly ? baseEventSkins : [...baseEventSkins, ...fashionReviewSkins];
  const panelMaterials = displayEvent
    ? displayEvent.materials && displayEvent.materials.length > 0
      ? displayEvent.materials
      : Object.keys(getEventMaterials(displayEvent.name, materials) || {})
    : [];
  const panelBanner = displayEvent ? getBannerForEvent(displayEvent.name, confirmedGlobalRange(displayEvent.global), banners) : null;
  const panelBannerSixStars = panelBanner ? getDisplayFeaturedSixStars(panelBanner, releaseLookup) : [];

  function openEvent(e: ScheduleEvent) {
    setDisplayEvent(e);
    setSelectedEvent(e);
  }
  function closePanel() {
    setSelectedEvent(null);
  }

  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selectedEvent) return;
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (target.closest('.schedule-bar')) return; // clicking another event is a switch, not a close -- let openEvent's own state update handle it
      if (panelRef.current && !panelRef.current.contains(target)) {
        closePanel();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [selectedEvent]);

  function goPrevMonth() {
    if (month === 0) {
      setYear((y) => y - 1);
      setMonth(11);
    } else {
      setMonth((m) => m - 1);
    }
  }
  function goNextMonth() {
    if (month === 11) {
      setYear((y) => y + 1);
      setMonth(0);
    } else {
      setMonth((m) => m + 1);
    }
  }
  function goToday() {
    setYear(today.year);
    setMonth(today.month);
  }

  return (
    <>
      <Head><title>Schedule — Arkpedia</title></Head>

      {/* The site's page header; the view switch is the site's Tabs in its actions
          (it was a primary/ghost pair, then a SegmentedControl). Both views sit in the one 1040px frame: the
          calendar used main-wide (1320px), so the page changed width with the view. */}
      <PageHeader
        eyebrow="Rhodes Island // Operations Calendar"
        title="Schedule"
        actions={<Tabs<ViewKey>
          label="Schedule view"
          id="schedule-view"
          value={view}
          onChange={showView}
          options={[
            { value: 'events', label: 'Events', count: eventRows.length, ariaLabel: `Events, ${eventRows.length} ongoing or upcoming` },
            { value: 'calendar', label: 'Calendar' },
          ]}
        />}
      />

      <main>
      {/* Both views stay mounted, and CSS shows one.
            The calendar holds a year, a month, two filters and an open event panel, and
            unmounting it would throw all of that away every time the reader looked at
            the list and came back. React 18 here, so no <Activity> to do this properly:
            hidden keeps it out of the accessibility tree and out of tab order, which is
            the part that matters, and the layout cost of a hidden subtree is nil. */}
        {/* One container for both views, holding the reader's place through a switch
            (useSwitchHold): the calendar is shorter than the list, and Events -> Calendar
            from the tab row clamped the page 51px up at 1440. */}
        <div ref={viewHold.ref} style={viewHold.style}>
        <div {...tabPanelProps('schedule-view', 'events')} hidden={view !== 'events'}>
          {eventRows.length === 0 ? (
            <div className="waiting-box">
              <h2>No ongoing or upcoming events right now</h2>
            </div>
          ) : (
            /* One compact grid row per event: art | name and dates (and the rate-up) |
               the plan link, inside the row. Each was a 992x101 row whose content ended
               two thirds of the way across, with the plan link on a line of its own
               under it. Two columns where the frame is wide enough. */
            <div className="events-list">
              {eventRows.map((e) => (
                <div key={e.name} className="events-row">
                  <Link prefetch={false} href={`/events/${encodeURIComponent(e.name)}`} className="events-row-main">
                    <div className="events-row-poster-wrap">
                      {e.poster && <Image src={e.poster} alt="" fill sizes="200px" style={{ objectFit: 'cover' }} />}
                      {e.isOngoing && <span className="badge-live events-row-live-badge">LIVE</span>}
                    </div>
                    <div className="events-row-info">
                      <span className="events-row-name">{e.name}</span>
                      <span className="events-row-date">
                        {e.isPredicted ? 'Predicted: ' : ''}
                        {e.dateRange}
                      </span>
                      {e.featuredOperators.length > 0 && (
                        <div className="events-row-ops">
                          {e.featuredOperators.map((op) => (
                            <Image
                              key={op.name}
                              src={iconPathFor(op.name, op.rarity)}
                              alt={op.name}
                              width={30}
                              height={30}
                              title={op.name}
                              className={`tier-${op.rarity}`}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </Link>
                  {e.pullBannerName && (
                    <Link prefetch={false} className="ghost btn-sm events-row-plan" href={{ pathname: '/pulls', query: { banner: e.pullBannerName } }}>
                      Plan pulls
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div {...tabPanelProps('schedule-view', 'calendar')} hidden={view !== 'calendar'}>
        {/* One header rather than three rows of controls.
            Prev, the month, Next and Today sat in one row, the twelve month buttons in
            another and the two filters in a third, which is three bands of chrome above
            the thing being read and no sense of which control belongs to what. The
            modern calendar header, and the one every current calendar UI converges on,
            is a single line: where you are, the arrows either side of it, and everything
            else grouped to the right.
            The twelve month buttons are gone with it. Twelve of anything is a lot of
            buttons to say what two arrows and a jump already say, and the month is now a
            picker beside the year, which is how a reader who wants March next year gets
            there in two presses rather than by hunting a row. */}
        <div className="cal-head">
          <div className="cal-head-when">
            <button
              type="button"
              className="cal-step"
              onClick={goPrevMonth}
              aria-label="Previous month"
            >
              <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d="M12 4 L6 10 L12 16" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {/* The month and the year read as one title, and each is the control that
                changes it. Buttons and a list of our own rather than a <select>: a
                native dropdown draws the operating system's list, in the system font on
                a white sheet, which is the one part of this page nothing can style.
                They also look pressable at rest now -- a chevron and a border -- where
                before only a hover said so. */}
            <span className="cal-head-title">
              <StyledSelect
                label="Month"
                size="title"
                className="cal-pick-month"
                menuMinWidth={180}
                value={String(month)}
                onChange={(value) => setMonth(Number(value))}
                options={MONTH_NAMES.map((name, i) => ({ value: String(i), label: name }))}
              />
              <StyledSelect
                label="Year"
                size="title"
                className="cal-pick-year"
                menuMinWidth={120}
                value={String(year)}
                onChange={(value) => setYear(Number(value))}
                options={years.map((y) => ({ value: String(y), label: String(y) }))}
              />
            </span>

            <button
              type="button"
              className="cal-step"
              onClick={goNextMonth}
              aria-label="Next month"
            >
              <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d="M8 4 L14 10 L8 16" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {/* Only offered when it would do something: on the current month it is a
                button that cannot change anything, which is worse than its absence.
                Its slot is held either way, so the header does not reflow as the reader
                walks past today. */}
            <span className="cal-today-slot">
              {(month !== today.month || year !== today.year) && (
                <button type="button" className="ghost btn-sm cal-today" onClick={goToday}>
                  Today
                </button>
              )}
            </span>
          </div>

          {/* What the grid shows, on the other end of the same line: these say what is
              drawn, not where you are, so they belong apart from the date controls. */}
          <div className="cal-head-shows" role="group" aria-label="Show on the calendar">
            <button
              type="button"
              className="filter-chip"
              aria-pressed={showOfficialEvents}
              onClick={() => setShowOfficialEvents((v) => !v)}
            >
              Events
            </button>
            <button
              type="button"
              className="filter-chip"
              aria-pressed={showBirthdays}
              onClick={() => setShowBirthdays((v) => !v)}
            >
              Birthdays
            </button>
          </div>
        </div>

        <div>
          <div className="schedule-calendar-col">
            <div className="timeline-month timeline-month-large">
              {/* The header above says which month this is, so the grid does not repeat
                  it. Kept for screen readers, which read the grid on its own. */}
              <h2 className="visually-hidden">{monthGrid.label}</h2>
              <div className="timeline-weekday-row timeline-weekday-row-large">
                {WEEKDAY_LABELS.map((w) => (
                  <span key={w}>{w}</span>
                ))}
              </div>

              <div className="timeline-week-stack">
                {monthGrid.weeks.map((week, wi) => {
                  const bars = computeWeekBars(week, barSources);
                  const laneCount = Math.max(1, bars.reduce((max, b) => Math.max(max, b.lane + 1), 0));
                  const todayKey = today.key;

                  return (
                    <div
                      key={wi}
                      className="timeline-week-grid"
                      style={{ gridTemplateRows: `minmax(${showBirthdays ? 46 : 30}px, auto) repeat(${laneCount}, 42px)` }}
                    >
                      {week.map((cell, ci) => (
                        <div key={cell.dateKey} style={{ display: 'contents' }}>
                          <div
                            className={`timeline-daybox${cell.inMonth ? '' : ' out-of-month'}${
                              cell.dateKey === todayKey ? ' is-today' : ''
                            }`}
                            style={{ gridColumn: ci + 1, gridRow: 1 }}
                          >
                            <span className="timeline-daynum-large">{cell.date.getDate()}</span>
                            {showBirthdays && (
                              <div className="timeline-birthday-row">
                                {birthdaysOn(month, cell.date.getDate())
                                  .filter(() => cell.inMonth)
                                  .map((b) => {
                                    const op = operatorByName.get(b.name);
                                    return (
                                      <Link prefetch={false}
                                        key={b.name}
                                        href={`/operators/${encodeURIComponent(b.name)}`}
                                        className="birthday-icon"
                                        title={`${b.name}'s birthday`}
                                      >
                                        {op && (
                                          <Image src={getOperatorIconPath(op)} alt={b.name} className="birthday-portrait" width={26} height={26} />
                                        )}
                                      </Link>
                                    );
                                  })}
                              </div>
                            )}
                          </div>
                          {laneCount > 0 && (
                            <div
                              className={`timeline-daybox-lanes${cell.inMonth ? '' : ' out-of-month'}${
                                cell.dateKey === todayKey ? ' is-today' : ''
                              }`}
                              style={{ gridColumn: ci + 1, gridRow: `2 / span ${laneCount}` }}
                            />
                          )}
                        </div>
                      ))}

                      {bars.map((bar) => {
                        const barKey = `${bar.key}-${wi}`;
                        const isSelected = selectedEvent?.name === bar.key;
                        const extractedColor = getEventColor(bar.key, colors);
                        return (
                          <button
                            key={barKey}
                            type="button"
                            className={`btn-bare timeline-bar ${bar.colorClass} schedule-bar${isSelected ? ' selected' : ''}`}
                            /* The poster's colour as an ACCENT, not a fill.
                               It used to be the bar's whole background at full
                               saturation, so a month with six events was six solid
                               blocks in six competing hues, every one shouting at the
                               same volume, and nothing receded far enough for the dates
                               underneath to be read. The colour now identifies the event
                               along its left edge and tints the bar faintly, which is
                               enough to tell two bars apart without either of them
                               taking over the grid. */
                            style={{
                              gridColumn: `${bar.colStart + 1} / ${bar.colEnd + 2}`,
                              gridRow: bar.lane + 2,
                              ...(extractedColor
                                ? ({ '--bar-accent': extractedColor.background } as CSSProperties)
                                : {}),
                            }}
                            onClick={() => openEvent(eventByName.get(bar.key)!)}
                          >
                            {bar.name}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* The event's details open as a drawer over the page's right edge (a full
              sheet on a phone), so opening one moves nothing: it used to slide the
              whole calendar 180px left to make room beside it. Always rendered, so the
              drawer can animate both ways; closed, it is visibility: hidden, which takes it
              out of the tab order and the accessibility tree. */}
          <div ref={panelRef} className={`schedule-fullscreen-panel${selectedEvent ? ' open' : ''}`} role="dialog" aria-label={displayEvent ? displayEvent.name : 'Event'}>
            {displayEvent && (
              <div className="schedule-panel">
                <button type="button" className="btn-bare schedule-panel-close-btn" onClick={closePanel} aria-label="Close">
                  ✕
                </button>
                {displayEvent.poster && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <Image
                    src={displayEvent.poster}
                    alt={displayEvent.name}
                    width={1600}
                    height={900}
                    className="schedule-panel-poster"
                    style={{ width: '100%', height: 'auto' }}
                  />
                )}
                <h2 className="schedule-panel-title">{displayEvent.name}</h2>
                <p className="hint">{displayEvent.global.dateRange}</p>
                <Link prefetch={false} href={`/events/${encodeURIComponent(displayEvent.name)}`} className="ghost btn-sm schedule-panel-event-link">
                  Event page
                </Link>

                {panelBanner && isLineupPending(panelBanner) && (
                  <div className="schedule-panel-pullable">
                    <h3 className="schedule-panel-subheading">Pullable Operators</h3>
                    <p className="hint">{LINEUP_PENDING_NOTE}</p>
                  </div>
                )}
                {panelBanner && !isLineupPending(panelBanner) && (panelBannerSixStars.length > 0 || panelBanner.five_stars.length > 0 || (panelBanner.four_stars || []).length > 0) && (
                  <div className="schedule-panel-pullable">
                    <h3 className="schedule-panel-subheading">Pullable Operators</h3>
                    {pullBannerLinks[panelBanner.name.toLowerCase()] && (
                      <p className="hint">
                        <Link prefetch={false} href={{ pathname: '/pulls', query: { banner: pullBannerLinks[panelBanner.name.toLowerCase()] } }}>
                          Add to Pull Planner
                        </Link>
                      </p>
                    )}
                    <div className="schedule-panel-pullable-row">
                      {panelBannerSixStars.map((name) => {
                        const op = operatorByName.get(name);
                        return (
                          <Link prefetch={false}
                            key={name}
                            href={`/operators/${encodeURIComponent(name)}`}
                            className="schedule-panel-pullable-op"
                            title={name}
                          >
                            {op ? (
                              <Image src={getOperatorIconPath(op)} alt={name} width={40} height={40} className="tier-6" />
                            ) : (
                              <div className="gacha-pull-icon-placeholder">6★</div>
                            )}
                          </Link>
                        );
                      })}
                      {panelBanner.five_stars.map((name) => {
                        const op = operatorByName.get(name);
                        return (
                          <Link prefetch={false}
                            key={name}
                            href={`/operators/${encodeURIComponent(name)}`}
                            className="schedule-panel-pullable-op"
                            title={name}
                          >
                            {op ? (
                              <Image src={getOperatorIconPath(op)} alt={name} width={40} height={40} className="tier-5" />
                            ) : (
                              <div className="gacha-pull-icon-placeholder">5★</div>
                            )}
                          </Link>
                        );
                      })}
                      {(panelBanner.four_stars || []).map((name) => {
                        const op = operatorByName.get(name);
                        return (
                          <Link prefetch={false}
                            key={name}
                            href={`/operators/${encodeURIComponent(name)}`}
                            className="schedule-panel-pullable-op"
                            title={name}
                          >
                            {op ? (
                              <Image src={getOperatorIconPath(op)} alt={name} width={40} height={40} className="tier-4" />
                            ) : (
                              <div className="gacha-pull-icon-placeholder">4★</div>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="schedule-panel-skins-header">
                  <h3 className="schedule-panel-subheading">Skins</h3>
                  <div className="schedule-panel-skins-actions">
                    {fashionReviewSkins.length > 0 && (
                      <button
                        type="button"
                        className="filter-chip"
                        aria-pressed={showNewestOnly}
                        onClick={() => setShowNewestOnly((v) => !v)}
                      >
                        Newest only
                      </button>
                    )}
                    {panelSkins.length > 0 && (
                      <button type="button" className="ghost btn-sm" onClick={() => { setShowAllVisibleCount(20); setShowAllSkins(true); }}>
                        Show All
                      </button>
                    )}
                  </div>
                </div>
                {panelSkins.length > 0 ? (
                  /* A row the reader scrolls, each skin once. It was a marquee on an
                     endless CSS loop, the same pattern the home page's skins row lost. */
                  <ScrollRow label={`Skins for ${displayEvent.name}`} className="schedule-panel-skins-row">
                    {panelSkins.map((s) => {
                      const prices = parsePrices(s.howToObtain);
                      return (
                        <button
                          key={s.name}
                          type="button"
                          className="btn-bare schedule-panel-skin"
                          onClick={() => setActiveSkin(s)}
                        >
                          {s.image && (
                            <Image src={s.image} alt={s.name} width={110} height={147} />
                          )}
                          {prices.length > 0 && (
                            <span className="schedule-panel-skin-price">{formatPrices(prices)}</span>
                          )}
                        </button>
                      );
                    })}
                  </ScrollRow>
                ) : (
                  <p className="hint">No matched skins for this event.</p>
                )}

                {panelMaterials && panelMaterials.length > 0 && (
                  <>
                    <h3 className="schedule-panel-subheading">Materials to Farm</h3>
                    <div className="schedule-panel-materials-row">
                      {panelMaterials.map((m) => (
                        <Image key={m} src={`/material-icons/${m}.webp`} alt={m} title={m} className="schedule-panel-material-icon" width={48} height={48} />
                      ))}
                    </div>
                  </>
                )}

                <h3 className="schedule-panel-subheading">Pulls Needed</h3>
                {displayEvent.pullsNeeded ? (
                  <p className="hint">{displayEvent.pullsNeeded}</p>
                ) : (
                  <p className="hint">Not available yet.</p>
                )}

              </div>
            )}
          </div>
        </div>
        </div>
        </div>
      </main>

      {showAllSkins && (
        <div className="modal-overlay" onClick={() => setShowAllSkins(false)}>
          <div className="modal-box schedule-show-all-modal" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="modal-back-btn" onClick={() => setShowAllSkins(false)}>
              ‹ Back
            </button>
            <h2 style={{ marginBottom: 12 }}>{displayEvent?.name} — All Skins</h2>
            <div className="schedule-show-all-grid">
              {panelSkins.slice(0, showAllVisibleCount).map((s) => {
                const prices = parsePrices(s.howToObtain);
                return (
                  <button key={s.name} type="button" className="btn-bare schedule-panel-skin" onClick={() => setActiveSkin(s)}>
                    {s.image && (
                      <Image src={s.image} alt={s.name} width={110} height={147} />
                    )}
                    {prices.length > 0 && <span className="schedule-panel-skin-price">{formatPrices(prices)}</span>}
                  </button>
                );
              })}
            </div>
            {showAllVisibleCount < panelSkins.length && (
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 14 }}>
                <button type="button" className="ghost" onClick={() => setShowAllVisibleCount((c) => c + 20)}>
                  Show More
                </button>
                <button type="button" className="ghost" onClick={() => setShowAllVisibleCount(panelSkins.length)}>
                  Show Everything
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {activeSkin && (
        <div className="modal-overlay" onClick={() => setActiveSkin(null)}>
          <div className="modal-box skin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="skin-modal-image-wrap-full">
              {activeSkin.image && (
                <Image
                  src={activeSkin.image}
                  alt={activeSkin.name}
                  width={1600}
                  height={900}
                  className="skin-modal-image-clickable"
                  style={{ maxWidth: '100%', maxHeight: '60vh', width: 'auto', height: 'auto', objectFit: 'contain' }}
                  onClick={() => setZooming(true)}
                />
              )}
            </div>
            <div className="skin-modal-info">
              <div className="eyebrow">
                {activeSkin.series}
                {activeSkin.code ? ` · ${activeSkin.code}` : ''}
              </div>
              <h2>{activeSkin.name}</h2>
              {activeSkin.model && <p className="hint">Model: {activeSkin.model}</p>}
              {activeSkin.illustrator && <p className="hint">Illustrator: {activeSkin.illustrator}</p>}
              {activeSkin.description && <p style={{ marginTop: 10 }}>{activeSkin.description}</p>}
              {(() => {
                const prices = parsePrices(activeSkin.howToObtain);
                return prices.length > 0 ? <p className="hint">Price: {formatPrices(prices)}</p> : null;
              })()}
              {activeSkin.howToObtain && <p className="hint">How to obtain: {activeSkin.howToObtain}</p>}
            </div>
            <div className="modal-actions">
              <button type="button" className="primary" onClick={() => setActiveSkin(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {zooming && activeSkin?.image && (
        <SkinZoomOverlay image={activeSkin.image} name={activeSkin.name} onClose={() => setZooming(false)} />
      )}
    </>
  );
}

export const getStaticProps: GetStaticProps<Props> = withContentPage<Props>("/schedule", async () => {
  // Timeline only ever reads name/rarity/isFuture (for icon paths) and
  // the birthdate (for the birthday row) -- trimming out the heavy
  // skills/talents/modules/baseSkills data here cuts this page's static
  // props from several megabytes down to a small fraction of that,
  // since none of it is actually used on this page.
  const allOperators = getAllOperators();

  const trimmedOperators: ExportedTimelineOperator[] = allOperators.map((op) => ({
    name: op.name,
    rarity: op.rarity ?? null,
    // Released or not is judged at render against `now` (timelineOperatorsAt).
    release: releaseMarker(op),
    ...portraitStatus(op),
    basicInfo: op.basicInfo?.['Date of Birth'] ? { 'Date of Birth': op.basicInfo['Date of Birth'] } : null,
  }));

  const releaseLookup: ReleaseDateLookup = {};
  for (const op of allOperators) {
    const releaseDate = op.characterInfo?.['Release Date'];
    if (releaseDate) releaseLookup[op.name] = releaseDate;
  }

  /* The Events list's rows, which used to be their own page's getStaticProps. Built here
     because the list is now a view of this page, and both views are wanted before the
     first paint: switching between them is a tab, not a navigation, so neither may
     arrive late. Every calendar event goes out with its window; "ongoing or upcoming"
     is a claim about now, so the page decides it at render (currentEventRows), and a
     release can no longer keep an ended event LIVE. A pull-planner banner leaves the
     planner at the end of its last day, the same instant /pulls drops it. */
  const pullBanners: PullBannerWindows = Object.fromEntries(
    getPullSchedule().map((banner) => [banner.name.toLowerCase(), { name: banner.name, end: Date.parse(`${banner.end}T23:59:59Z`) }]),
  );
  const eventRows: EventRow[] = getEventCalendar().map((e) => {
    const banner = getBannerForEvent(e.name, e.isPredicted ? null : e.dateRange, getAllHeadhuntingBanners());
    const featuredOperators: { name: string; rarity: 6 | 5 }[] = [];
    if (banner) {
      (banner.six_stars || []).forEach((name) => featuredOperators.push({ name, rarity: 6 }));
      (banner.five_stars || []).forEach((name) => featuredOperators.push({ name, rarity: 5 }));
    }
    return {
      name: e.name,
      poster: e.poster,
      dateRange: e.dateRange,
      isPredicted: e.isPredicted,
      start: e.start.getTime(),
      end: e.end.getTime(),
      pullBanner: banner ? pullBanners[banner.name.toLowerCase()] ?? null : null,
      featuredOperators,
    };
  });

  return {
    // The panel's poster, like every other: null until the image repository has it.
    props: { events: getAllEvents().map((e) => ({ ...e, poster: publishedArt(e.poster) })), operators: trimmedOperators, skins: getAllSkins(), releaseLookup, eventRows, pullBanners },
  };
}, {
  finalize: async (props) => pruneScheduleProps(props),
  tables: {
    event_colors: async () => (await import('@/data/event_colors.json')).default,
    event_materials: async () => (await import('@/data/event_materials.json')).default,
    headhunting_banners: async () => (await import('@/data/headhunting_banners.json')).default,
  },
});
