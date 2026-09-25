import { operatorIconOverrides } from '@/lib/operators/operatorIconOverrides';
import { useContentTable } from '@/lib/content/context';
import contentColors from '@/data/event_colors.json';
import contentMaterials from '@/data/event_materials.json';
import contentBanners from '@/data/headhunting_banners.json';
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
import { getAllEvents, getOperatorBirthdays, parseDateRange, OperatorBirthday } from '@/lib/schedule/schedule';
import { getAllOperators } from '@/lib/operators/operators';
import { getOperatorIconPath } from '@/lib/operators/operatorIcon';
import { isOperatorReleased } from '@/lib/operators/operatorAvailability';
import { getAllSkins } from '@/lib/skins/skins';
import { getSkinsForEvent } from '@/lib/schedule/scheduleSkinMatch';
import { getEventMaterials } from '@/lib/schedule/eventMaterials';
import { confirmedGlobalRange, getBannerForEvent } from '@/lib/gacha/headhuntingBanners';
import { getAllHeadhuntingBanners } from '@/lib/gacha/headhuntingBannerData';
import { portraitStatus } from '@/lib/operators/operatorPortrait';
import { getAllEventListings } from '@/lib/home/frontPageContent';
import { getDisplayFeaturedSixStars } from '@/lib/gacha/realGachaBanners';
import { isLineupPending, LINEUP_PENDING_NOTE } from '@/lib/gacha/bannerLineup';
import { publishedArt } from '@/lib/art/artVersion';
import { ReleaseDateLookup } from '@/lib/operators/operatorReleaseDates';
import SkinZoomOverlay from '@/components/skins/SkinZoomOverlay';
import { getEventColor } from '@/lib/schedule/eventColors';
import { parsePrices, formatPrices } from '@/lib/skins/skinPrice';
import { ScheduleEvent } from '@/lib/schedule/scheduleTypes';
import { TimelineOperator } from '@/lib/operators/operatorTypes';
import { Skin } from '@/lib/skins/skinTypes';

/** A row of the Events list: what the old /events page rendered. */
interface EventRow {
  name: string;
  poster: string | null;
  dateRange: string;
  isPredicted: boolean;
  pullBannerName: string | null;
  isOngoing: boolean;
  featuredOperators: { name: string; rarity: 6 | 5 }[];
}

interface Props {
  events: ScheduleEvent[];
  operators: TimelineOperator[];
  skins: Skin[];
  releaseLookup: ReleaseDateLookup;
  /** The Events list's rows. Named apart from `events`, which is the calendar's
   *  schedule data and a different shape entirely. */
  eventRows: EventRow[];
  pullBannerLinks: Record<string, string>;
}

/** The two views. In the URL as ?view=, so a link can point at either. */
type ViewKey = 'calendar' | 'events';

