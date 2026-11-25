import PageMeta from '@/components/layout/PageMeta';
import { useRegionalTime } from '@/lib/time/useRegionalTime';
import { regionalBanners, withLightRegionalTable } from '@/lib/time/regional';
import { isLineupPending, lineupPendingNote, RETURNING_LIMITED_NOTE } from '@/lib/gacha/bannerLineup';
import { bannerDisplayName } from '@/lib/gacha/bannerDisplayName';
import { withContentPage } from '@/lib/content/server';
import { GetStaticProps } from 'next';
import { useRouter } from 'next/router';
import Image from '@/components/content/ContentImage';
import BannerArtworkFallback, { BannerArtworkThumbnail } from '@/components/gacha/BannerArtworkFallback';
import type { BannerArtworkOperator } from '@/lib/gacha/bannerArtwork';
import { buildBannerArtwork, readBannerShopRows } from '@/lib/gacha/bannerArtworkServer';
import { useContentUrl } from '@/lib/content/context';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { getGachaIconPools, GachaIconPools } from '@/lib/gacha/gachaIconPools';
import type { HeadhuntingBanner } from '@/lib/gacha/headhuntingBanners';
import { getBannersSortedByDate } from '@/lib/gacha/headhuntingBannerData';
import { resolveGachaSimulatorBanners } from '@/lib/gacha/gachaBannerWindows';
import { getDisplayFeaturedSixStarsWithRerunLabel, getMechanicType, HowToObtainLookup, parseBannerDate, simulatorBannerConfig } from '@/lib/gacha/realGachaBanners';
import { isBannerLive } from '@/lib/gacha/upcomingBanners';
import { useReaderClock } from '@/lib/time/readerClock';
import { buildOperatorSeriesMap, OperatorSeries } from '@/lib/operators/operatorSeries';
import { KernelAdditionLookup } from '@/lib/operators/kernelAdditionDates';
import { ReleaseDateLookup, deriveReleaseDatesFromBanners, getReleaseDate } from '@/lib/operators/operatorReleaseDates';
import { getAllOperators } from '@/lib/operators/operators';
import OperatorPreviewModal, { type OperatorPreviewItem as PreviewItem } from '@/components/operators/OperatorPreviewModal';
import { createInitialState, GachaState, BannerConfig, PulledItem, GachaItem } from '@/lib/gacha/gachaTypes';
import { doPulls, sixStarWeightedPool, fiveStarWeightedPool, simulatorPullable, BASE_RATES, ratesAtPull } from '@/lib/gacha/gachaEngine';
import { useVirtualRows, type VirtualRowLayout } from '@/components/ui/useVirtualRows';
import StyledSelect from '@/components/ui/StyledSelect';
import PageHeader from '@/components/ui/PageHeader';
import Rarity, { rarityLevel } from '@/components/ui/Rarity';
import { useHeightFloor } from '@/components/ui/useHeightFloor';
import XButton from '@/components/ui/XButton';
import { historyCsvFilename, pullHistoryCsv } from '@/lib/gacha/historyCsv';
import { downloadBlob } from '@/lib/ui/downloadBlob';
import { CATEGORIES, CATEGORY_LABELS, displayCategory, groupSimulatorBanners, type DisplayCategory } from '@/lib/gacha/bannerCategories';
import { bannerTimingLabel as bannerDateLabel } from '@/lib/gacha/bannerTimingLabel';
import { BASICS_PAGES, bannerTutorialPages } from '@/components/gacha/BannerTutorial';

interface Props {
  pools: GachaIconPools;
  banners: HeadhuntingBanner[]; // sorted newest-first
  fallbackArtwork?: Record<string, BannerArtworkOperator[]>;
  kernelLookup: KernelAdditionLookup;
  releaseLookup: ReleaseDateLookup;
  kernelExclusiveNames: string[];
  howToObtainLookup: HowToObtainLookup;
  operatorSeriesMap: Record<string, OperatorSeries>;
  /** The request's clock (epoch ms, to the minute), which contentPageClock adds
   *  (lib/content/pageClock.ts): what the server markup and the first client paint
   *  judge LIVE NOW and the Upcoming tab by, before useReaderClock takes over. */
  now: number;
}

const BANNER_ROW_STRIDE = 138;
function bannerRowLayout(): VirtualRowLayout { return { columns: 1, rowStride: BANNER_ROW_STRIDE }; }
function historyRowLayout(element: HTMLDivElement): VirtualRowLayout {
  const grid = element.querySelector<HTMLElement>('.gacha-history-grid');
  if (!grid) return { columns: 10, rowStride: 72 };
  const styles = getComputedStyle(grid);
  const columns = styles.gridTemplateColumns.split(' ').length;
  const gap = parseFloat(styles.columnGap) || 0;
  const rowGap = parseFloat(styles.rowGap) || 0;
  return { columns, rowStride: (grid.clientWidth - gap * (columns - 1)) / columns + rowGap };
}

function rarityClass(rarity: number): string {
  if (rarity === 6) return 'pull-six';
  if (rarity === 5) return 'pull-five';
  if (rarity === 4) return 'pull-four';
  return 'pull-three';
}

/** Spark cost for a genuinely Limited six-star drops from 300 to 200
 * once the eligible waiting period has passed since their own release
 * date -- 4 years 10 months for Festival specifically, 3 years 10
 * months for every other series (Celebration, Carnival, Crossover).
 * Checked against the CURRENT BANNER's own date -- not real-world
 * "today" -- consistent with every other chronology check in this
 * simulator (release availability, series eligibility, etc.), since
 * the simulator represents a specific point in the banner timeline,
 * not the actual present moment. */
function getSparkCost(operatorName: string, bannerDate: Date | null, releaseLookup: ReleaseDateLookup, series?: OperatorSeries): number {
  if (!bannerDate) return 300;
  const releaseDate = getReleaseDate(operatorName, releaseLookup);
  if (!releaseDate) return 300;
  const threshold = new Date(releaseDate);
  const [years, months] = series === 'festival' ? [4, 10] : [3, 10];
  threshold.setFullYear(threshold.getFullYear() + years);
  threshold.setMonth(threshold.getMonth() + months);
  return bannerDate >= threshold ? 200 : 300;
}

function PullIcon({ item }: { item: PulledItem }) {
  if (item.icon) {
    return <Image src={item.icon} alt="" className="gacha-pull-icon" width={80} height={80} />;
  }
  return <div className="gacha-pull-icon gacha-pull-icon-placeholder">{item.rarity}★</div>;
}

function PullTile({ item, onSelect, className = '', label }: { item: PulledItem; onSelect: (item: PulledItem) => void; className?: string; label?: string }) {
  const accessibleName = `${label ? `${label}: ` : ''}${item.name}, ${item.rarity} stars${item.isBonus ? ', bonus guarantee' : ''}`;
  return (
    <button type="button" data-rarity={item.rarity} className={`gacha-pull-tile rarity-frame ${rarityClass(item.rarity)} ${className}`} onClick={() => onSelect(item)} aria-label={accessibleName} title={accessibleName}>
      <PullIcon item={item} />
    </button>
  );
}


function PullHistory({ history, onSelect }: { history: PulledItem[]; onSelect: (item: PulledItem) => void }) {
  const entries = useMemo(() => {
    let pullNumber = 0;
    return history.map((item, index) => {
      // A guaranteed bonus is awarded alongside a pull, not as an extra pull.
      if (!item.isBonus) pullNumber += 1;
      return { item, index, pullNumber };
    }).reverse();
  }, [history]);
  const window = useVirtualRows(entries.length, historyRowLayout, { columns: 10, rowStride: 72 }, 3);

  return (
    <div className="gacha-history-list" ref={window.scrollerRef} role="region" aria-label="Pull history, newest first" tabIndex={0}>
      <div style={{ height: window.before }} aria-hidden="true" />
      <div className="gacha-history-grid">
        {entries.slice(window.firstIndex, window.lastIndex).map(({ item, index, pullNumber }) => (
          <PullTile key={index} item={item} onSelect={onSelect} label={`Pull #${pullNumber}`} />
        ))}
      </div>
      <div style={{ height: window.after }} aria-hidden="true" />
    </div>
  );
}

