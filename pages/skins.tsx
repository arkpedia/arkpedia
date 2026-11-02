import { useRegionalTime } from '@/lib/time/useRegionalTime';
import PageMeta from '@/components/layout/PageMeta';
import { regionalSkinWindows } from '@/lib/time/regional';
import { SERVER_TIME } from '@/lib/time/servers.mjs';
import { withContentPage } from '@/lib/content/server';
import { GetStaticProps } from 'next';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useReaderClock } from '@/lib/time/readerClock';
import { getAllSkins } from '@/lib/skins/skins';
import { useSkinGalleryState } from '@/lib/skins/useSkinGalleryState';
import { Skin } from '@/lib/skins/skinTypes';
import { acquisitionLabel, compareUpcomingSkins, isUpcomingSkin, compareCurrentSkins, computeSkinCountdowns, getSkinWindows, isAvailableNow, skinKey, type SkinWindow } from '@/lib/skins/skinAvailability';
import { withLocalConfirmedSkinWindows } from '@/lib/skins/localSkinWindows';
import { assertSkinMatching } from '@/lib/schedule/scheduleSkinMatch';
import { seriesKey, skinSeriesOptions } from '@/lib/skins/skinSeriesConfig';
import { parsePrices, formatPrices } from '@/lib/skins/skinPrice';
import LoadOnScroll from '@/components/ui/LoadOnScroll';
import PageHeader from '@/components/ui/PageHeader';
import SearchInput from '@/components/ui/SearchInput';
import SegmentedControl from '@/components/ui/SegmentedControl';
import OwnedFilter, { countOwned } from '@/components/account/OwnedFilter';
import { ownedFilter, useAccount } from '@/lib/account/accountStore';
import { useSkinPlan } from '@/lib/skins/skinPlan';
import StyledSelect from '@/components/ui/StyledSelect';
import FilterSheet, { type ActiveFilter } from '@/components/ui/FilterSheet';
import { useSwitchHold } from '@/components/ui/useSwitchHold';
import SkinDetailDialog from '@/components/skins/SkinDetailDialog';
import { skinDynamicArt } from '@/lib/skins/dynamicArt';
import { withSkinDynamicArt, loadDynamicArtIndex } from '@/lib/skins/dynamicArtFallback';
import ResponsiveSkinArtwork from '@/components/skins/ResponsiveSkinArtwork';
import { getAllEvents } from '@/lib/schedule/schedule';
import { matchesSearch, searchRelevance } from '@/lib/search/searchNormalize';

interface Props {
  skins: Skin[];
  /** Every acquisition window, from the release's tables (getSkinWindows in getStaticProps).
   *  Required: the page used to rebuild them from bundled copies when a payload lacked them. */
  availabilityWindows: SkinWindow[];
  /** The build's clock, in unix milliseconds, rounded to the minute. */
  now: number;
  /** Each animated outfit's model.json, by skin id (data/dynamic-art.json, lib/skins/dynamicArt.ts):
   *  only the outfits that have one. Absent from a release compiled before animated art, where
   *  every outfit then opens as a still picture, as it did. */
  dynamicArt?: Record<string, string>;
}

const AVAILABILITY_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'now', label: 'Available now' },
  { value: 'shop', label: 'Shop' },
  { value: 'reward', label: 'Rewards' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'fashion', label: 'Fashion Review' },
];
const SORT_OPTIONS = [
  { value: '', label: 'Catalogue order' },
  { value: 'available', label: 'Availability' },
];