function iconPathFor(name: string, rarity: 6 | 5): string {
  if (operatorIconOverrides[name]) return operatorIconOverrides[name].icon;
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

export default function SchedulePage({ events, operators, skins, releaseLookup, eventRows, pullBannerLinks }: Props) {
  const colors = useContentTable('event_colors', contentColors);
  const materials = useContentTable('event_materials', contentMaterials);
  const banners = useContentTable('headhunting_banners', contentBanners) as HeadhuntingBanner[];
  const router = useRouter();
  const today = useMemo(() => new Date(), []);

  /**
   * Which of the two views is showing, read from the URL rather than held in state.
   *
   * ?view=events is a link someone can send, and the back button steps between the two
   * the way a reader expects after clicking a tab. Derived during render instead of
   * mirrored into state, so there is no second render and no way for the two to drift.
   */
  const view: ViewKey = router.query.view === 'calendar' ? 'calendar' : 'events';
  const showView = (next: ViewKey) => {
    /* shallow: the data for both views is already here, so there is nothing to fetch.
       replace, not push: flipping a tab five times should not cost five presses of the
       back button to leave the page. */
    void router.replace(
      { pathname: '/schedule', query: next === 'events' ? {} : { view: next } },
      undefined,
      { shallow: true, scroll: false },
    );
  };
  const [year, setYear] = useState(today.getFullYear());
  const [showBirthdays, setShowBirthdays] = useState(false);
  const [showOfficialEvents, setShowOfficialEvents] = useState(true);
  const [month, setMonth] = useState(today.getMonth()); // 0-11
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
    ys.add(today.getFullYear());
    ys.add(today.getFullYear() + 1);
    return Array.from(ys).sort((a, b) => a - b);
  }, [events, today]);

  /** Which of the two pickers is open, or neither. One at a time. */
  const [openPick, setOpenPick] = useState<'month' | 'year' | null>(null);
  /* Escape and a press outside both close it, which is what a reader expects of an open
     list and what a native select gives for free. 'click' rather than 'mousedown': the
     option's own handler runs on click, and closing first would take the row out from
     under the press. */
  useEffect(() => {
    if (!openPick) return;
    const onClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement)?.closest?.('.cal-pick')) setOpenPick(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenPick(null); };
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [openPick]);

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

  const skinsTrackRef = useRef<HTMLDivElement>(null);
  const skinsOuterRef = useRef<HTMLDivElement>(null);
  const [skinsScrollDistance, setSkinsScrollDistance] = useState(0);

  useEffect(() => {
    const track = skinsTrackRef.current;
    const outer = skinsOuterRef.current;
    if (!track || !outer) return;

    function measure() {
      if (!track || !outer) return;
      const distance = track.scrollWidth - outer.clientWidth;
      setSkinsScrollDistance(Math.max(0, distance));
    }

    // A one-time measurement can catch the panel mid open/close
    // transition (its width still animating from 0), giving a wrong
    // reading -- ResizeObserver re-measures whenever either element's
    // actual size changes, so it settles on the real final value
    // regardless of transition timing.
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    observer.observe(outer);
    return () => observer.disconnect();
  }, [panelSkins]);

  // Scroll speed stays roughly consistent regardless of skin count --
  // more skins to scroll through means a longer total duration, rather
  // than a fixed duration that looks too slow for 2 skins or too fast
  // for 10.
  const skinsScrollDuration = Math.max(6, panelSkins.length * 3);


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
    setYear(today.getFullYear());
    setMonth(today.getMonth());
  }

  return (
    <>
      <Head><title>Schedule — Arkpedia</title></Head>

      <header>
        <div className="eyebrow">Rhodes Island // Operations Calendar</div>
        <h1>Schedule</h1>
        {/* Two views of the same subject, so one heading rather than two pages. The
            switcher says which, and each says how much it holds -- a tab that carries
            its own count answers "is there anything in there" before being pressed. */}
        <div className="schedule-views" role="tablist" aria-label="Schedule views">
          {([
            { key: 'events' as ViewKey, label: 'Events', hint: `${eventRows.length} ongoing or upcoming` },
            { key: 'calendar' as ViewKey, label: 'Calendar', hint: 'Month by month' },
          ]).map((v) => (
            <button
              key={v.key}
              type="button"
              role="tab"
              id={`schedule-tab-${v.key}`}
              aria-selected={view === v.key}
              aria-controls={`schedule-panel-${v.key}`}
              className={`schedule-view ${view === v.key ? 'primary' : 'ghost'}`}
              onClick={() => showView(v.key)}
            >
              <b>{v.label}</b>
              <em>{v.hint}</em>
            </button>
          ))}
        </div>
      </header>

      {/* main-wide is 1320px, which the calendar grid needs and the events list does
          not: at that width the rows ran 280px past every other page on the site, which
          is what made them look unconfined. The class follows the view. */}
      <main className={view === 'calendar' ? 'main-wide' : undefined}>
        {/* Both views stay mounted, and CSS shows one.
            The calendar holds a year, a month, two filters and an open event panel, and
            unmounting it would throw all of that away every time the reader looked at
            the list and came back. React 18 here, so no <Activity> to do this properly:
            hidden keeps it out of the accessibility tree and out of tab order, which is
            the part that matters, and the layout cost of a hidden subtree is nil. */}
        <div
          role="tabpanel"
          id="schedule-panel-events"
          aria-labelledby="schedule-tab-events"
          hidden={view !== 'events'}
        >
          {eventRows.length === 0 ? (
            <div className="waiting-box">
              <h2>No ongoing or upcoming events right now</h2>
            </div>
          ) : (
            <div className="events-list">
              {eventRows.map((e) => (
                <div key={e.name} className="events-row-entry">
                <Link prefetch={false} href={`/events/${encodeURIComponent(e.name)}`} className="events-row">
                  <div className="events-row-poster-wrap">
                    {e.poster && <Image src={e.poster} alt={e.name} fill sizes="240px" style={{ objectFit: 'cover' }} />}
                    {e.isOngoing && <span className="events-row-live-badge">LIVE</span>}
                  </div>
                  <div className="events-row-info">
                    <span className="events-row-name">{e.name}</span>
                    <span className="events-row-date">
                      {e.isPredicted ? 'Predicted release: ' : 'Release: '}
                      {e.dateRange}
                    </span>
                    {e.featuredOperators.length > 0 && (
                      <div className="events-row-ops">
                        {e.featuredOperators.map((op) => (
                          <Image
                            key={op.name}
                            src={iconPathFor(op.name, op.rarity)}
                            alt={op.name}
                            width={32}
                            height={32}
                            title={op.name}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </Link>
                {e.pullBannerName && (
                  <Link prefetch={false} className="events-row-plan" href={{ pathname: '/pulls', query: { banner: e.pullBannerName } }}>
                    Add to Pull Planner
                  </Link>
                )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div
          role="tabpanel"
          id="schedule-panel-calendar"
          aria-labelledby="schedule-tab-calendar"
          hidden={view !== 'calendar'}
        >
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
              <span className="cal-pick">
                <button
                  type="button"
                  className={`cal-pick-btn cal-pick-month${openPick === 'month' ? ' open' : ''}`}
                  aria-haspopup="listbox"
                  aria-expanded={openPick === 'month'}
                  onClick={() => setOpenPick((v) => (v === 'month' ? null : 'month'))}
                >
                  {MONTH_NAMES[month]}
                  <svg viewBox="0 0 20 20" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M5 8 L10 13 L15 8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {openPick === 'month' && (
                  <ul className="cal-picklist" role="listbox" aria-label="Month">
                    {MONTH_NAMES.map((m, i) => (
                      <li key={m}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={i === month}
                          className={`cal-pickopt${i === month ? ' current' : ''}`}
                          onClick={() => { setMonth(i); setOpenPick(null); }}
                        >
                          {m}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </span>
              <span className="cal-pick">
                <button
                  type="button"
                  className={`cal-pick-btn cal-pick-year${openPick === 'year' ? ' open' : ''}`}
                  aria-haspopup="listbox"
                  aria-expanded={openPick === 'year'}
                  onClick={() => setOpenPick((v) => (v === 'year' ? null : 'year'))}
                >
                  {year}
                  <svg viewBox="0 0 20 20" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M5 8 L10 13 L15 8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {openPick === 'year' && (
                  <ul className="cal-picklist" role="listbox" aria-label="Year">
                    {years.map((y) => (
                      <li key={y}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={y === year}
                          className={`cal-pickopt${y === year ? ' current' : ''}`}
                          onClick={() => { setYear(y); setOpenPick(null); }}
                        >
                          {y}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </span>
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
              {(month !== today.getMonth() || year !== today.getFullYear()) && (
                <button type="button" className="cal-today" onClick={goToday}>
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
              className={`cal-toggle${showOfficialEvents ? ' on' : ''}`}
              aria-pressed={showOfficialEvents}
              onClick={() => setShowOfficialEvents((v) => !v)}
            >
              Events
            </button>
            <button
              type="button"
              className={`cal-toggle${showBirthdays ? ' on' : ''}`}
              aria-pressed={showBirthdays}
              onClick={() => setShowBirthdays((v) => !v)}
            >
              Birthdays
            </button>
          </div>
        </div>

        <div className={`schedule-layout${selectedEvent ? ' panel-open' : ''}`}>
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
                  const todayKey = today.toISOString().slice(0, 10);

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
                            className={`timeline-bar ${bar.colorClass} schedule-bar${isSelected ? ' selected' : ''}`}
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

          {/* Always rendered so the open/close transition can animate both
              ways -- CSS handles hiding it via opacity/transform when
              closed, rather than the element being removed from the DOM
              instantly. Full-screen takeover rather than a side panel. */}
          <div ref={panelRef} className={`schedule-fullscreen-panel${selectedEvent ? ' open' : ''}`}>
            {displayEvent && (
              <div className="schedule-panel">
                <button type="button" className="schedule-panel-close-btn" onClick={closePanel} aria-label="Close">
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
                <Link prefetch={false} href={`/events/${encodeURIComponent(displayEvent.name)}`} className="hint">
                  Go to event page →
                </Link>

                {panelBanner && isLineupPending(panelBanner) && (
                  <div className="schedule-panel-pullable">
                    <h3 className="char-file-subheading">Pullable Operators</h3>
                    <p className="hint">{LINEUP_PENDING_NOTE}</p>
                  </div>
                )}
                {panelBanner && !isLineupPending(panelBanner) && (panelBannerSixStars.length > 0 || panelBanner.five_stars.length > 0 || (panelBanner.four_stars || []).length > 0) && (
                  <div className="schedule-panel-pullable">
                    <h3 className="char-file-subheading">Pullable Operators</h3>
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
                            className="schedule-panel-pullable-op pullable-six-star"
                            title={name}
                          >
                            {op ? (
                              <Image src={getOperatorIconPath(op)} alt={name} width={40} height={40} />
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
                            className="schedule-panel-pullable-op pullable-five-star"
                            title={name}
                          >
                            {op ? (
                              <Image src={getOperatorIconPath(op)} alt={name} width={40} height={40} />
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
                            className="schedule-panel-pullable-op pullable-four-star"
                            title={name}
                          >
                            {op ? (
                              <Image src={getOperatorIconPath(op)} alt={name} width={40} height={40} />
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
                  <h3 className="char-file-subheading">Skins</h3>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {fashionReviewSkins.length > 0 && (
                      <button
                        type="button"
                        className={`ghost schedule-panel-show-all-btn${showNewestOnly ? ' active' : ''}`}
                        onClick={() => setShowNewestOnly((v) => !v)}
                      >
                        {showNewestOnly ? 'Showing Newest Only' : 'Show Newest Only'}
                      </button>
                    )}
                    {panelSkins.length > 0 && (
                      <button type="button" className="ghost schedule-panel-show-all-btn" onClick={() => { setShowAllVisibleCount(20); setShowAllSkins(true); }}>
                        Show All
                      </button>
                    )}
                  </div>
                </div>
                {panelSkins.length > 0 ? (
                  <div className="schedule-panel-skins-outer" ref={skinsOuterRef}>
                    <div
                      className={`schedule-panel-skins-track${skinsScrollDistance > 0 ? '' : ' no-scroll'}${activeSkin ? ' paused' : ''}`}
                      ref={skinsTrackRef}
                      style={
                        {
                          '--skins-scroll-duration': `${skinsScrollDuration}s`,
                        } as CSSProperties
                      }
                    >
                      {(skinsScrollDistance > 0 ? [...panelSkins, ...panelSkins] : panelSkins).map((s, i) => {
                        const prices = parsePrices(s.howToObtain);
                        return (
                          <button
                            key={`${s.name}-${i}`}
                            type="button"
                            className="schedule-panel-skin"
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
                    </div>
                  </div>
                ) : (
                  <p className="hint">No matched skins for this event.</p>
                )}

                {panelMaterials && panelMaterials.length > 0 && (
                  <>
                    <h3 className="char-file-subheading">Materials to Farm</h3>
                    <div className="schedule-panel-materials-row">
                      {panelMaterials.map((m) => (
                        <Image key={m} src={`/material-icons/${m}.webp`} alt={m} title={m} className="schedule-panel-material-icon" width={48} height={48} />
                      ))}
                    </div>
                  </>
                )}

                <h3 className="char-file-subheading">Pulls Needed</h3>
                {displayEvent.pullsNeeded ? (
                  <p className="hint">{displayEvent.pullsNeeded}</p>
                ) : (
                  <p className="hint">Not available yet.</p>
                )}

                <button type="button" className="ghost schedule-panel-event-page-btn" disabled title="Event page coming soon">
                  Go to Event Page
                </button>
              </div>
            )}
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
                  <button key={s.name} type="button" className="schedule-panel-skin" onClick={() => setActiveSkin(s)}>
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

  const trimmedOperators: TimelineOperator[] = allOperators.map((op) => ({
    name: op.name,
    rarity: op.rarity ?? null,
    isFuture: !isOperatorReleased(op),
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
     arrive late. */
  const pullBannerLinks = Object.fromEntries(
    getPullSchedule()
      .filter((banner) => new Date(`${banner.end}T23:59:59Z`) > new Date())
      .map((banner) => [banner.name.toLowerCase(), banner.name]),
  );
  const eventRows: EventRow[] = getAllEventListings(new Date()).map((e) => {
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
      pullBannerName: banner ? pullBannerLinks[banner.name.toLowerCase()] ?? null : null,
      isOngoing: e.isOngoing,
      featuredOperators,
    };
  });

  return {
    // The panel's poster, like every other: null until the image repository has it.
    props: { events: getAllEvents().map((e) => ({ ...e, poster: publishedArt(e.poster, e.name) })), operators: trimmedOperators, skins: getAllSkins(), releaseLookup, eventRows, pullBannerLinks },
    /* The list carries "ongoing or upcoming", which is a claim about now, so the page
       cannot be built once and left. Twenty minutes, as the old events page had. */
    revalidate: 1200,
  };
}, {
  tables: {
    event_colors: async () => (await import('@/data/event_colors.json')).default,
    event_materials: async () => (await import('@/data/event_materials.json')).default,
    headhunting_banners: async () => (await import('@/data/headhunting_banners.json')).default,
  },
});