function FeaturedChip({ item, rarity, percent, tags, count, onSelect }: { item: GachaItem; rarity: 6 | 5; percent?: number; tags?: ('rateUp' | 'limited')[]; count?: number; onSelect: (item: PreviewItem) => void }) {
  return (
    <button type="button" className={`btn-bare gacha-featured-chip gacha-featured-chip-${rarity}`} onClick={() => onSelect({ ...item, rarity })} aria-label={`View ${item.name} operator details`}>
      <span className="gacha-featured-portrait">
        {item.icon ? (
          <Image src={item.icon} alt="" width={44} height={44} />
        ) : (
          <span className="gacha-pull-icon-placeholder">{rarity}★</span>
        )}
      </span>
      <span className="gacha-featured-info">
        <span className="gacha-featured-name" title={item.name}>{item.name}</span>
        <span className="gacha-featured-meta">
          {percent !== undefined && <span className="gacha-featured-percent">{percent.toFixed(2)}%</span>}
          {!!count && <span className="gacha-featured-count">Owned ×{count}</span>}
        </span>
        {tags?.includes('rateUp') && <span className="gacha-rate-up-tag">RATE-UP</span>}
        {tags?.includes('limited') && <span className="gacha-limited-tag">LIMITED</span>}
      </span>
    </button>
  );
}

function BannerDetails({ banner, dateLabel, onClose, onSelect, previewOpen }: {
  banner: BannerConfig;
  dateLabel: string;
  onClose: () => void;
  onSelect: (item: PulledItem) => void;
  previewOpen: boolean;
}) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const closeAction = useRef(onClose);
  const previewActive = useRef(previewOpen);
  closeAction.current = onClose;
  previewActive.current = previewOpen;
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !previewActive.current) closeAction.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
  }, []);

  // `item?.`: a pool entry without an operator is a lineup the engine should have
  // dropped (allocate), and it must not take the whole page down with it.
  const sixOdds = new Map(sixStarWeightedPool(banner).flatMap(({ item, weight }) => (item?.name ? [[item.name, weight] as const] : [])));
  const fiveOdds = new Map(fiveStarWeightedPool(banner).flatMap(({ item, weight }) => (item?.name ? [[item.name, weight] as const] : [])));
  const openOperator = (item: GachaItem, rarity: 6 | 5 | 4 | 3) => onSelect({ ...item, rarity, isFeatured: false });
  const featuredGroups: { title: string; rarity: 6 | 5 | 4; items: GachaItem[]; odds?: Map<string, number>; note?: string }[] = [
    { title: banner.type === 'celebration' ? 'Available 6★' : 'Rate-up 6★', rarity: 6, items: banner.sixStarFeatured, odds: sixOdds },
    { title: 'Rate-up 5★', rarity: 5, items: banner.fiveStarFeatured, odds: fiveOdds, note: banner.type === 'crossover' ? 'These percentages apply before the crossover 5★ guarantee changes the pool.' : undefined },
    { title: 'Rate-up 4★', rarity: 4, items: banner.fourStarFeatured ?? [] },
    { title: 'Returning limited 6★', rarity: 6, items: banner.rateUpSixStars ?? [], odds: sixOdds, note: 'In the off-banner pool at a higher chance than other 6★ operators.' },
  ];
  const remainingGroups: { rarity: 6 | 5 | 4 | 3; items: GachaItem[] }[] = [
    { rarity: 6, items: banner.otherSixStarPool },
    { rarity: 5, items: banner.otherFiveStarPool },
    { rarity: 4, items: banner.fourStarPool },
    { rarity: 3, items: banner.threeStarPool },
  ];

  return <div className="modal-overlay gacha-details-overlay" aria-hidden={previewOpen} onClick={() => { if (!previewOpen) onClose(); }}>
    <div className="modal-box gacha-details-modal" role="dialog" aria-modal={!previewOpen} aria-labelledby="gacha-details-title" onClick={(event) => event.stopPropagation()}>
      <div className="gacha-details-header">
        <div><span className="gacha-pull-preview-rarity">{dateLabel}</span><h2 id="gacha-details-title">Banner details</h2><p>{banner.label}</p></div>
        <XButton ref={closeButton} className="gacha-preview-close" onClick={onClose} label="Close banner details" />
      </div>
      <div className="gacha-details-rates" aria-label="Base rarity rates">
        {([[6, BASE_RATES.six], [5, BASE_RATES.five], [4, BASE_RATES.four], [3, BASE_RATES.three]] as const).map(([rarity, rate]) => <div key={rarity}><strong><Rarity n={rarity} /></strong><span>{(rate * 100).toFixed(0)}%</span></div>)}
      </div>
      <p className="gacha-details-caption">Base chance per pull. The 6★ chance rises with pity; operator percentages below are within that rarity.</p>
      {featuredGroups.filter((group) => group.items.length).map((group) => <section className="gacha-details-section" key={group.title}>
        <h3>{group.title}</h3>
        {group.note && <p className="gacha-details-caption">{group.note}</p>}
        <div className="gacha-details-featured-list">
          {group.items.map((item) => <button key={item.name} type="button" className={`gacha-details-featured gacha-details-rarity-${group.rarity}`} onClick={() => openOperator(item, group.rarity)}>
            {item.icon ? <Image src={item.icon} alt="" width={54} height={54} /> : <span className="gacha-pull-icon-placeholder">{group.rarity}★</span>}
            <span><strong>{item.name}</strong>{group.odds?.has(item.name) && <small>{((group.odds.get(item.name) ?? 0) * 100).toFixed(2)}% of {group.rarity}★</small>}</span>
          </button>)}
        </div>
      </section>)}
      <section className="gacha-details-section">
        <h3>Other possible operators</h3>
        {remainingGroups.map(({ rarity, items }) => <div className="gacha-details-pool" key={rarity}>
          <h4><Rarity n={rarityLevel(rarity)} /></h4>
          {items.length ? <div className="gacha-details-name-list">{[...items].sort((a, b) => a.name.localeCompare(b.name)).map((item) => <button type="button" key={item.name} onClick={() => openOperator(item, rarity)}>{item.name}</button>)}</div> : <p className="gacha-details-caption">No other {rarity}★ operators in this banner.</p>}
        </div>)}
      </section>
    </div>
  </div>;
}

function selectionStatus(banner: BannerConfig, state: GachaState) {
  if (state.secondSelectionUsed) return 'Both used';
  const remaining = (state.firstSelection ? 300 : 150) - state.pullCount;
  if (remaining > 0) return `${remaining} pulls left`;
  const other = state.firstSelection && banner.sixStarFeatured.find(op => op.name !== state.firstSelection);
  return other ? `Next 6★: ${other.name}` : 'Next 6★: either rate-up';
}