export default function SkinsGallery({ skins, now, availabilityWindows, dynamicArt = {} }: Props) {
  const { server, schedule, globalSchedule } = useRegionalTime();
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
  // The request's clock first, the reader's after mount (lib/time/readerClock.ts).
  const clock = useReaderClock(now, { tickMs: 30_000, onFocus: true });
  // Recompute from acquisition windows even when runtime content contains old
  // build-time availability flags. Initial server/client clocks still agree.
  // SL-4b: the bundled confirmed windows still merge in here until the maintainer decides.
  // Global's windows first; JP and KR move each onto their own sale of the same outfits (lib/time/regional.ts).
  const windows = useMemo(() => {
    const global = regionalSkinWindows(withLocalConfirmedSkinWindows(availabilityWindows), globalSchedule, 'en');
    return server === 'en' ? global : regionalSkinWindows(global, schedule, server);
  }, [availabilityWindows, globalSchedule, schedule, server]);
  const availability = useMemo(() => computeSkinCountdowns(new Date(clock), windows), [clock, windows]);
  const availabilityFilter = query.availability === 'draw' ? '' : query.availability;
  const setAvailabilityFilter = (value: string) => setQuery('availability', value);
  useEffect(() => {
    if (query.availability === 'draw') setQuery('availability', '');
  }, [query.availability, setQuery]);
  const wishlistOnly = query.wishlist;
  const setWishlistOnly = (value: string) => setQuery('wishlist', value);
  // Owned or not, by the imported account's skin ids (lib/account/accountStore); ignored without one.
  const owned = ownedFilter(query.owned);
  const setOwned = (value: string) => setQuery('owned', value === 'all' ? '' : value);
  const account = useAccount();
  const ownedSkins = useMemo(() => new Set(account?.skins ?? []), [account]);
  const shortDate = (value: string) => new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: SERVER_TIME.en.timeZone });
  function availabilityText(skin: Skin): string | null {
    const window = availability.get(skinKey(skin));
    if (!window) return null;
    return window.live ? `${acquisitionLabel(window)} · until ${shortDate(window.endAt)}` : `${window.estimated ? 'Estimated ' : ''}${shortDate(window.startAt)}`;
  }

  function openSkin(skin: Skin) { setActiveSkinName(skin.name); }
  function closeSkin() { setActiveSkinName(''); }

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
  /* The wishlist is the skin plan the Skin Planner and the Pull Planner share
     (lib/skins/skinPlan), by "Operator / Outfit". An entry the first read could not place
     is still the outfit's bare name, so both forms count. */
  const keyByName = useMemo(() => new Map(skins.filter((skin) => skin.model).map((skin) => [skin.name, skinKey(skin)])), [skins]);
  const ownedPlanKeys = useMemo(() => new Set(skins.filter(skin => ownedSkins.has(skin.skinId ?? '')).flatMap(skin => [skinKey(skin), skin.name])), [skins, ownedSkins]);
  const [planIds, setPlanIds] = useSkinPlan((name) => keyByName.get(name), ownedPlanKeys);
  const planned = useMemo(() => new Set(planIds), [planIds]);
  const isWished = useCallback((skin: Skin) => planned.has(skinKey(skin)) || planned.has(skin.name), [planned]);
  const wishCount = useMemo(() => skins.filter(isWished).length, [skins, isWished]);
  function toggleWishlist(skin: Skin) {
    const key = skinKey(skin);
    setPlanIds(isWished(skin) ? planIds.filter((id) => id !== key && id !== skin.name) : [...planIds, key]);
  }

  const seriesOptions = useMemo(() => skinSeriesOptions(skins), [skins]);
  const seriesFiltered = useMemo(() => {
    return skins.filter(skin => {
      if ((wishlistOnly === '1' || selectedSeries === 'WISHLIST') && !isWished(skin)) return false;
      if (selectedSeries && selectedSeries !== 'WISHLIST' && seriesKey(skin.series) !== seriesKey(selectedSeries)) return false;
      const window = availability.get(skinKey(skin));
      if (availabilityFilter === 'now') return isAvailableNow(window);
      if (availabilityFilter === 'fashion') return !!skin.fashionReviewDate || windows.some(window => /Fashion Review/i.test(window.label) && window.skinIds.includes(skinKey(skin)));
      if (availabilityFilter === 'upcoming') return isUpcomingSkin(skin, window, clock) && !skin.fashionReviewDate;
      if (['shop', 'reward'].includes(availabilityFilter)) return !!window?.live && window.kind === availabilityFilter;
      return true;
    });
  }, [skins, selectedSeries, isWished, wishlistOnly, availability, availabilityFilter, clock, windows]);
  /* Every filter but Owned, so the Owned filter can count what each of its options would show
     (components/account/OwnedFilter). */
  const matchingSkins = useMemo(() => (!search.trim()
    ? seriesFiltered
    : seriesFiltered.filter((s) => matchesSearch(`${s.model || ''} ${s.name} ${s.series} ${s.release || ''} ${(s.searchAliases || []).join(' ')}`, search))), [seriesFiltered, search]);
  const ownedCounts = useMemo(() => countOwned(matchingSkins, (skin) => ownedSkins.has(skin.skinId ?? '')), [matchingSkins, ownedSkins]);

  const filteredSkins = useMemo(() => {
    const base = account && owned !== 'all' ? matchingSkins.filter((skin) => ownedSkins.has(skin.skinId ?? '') === (owned === 'owned')) : matchingSkins;

    if (availabilityFilter === 'upcoming') return [...base].sort((a, b) => compareUpcomingSkins(a, b, availability));
    const searching = search.trim().length > 0;
    // What can be had now leads the gallery, in the order the Available now tab lists it,
    // and the rest follows in its own order. It had a shelf of its own above the gallery,
    // the same outfits the Available now tab lists, twice on one page (2026-09-29).
    if (!sortByAvailableDate && !searching && !['now', 'shop', 'reward'].includes(availabilityFilter)) {
      const now = base.filter((skin) => isAvailableNow(availability.get(skinKey(skin))))
        .sort((a, b) => compareCurrentSkins(a, b, availability));
      if (!now.length) return base;
      const leading = new Set(now.map(skinKey));
      return [...now, ...base.filter((skin) => !leading.has(skinKey(skin)))];
    }

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
  }, [matchingSkins, account, owned, ownedSkins, search, sortByAvailableDate, availability, availabilityFilter]);

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

  // The phone's Filters sheet (components/ui/FilterSheet): one chip per filter that is on,
  // and a hold over the gallery so a filter pressed in the sheet cannot clamp the reader.
  const hold = useSwitchHold('skins');
  const wishlistOn = wishlistOnly === '1' || selectedSeries === 'WISHLIST';
  const activeFilters: ActiveFilter[] = [
    ...(selectedSeries && selectedSeries !== 'WISHLIST' ? [{ key: 'series', label: selectedSeries, remove: () => setSelectedSeries(null) }] : []),
    ...(availabilityFilter ? [{ key: 'availability', label: AVAILABILITY_OPTIONS.find(o => o.value === availabilityFilter)?.label ?? availabilityFilter, remove: () => setAvailabilityFilter('') }] : []),
    ...(account && owned !== 'all' ? [{ key: 'owned', label: owned === 'owned' ? 'Owned' : 'Not owned', remove: () => setOwned('all') }] : []),
    ...(wishlistOn ? [{ key: 'wishlist', label: 'Wishlist', remove: () => { if (selectedSeries === 'WISHLIST') setSelectedSeries(null); setWishlistOnly(''); } }] : []),
  ];
  /** Every filter but the search (the sheet's Reset; Reset filters clears the search too). */
  function resetFilters() {
    setSelectedSeries(null);
    setAvailabilityFilter('');
    setWishlistOnly('');
    setOwned('all');
  }

  const wishlistOriginitePrimeTotal = useMemo(() => {
    let total = 0;
    for (const skin of skins) {
      if (!isWished(skin)) continue;
      const prices = parsePrices(skin.howToObtain);
      for (const p of prices) {
        if (p.currency === 'Originite Prime') total += p.amount;
      }
    }
    return total;
  }, [skins, isWished]);

  return (
    <>
      <PageMeta title="Skins Gallery" description="Every Arknights outfit with its art, series, price and when it is on sale on Global." path="/skins" />

      <PageHeader stickyActions eyebrow="Rhodes Island // Wardrobe" title="Skins" sub={`${skins.length} outfits · Global availability`}
        actions={<div className="skins-controls">
            <SearchInput className="skins-search" label="Search skins" name="skin-search" placeholder="Operator or outfit…" value={search} onChange={setSearch} />
            {/* On a phone everything but the search folds into the Filters sheet. */}
            <FilterSheet controlsClassName="skins-controls" active={activeFilters} onReset={resetFilters} hold={hold} controls={<>
            <StyledSelect label="Skin series" placeholder="All series"
              value={selectedSeries === 'WISHLIST' ? '' : seriesOptions.find(series => seriesKey(series) === seriesKey(selectedSeries)) ?? selectedSeries ?? ''}
              options={[{ value: '', label: 'All series' }, ...seriesOptions.map(series => ({ value: series, label: series }))]}
              onChange={value => setSelectedSeries(value || null)} />
            <StyledSelect label="Sort skins" value={availabilityFilter === 'upcoming' ? 'upcoming' : sortByAvailableDate ? 'available' : ''}
              options={availabilityFilter === 'upcoming' ? [{value: 'upcoming', label: 'Availability date'}] : SORT_OPTIONS} disabled={availabilityFilter === 'upcoming'}
              onChange={value => setSortByAvailableDate(value === 'available')} />
          {/* The filters, then the wishlist at the far end: the roster's and the Skin Planner's
              row, with the owned filter in the same place. */}
          <div className="skins-filter-row">
            <SegmentedControl label="Skin availability" value={availabilityFilter} options={AVAILABILITY_OPTIONS} onChange={setAvailabilityFilter} />
            <OwnedFilter label="Outfits you own" value={owned} onChange={setOwned} account={account} counts={ownedCounts} />
            <span className="toolbar-spacer" aria-hidden="true" />
            <button type="button" className="filter-chip skins-wishlist-filter"
              aria-pressed={wishlistOnly === '1' || selectedSeries === 'WISHLIST'} onClick={() => {
                if (selectedSeries === 'WISHLIST') setSelectedSeries(null);
                setWishlistOnly(wishlistOnly === '1' || selectedSeries === 'WISHLIST' ? '' : '1');
              }}>☆ Wishlist <span className="filter-chip-count">{wishCount}</span></button>
          </div>
          {(wishlistOnly === '1' || selectedSeries === 'WISHLIST') && <p className="skins-wishlist-total">{wishCount} wishlisted · {wishlistOriginitePrimeTotal} OP catalogue total · planned in the <Link prefetch={false} href="/skin-planner">Skin Planner</Link></p>}
            </>} />
        </div>} />

      <main className="skins-results" id="skin-results" tabIndex={-1} aria-label="Skin gallery">
        <div ref={hold.ref} style={hold.style}>
        <div className="skins-result-summary"><span className="hint" role="status">{filteredSkins.length} of {skins.length} outfits</span>
          <button type="button" className="ghost btn-sm" disabled={!search && !selectedSeries && !availabilityFilter && !wishlistOnly && !(account && owned !== 'all')} onClick={() => { hold.capture(); setSearch(''); resetFilters(); }}>Reset filters</button>
        </div>
        {availabilityFilter === 'fashion' && <p className="skins-acquisition-note">Outfits included in Fashion Review. Availability depends on the announced shop or draw pool.</p>}
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
            <LoadOnScroll shown={visibleSkinCount} total={filteredSkins.length}
              onMore={() => setVisibleSkinCount(count => Math.min(count + SKIN_PAGE_SIZE, filteredSkins.length))} />
          </>
        )}
        </div>
      </main>

      {active && <SkinDetailDialog key={active.name} skin={active} onClose={closeSkin}
        availability={availability.get(skinKey(active))}
        wishlist={{wished:isWished(active),owned:ownedSkins.has(active.skinId ?? ''),toggle:()=>toggleWishlist(active)}}
        dynamic={active.skinId ? dynamicArt[active.skinId] ?? null : null}
        alternate={active.skinId ? dynamicArt[`${active.skinId}^sp_dyn`] ?? null : null} />}

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

  // `now`, the countdowns' first paint, is the request's clock from contentPageClock
  // (lib/content/pageClock.ts), rounded to the minute. The component re-picks the
  // reader's real time on mount (see the clock state above).
  const availabilityWindows = getSkinWindows(skins, events, {
    confirmed: (await import('@/data/skin-availability-windows.json')).default,
    rotations: (await import('@/data/skin-shop-rotations.json')).default,
  });
  const dynamicArt = skinDynamicArt(await loadDynamicArtIndex(), skins);
  // The events only size the windows above; the page reads the windows, so they stay here.
  return { props: { skins, availabilityWindows, dynamicArt } };
}, {
  // A release exported before animated art: this deployment's data/dynamic-art.json fills the pointers in.
  finalize: withSkinDynamicArt,
});
