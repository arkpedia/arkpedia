import { withContentPage } from '@/lib/content/server';
import { GetStaticProps } from 'next';
import Head from 'next/head';
import { KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useReaderClock } from '@/lib/time/readerClock';
import { getAllSkins } from '@/lib/skins/skins';
import { useSkinGalleryState } from '@/lib/skins/useSkinGalleryState';
import { Skin } from '@/lib/skins/skinTypes';
import { acquisitionLabel, compareCurrentSkins, computeSkinCountdowns, getSkinWindows, skinKey, type SkinWindow } from '@/lib/skins/skinAvailability';
import { withLocalConfirmedSkinWindows } from '@/lib/skins/localSkinWindows';
import { assertSkinMatching } from '@/lib/schedule/scheduleSkinMatch';
import { ALL_SERIES, seriesKey, skinSeriesOptions } from '@/lib/skins/skinSeriesConfig';
import { parsePrices, formatPrices } from '@/lib/skins/skinPrice';
import PageHeader from '@/components/ui/PageHeader';
import ScrollRow from '@/components/ui/ScrollRow';
import SearchInput from '@/components/ui/SearchInput';
import SegmentedControl from '@/components/ui/SegmentedControl';
import StyledSelect from '@/components/ui/StyledSelect';
import SkinZoomOverlay from '@/components/skins/SkinZoomOverlay';
import ResponsiveSkinArtwork from '@/components/skins/ResponsiveSkinArtwork';
import { getAllEvents } from '@/lib/schedule/schedule';
import { ScheduleEvent } from '@/lib/schedule/scheduleTypes';
import { matchesSearch, searchRelevance } from '@/lib/search/searchNormalize';

interface Props {
  skins: Skin[];
  seriesLogos: Record<string, string | null>;
  events: ScheduleEvent[];
  /** Every acquisition window, from the release's tables (getSkinWindows in getStaticProps).
   *  Required: the page used to rebuild them from bundled copies when a payload lacked them. */
  availabilityWindows: SkinWindow[];
  /** The build's clock, in unix milliseconds, rounded to the minute. */
  now: number;
}

const WISHLIST_STORAGE_KEY = 'skinWishlist_v1';
const AVAILABILITY_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'now', label: 'Available now' },
  { value: 'shop', label: 'Shop' },
  { value: 'reward', label: 'Rewards' },
  { value: 'upcoming', label: 'Upcoming' },
];
const SORT_OPTIONS = [
  { value: '', label: 'Catalogue order' },
  { value: 'available', label: 'Availability' },
];

