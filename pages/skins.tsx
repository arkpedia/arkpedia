import { GetStaticProps } from 'next';
import Head from 'next/head';
import Image from 'next/image';
import { KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { getAllSkins } from '@/lib/skins/skins';
import { useQueryState } from '@/lib/hooks/useQueryState';
import { Skin } from '@/lib/skins/skinTypes';
import { computeSkinCountdowns } from '@/lib/skins/skinAvailability';
import { assertSkinMatching } from '@/lib/schedule/scheduleSkinMatch';
import { ALL_SERIES } from '@/lib/skins/skinSeriesConfig';
import { parsePrices, formatPrices } from '@/lib/skins/skinPrice';
import SkinZoomOverlay from '@/components/skins/SkinZoomOverlay';
import ResponsiveSkinArtwork from '@/components/skins/ResponsiveSkinArtwork';
import { getAllEvents } from '@/lib/schedule/schedule';
import { ScheduleEvent } from '@/lib/schedule/scheduleTypes';
import { getOngoingEvents, getSkinsForScheduleEvent } from '@/lib/skins/upcomingSkins';
import { matchesSearch, searchRelevance } from '@/lib/search/searchNormalize';

interface Props {
  skins: Skin[];
  seriesLogos: Record<string, string | null>;
  events: ScheduleEvent[];
  /** The build's clock, in unix milliseconds, rounded to the minute. */
  now: number;
}

const WISHLIST_STORAGE_KEY = 'skinWishlist_v1';
const MIN_IN_STORE_FOR_SPIN = 6; // matches SkinsCarousel.tsx's own threshold -- a handful of items overflowing the row still doesn't make for a proper spin, just a choppy loop of the same few images

export default function SkinsGallery({ skins, seriesLogos, events, now }: Props) {
  // The open skin lives in the URL, addressed by name (the same key the
  // wishlist already treats as a skin's identity) -- so a specific
  // skin's detail view can be shared as a link. Opening the dialog sets
  // it, closing clears it back out of the query string, and the Skin
  // object itself is just looked up from that name.
  const [activeSkinName, setActiveSkinName] = useQueryState('skin');
  const active = useMemo(
    () => (activeSkinName ? skins.find((s) => s.name === activeSkinName) ?? null : null),
    [skins, activeSkinName]
  );
  const [zooming, setZooming] = useState(false);
  const [inStoreDismissed, setInStoreDismissed] = useState(false);
  const inStoreRowRef = useRef<HTMLDivElement | null>(null);
  const inStoreViewportRef = useRef<HTMLDivElement | null>(null);
  const [inStoreNeedsScroll, setInStoreNeedsScroll] = useState(false);
  // Focus bookkeeping for the detail dialog: where focus should land
  // when it opens (its Back button), and where it should return when it
  // closes (the card that opened it). With a deep link there is no
  // opener, and focus simply stays where it was.
  const modalBoxRef = useRef<HTMLDivElement | null>(null);
  const modalBackBtnRef = useRef<HTMLButtonElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  // Availability countdowns are judged against the READER's clock, not
  // the build's -- a static build can be weeks old, and "Available in:
  // 3 days" for a skin that arrived last Tuesday is actively wrong. So
  // the markup and first client paint render from the build's clock
  // (they must agree, or React flags a hydration mismatch) and an
  // effect re-picks the real time immediately on mount. Same pattern as
  // the Terminal page. Rounded to the minute so a re-read is a no-op.
  const [clock, setClock] = useState(now);
  useEffect(() => {
    setClock(Math.floor(Date.now() / 60000) * 60000);
  }, []);

  // Recomputes the countdown from the shipped availableDate instead of
  // trusting the daysUntilAvailable number the build derived from ITS
  // clock. Deliberately whole days in UTC on both ends: local-midnight
  // math would make the server (built in one timezone) and the reader's
  // browser (in another) disagree about "today" and mismatch on
  // hydration. Null once the date has arrived, matching the build-side
  // convention.
  function daysUntilAvailable(skin: Skin): number | null {
    if (!skin.availableDate) return null;
    const todayUtcMidnight = Math.floor(clock / 86400000) * 86400000;
    const days = Math.ceil((Date.parse(`${skin.availableDate}T00:00:00Z`) - todayUtcMidnight) / 86400000);
    return days > 0 ? days : null;
  }

  /** The window a skin is buyable in, as "19 Aug 2026 - 2 Sep 2026".
   *
   *  Only for a skin that is available NOW, which is the case where the label
   *  above it does not already carry a date: "In 19 days" says when the window
   *  opens, so repeating the same date under it was the line saying itself
   *  twice. "NOW" is the one that leaves the question open -- until when. */
  function availabilityWindow(skin: Skin): string | null {
    if (!skin.availableNow) return null;
    if (!skin.availableDate) return null;
    const fmt = (iso: string) => {
      const t = Date.parse(`${iso}T00:00:00Z`);
      return Number.isNaN(t)
        ? null
        : new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
    };
    const from = fmt(skin.availableDate);
    if (!from) return null;
    const to = skin.availableUntil ? fmt(skin.availableUntil) : null;
    return to && to !== from ? `${from} \u2013 ${to}` : from;
  }

  const inStoreSkins = useMemo(() => {
    const ongoing = getOngoingEvents(events);
    const seen = new Set<string>();
    const result: Skin[] = [];
    for (const event of ongoing) {
      for (const skin of getSkinsForScheduleEvent(event, skins, events)) {
        if (!seen.has(skin.name)) {
          seen.add(skin.name);
          result.push(skin);
        }
      }
    }
    return result;
  }, [events, skins]);

  useEffect(() => {
    function checkOverflow() {
      const row = inStoreRowRef.current;
      const viewport = inStoreViewportRef.current;
      if (!row || !viewport) return;
      setInStoreNeedsScroll(inStoreSkins.length >= MIN_IN_STORE_FOR_SPIN && row.scrollWidth > viewport.clientWidth);
    }
    checkOverflow();
    window.addEventListener('resize', checkOverflow);
    return () => window.removeEventListener('resize', checkOverflow);
  }, [inStoreSkins, inStoreRowRef, inStoreViewportRef]);

  useEffect(() => {
    if (!active) setZooming(false);
  }, [active]);

  /** Opens the detail dialog, remembering the element that opened it so
   * focus can be handed back there on close. */
  function openSkin(skin: Skin) {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setActiveSkinName(skin.name);
  }

  function closeSkin() {
    setActiveSkinName('');
    // The opener card is still in the document (closing a dialog doesn't
    // reflow the grid), so focus can go straight back to it.
    openerRef.current?.focus();
    openerRef.current = null;
  }

  // Focus moves into the dialog the moment it opens -- otherwise a
  // keyboard or screen-reader user is left standing outside a modal
  // they can't see past. The Back button is the dialog's first control,
  // which also makes "get me out" the closest action at hand.
  useEffect(() => {
    if (activeSkinName) modalBackBtnRef.current?.focus();
  }, [activeSkinName]);

  // Escape closes the topmost layer only: the zoom overlay first if
  // it's up, the dialog otherwise. Document-level because focus can be
  // anywhere (the overlay backdrop, the zoomed image) when it's hit.
  useEffect(() => {
    if (!active) return;
    function onDocumentKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (zooming) setZooming(false);
      else closeSkin();
    }
    document.addEventListener('keydown', onDocumentKeyDown);
    return () => document.removeEventListener('keydown', onDocumentKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, zooming]);

  // Simple Tab containment while the dialog is open: when Tab would
  // step past the last control (or Shift+Tab before the first), wrap
  // around instead of escaping into the page hidden underneath.
  function handleModalKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Tab') return;
    const box = modalBoxRef.current;
    if (!box) return;
    const focusables = Array.from(
      box.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
    ).filter((el) => !el.hasAttribute('disabled'));
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  // The series filter, sort toggle, and search text all live in the URL
  // too, so any filtered view of the gallery is shareable and survives
  // reload. 'WISHLIST' rides along as a pseudo-series name; the sort is
  // stored as the word 'available' rather than a bare flag so the query
  // string stays self-describing.
  const [selectedSeriesRaw, setSelectedSeriesRaw] = useQueryState('series');
  const selectedSeries: string | null = selectedSeriesRaw === '' ? null : selectedSeriesRaw;
  const setSelectedSeries = (v: string | null) => setSelectedSeriesRaw(v ?? '');
  const [showSeriesRow, setShowSeriesRow] = useState(false);
  const [search, setSearch] = useQueryState('q');
  const [sortRaw, setSortRaw] = useQueryState('sort');
  const sortByAvailableDate = sortRaw === 'available';
  const setSortByAvailableDate = (v: boolean) => setSortRaw(v ? 'available' : '');
  const SKIN_PAGE_SIZE = 30;
  const [visibleSkinCount, setVisibleSkinCount] = useState(SKIN_PAGE_SIZE);
  const [wishlist, setWishlist] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(WISHLIST_STORAGE_KEY);
      if (saved) setWishlist(new Set(JSON.parse(saved)));
    } catch {
      /* ignore */
    }
  }, []);

  function toggleWishlist(skinName: string) {
    setWishlist((current) => {
      const next = new Set(current);
      if (next.has(skinName)) next.delete(skinName);
      else next.add(skinName);
      try {
        window.localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(Array.from(next)));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const seriesFiltered = useMemo(() => {
    if (selectedSeries === 'WISHLIST') return skins.filter((s) => wishlist.has(s.name));
    if (selectedSeries) return skins.filter((s) => s.series === selectedSeries);
    return skins;
  }, [skins, selectedSeries, wishlist]);

  const filteredSkins = useMemo(() => {
    const base = !search.trim()
      ? seriesFiltered
      : seriesFiltered.filter((s) => s.model && matchesSearch(s.model, search));

    const searching = search.trim().length > 0;
    if (!sortByAvailableDate && !searching) return base;

    return [...base].sort((a, b) => {
      if (searching) {
        const relDiff = searchRelevance(a.model || '', search) - searchRelevance(b.model || '', search);
        if (relDiff !== 0) return relDiff;
      }
      if (!sortByAvailableDate) return 0;
      if (!a.availableDate && !b.availableDate) return 0;
      if (!a.availableDate) return 1; // no known date -- sort to the end
      if (!b.availableDate) return -1;
      if (a.availableDate !== b.availableDate) return a.availableDate.localeCompare(b.availableDate);
      // Same date: non-Fashion-Review skins (a direct release) come
      // before Fashion Review ones.
      const aIsFR = a.isFashionReviewAvailability ? 1 : 0;
      const bIsFR = b.isFashionReviewAvailability ? 1 : 0;
      return aIsFR - bIsFR;
    });
  }, [seriesFiltered, search, sortByAvailableDate]);

  useEffect(() => {
    setVisibleSkinCount(SKIN_PAGE_SIZE);
  }, [search, seriesFiltered, sortByAvailableDate]);

  function renderSkinCards(list: Skin[], keyPrefix: string) {
    return list.map((skin, i) => {
      const prices = parsePrices(skin.howToObtain);
      const daysUntil = daysUntilAvailable(skin);
      return (
        <button
          key={`${keyPrefix}${skin.series}-${skin.name}-${i}`}
          type="button"
          className="skin-card skin-card-enter"
          style={{ animationDelay: `${Math.min(i * 25, 600)}ms` }}
          onClick={() => openSkin(skin)}
        >
          <div className="skin-image-wrap">
            {skin.image ? (
              <ResponsiveSkinArtwork src={skin.image} alt={skin.name} fill sizes="(max-width: 480px) 170px, 220px" />
            ) : (
              <div className="skin-image-placeholder">No image</div>
            )}

            <div className="skin-card-overlay">
              <p className="skin-card-overlay-name">{skin.name}</p>
              {prices.length > 0 && (
                <p className="skin-card-overlay-price">{formatPrices(prices)}</p>
              )}
              {(skin.availableNow || daysUntil !== null) && (
                <p className="skin-card-overlay-availability">
                  {/* One label in both states -- it read "Available in: 12 days"
                      for a future skin and said nothing at all for one you could
                      buy today, so the two cases could not be compared. */}
                  Available: {skin.availableNow ? 'NOW' : `In ${daysUntil} ${daysUntil === 1 ? 'day' : 'days'}`}
                </p>
              )}
              {availabilityWindow(skin) && (
                <p className="skin-card-overlay-window">{availabilityWindow(skin)}</p>
              )}
            </div>
          </div>
        </button>
      );
    });
  }

  const wishlistOriginitePrimeTotal = useMemo(() => {
    let total = 0;
    for (const skin of skins) {
      if (!wishlist.has(skin.name)) continue;
      const prices = parsePrices(skin.howToObtain);
      for (const p of prices) {
        if (p.currency === 'Originite Prime') total += p.amount;
      }
    }
    return total;
  }, [skins, wishlist]);

  return (
    <>
      <Head><title>Skins Gallery — Arkpedia</title></Head>

      <header>
        <div className="eyebrow">Rhodes Island // Wardrobe Archive</div>
        <h1>Skins Gallery</h1>
        <p className="sub">
          {filteredSkins.length} of {skins.length} outfits shown. Click any skin for full details.
        </p>

        {inStoreSkins.length > 0 && !inStoreDismissed && (
          <div className="in-store-now-banner">
            <div className="in-store-now-header">
              <h2 style={{ margin: 0 }}>In Store Now</h2>
              <button type="button" className="ghost in-store-now-close" onClick={() => setInStoreDismissed(true)}>
                Close
              </button>
            </div>
            <div className="in-store-now-viewport" ref={inStoreViewportRef}>
              <div className={`in-store-now-row${inStoreNeedsScroll ? ' scrolling' : ' static'}`} ref={inStoreRowRef}>
                {(inStoreNeedsScroll ? [...inStoreSkins, ...inStoreSkins] : inStoreSkins).map((s, i) => {
                  // The second copy of the set exists purely so the
                  // marquee can loop seamlessly -- to a screen reader or
                  // the Tab order it would just be the same run of
                  // buttons twice, so the duplicates are hidden from
                  // assistive tech and skipped by the keyboard.
                  const isLoopDuplicate = inStoreNeedsScroll && i >= inStoreSkins.length;
                  return (
                    <button
                      type="button"
                      key={`${s.name}-${i}`}
                      className="in-store-now-item"
                      onClick={() => openSkin(s)}
                      aria-hidden={isLoopDuplicate || undefined}
                      tabIndex={isLoopDuplicate ? -1 : undefined}
                    >
                      {s.image && (
                        <ResponsiveSkinArtwork src={s.image} alt={s.name} width={90} height={120} sizes="90px" />
                      )}
                      <span>{s.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10, marginBottom: 4, flexWrap: 'wrap' }}>
          <input
            type="search"
            name="skin-search"
            aria-label="Search skins"
            autoComplete="off"
            spellCheck={false}
            placeholder="Search by operator…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="guesser-input"
            style={{ maxWidth: 320, marginTop: 0, marginBottom: 0 }}
          />
          <button
            type="button"
            className={`ghost${sortByAvailableDate ? ' active' : ''}`}
            aria-pressed={sortByAvailableDate}
            onClick={() => setSortByAvailableDate(!sortByAvailableDate)}
          >
            {sortByAvailableDate ? 'Sorted by Available Date' : 'Sort by Available Date'}
          </button>
        </div>

        <div className="series-filter-row">
          <button
            type="button"
            className={selectedSeries === null ? 'series-logo-btn active' : 'series-logo-btn'}
            aria-pressed={selectedSeries === null}
            onClick={() => setSelectedSeries(null)}
            title="All series"
          >
            <span className="series-logo-all">All</span>
          </button>
          <button
            type="button"
            className={selectedSeries === 'WISHLIST' ? 'series-logo-btn active' : 'series-logo-btn'}
            aria-pressed={selectedSeries === 'WISHLIST'}
            onClick={() => setSelectedSeries('WISHLIST')}
            title="Wishlist"
          >
            <span className="series-logo-fallback">WISHLIST</span>
          </button>
          <button
            type="button"
            className="series-logo-btn"
            aria-pressed={showSeriesRow}
            onClick={() => setShowSeriesRow((v) => !v)}
          >
            <span className="series-logo-fallback">{showSeriesRow ? 'Hide Series' : 'Show Series'}</span>
          </button>
        </div>

        {showSeriesRow && (
          <div className="series-filter-row">
            {ALL_SERIES.map((series) => {
              const logo = seriesLogos[series];
              return (
                <button
                  key={series}
                  type="button"
                  className={selectedSeries === series ? 'series-logo-btn active' : 'series-logo-btn'}
                  aria-pressed={selectedSeries === series}
                  onClick={() => setSelectedSeries(series)}
                  title={series}
                >
                  {logo ? (
                    <Image src={logo} alt={series} width={80} height={32} style={{ objectFit: 'contain' }} />
                  ) : (
                    <span className="series-logo-fallback">{series}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {selectedSeries === 'WISHLIST' && (
          <p className="hint" style={{ marginTop: 8 }}>
            {wishlist.size} skin{wishlist.size === 1 ? '' : 's'} wishlisted — {wishlistOriginitePrimeTotal} Originite Prime total
          </p>
        )}
      </header>

      <main>
        {filteredSkins.length === 0 ? (
          // A silent empty grid reads as a broken page, not as "nothing
          // matched" -- same empty-state treatment the roster uses.
          <div className="waiting-box">
            <h2>No skins match</h2>
            <p className="hint">Clear the search or filters to see the collection again.</p>
          </div>
        ) : (
          <>
            <div className="skin-grid">
              {renderSkinCards(filteredSkins.slice(0, visibleSkinCount), '')}
            </div>
            {visibleSkinCount < filteredSkins.length && (
              <div className="roster-show-more-row">
                <p className="hint">
                  Showing {Math.min(visibleSkinCount, filteredSkins.length)} of {filteredSkins.length}.
                </p>
                <button type="button" className="ghost" onClick={() => setVisibleSkinCount((c) => c + SKIN_PAGE_SIZE)}>
                  Show more
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {active && (
        <div className="modal-overlay" onClick={closeSkin}>
          <div
            className="modal-box skin-modal"
            role="dialog"
            aria-modal="true"
            aria-label={active.name}
            ref={modalBoxRef}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleModalKeyDown}
          >
            <button type="button" className="modal-back-btn" ref={modalBackBtnRef} onClick={closeSkin}>
              ‹ Back
            </button>
            <button
              type="button"
              className={`skin-wishlist-btn${wishlist.has(active.name) ? ' active' : ''}`}
              onClick={() => toggleWishlist(active.name)}
            >
              {wishlist.has(active.name) ? '★ Wishlisted' : '☆ Wishlist'}
            </button>
            <div className="skin-modal-image-wrap-full">
              {active.image && (
                <ResponsiveSkinArtwork
                  src={active.image}
                  alt={active.name}
                  width={1600}
                  height={900}
                  sizes="90vw"
                  className="skin-modal-image-clickable"
                  style={{ maxWidth: '100%', maxHeight: '60vh', width: 'auto', height: 'auto', objectFit: 'contain' }}
                  onClick={() => setZooming(true)}
                />
              )}
            </div>
            <div className="skin-modal-info">
              <div className="eyebrow">
                {active.series}
                {active.code ? ` · ${active.code}` : ''}
              </div>
              <h2>{active.name}</h2>
              {active.model && <p className="hint">Model: {active.model}</p>}
              {active.illustrator && <p className="hint">Illustrator: {active.illustrator}</p>}
              {active.description && <p style={{ marginTop: 10 }}>{active.description}</p>}
              {active.release && <p className="hint" style={{ marginTop: 10 }}>Release: {active.release}</p>}
              {(() => {
                const prices = parsePrices(active.howToObtain);
                return prices.length > 0 ? (
                  <p className="hint">Price: {formatPrices(prices)}</p>
                ) : null;
              })()}
              {(() => {
                const daysUntil = daysUntilAvailable(active);
                if (!active.availableNow && daysUntil === null) return null;
                return (
                  <>
                    <p className="hint">
                      Available: {active.availableNow ? 'NOW' : `In ${daysUntil} ${daysUntil === 1 ? 'day' : 'days'}`}
                      {active.availableEventName && ` (${active.availableEventName})`}
                    </p>
                    {availabilityWindow(active) && <p className="hint">{availabilityWindow(active)}</p>}
                  </>
                );
              })()}
              {active.howToObtain && <p className="hint">How to obtain: {active.howToObtain}</p>}
            </div>
            <div className="modal-actions">
              <button type="button" className="primary" onClick={closeSkin}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {zooming && active?.image && (
        <SkinZoomOverlay image={active.image} name={active.name} onClose={() => setZooming(false)} />
      )}
    </>
  );
}

export const getStaticProps: GetStaticProps<Props> = async () => {
  const rawSkins = getAllSkins();
  const events = getAllEvents();

  /* Throws if a skin's release text matches two events exactly, which would mean two
     windows claiming the same skin with nothing to tell them apart. Here rather than
     in a test because this data is hand-maintained: the failure it guards against is
     a new event name silently making an old skin look buyable, which is what
     happened, and which nothing else would have reported. */
  assertSkinMatching(events.map((e) => e.name), rawSkins);

  const availability = computeSkinCountdowns(rawSkins, events);
  const skins: Skin[] = rawSkins.map((skin) => {
    // fashionReviewDate only feeds computeSkinCountdowns above (server-side)
    // -- the component never reads it directly, only the derived
    // availableDate/availableEventName/isFashionReviewAvailability
    // fields below, so there's no reason to ship the raw field to the
    // client too. The "available in N days" countdown itself is
    // deliberately NOT baked in here any more: a number derived from
    // the build's clock goes stale the moment the build does, so the
    // component recomputes it from availableDate against the reader's
    // own clock instead (see daysUntilAvailable there).
    const { fashionReviewDate, ...clientSkin } = skin;
    const avail = availability.get(skin.name);
    if (!avail) return clientSkin;
    return {
      ...clientSkin,
      availableDate: avail.date.toISOString().slice(0, 10),
      availableUntil: avail.endDate ? avail.endDate.toISOString().slice(0, 10) : undefined,
      availableNow: avail.live,
      availableEventName: avail.eventName,
      isFashionReviewAvailability: avail.isFashionReview,
    };
  });

  const seriesLogos: Record<string, string | null> = {};
  for (const skin of skins) {
    if (skin.seriesImage && !seriesLogos[skin.series]) {
      seriesLogos[skin.series] = skin.seriesImage;
    }
  }
  for (const series of ALL_SERIES) {
    if (!(series in seriesLogos)) seriesLogos[series] = null;
  }

  // The build's clock, for the countdowns' first paint -- the component
  // re-picks the reader's real time on mount (see the clock state
  // above). Rounded to the minute, matching that re-pick.
  const now = Math.floor(Date.now() / 60000) * 60000;
  return { props: { skins, seriesLogos, events, now } };
};