export default function GachaSimulator({ pools, banners: globalBanners, fallbackArtwork = {}, kernelLookup, releaseLookup, kernelExclusiveNames, howToObtainLookup, operatorSeriesMap, now }: Props) {
  const { server, schedule } = useRegionalTime();
  const banners = useMemo(() => regionalBanners(globalBanners, schedule, server), [globalBanners, schedule, server]);
  const router = useRouter();
  const contentUrl = useContentUrl();
  // What is live or upcoming is judged on the reader's clock, not the server's: the
  // first render uses the request's `now`, so it matches the markup, and the reader's
  // clock takes over after mount (a tab left open follows a banner's end, too).
  const clock = useReaderClock(now, { tickMs: 60_000, onFocus: true });
  const bannersByCategory = useMemo(() => groupSimulatorBanners(banners, clock), [banners, clock]);

  const [category, setCategory] = useState<DisplayCategory>('upcoming');
  const categoryBanners = bannersByCategory[category];
  const bannerWindow = useVirtualRows(categoryBanners.length, bannerRowLayout, { columns: 1, rowStride: BANNER_ROW_STRIDE }, 2);
  const [selectedBannerName, setSelectedBannerName] = useState<string>(categoryBanners[0]?.name || '');
  const [showDetails, setShowDetails] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showSparkStore, setShowSparkStore] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [guidePhase, setGuidePhase] = useState<'question' | 'basics' | 'banner'>('question');
  const [guidePageIndex, setGuidePageIndex] = useState(0);
  const selectedBanner = categoryBanners.find((b) => b.name === selectedBannerName) || categoryBanners[0];
  const selectedArt = selectedBanner?.banner_image;
  const selectedFallback = selectedBanner && !selectedBanner.globalLineupPending && fallbackArtwork[selectedBanner.name];
  const bannerArtworkView = !selectedBanner ? null : selectedArt ? (
    <a className="gacha-banner-art-link lift" href={contentUrl(selectedArt)} target="_blank" rel="noreferrer"
      aria-label={`Open full-size banner artwork for ${bannerDisplayName(selectedBanner.name)} (opens in a new tab)`}>
      <Image src={selectedArt} alt={bannerDisplayName(selectedBanner.name)} width={1600} height={900}
        className="gacha-banner-main-image" priority />
    </a>
  ) : selectedFallback ? (
    <BannerArtworkFallback operators={selectedFallback} kernel={selectedBanner.pull_type === 'kernel'} />
  ) : null;
  const visibleBanners = categoryBanners.slice(bannerWindow.firstIndex, bannerWindow.lastIndex);

  const [state, setState] = useState<GachaState>(createInitialState());
  const [lastPulls, setLastPulls] = useState<PulledItem[]>([]);
  /* Reset at the bottom of the page emptied Latest pull and the history and moved
     everything 341px down the screen. Latest pull now stays mounted (ten empty tiles
     before the first pull) and the history header stays mounted, so the page keeps
     most of its height; this floor holds the reader through whatever is left, such as
     an open history list emptying. Per banner. */
  const pullFloor = useHeightFloor(selectedBanner?.name);
  // The Featured panel's chip row, measured after every render that shows one. A banner
  // whose lineup is still to be confirmed shows a one-line note in its place, and the note
  // holds the height of the row it replaced, so choosing that banner never shortens the page
  // under the reader (Anti-Page Jump: 171px on desktop, more on a phone, for Standard Pool
  // #176). Nothing is held on the first render, which the server's HTML must match.
  const featuredRowRef = useRef<HTMLDivElement>(null);
  const featuredRowHeight = useRef(0);
  useLayoutEffect(() => {
    if (featuredRowRef.current) featuredRowHeight.current = featuredRowRef.current.offsetHeight;
  });
  const [previewedPull, setPreviewedPull] = useState<PreviewItem | null>(null);
  /* One function for the dialog's life: its effect re-subscribes on a new onClose, and the page
     re-renders every minute (the clock), which moved focus to Close while a pull was open. */
  const closePreview = useCallback(() => setPreviewedPull(null), []);

  const [orienteeringSelected, setOrienteeringSelected] = useState<GachaItem[]>([]);
  const [orienteeringFiveSelected, setOrienteeringFiveSelected] = useState<GachaItem[]>([]);
  const [orienteeringConfirmed, setOrienteeringConfirmed] = useState(false);
  const [missingSixStars, setMissingSixStars] = useState<Set<string>>(new Set());
  const [celebrationConfirmed, setCelebrationConfirmed] = useState(false);
  const [kernelLocatingSixSelected, setKernelLocatingSixSelected] = useState<GachaItem[]>([]);
  const [kernelLocatingFiveSelected, setKernelLocatingFiveSelected] = useState<GachaItem[]>([]);
  const [kernelLocatingConfirmed, setKernelLocatingConfirmed] = useState(false);

  const isKernelLocating = selectedBanner ? getMechanicType(selectedBanner) === 'kernelLocating' : false;
  const kernelLocatingSixCandidates: GachaItem[] = useMemo(() => {
    if (!isKernelLocating || !selectedBanner) return [];
    return selectedBanner.six_stars.map((name) => pools.six.find((i) => i.name === name) || { name, icon: null });
  }, [isKernelLocating, selectedBanner, pools.six]);
  const kernelLocatingFiveCandidates: GachaItem[] = useMemo(() => {
    if (!isKernelLocating || !selectedBanner) return [];
    return selectedBanner.five_stars.map((name) => pools.five.find((i) => i.name === name) || { name, icon: null });
  }, [isKernelLocating, selectedBanner, pools.five]);

  function toggleKernelLocatingSix(item: GachaItem) {
    setKernelLocatingSixSelected((current) => {
      if (current.some((c) => c.name === item.name)) return current.filter((c) => c.name !== item.name);
      if (current.length >= 2) return current;
      return [...current, item];
    });
  }
  function toggleKernelLocatingFive(item: GachaItem) {
    setKernelLocatingFiveSelected((current) => {
      if (current.some((c) => c.name === item.name)) return current.filter((c) => c.name !== item.name);
      if (current.length >= 3) return current;
      return [...current, item];
    });
  }

  const isCelebration = selectedBanner ? getMechanicType(selectedBanner) === 'celebration' : false;

  const isOrienteering = selectedBanner ? getMechanicType(selectedBanner) === 'orienteering' : false;
  const orienteeringCandidates: GachaItem[] = useMemo(() => {
    if (!isOrienteering || !selectedBanner) return [];
    return selectedBanner.six_stars.map((name) => {
      const found = pools.six.find((i) => i.name === name);
      return found || { name, icon: null };
    });
  }, [isOrienteering, selectedBanner, pools.six]);
  const orienteeringFiveCandidates: GachaItem[] = useMemo(() => {
    if (!isOrienteering || !selectedBanner) return [];
    return selectedBanner.five_stars.map((name) => {
      const found = pools.five.find((i) => i.name === name);
      return found || { name, icon: null };
    });
  }, [isOrienteering, selectedBanner, pools.five]);

  function changeCategory(next: DisplayCategory) {
    setShowDetails(false);
    bannerWindow.scrollerRef.current?.scrollTo({ top: 0 });
    setCategory(next);
    const firstInCategory = bannersByCategory[next][0];
    setSelectedBannerName(firstInCategory?.name || '');
    setState(createInitialState());
    setLastPulls([]);
    setOrienteeringSelected([]);
    setOrienteeringFiveSelected([]);
    setOrienteeringConfirmed(false);
    setMissingSixStars(new Set());
    setCelebrationConfirmed(false);
    setKernelLocatingSixSelected([]);
    setKernelLocatingFiveSelected([]);
    setKernelLocatingConfirmed(false);
  }

  function changeBanner(name: string) {
    setShowDetails(false);
    setSelectedBannerName(name);
    setState(createInitialState());
    setLastPulls([]);
    setOrienteeringSelected([]);
    setOrienteeringFiveSelected([]);
    setOrienteeringConfirmed(false);
    setMissingSixStars(new Set());
    setCelebrationConfirmed(false);
    setKernelLocatingSixSelected([]);
    setKernelLocatingFiveSelected([]);
    setKernelLocatingConfirmed(false);
  }

  // Resolve old names and historical links into the banner's current navigation group.
  useEffect(() => {
    if (!router.isReady || typeof router.query.banner !== 'string') return;
    const target = banners.find(b => b.name === router.query.banner || b.aliases?.includes(router.query.banner as string));
    if (!target) return;
    setCategory(bannersByCategory.upcoming.includes(target) ? 'upcoming' : displayCategory(target));
    changeBanner(target.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.query.banner, banners]);

  function toggleMissingSixStar(name: string) {
    setMissingSixStars((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function confirmCelebrationSelection() {
    setCelebrationConfirmed(true);
    setState(createInitialState());
    setLastPulls([]);
  }

  function changeCelebrationSelection() {
    setCelebrationConfirmed(false);
  }

  function toggleOrienteeringPick(item: GachaItem) {
    setOrienteeringSelected((current) => {
      if (current.some((c) => c.name === item.name)) {
        return current.filter((c) => c.name !== item.name);
      }
      if (current.length >= 3) return current;
      return [...current, item];
    });
  }

  function toggleOrienteeringFivePick(item: GachaItem) {
    setOrienteeringFiveSelected((current) => {
      if (current.some((c) => c.name === item.name)) {
        return current.filter((c) => c.name !== item.name);
      }
      if (current.length >= 3) return current;
      return [...current, item];
    });
  }

  /* Only this yes/no of the pulls so far reaches the banner's pools: keyed on every pull's
     counts, the memo rebuilt every pool (four eligibility passes over every operator) on
     each pull, which is most of what a ten-pull press cost (2026-10-27). */
  const hasObtainedAnyCelebrationSix = isCelebration && !!selectedBanner && selectedBanner.six_stars.some((n) => (state.obtainedCounts[n] || 0) > 0);
  const banner: BannerConfig | null = useMemo(() => {
    if (!selectedBanner || category === 'other') return null;
    // Celebration's pool isn't static once pulling starts: the player's
    // initial "I already own this" marks (missingSixStars) only govern
    // the pool BEFORE they've obtained anything from this banner. The
    // moment they land any new six-star from this specific banner, the
    // real game reopens the pool to ALL six of them -- including the
    // one they just obtained, which is exactly why continuing to pull
    // risks landing a duplicate of what you just got. So once that
    // happens, nothing is excluded at all.
    const celebrationExcludeNames = isCelebration && selectedBanner && missingSixStars.size > 0 && !hasObtainedAnyCelebrationSix
      ? selectedBanner.six_stars.filter((n) => !missingSixStars.has(n))
      : [];
    const withEligibility = simulatorBannerConfig(selectedBanner, pools, celebrationExcludeNames, kernelLookup, releaseLookup, new Set(kernelExclusiveNames), howToObtainLookup, operatorSeriesMap);

    if (isOrienteering && orienteeringConfirmed && orienteeringSelected.length === 3 && orienteeringFiveSelected.length === 3) {
      // Six-stars stay fully exclusive (only the chosen 3 are pullable
      // at all), but five-stars aren't anymore -- the 3 NOT chosen
      // remain pullable too, just at reduced weight, so they need to
      // actually be in the off-banner pool rather than left empty.
      const chosenFiveNames = new Set(orienteeringFiveSelected.map((o) => o.name));
      const remainingFive = orienteeringFiveCandidates.filter((o) => !chosenFiveNames.has(o.name));
      return {
        ...withEligibility,
        sixStarFeatured: orienteeringSelected,
        fiveStarFeatured: orienteeringFiveSelected,
        otherFiveStarPool: remainingFive,
      };
    }
    if (isKernelLocating && kernelLocatingConfirmed && kernelLocatingSixSelected.length === 2 && kernelLocatingFiveSelected.length === 3) {
      const chosenSixNames = new Set(kernelLocatingSixSelected.map((o) => o.name));
      const chosenFiveNames = new Set(kernelLocatingFiveSelected.map((o) => o.name));
      const offBannerSix = kernelLocatingSixCandidates.filter((o) => !chosenSixNames.has(o.name));
      const offBannerFive = kernelLocatingFiveCandidates.filter((o) => !chosenFiveNames.has(o.name));
      return {
        ...withEligibility,
        sixStarFeatured: kernelLocatingSixSelected,
        fiveStarFeatured: kernelLocatingFiveSelected,
        otherSixStarPool: offBannerSix,
        otherFiveStarPool: offBannerFive,
      };
    }
    return withEligibility;
  }, [
    selectedBanner,
    pools,
    category,
    isCelebration,
    missingSixStars,
    celebrationConfirmed,
    hasObtainedAnyCelebrationSix,
    isOrienteering,
    orienteeringConfirmed,
    orienteeringSelected,
    orienteeringFiveSelected,
    orienteeringFiveCandidates,
    isKernelLocating,
    kernelLocatingConfirmed,
    kernelLocatingSixSelected,
    kernelLocatingFiveSelected,
    kernelLocatingSixCandidates,
    kernelLocatingFiveCandidates,
    kernelLookup,
    releaseLookup,
    kernelExclusiveNames,
    howToObtainLookup,
    operatorSeriesMap,
  ]);

  // A banner with its own tutorial asks whether the reader knows the basics first; one
  // without goes straight to the Basics, which then end on Done.
  const openGuide = () => {
    setShowGuide(true);
    setGuidePhase(bannerTutorialPages(banner) ? 'question' : 'basics');
    setGuidePageIndex(0);
  };

  const sixStarOdds = useMemo(() => {
    if (!banner) return [];
    const pool = sixStarWeightedPool(banner);
    const total = pool.reduce((sum, p) => sum + p.weight, 0) || 1;
    return pool.map((p) => ({ item: p.item, weight: p.weight / total }));
  }, [banner]);

  const fiveStarOdds = useMemo(() => {
    if (!banner) return [];
    const pool = fiveStarWeightedPool(banner);
    const total = pool.reduce((sum, p) => sum + p.weight, 0) || 1;
    return pool.map((p) => ({ item: p.item, weight: p.weight / total }));
  }, [banner]);

  const stats = useMemo(() => {
    const counts = { 6: 0, 5: 0, 4: 0, 3: 0 };
    state.history.forEach((item) => {
      counts[item.rarity] += 1;
    });
    return counts;
  }, [state.history]);

  // A pending lineup (Standard Pool #176 on the day it opened) or a banner no 6★ can
  // drop from: the controls stay where they are, disabled, and the Featured
  // Operators panel says why. See simulatorPullable.
  const pullable = !!banner && !!selectedBanner && simulatorPullable(selectedBanner, banner);
  const unpullableReason = !banner || !selectedBanner || pullable ? undefined
    : isLineupPending(selectedBanner) ? lineupPendingNote(selectedBanner) : 'No 6★ operators can be pulled on this banner.';

  function pull(count: number) {
    if (!banner || !pullable) return;
    const result = doPulls(banner, state, count);
    setState(result.state);
    setLastPulls(result.items);
  }

  /** The pulls so far as CSV, for the reader's own charts (lib/gacha/historyCsv.ts). */
  function exportHistory() {
    if (!selectedBanner || state.history.length === 0) return;
    downloadBlob(new Blob([pullHistoryCsv(state.history, { name: selectedBanner.name, type: getMechanicType(selectedBanner) })], { type: 'text/csv;charset=utf-8' }), historyCsvFilename(selectedBanner.name));
  }

  function reset() {
    setState(createInitialState());
    setLastPulls([]);
  }

  return (
    <>
      <PageMeta title="Gacha Simulator" description="Simulate Arknights headhunting banners with the real rates, pity and rate-ups." path="/gacha" />

      <PageHeader eyebrow="Rhodes Island // Headhunting Simulation" title="Gacha Simulator" />

      <main className="gacha-main">
        <div className="gacha-category-row" role="group" aria-label="Banner category">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              className="filter-chip"
              onClick={() => changeCategory(cat)}
              disabled={bannersByCategory[cat].length === 0}
              aria-pressed={cat === category}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
        {/* The site's dropdown on a phone; it was a native <select>. */}
        <StyledSelect
          label="Banner category"
          className="gacha-category-mobile"
          value={category}
          onChange={(value) => changeCategory(value as DisplayCategory)}
          options={CATEGORIES.map((cat) => ({ value: cat, label: CATEGORY_LABELS[cat], disabled: bannersByCategory[cat].length === 0 }))}
        />

        <div className="gacha-layout">
          <div className="panel gacha-banner-sidebar" ref={bannerWindow.scrollerRef} role="region" aria-label="Banners" tabIndex={0}>
            {categoryBanners.length === 0 ? (
              <p className="hint">No banners in this category yet.</p>
            ) : (
              <>
                <div className="gacha-banner-sidebar-spacer" style={{ height: bannerWindow.before }} aria-hidden="true" />
                {visibleBanners.map((b) => {
                  const isCurrentlyActive = category === 'upcoming' && isBannerLive(b, clock);
                  const art = b.banner_image;
                  const fallback = !b.globalLineupPending && fallbackArtwork[b.name];
                  return (
                    <button
                      key={b.name}
                      type="button"
                      className={`gacha-banner-sidebar-item${b.name === selectedBanner?.name ? ' active' : ''}`}
                      onClick={() => changeBanner(b.name)}
                      aria-pressed={b.name === selectedBanner?.name}
                      title={bannerDisplayName(b.name)}
                    >
                      {art
                        ? <Image src={art} alt="" fill sizes="260px" className="gacha-banner-sidebar-bg" />
                        : fallback && <BannerArtworkThumbnail operators={fallback} />}
                      {isCurrentlyActive && <span className="badge-live gacha-banner-sidebar-live-badge">LIVE NOW</span>}
                      <span className="gacha-banner-sidebar-text">
                        <span className="gacha-banner-sidebar-name">{getDisplayFeaturedSixStarsWithRerunLabel(b, releaseLookup).join(' / ') || bannerDisplayName(b.name)}</span>
                        <span className="gacha-banner-sidebar-date">{bannerDateLabel(b)}</span>
                      </span>
                    </button>
                  );
                })}
                <div className="gacha-banner-sidebar-spacer" style={{ height: bannerWindow.after }} aria-hidden="true" />
              </>
            )}
          </div>

          <div className="gacha-main-col">
            {category === 'other' && selectedBanner ? (
              <section className="op-section">
                <h2>{bannerDisplayName(selectedBanner.name)}</h2>
                {bannerArtworkView}
                <p className="hint">
                  This banner&apos;s type couldn&apos;t be confidently determined from the scraped data, so no
                  simulator is available for it. Showing what&apos;s known below.
                </p>
                {isLineupPending(selectedBanner) && <p className="hint">{lineupPendingNote(selectedBanner)}</p>}
                <div className="gacha-featured-row" style={{ marginTop: 12 }}>
                  {selectedBanner.six_stars.map((name) => {
                    const found = pools.six.find((i) => i.name === name);
                    return <FeaturedChip key={name} item={found || { name, icon: null }} rarity={6} onSelect={setPreviewedPull} />;
                  })}
                  {selectedBanner.five_stars.map((name) => {
                    const found = pools.five.find((i) => i.name === name);
                    return <FeaturedChip key={name} item={found || { name, icon: null }} rarity={5} onSelect={setPreviewedPull} />;
                  })}
                </div>
              </section>
            ) : !selectedBanner || !banner ? (
              <section className="op-section">
                <p className="hint">No banner data available yet -- run the headhunting banners scraper first.</p>
              </section>
            ) : (
              <>
                {!((isOrienteering && !orienteeringConfirmed) || (isKernelLocating && !kernelLocatingConfirmed)) && (
                  <section className="op-section gacha-featured-section">
                    <h2>
                      {banner.label} <span className="gacha-banner-date">({bannerDateLabel(selectedBanner)})</span>
                    </h2>
                    {!selectedBanner?.global_date && <p className="hint">Global release date unannounced.</p>}
                    {bannerArtworkView ?? (
                      <div className="gacha-banner-main-image gacha-banner-main-placeholder art-placeholder">No art yet</div>
                    )}
                    <div className="gacha-banner-actions">
                      <button type="button" className="ghost btn-sm gacha-banner-action" onClick={() => setShowDetails(true)}>Details</button>
                      <button type="button" className="ghost btn-sm gacha-banner-action" onClick={openGuide}>How does this work?</button>
                      {banner.type === 'limited' && <button type="button" className="gacha-spark-store-btn" onClick={() => setShowSparkStore(true)}>Spark Store</button>}
                    </div>
                  </section>
                )}

                {isCelebration && !celebrationConfirmed && (
                  <section className="op-section">
                    <h2>{banner.label} — Choose the units you&apos;re missing</h2>
                    <p className="hint" style={{ marginBottom: 12 }}>
                      Select the operators you’re missing. Your first 6★ will come from that selection. Leave it empty if you own them all.
                    </p>
                    <div className="gacha-owned-grid">
                      {selectedBanner?.six_stars.map((name) => {
                        const found = pools.six.find((i) => i.name === name);
                        const missing = missingSixStars.has(name);
                        return (
                          <button
                            key={name}
                            type="button"
                            className={`gacha-owned-card${missing ? ' owned' : ''}`}
                            onClick={() => toggleMissingSixStar(name)}
                          >
                            {found?.icon ? (
                              <Image src={found.icon} alt={name} width={44} height={44} />
                            ) : (
                              <div className="gacha-pull-icon-placeholder">6★</div>
                            )}
                            <span>{name}</span>
                            {missing && <span className="gacha-owned-tag">MISSING</span>}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      className="primary"
                      style={{ marginTop: 14 }}
                      onClick={confirmCelebrationSelection}
                    >
                      Confirm selection
                    </button>
                  </section>
                )}

                {isCelebration && celebrationConfirmed && (
                  <section className="op-section">
                    <button type="button" className="ghost" onClick={changeCelebrationSelection}>
                      Change selection
                    </button>
                  </section>
                )}

                <div className="gacha-content-group">
                {(isOrienteering && !orienteeringConfirmed && !isLineupPending(selectedBanner!)) || (isCelebration && !celebrationConfirmed) || (isKernelLocating && !kernelLocatingConfirmed) ? (
                  isOrienteering ? (
                  <section className="op-section">
                    <div className="gacha-info-toggle-row">
                      <h2 style={{ margin: 0 }}>{banner.label} — Choose 3 six★s and 3 five★s</h2>
                      <button
                        type="button"
                        className="ghost gacha-other-toggle"
                        onClick={openGuide}
                      >
                        How does this work?
                      </button>
                    </div>
                    <p className="hint" style={{ marginBottom: 12 }}>
                      Pick exactly 3 of this banner&apos;s real six-star candidates and 3 of its
                      five-star candidates. Only your chosen 6★ can appear. Your chosen 5★ share 60% of 5★ pulls.
                    </p>
                    <h3 style={{ marginBottom: 8 }}>Six-star candidates ({orienteeringSelected.length}/3)</h3>
                    <div className="orienteering-pick-grid">
                      {orienteeringCandidates.map((item) => {
                        const picked = orienteeringSelected.some((s) => s.name === item.name);
                        return (
                          <button
                            key={item.name}
                            type="button"
                            className={`orienteering-pick-card${picked ? ' picked' : ''}`}
                            onClick={() => toggleOrienteeringPick(item)}
                          >
                            {item.icon ? (
                              <Image src={item.icon} alt={item.name} width={48} height={48} />
                            ) : (
                              <div className="gacha-pull-icon-placeholder">6★</div>
                            )}
                            <span>{item.name}</span>
                          </button>
                        );
                      })}
                    </div>
                    <h3 style={{ marginTop: 16, marginBottom: 8 }}>Five-star candidates ({orienteeringFiveSelected.length}/3)</h3>
                    <div className="orienteering-pick-grid">
                      {orienteeringFiveCandidates.map((item) => {
                        const picked = orienteeringFiveSelected.some((s) => s.name === item.name);
                        return (
                          <button
                            key={item.name}
                            type="button"
                            className={`orienteering-pick-card${picked ? ' picked' : ''}`}
                            onClick={() => toggleOrienteeringFivePick(item)}
                          >
                            {item.icon ? (
                              <Image src={item.icon} alt={item.name} width={48} height={48} />
                            ) : (
                              <div className="gacha-pull-icon-placeholder">5★</div>
                            )}
                            <span>{item.name}</span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="submit-row" style={{ marginTop: 14 }}>
                      <span className="rated-count">
                        {orienteeringSelected.length}/3 six★, {orienteeringFiveSelected.length}/3 five★ selected
                      </span>
                      <div className="submit-row-actions">
                        <button
                          type="button"
                          className="primary"
                          disabled={orienteeringSelected.length !== 3 || orienteeringFiveSelected.length !== 3}
                          onClick={() => setOrienteeringConfirmed(true)}
                        >
                          Confirm selection
                        </button>
                      </div>
                    </div>
                  </section>
                ) : isKernelLocating && !kernelLocatingConfirmed ? (
                  <section className="op-section">
                    <div className="gacha-info-toggle-row">
                      <h2 style={{ margin: 0 }}>{banner.label} — Choose 2 six★s and 3 five★s</h2>
                      <button
                        type="button"
                        className="ghost gacha-other-toggle"
                        onClick={openGuide}
                      >
                        How does this work?
                      </button>
                    </div>
                    <p className="hint" style={{ marginBottom: 12 }}>
                      Kernel Locating: your chosen 2 six-stars share half of every 6★ result and your
                      3 five-stars half of every 5★ result; the other candidates share the rest.
                    </p>
                    <h3 style={{ marginBottom: 8 }}>Six-star candidates ({kernelLocatingSixSelected.length}/2)</h3>
                    <div className="orienteering-pick-grid">
                      {kernelLocatingSixCandidates.map((item) => {
                        const picked = kernelLocatingSixSelected.some((s) => s.name === item.name);
                        return (
                          <button
                            key={item.name}
                            type="button"
                            className={`orienteering-pick-card${picked ? ' picked' : ''}`}
                            onClick={() => toggleKernelLocatingSix(item)}
                          >
                            {item.icon ? (
                              <Image src={item.icon} alt={item.name} width={48} height={48} />
                            ) : (
                              <div className="gacha-pull-icon-placeholder">6★</div>
                            )}
                            <span>{item.name}</span>
                          </button>
                        );
                      })}
                    </div>
                    <h3 style={{ marginTop: 16, marginBottom: 8 }}>Five-star candidates ({kernelLocatingFiveSelected.length}/3)</h3>
                    <div className="orienteering-pick-grid">
                      {kernelLocatingFiveCandidates.map((item) => {
                        const picked = kernelLocatingFiveSelected.some((s) => s.name === item.name);
                        return (
                          <button
                            key={item.name}
                            type="button"
                            className={`orienteering-pick-card${picked ? ' picked' : ''}`}
                            onClick={() => toggleKernelLocatingFive(item)}
                          >
                            {item.icon ? (
                              <Image src={item.icon} alt={item.name} width={48} height={48} />
                            ) : (
                              <div className="gacha-pull-icon-placeholder">5★</div>
                            )}
                            <span>{item.name}</span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="submit-row" style={{ marginTop: 14 }}>
                      <span className="rated-count">
                        {kernelLocatingSixSelected.length}/2 six★, {kernelLocatingFiveSelected.length}/3 five★ selected
                      </span>
                      <div className="submit-row-actions">
                        <button
                          type="button"
                          className="primary"
                          disabled={kernelLocatingSixSelected.length !== 2 || kernelLocatingFiveSelected.length !== 3}
                          onClick={() => setKernelLocatingConfirmed(true)}
                        >
                          Confirm selection
                        </button>
                      </div>
                    </div>
                  </section>
                  ) : null
                ) : (
                  <section className="op-section">
                    <div className="panel gacha-pity-row">
                      <div className="gacha-pity-stat">
                        <span className="gacha-pity-label">Total pulls</span>
                        <span className="gacha-pity-value">{state.pullCount}</span>
                      </div>
                      <div className="gacha-pity-stat">
                        <span className="gacha-pity-label">Pulls since last 6★</span>
                        <span className="gacha-pity-value">{state.softPitySince6}</span>
                      </div>
                      <div className="gacha-pity-stat">
                        <span className="gacha-pity-label">First-10 5★+ guarantee</span>
                        <span className="gacha-pity-value">
                          {state.firstTenGuaranteeUsed
                            ? 'Used'
                            : state.pullCount < 10
                            ? `${10 - state.pullCount} left`
                            : 'Missed'}
                        </span>
                      </div>
                      {banner.sixStarGuarantee === 'selection' && banner.sixStarFeatured.length === 2 && (
                        <div className="gacha-pity-stat">
                          <span className="gacha-pity-label">{banner.type === 'kernel' ? 'Kernel Selection' : 'Standard Selection'}</span>
                          <span className="gacha-pity-value">{selectionStatus(banner, state)}</span>
                        </div>
                      )}
                      {banner.sixStarGuarantee === 'focused' && (
                        <div className="gacha-pity-stat">
                          <span className="gacha-pity-label">Featured guarantee</span>
                          <span className="gacha-pity-value">
                            {state.featuredGuaranteeUsed
                              ? 'Used'
                              : state.pullsSinceFeatured6Star >= 150
                              ? 'Active'
                              : `${150 - state.pullsSinceFeatured6Star} left`}
                          </span>
                        </div>
                      )}
                      {banner.sixStarGuarantee === 'limitedBonus' && (
                        <div className="gacha-pity-stat">
                          <span className="gacha-pity-label">Limited guarantee</span>
                          <span className="gacha-pity-value">
                            {state.limitedGuaranteeGranted ? 'Granted (+1)' : `${Math.max(0, 300 - state.pullCount)} left`}
                          </span>
                        </div>
                      )}
                      {banner.type === 'crossover' && (
                        <div className="gacha-pity-stat">
                          <span className="gacha-pity-label">Crossover guarantee (120)</span>
                          <span className="gacha-pity-value">
                            {banner.sixStarGuarantee === 'first120' && state.obtainedCounts[banner.sixStarFeatured[0]?.name] ? 'Used'
                              : state.pullsSinceCrossover6Star >= 120
                              ? 'Active'
                              : `${120 - state.pullsSinceCrossover6Star} left`}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="gacha-stats-rates">
                      <div className="gacha-rarity-stats" aria-label="Pull rates and results">
                        {(() => {
                          const currentPullNumber = state.softPitySince6 + 1;
                          const current = ratesAtPull(currentPullNumber);
                          const decimals = currentPullNumber > 50 ? 2 : 0;
                          return ([
                            { rarity: 6, rate: current.six },
                            { rarity: 5, rate: current.five },
                            { rarity: 4, rate: current.four },
                            { rarity: 3, rate: current.three },
                          ] as const).map(({ rarity, rate }) => (
                            <div className="gacha-rarity-stat" key={rarity}>
                              <span className="gacha-rarity-label"><Rarity n={rarity} /> <small>({(rate * 100).toFixed(decimals)}%)</small></span>
                              <strong className="gacha-rarity-count">{stats[rarity]}</strong>
                            </div>
                          ));
                        })()}
                      </div>
                      <div className="gacha-pull-actions">
                        <button type="button" className="gacha-action gacha-action-reset" onClick={reset}>
                          Reset
                        </button>
                        <button type="button" className="gacha-action gacha-action-single" onClick={() => pull(1)} aria-label="Pull one operator" disabled={!pullable} title={unpullableReason}>
                          x1
                        </button>
                        <button type="button" className="gacha-action gacha-action-ten" onClick={() => pull(10)} aria-label="Pull ten operators" disabled={!pullable} title={unpullableReason}>
                          x10
                        </button>
                      </div>
                    </div>
                  </section>
                )}

                <div ref={pullFloor.ref}>
                <section className="op-section">
                  <h2>Latest pull</h2>
                  <div className="gacha-pull-grid">
                    {lastPulls.length > 0
                      ? lastPulls.map((item, i) => {
                        const slideDirection = lastPulls.length === 1 || i % 2 === 0 ? 'gacha-pull-slide-bottom' : 'gacha-pull-slide-top';
                        return <PullTile key={`${state.pullCount}-${i}`} item={item} onSelect={setPreviewedPull} className={slideDirection} />;
                      })
                      : Array.from({ length: 10 }, (_, i) => <span key={i} className="gacha-pull-tile rarity-frame gacha-pull-tile-empty" aria-hidden="true" />)}
                  </div>
                  {lastPulls.length === 0 && <p className="visually-hidden">No pulls yet.</p>}
                </section>

                {/* A sibling of Latest pull, so the same heading level (it was an h3
                    beside an h2); its groups below are h3. */}
                <section className="op-section gacha-roster-section">
                    <div className="gacha-content-group">
                    <h2>Featured Operators</h2>
                    {isLineupPending(selectedBanner) ? (
                      <div className="gacha-lineup-pending" style={featuredRowHeight.current ? { minHeight: featuredRowHeight.current } : undefined}>
                        <p className="hint">{lineupPendingNote(selectedBanner)}</p>
                      </div>
                    ) : <div className="gacha-featured-row" ref={featuredRowRef}>
                      {(isOrienteering && orienteeringConfirmed ? orienteeringSelected : banner.sixStarFeatured).map((item) => {
                        const pct = sixStarOdds.find((o) => o.item?.name === item.name);
                        const isLimited = banner.type === 'limited' && howToObtainLookup[item.name]?.Limited === 'Yes';
                        return (
                          <FeaturedChip
                            key={item.name}
                            item={item}
                            rarity={6} onSelect={setPreviewedPull}
                            tags={isLimited ? ['limited'] : undefined}
                            percent={pct ? pct.weight * 100 : undefined}
                            count={state.obtainedCounts[item.name]}
                          />
                        );
                      })}
                      {banner.fiveStarFeatured.map((item) => {
                        const pct = fiveStarOdds.find((o) => o.item?.name === item.name);
                        return (
                          <FeaturedChip
                            key={item.name}
                            item={item}
                            rarity={5} onSelect={setPreviewedPull}
                            percent={pct ? pct.weight * 100 : undefined}
                            count={state.obtainedCounts[item.name]}
                          />
                        );
                      })}
                    </div>}
                    {(banner.rateUpSixStars || []).length > 0 && <>
                      <h3 style={{ marginTop: 16, marginBottom: 4 }}>Returning limited operators</h3>
                      <p className="hint">{RETURNING_LIMITED_NOTE}</p>
                      <div className="gacha-featured-row">
                      {(banner.rateUpSixStars || []).map((item) => {
                        const pct = sixStarOdds.find((o) => o.item?.name === item.name);
                        const isLimited = howToObtainLookup[item.name]?.Limited === 'Yes';
                        return (
                          <FeaturedChip
                            key={item.name}
                            item={item}
                            rarity={6} onSelect={setPreviewedPull}
                            tags={isLimited ? ['limited'] : undefined}
                            percent={pct ? pct.weight * 100 : undefined}
                            count={state.obtainedCounts[item.name]}
                          />
                        );
                      })}
                      </div>
                    </>}
                    {banner.otherSixStarPool.some(item => (banner.type === 'limited' && howToObtainLookup[item.name]?.Limited === 'Yes' && state.pullCount === 0) || state.obtainedCounts[item.name]) && <>
                      <h3 style={{ marginTop: 16, marginBottom: 8 }}>Other available operators</h3>
                      <div className="gacha-featured-row">
                      {banner.otherSixStarPool
                        .filter((item) => {
                          const isLimited = banner.type === 'limited' && howToObtainLookup[item.name]?.Limited === 'Yes';
                          if (isLimited) return state.pullCount === 0 || state.obtainedCounts[item.name];
                          return state.obtainedCounts[item.name];
                        })
                        .map((item) => {
                        const pct = sixStarOdds.find((o) => o.item?.name === item.name);
                        const isLimited = howToObtainLookup[item.name]?.Limited === 'Yes';
                        return (
                          <FeaturedChip
                            key={item.name}
                            item={item}
                            rarity={6} onSelect={setPreviewedPull}
                            tags={banner.type === 'limited' && isLimited ? ['limited'] : undefined}
                            percent={pct ? pct.weight * 100 : undefined}
                            count={state.obtainedCounts[item.name]}
                          />
                        );
                      })}
                    </div>
                    </>}

                    </div>
                </section>

                <section className="op-section">
                  <div className="gacha-history-head">
                    <button
                      type="button"
                      className="ghost gacha-history-toggle"
                      aria-expanded={showHistory && state.history.length > 0}
                      disabled={state.history.length === 0}
                      onClick={() => setShowHistory((v) => !v)}
                    >
                      {showHistory && state.history.length > 0 ? '▾' : '▸'} Pull history{state.history.length > 0 ? ` (${state.history.length})` : ''}
                    </button>
                    {/* For the reader's own charts: one row per pull, a spreadsheet's columns. */}
                    <button type="button" className="ghost btn-sm" disabled={state.history.length === 0} onClick={exportHistory} title="One row per pull, for a spreadsheet or a chart">
                      Export CSV
                    </button>
                  </div>
                  {showHistory && state.history.length > 0 && (
                    <PullHistory history={state.history} onSelect={setPreviewedPull} />
                  )}
                </section>
                {pullFloor.spacer}
                </div>
                </div>
              </>
            )}
          </div>
        </div>
      </main>

      {showDetails && banner && <BannerDetails banner={banner} dateLabel={bannerDateLabel(selectedBanner)} onClose={() => setShowDetails(false)} onSelect={setPreviewedPull} previewOpen={!!previewedPull} />}
      {previewedPull && <OperatorPreviewModal key={previewedPull.name} item={previewedPull} onClose={closePreview} />}

      {showSparkStore && banner && (
        <div className="modal-overlay" onClick={() => setShowSparkStore(false)}>
          <div className="modal-box gacha-spark-store-modal" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="back-btn" onClick={() => setShowSparkStore(false)}>
              ‹ Back
            </button>
            <h2>Spark Store</h2>
            <p className="hint" style={{ marginBottom: 14 }}>
              Guaranteed at 300 spark for a six-star, 75 for a featured five-star.
            </p>
            <div className="gacha-spark-store-grid">
              {[
                ...banner.sixStarFeatured,
                ...(banner.rateUpSixStars || []),
                ...banner.otherSixStarPool.filter((item) => howToObtainLookup[item.name]?.Limited === 'Yes'),
              ]
                .slice()
                .sort((a, b) => {
                  const dateA = getReleaseDate(a.name, releaseLookup);
                  const dateB = getReleaseDate(b.name, releaseLookup);
                  if (!dateA && !dateB) return 0;
                  if (!dateA) return 1; // no known date -- sort to the end
                  if (!dateB) return -1;
                  return dateB.getTime() - dateA.getTime(); // newest first
                })
                .map((item) => (
                <div key={item.name} className="gacha-spark-store-item">
                  {item.icon ? (
                    <Image src={item.icon} alt={item.name} width={56} height={56} />
                  ) : (
                    <div className="gacha-pull-icon-placeholder">6★</div>
                  )}
                  <span>{item.name}</span>
                  <span className="gacha-spark-store-cost">{getSparkCost(item.name, parseBannerDate(selectedBanner), releaseLookup, operatorSeriesMap[item.name])}</span>
                </div>
              ))}
              {banner.fiveStarFeatured.map((item) => (
                <div key={item.name} className="gacha-spark-store-item">
                  {item.icon ? (
                    <Image src={item.icon} alt={item.name} width={56} height={56} />
                  ) : (
                    <div className="gacha-pull-icon-placeholder">5★</div>
                  )}
                  <span>{item.name}</span>
                  <span className="gacha-spark-store-cost">75</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showGuide && (
        <div
          className="modal-overlay"
          onClick={() => {
            setShowGuide(false);
            setGuidePhase('question');
            setGuidePageIndex(0);
          }}
        >
          <div className="modal-box gacha-guide-modal" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="back-btn"
              onClick={() => {
                setShowGuide(false);
                setGuidePhase('question');
                setGuidePageIndex(0);
              }}
            >
              ‹ Back
            </button>

            {guidePhase === 'question' && (
              <div className="gacha-tutorial-question">
                <p>Do you understand the basics of Arknights banners?</p>
                <div className="gacha-tutorial-question-actions">
                  <button
                    type="button"
                    className="gacha-tutorial-yes-btn"
                    onClick={() => {
                      setGuidePhase('banner');
                      setGuidePageIndex(0);
                    }}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    className="gacha-tutorial-no-btn"
                    onClick={() => {
                      setGuidePhase('basics');
                      setGuidePageIndex(0);
                    }}
                  >
                    No
                  </button>
                </div>
              </div>
            )}

            {guidePhase !== 'question' && (() => {
              const bannerPages = bannerTutorialPages(banner);
              const pages = guidePhase === 'basics' || !bannerPages ? BASICS_PAGES : bannerPages;
              const { Visual } = pages[guidePageIndex];
              const isLastPage = guidePageIndex === pages.length - 1;
              // Continue into the banner's own pages only when it has some.
              const isLastBasicsPage = guidePhase === 'basics' && isLastPage && bannerPages !== null;
              return (
                <div className="gacha-tutorial-page">
                  <div className="gacha-tutorial-visual">
                    <Visual />
                  </div>
                  <p className="gacha-tutorial-text">{pages[guidePageIndex].text}</p>
                  <div className="gacha-tutorial-nav">
                    {/* Previous, not Back: a page of the guide, beside Next. "‹ Back" on the
                        site always leaves where you are (a sheet, a page). */}
                    <button type="button" className="ghost" disabled={guidePageIndex === 0} onClick={() => setGuidePageIndex((s) => s - 1)}>
                      ‹ Previous
                    </button>
                    <span className="gacha-tutorial-progress">
                      {guidePhase === 'basics' ? 'Basics ' : "Banner "}
                      {guidePageIndex + 1} / {pages.length}
                    </span>
                    {isLastBasicsPage ? (
                      <button
                        type="button"
                        className="primary"
                        onClick={() => {
                          setGuidePhase('banner');
                          setGuidePageIndex(0);
                        }}
                      >
                        Continue ›
                      </button>
                    ) : isLastPage ? (
                      <button
                        type="button"
                        className="primary"
                        onClick={() => {
                          setShowGuide(false);
                          setGuidePhase('question');
                          setGuidePageIndex(0);
                        }}
                      >
                        Done
                      </button>
                    ) : (
                      <button type="button" className="primary" onClick={() => setGuidePageIndex((s) => s + 1)}>
                        Next ›
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </>
  );
}

export const getStaticProps: GetStaticProps<Props> = withContentPage<Props>("/gacha", async () => {
  const pools = getGachaIconPools();
  const banners = resolveGachaSimulatorBanners(getBannersSortedByDate());
  const derivedReleaseDates = deriveReleaseDatesFromBanners(banners);
  const operators = getAllOperators();

  const kernelLookup: KernelAdditionLookup = {};
  const releaseLookup: ReleaseDateLookup = {};
  const kernelExclusiveNames: string[] = [];
  const howToObtainLookup: HowToObtainLookup = {};
  for (const op of operators) {
    const kernelDate = op.characterInfo?.['Kernel Addition Date'];
    if (kernelDate) kernelLookup[op.name] = kernelDate;
    // The operator's own recorded Release Date takes priority; when
    // it's missing, fall back to their earliest banner appearance
    // instead of leaving them with no release date on record at all.
    const releaseDate = op.characterInfo?.['Release Date'] || derivedReleaseDates[op.name];
    if (releaseDate) releaseLookup[op.name] = releaseDate;

    const obtain = op.howToObtain;
    if (obtain && typeof obtain === 'object') {
      howToObtainLookup[op.name] = obtain;
      if (obtain['Kernel Headhunting'] === 'Yes' && obtain['Standard Headhunting'] !== 'Yes') {
        kernelExclusiveNames.push(op.name);
      }
    }
  }

  const operatorSeriesMap = buildOperatorSeriesMap(banners, howToObtainLookup);

  // Trimmed for the client -- category and year are
  // confirmed unused both directly in this file and in every helper
  // function from realGachaBanners.ts this page relies on
  // (buildRealBannerConfig, getMechanicType, getDisplayFeaturedSixStars,
  // parseBannerDate/EndDate). Every other field is read by one of those,
  // and lineupSource by the page's own "lineup to be confirmed" note.
  const trimmedBanners: HeadhuntingBanner[] = banners.map((b) => ({
    name: b.name ?? '',
    ...(b.aliases?.length ? { aliases: b.aliases } : {}),
    category: '',
    cn_date: b.cn_date ?? null,
    global_date: b.global_date ?? null,
    global_date_estimated: b.global_date_estimated ?? false,
    ...(b.globalForecastWithdrawn ? { globalForecastWithdrawn: true } : {}),
    ...(b.globalScheduleStatus ? { globalScheduleStatus: b.globalScheduleStatus } : {}),
    ...(b.globalLineupPending ? { globalLineupPending: true } : {}),
    ...(b.schedule_anchor ? { schedule_anchor: b.schedule_anchor } : {}),
    ...(b.global_window ? { global_window: b.global_window } : {}),
    ...(b.cn_window ? { cn_window: b.cn_window } : {}),
    banner_image: b.banner_image ?? null,
    ...(b.lineupSource ? { lineupSource: b.lineupSource } : {}),
    ...(b.announcedLineup ? { announcedLineup: b.announcedLineup } : {}),
    six_stars: b.six_stars ?? [],
    rate_up_six_stars: b.rate_up_six_stars ?? [],
    five_stars: b.five_stars ?? [],
    four_stars: b.four_stars ?? [],
    pull_type: b.pull_type ?? 'unknown',
    year: 0,
    linked_event: b.linked_event ?? null,
  }));

  const fallbackArtwork = buildBannerArtwork(banners, operators, readBannerShopRows());
  return { props: { pools, banners: trimmedBanners, fallbackArtwork, kernelLookup, releaseLookup, kernelExclusiveNames, howToObtainLookup, operatorSeriesMap } };
  // No request-time estimating: the content export runs this against the release's own
  // banners and calendar, so every estimate above arrives with the release. The old
  // hook re-estimated CN-only dates on each request from this deployment's bundled
  // banners and events, which lag the release (411 banners against its 412). The one
  // request-time step is clock-free: the regional table without its provenance links.
}, {
  finalize: async props => withLightRegionalTable(props.fallbackArtwork ? props : {
    ...props,
    // Releases exported before lineup artwork still carry the featured operators.
    fallbackArtwork: buildBannerArtwork(props.banners, getAllOperators(), readBannerShopRows()),
  }),
});
