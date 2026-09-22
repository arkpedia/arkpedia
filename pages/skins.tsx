import { withContentPage } from '@/lib/content/server';
import { GetStaticProps } from 'next';
import Head from 'next/head';
import { KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { getAllSkins } from '@/lib/skins/skins';
import { useSkinGalleryState } from '@/lib/skins/useSkinGalleryState';
import { Skin } from '@/lib/skins/skinTypes';
import { acquisitionLabel, computeSkinCountdowns, getSkinWindows, skinKey, type SkinWindow } from '@/lib/skins/skinAvailability';
import { assertSkinMatching } from '@/lib/schedule/scheduleSkinMatch';
import { ALL_SERIES } from '@/lib/skins/skinSeriesConfig';
import { parsePrices, formatPrices } from '@/lib/skins/skinPrice';
import SkinZoomOverlay from '@/components/skins/SkinZoomOverlay';
import ResponsiveSkinArtwork from '@/components/skins/ResponsiveSkinArtwork';
import { getAllEvents } from '@/lib/schedule/schedule';
import { ScheduleEvent } from '@/lib/schedule/scheduleTypes';
import { matchesSearch, searchRelevance } from '@/lib/search/searchNormalize';

interface Props {
  skins: Skin[];
  seriesLogos: Record<string, string | null>;
  events: ScheduleEvent[];
  availabilityWindows?: SkinWindow[];
  /** The build's clock, in unix milliseconds, rounded to the minute. */
  now: number;
}

const WISHLIST_STORAGE_KEY = 'skinWishlist_v1';

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

  const [clock, setClock] = useState(now);
  useEffect(() => {
    const tick = () => setClock(Date.now());
    tick();
    const timer = window.setInterval(tick, 30_000);
    window.addEventListener('focus', tick);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', tick); };
  }, []);
  // Recompute from acquisition windows even when runtime content contains old
  // build-time availability flags. Initial server/client clocks still agree.
  const windows = useMemo(() => availabilityWindows ?? getSkinWindows(skins, events), [skins, events, availabilityWindows]);
  const availability = useMemo(() => computeSkinCountdowns(skins, events, new Date(clock), windows), [skins, events, clock, windows]);
  const currentSkins = useMemo(() => skins.filter(skin => availability.get(skinKey(skin))?.live), [skins, availability]);
  const directSkins = currentSkins.filter(skin => availability.get(skinKey(skin))?.kind !== 'draw');
  const drawCount = currentSkins.length - directSkins.length;
  const availabilityFilter = query.availability;
  const setAvailabilityFilter = (value: string) => setQuery('availability', value);
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
    return skins.filter(skin => {
      if ((wishlistOnly === '1' || selectedSeries === 'WISHLIST') && !wishlist.has(skin.name)) return false;
      if (selectedSeries && selectedSeries !== 'WISHLIST' && skin.series !== selectedSeries) return false;
      const window = availability.get(skinKey(skin));
      if (availabilityFilter === 'now') return !!window?.live;
      if (availabilityFilter === 'upcoming') return !!window && !window.live;
      if (['shop', 'reward', 'draw'].includes(availabilityFilter)) return !!window?.live && window.kind === availabilityFilter;
      return true;
    });
  }, [skins, selectedSeries, wishlist, wishlistOnly, availability, availabilityFilter]);

  const filteredSkins = useMemo(() => {
    const base = !search.trim()
      ? seriesFiltered
      : seriesFiltered.filter((s) => matchesSearch(`${s.model || ''} ${s.name} ${s.series}`, search));

    const searching = search.trim().length > 0;
    if (!sortByAvailableDate && !searching) return base;

    return [...base].sort((a, b) => {
      if (searching) {
        const relDiff = searchRelevance(`${a.model || ''} ${a.name}`, search) - searchRelevance(`${b.model || ''} ${b.name}`, search);
        if (relDiff !== 0) return relDiff;
      }
      if (!sortByAvailableDate) return 0;
      const aWindow = availability.get(skinKey(a)), bWindow = availability.get(skinKey(b));
      if (!!aWindow?.live !== !!bWindow?.live) return aWindow?.live ? -1 : 1;
      return (aWindow ? Date.parse(aWindow.live ? aWindow.endAt : aWindow.startAt) : Infinity)
        - (bWindow ? Date.parse(bWindow.live ? bWindow.endAt : bWindow.startAt) : Infinity);
    });
  }, [seriesFiltered, search, sortByAvailableDate, availability]);

  useEffect(() => {
    setVisibleSkinCount(SKIN_PAGE_SIZE);
  }, [search, selectedSeries, wishlistOnly, availabilityFilter, sortByAvailableDate]);

  function renderSkinCards(list: Skin[], keyPrefix: string) {
    return list.map((skin, i) => {
      const prices = parsePrices(skin.howToObtain);
      const window = availability.get(skinKey(skin));
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

      <header className="skins-header">
        <div className="skins-heading">
          <h1>Skins</h1>
          <span className="hint">{skins.length} outfits · Global availability</span>
        </div>
        <div className="skins-toolbar">
          <input type="search" name="skin-search" aria-label="Search skins" autoComplete="off" spellCheck={false}
            placeholder="Operator or outfit…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select aria-label="Skin series" value={selectedSeries === 'WISHLIST' ? '' : selectedSeries || ''} onChange={e => setSelectedSeries(e.target.value || null)}>
            <option value="">All series</option>
            {ALL_SERIES.filter(series => skins.some(skin => skin.series === series)).map(series => <option key={series} value={series}>{series}</option>)}
          </select>
          <select aria-label="Sort skins" value={sortByAvailableDate ? 'available' : ''} onChange={e => setSortByAvailableDate(e.target.value === 'available')}>
            <option value="">Catalogue order</option><option value="available">Availability</option>
          </select>
          <button type="button" className={`ghost${wishlistOnly === '1' || selectedSeries === 'WISHLIST' ? ' active' : ''}`}
            aria-pressed={wishlistOnly === '1' || selectedSeries === 'WISHLIST'} onClick={() => {
              if (selectedSeries === 'WISHLIST') setSelectedSeries(null);
              setWishlistOnly(wishlistOnly === '1' || selectedSeries === 'WISHLIST' ? '' : '1');
            }}>☆ Wishlist <span>{wishlist.size}</span></button>
        </div>
        <div className="skins-filters" role="group" aria-label="Skin availability">
          {([['', 'All'], ['now', 'Available now'], ['shop', 'Shop'], ['reward', 'Rewards'], ['draw', 'Random draws'], ['upcoming', 'Upcoming']] as const).map(([value, label]) => (
            <button key={value} type="button" className={`ghost${availabilityFilter === value ? ' active' : ''}`} aria-pressed={availabilityFilter === value} onClick={() => setAvailabilityFilter(value)}>{label}</button>
          ))}
        </div>
        {(wishlistOnly === '1' || selectedSeries === 'WISHLIST') && <p className="hint">{wishlist.size} wishlisted · {wishlistOriginitePrimeTotal} OP catalogue total</p>}
      </header>

      {currentSkins.length > 0 && (
        <section className="skins-current" aria-label="Available now">
          <div className="skins-current-heading">
            <h2>Available now <span>{currentSkins.length}</span></h2>
            <button className="ghost" type="button" onClick={() => { setAvailabilityFilter('now'); setSearch(''); setSelectedSeries(null); setWishlistOnly(''); }}>View all</button>
          </div>
          <div className="skins-current-row">
            {directSkins.map(skin => {
              const window = availability.get(skinKey(skin))!;
              return <button type="button" key={skinKey(skin)} className="skins-current-item" onClick={() => openSkin(skin)}>
                {skin.image && <ResponsiveSkinArtwork src={skin.image} alt="" width={72} height={84} sizes="72px" />}
                <span><strong>{skin.model}</strong><span>{skin.name}</span><small>{acquisitionLabel(window)}</small><small>Until {shortDate(window.endAt)}</small></span>
              </button>;
            })}
          </div>
          {drawCount > 0 && <button type="button" className="skins-draw-link" onClick={() => { setAvailabilityFilter('draw'); setSearch(''); setSelectedSeries(null); setWishlistOnly(''); }}>
            Fashion Review · {drawCount} outfits in random draws <span aria-hidden="true">→</span>
          </button>}
        </section>
      )}

      <main className="skins-results">
        <div className="skins-result-summary"><span className="hint" role="status">{filteredSkins.length} of {skins.length} outfits</span>
          <button type="button" className="ghost" disabled={!search && !selectedSeries && !availabilityFilter && !wishlistOnly} onClick={() => { setSearch(''); setSelectedSeries(null); setAvailabilityFilter(''); setWishlistOnly(''); }}>Reset filters</button>
        </div>
        {availabilityFilter === 'draw' && <p className="skins-acquisition-note">Fashion Review gives a random outfit for 2,800 Orundum, up to twice per pool. Owning the entire pool gives a Review Ticket instead.</p>}
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

  // The build's clock, for the countdowns' first paint -- the component
  // re-picks the reader's real time on mount (see the clock state
  // above). Rounded to the minute, matching that re-pick.
  const now = Math.floor(Date.now() / 60000) * 60000;
  return { props: { skins, seriesLogos, events, now, availabilityWindows: getSkinWindows(skins, events) } };
});