export default function SkinsGallery({ skins, events, now, availabilityWindows }: Props) {
  // The open skin lives in the URL, addressed by name (the same key the
  // wishlist already treats as a skin's identity) -- so a specific
  // skin's detail view can be shared as a link. Opening the dialog sets
  // it, closing clears it back out of the query string, and the Skin
  // object itself is just looked up from that name.
  const [query, setQuery] = useSkinGalleryState();
  const activeSkinName = query.skin;
  const setActiveSkinName = (value: string) => setQuery('skin', value);
  const active = useMemo(
    () => (activeSkinName ? skins.find((s) => s.name === activeSkinName) ?? null : null),
    [skins, activeSkinName]
  );
  const [zooming, setZooming] = useState(false);
  // Focus bookkeeping for the detail dialog: where focus should land
  // when it opens (its Back button), and where it should return when it
  // closes (the card that opened it). With a deep link there is no
  // opener, and focus simply stays where it was.
  const modalBoxRef = useRef<HTMLDivElement | null>(null);
  const modalBackBtnRef = useRef<HTMLButtonElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  // The request's clock first, the reader's after mount (lib/time/readerClock.ts).
  const clock = useReaderClock(now, { tickMs: 30_000, onFocus: true });
  // Recompute from acquisition windows even when runtime content contains old
  // build-time availability flags. Initial server/client clocks still agree.
  // SL-4b: the bundled confirmed windows still merge in here until the maintainer decides.
  const windows = useMemo(() => withLocalConfirmedSkinWindows(availabilityWindows), [availabilityWindows]);
  const availability = useMemo(() => computeSkinCountdowns(skins, events, new Date(clock), windows), [skins, events, clock, windows]);
  const currentSkins = useMemo(() => skins.filter(skin => availability.get(skinKey(skin))?.live).sort((a, b) => compareCurrentSkins(a, b, availability)), [skins, availability]);
  const directSkins = currentSkins.filter(skin => availability.get(skinKey(skin))?.kind !== 'draw');
  const availabilityFilter = query.availability === 'draw' ? '' : query.availability;
  const setAvailabilityFilter = (value: string) => setQuery('availability', value);
  useEffect(() => {
    if (query.availability === 'draw') setQuery('availability', '');
  }, [query.availability, setQuery]);
  const wishlistOnly = query.wishlist;
  const setWishlistOnly = (value: string) => setQuery('wishlist', value);
  const shortDate = (value: string) => new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Etc/GMT+7' });
  const exactDate = (value: string) => new Date(value).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Etc/GMT+7' }) + ' (UTC−7)';
  function availabilityText(skin: Skin): string | null {
    const window = availability.get(skinKey(skin));
    if (!window) return null;
    return window.live ? `${acquisitionLabel(window)} · until ${shortDate(window.endAt)}` : `${window.estimated ? 'Estimated ' : ''}${shortDate(window.startAt)}`;
  }

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

  // Keep legacy wishlist links working alongside independent filters.
  const selectedSeriesRaw = query.series;
  const setSelectedSeriesRaw = (value: string) => setQuery('series', value);
  const selectedSeries: string | null = selectedSeriesRaw === '' ? null : selectedSeriesRaw;
  const setSelectedSeries = (v: string | null) => setSelectedSeriesRaw(v ?? '');
  const search = query.q;
  const setSearch = (value: string) => setQuery('q', value);
  const sortRaw = query.sort;
  const setSortRaw = (value: string) => setQuery('sort', value);
  const sortByAvailableDate = sortRaw === 'available';
  const setSortByAvailableDate = (v: boolean) => setSortRaw(v ? 'available' : '');
  const SKIN_PAGE_SIZE = 30;
  const [visibleSkinCount, setVisibleSkinCount] = useState(SKIN_PAGE_SIZE);
  const resultsRef = useRef<HTMLElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [currentShelfOpen, setCurrentShelfOpen] = useState(true);
  function closeCurrentShelf() {
    setCurrentShelfOpen(false);
    resultsRef.current?.focus({ preventScroll: true });
  }
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

  const seriesOptions = useMemo(() => skinSeriesOptions(skins), [skins]);
  const seriesFiltered = useMemo(() => {
    return skins.filter(skin => {
      if ((wishlistOnly === '1' || selectedSeries === 'WISHLIST') && !wishlist.has(skin.name)) return false;
      if (selectedSeries && selectedSeries !== 'WISHLIST' && seriesKey(skin.series) !== seriesKey(selectedSeries)) return false;
      const window = availability.get(skinKey(skin));
      if (availabilityFilter === 'now') return !!window?.live && window.kind !== 'draw';
      if (availabilityFilter === 'upcoming') return (!!window && !window.live) || skin.sourceRegion === 'CN' || /^\[CN\]/.test(skin.release || '');
      if (['shop', 'reward'].includes(availabilityFilter)) return !!window?.live && window.kind === availabilityFilter;
      return true;
    });
  }, [skins, selectedSeries, wishlist, wishlistOnly, availability, availabilityFilter]);

  const filteredSkins = useMemo(() => {
    const base = !search.trim()
      ? seriesFiltered
      : seriesFiltered.filter((s) => matchesSearch(`${s.model || ''} ${s.name} ${s.series} ${s.release || ''} ${(s.searchAliases || []).join(' ')}`, search));

    const searching = search.trim().length > 0;
    if (!sortByAvailableDate && !searching && !['now', 'shop', 'reward'].includes(availabilityFilter)) return base;

    return [...base].sort((a, b) => {
      if (searching) {
        const relDiff = searchRelevance(`${a.model || ''} ${a.name}`, search) - searchRelevance(`${b.model || ''} ${b.name}`, search);
        if (relDiff !== 0) return relDiff;
      }
      if (availability.get(skinKey(a))?.live && availability.get(skinKey(b))?.live
        && (sortByAvailableDate || ['now', 'shop', 'reward'].includes(availabilityFilter))) {
        const currentOrder = compareCurrentSkins(a, b, availability);
        if (currentOrder) return currentOrder;
      }
      if (!sortByAvailableDate) return 0;
      const aWindow = availability.get(skinKey(a)), bWindow = availability.get(skinKey(b));
      if (!!aWindow?.live !== !!bWindow?.live) return aWindow?.live ? -1 : 1;
      return (aWindow ? Date.parse(aWindow.live ? aWindow.endAt : aWindow.startAt) : Infinity)
        - (bWindow ? Date.parse(bWindow.live ? bWindow.endAt : bWindow.startAt) : Infinity);
    });
  }, [seriesFiltered, search, sortByAvailableDate, availability, availabilityFilter]);

  useEffect(() => {
    setVisibleSkinCount(SKIN_PAGE_SIZE);
  }, [search, selectedSeries, wishlistOnly, availabilityFilter, sortByAvailableDate]);

  useEffect(() => {
    const sentinel = loadMoreRef.current;
    if (!sentinel || visibleSkinCount >= filteredSkins.length) return;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      setVisibleSkinCount(count => Math.min(count + SKIN_PAGE_SIZE, filteredSkins.length));
    }, { rootMargin: '600px 0px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [visibleSkinCount, filteredSkins]);

  function renderSkinCards(list: Skin[], keyPrefix: string) {
    return list.map((skin, i) => {
      const prices = parsePrices(skin.howToObtain);
      const window = availability.get(skinKey(skin));
      return (
        <button
          key={`${keyPrefix}${skin.series}-${skin.name}-${i}`}
          type="button"
          className="btn-bare skin-card skin-card-enter"
          style={{ animationDelay: `${Math.min(i * 25, 600)}ms` }}
          onClick={() => openSkin(skin)}
        >
          <div className="skin-image-wrap">
            {skin.image ? (
              <ResponsiveSkinArtwork src={skin.image} alt={skin.name} fill sizes="(max-width: 480px) 170px, 220px" />
            ) : (
              <div className="skin-image-placeholder">No image</div>
            )}

          </div>
          <div className="skin-card-info">
            <span className="skin-card-operator">{skin.model}</span>
            <span className="skin-card-name">{skin.name}</span>
            <span className="skin-card-price">{window?.live && window.kind === 'draw' ? window.label : prices.length > 0 ? formatPrices(prices) : 'Special acquisition'}</span>
            <span className={`skin-card-status${window?.live ? ' is-live' : ''}`}>{availabilityText(skin) || 'No scheduled availability'}</span>
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

      <PageHeader eyebrow="Rhodes Island // Wardrobe" title="Skins" sub={`${skins.length} outfits · Global availability`}
        actions={<div className="skins-controls">
          <div className="skins-toolbar">
            <SearchInput label="Search skins" name="skin-search" placeholder="Operator or outfit…" value={search} onChange={setSearch} />
            <StyledSelect label="Skin series" placeholder="All series"
              value={selectedSeries === 'WISHLIST' ? '' : seriesOptions.find(series => seriesKey(series) === seriesKey(selectedSeries)) ?? selectedSeries ?? ''}
              options={[{ value: '', label: 'All series' }, ...seriesOptions.map(series => ({ value: series, label: series }))]}
              onChange={value => setSelectedSeries(value || null)} />
            <StyledSelect label="Sort skins" value={sortByAvailableDate ? 'available' : ''} options={SORT_OPTIONS}
              onChange={value => setSortByAvailableDate(value === 'available')} />
            <button type="button" className="filter-chip skins-wishlist-filter"
              aria-pressed={wishlistOnly === '1' || selectedSeries === 'WISHLIST'} onClick={() => {
                if (selectedSeries === 'WISHLIST') setSelectedSeries(null);
                setWishlistOnly(wishlistOnly === '1' || selectedSeries === 'WISHLIST' ? '' : '1');
              }}>☆ Wishlist <span className="filter-chip-count">{wishlist.size}</span></button>
          </div>
          <SegmentedControl label="Skin availability" value={availabilityFilter} options={AVAILABILITY_OPTIONS} onChange={setAvailabilityFilter} />
          {(wishlistOnly === '1' || selectedSeries === 'WISHLIST') && <p className="skins-wishlist-total">{wishlist.size} wishlisted · {wishlistOriginitePrimeTotal} OP catalogue total</p>}
        </div>} />

      <main className="skins-results" id="skin-results" ref={resultsRef} tabIndex={-1} aria-label="Skin gallery">
        {currentShelfOpen && directSkins.length > 0 && (
          <section className="op-section skins-current" aria-labelledby="skins-current-title">
            <div className="skins-current-heading">
              <h2 id="skins-current-title">Available now <span className="skins-current-count">{directSkins.length}</span></h2>
              <button className="ghost btn-sm" type="button" onClick={closeCurrentShelf}>Close</button>
            </div>
            <ScrollRow label="Outfits available now" controls>
              {directSkins.map(skin => {
                const window = availability.get(skinKey(skin))!;
                return <button type="button" key={skinKey(skin)} className="btn-bare skins-current-item" onClick={() => openSkin(skin)}>
                  {skin.image && <ResponsiveSkinArtwork src={skin.image} alt="" width={180} height={156} sizes="180px" />}
                  <span><strong>{skin.model}</strong><span>{skin.name}</span><small>{acquisitionLabel(window)}</small><small>Until {shortDate(window.endAt)}</small></span>
                </button>;
              })}
            </ScrollRow>
          </section>
        )}

        <div className="skins-result-summary"><span className="hint" role="status">{filteredSkins.length} of {skins.length} outfits</span>
          <button type="button" className="ghost btn-sm" disabled={!search && !selectedSeries && !availabilityFilter && !wishlistOnly} onClick={() => { setSearch(''); setSelectedSeries(null); setAvailabilityFilter(''); setWishlistOnly(''); }}>Reset filters</button>
        </div>
        {availabilityFilter === 'upcoming' && <p className="skins-acquisition-note">Estimated dates follow the current event schedule and may change.</p>}
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
              <div ref={loadMoreRef} className="skins-load-sentinel" aria-hidden="true" />
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
              className="filter-chip skin-wishlist-btn"
              aria-pressed={wishlist.has(active.name)}
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
              {active.release && <p className="hint" style={{ marginTop: 10 }}>Original release: {availability.get(skinKey(active))?.live ? active.release.replace(/\[CN\]\s*/g, '') : active.release}</p>}
              {(() => {
                const window = availability.get(skinKey(active));
                const prices = parsePrices(active.howToObtain);
                return <>
                  {window && <div className="skin-acquisition">
                    <strong>{window.live ? 'Available now' : window.estimated ? 'Estimated availability' : 'Upcoming'} · {acquisitionLabel(window)}</strong>
                    <p>{window.label} · {window.event.replace(/\[[^\]]*\]\s*/g, '')}</p>
                    <p>{exactDate(window.startAt)} – {exactDate(window.endAt)}</p>
                    {window.details && <p>{window.details}</p>}
                    {window.source && <a href={window.source} target="_blank" rel="noreferrer">{window.estimated ? 'Schedule source' : 'Official announcement'} ↗</a>}
                    {window.inventorySource && <> · <a href={window.inventorySource} target="_blank" rel="noreferrer">Pool contents ↗</a></>}
                  </div>}
                  {prices.length > 0 && <p className="hint">{window?.live && window.kind !== 'shop' ? 'Original shop price' : 'Catalogue price'}: {formatPrices(prices)}</p>}
                  {active.howToObtain && <p className="hint">Original acquisition: {active.howToObtain}</p>}
                </>;
              })()}
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

export const getStaticProps: GetStaticProps<Props> = withContentPage<Props>("/skins", async () => {
  const rawSkins = getAllSkins();
  const events = getAllEvents();

  /* Throws if a skin's release text matches two events exactly, which would mean two
     windows claiming the same skin with nothing to tell them apart. Here rather than
     in a test because this data is hand-maintained: the failure it guards against is
     a new event name silently making an old skin look buyable, which is what
     happened, and which nothing else would have reported. */
  assertSkinMatching(events.map((e) => e.name), rawSkins);

  const skins = rawSkins;
  const seriesLogos: Record<string, string | null> = {};
  for (const skin of skins) {
    if (skin.seriesImage && !seriesLogos[skin.series]) {
      seriesLogos[skin.series] = skin.seriesImage;
    }
  }
  for (const series of ALL_SERIES) {
    if (!(series in seriesLogos)) seriesLogos[series] = null;
  }

  // `now`, the countdowns' first paint, is the request's clock from contentPageClock
  // (lib/content/pageClock.ts), rounded to the minute. The component re-picks the
  // reader's real time on mount (see the clock state above).
  const availabilityWindows = getSkinWindows(skins, events, {
    confirmed: (await import('@/data/skin-availability-windows.json')).default,
    rotations: (await import('@/data/skin-shop-rotations.json')).default,
  });
  return { props: { skins, seriesLogos, events, availabilityWindows } };
});
