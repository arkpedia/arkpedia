import { isLineupPending, LINEUP_PENDING_NOTE, RETURNING_LIMITED_NOTE } from '@/lib/gacha/bannerLineup';
import { bannerDisplayName } from '@/lib/gacha/bannerDisplayName';
import { withContentPage } from '@/lib/content/server';
import { GetStaticProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Image, { ContentImg } from '@/components/content/ContentImage';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { getGachaIconPools, GachaIconPools } from '@/lib/gacha/gachaIconPools';
import type { HeadhuntingBanner } from '@/lib/gacha/headhuntingBanners';
import { getBannersSortedByDate } from '@/lib/gacha/headhuntingBannerData';
import { resolveGachaSimulatorBanners } from '@/lib/gacha/gachaBannerWindows';
import { buildRealBannerConfig, getDisplayFeaturedSixStars, getDisplayFeaturedSixStarsWithRerunLabel, getMechanicType, HowToObtainLookup, parseBannerDate } from '@/lib/gacha/realGachaBanners';
import { isBannerLive, upcomingBanners } from '@/lib/gacha/upcomingBanners';
import { useReaderClock } from '@/lib/time/readerClock';
import { buildOperatorSeriesMap, OperatorSeries } from '@/lib/operators/operatorSeries';
import { buildEligiblePool } from '@/lib/gacha/gachaOperatorEligibility';
import { KernelAdditionLookup } from '@/lib/operators/kernelAdditionDates';
import { ReleaseDateLookup, deriveReleaseDatesFromBanners, getReleaseDate } from '@/lib/operators/operatorReleaseDates';
import { getAllOperators } from '@/lib/operators/operators';
import type { GachaOperatorPreview } from '@/lib/gacha/operatorPreviewData';
import { createInitialState, GachaState, BannerConfig, BannerType, PulledItem, GachaItem } from '@/lib/gacha/gachaTypes';
import { doPulls, sixStarWeightedPool, fiveStarWeightedPool, simulatorPullable, BASE_RATES, ratesAtPull } from '@/lib/gacha/gachaEngine';
import { useVirtualRows, type VirtualRowLayout } from '@/components/ui/useVirtualRows';
import StyledSelect from '@/components/ui/StyledSelect';
import PageHeader from '@/components/ui/PageHeader';
import Rarity, { rarityLevel } from '@/components/ui/Rarity';
import { useHeightFloor } from '@/components/ui/useHeightFloor';

interface Props {
  pools: GachaIconPools;
  banners: HeadhuntingBanner[]; // sorted newest-first
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

type DisplayCategory = BannerType | 'other' | 'upcoming';
type PreviewItem = Pick<PulledItem, 'name' | 'icon' | 'rarity'>;

const CATEGORY_LABELS: Record<DisplayCategory, string> = {
  upcoming: 'Upcoming',
  featured: 'Featured',
  limited: 'Limited',
  standard: 'Standard',
  kernel: 'Kernel',
  kernelLocating: 'Kernel Locating',
  joint: 'Joint Operation',
  orienteering: 'Orienteering',
  celebration: 'Celebration',
  crossover: 'Crossover',
  trio: 'The Front That Was',
  other: 'Other (unclassified)',
};
const CATEGORIES: DisplayCategory[] = ['upcoming', 'featured', 'limited', 'standard', 'kernel', 'kernelLocating', 'joint', 'orienteering', 'celebration', 'crossover', 'trio', 'other'];
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

function bannerDateLabel(banner: HeadhuntingBanner): string {
  const prefix = banner.global_date_estimated ? 'Estimated Global · ' : banner.global_date ? '' : 'CN · ';
  return `${prefix}${banner.global_date || banner.cn_date || 'date unknown'}`;
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
    <button type="button" className={`gacha-pull-tile ${rarityClass(item.rarity)} ${className}`} onClick={() => onSelect(item)} aria-label={accessibleName} title={accessibleName}>
      <PullIcon item={item} />
    </button>
  );
}

function PullPreview({ item, onClose }: { item: PreviewItem; onClose: () => void }) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const [details, setDetails] = useState<GachaOperatorPreview | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState(0);
  const [selectedModule, setSelectedModule] = useState(0);
  const [selectedStage, setSelectedStage] = useState(0);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
  }, [onClose]);
  useEffect(() => {
    const controller = new AbortController();
    setDetails(null);
    setLoadError(false);
    fetch(`/api/gacha-operator/${encodeURIComponent(item.name)}`, { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error('Operator details unavailable'); return response.json() as Promise<GachaOperatorPreview>; })
      .then((operator) => {
        setDetails(operator);
        const moduleIndex = operator.modules.findIndex((module) => module.type === 'Upgrade');
        const nextModule = moduleIndex < 0 ? 0 : moduleIndex;
        setSelectedModule(nextModule);
        setSelectedStage(Math.max(0, (operator.modules[nextModule]?.stages.length ?? 1) - 1));
      })
      .catch((error: unknown) => { if (!(error instanceof Error && error.name === 'AbortError')) setLoadError(true); });
    return () => controller.abort();
  }, [item.name]);
  const artFolder = item.rarity === 6 ? 'six' : item.rarity === 5 ? 'five' : item.rarity === 4 ? 'four' : 'three';
  const art = `/${artFolder}-star-skins/${encodeURIComponent(`${item.name} - Base.webp`)}`;
  const selectedModuleData = details?.modules[selectedModule];
  const moduleStage = selectedModuleData?.stages[selectedStage];
  const skill = details?.skills[selectedSkill];
  return (
    <div className="modal-overlay gacha-operator-overlay" onClick={onClose}>
      <div className="modal-box gacha-pull-preview" role="dialog" aria-modal="true" aria-labelledby="gacha-pull-preview-title" onClick={(event) => event.stopPropagation()}>
        <div className="gacha-pull-preview-header">
          <div><span className="gacha-pull-preview-rarity"><Rarity n={rarityLevel(item.rarity)} /> Operator{details?.className ? ` · ${details.className}` : ''}{details?.branch ? ` / ${details.branch}` : ''}</span><h2 id="gacha-pull-preview-title">{item.name}</h2></div>
          <button ref={closeButton} type="button" className="gacha-preview-close" onClick={onClose} aria-label="Close operator preview">×</button>
        </div>
        <div className="gacha-preview-body">
          <div className="gacha-preview-portrait">
            <ContentImg className="gacha-pull-preview-art" src={art} alt={`${item.name} base artwork`} />
            <Link className="gacha-preview-link" href={`/operators/${encodeURIComponent(item.name)}`}>View operator page ↗</Link>
          </div>
          <div className="gacha-preview-data" role="region" aria-label={`${item.name} operator details`} tabIndex={0}>
            {!details && !loadError && <p className="gacha-preview-loading" role="status">Loading operator details…</p>}
            {loadError && <p className="gacha-preview-loading" role="status">Details are unavailable right now. The operator page is still linked beside the artwork.</p>}
            {details?.stats && <section className="gacha-preview-section">
              <h3>Stats <span>E{details.stats.elite} Lv {details.stats.level} · max trust</span></h3>
              <div className="gacha-preview-stats">
                {([
                  ['HP', details.stats.values.hp, details.stats.trust.hp],
                  ['ATK', details.stats.values.atk, details.stats.trust.atk],
                  ['DEF', details.stats.values.def, details.stats.trust.def],
                  ['RES', `${details.stats.values.res}%`, null],
                  ['DP', details.stats.values.dp, null],
                  ['Block', details.stats.values.block, null],
                  ['Interval', `${details.stats.values.interval}s`, null],
                  ['Redeploy', `${details.stats.values.redeploy}s`, null],
                ] as const).map(([label, value, trust]) => (
                  <div key={label} className="gacha-preview-stat"><span>{label}</span><strong>{value}{trust ? <small> +{trust}</small> : null}</strong></div>
                ))}
              </div>
            </section>}
            {details?.trait && <section className="gacha-preview-section"><h3>Trait</h3><p>{details.trait}</p></section>}
            {!!details?.talents.length && <section className="gacha-preview-section">
              <h3>Talents</h3>
              {details.talents.map((talent, index) => <div className="gacha-preview-entry" key={`${talent.name}-${index}`}>
                <div className="gacha-preview-entry-title"><strong>{talent.name}</strong>{talent.stage && <span>{talent.stage}</span>}</div>
                <p>{talent.description}</p>
              </div>)}
            </section>}
            {!!details?.skills.length && <section className="gacha-preview-section gacha-preview-ability-section">
              <h3>Skills</h3>
              <div className="gacha-preview-tabs" role="group" aria-label="Select skill">
                {details.skills.map((entry, index) => <button key={index} type="button" className={index === selectedSkill ? 'active' : ''} aria-pressed={index === selectedSkill} onClick={() => setSelectedSkill(index)}>
                  {entry.icon && <ContentImg src={entry.icon} alt="" width={28} height={28} />}
                  <span>S{index + 1}</span>
                </button>)}
              </div>
              {skill && <div className="gacha-preview-entry">
                <div className="gacha-preview-entry-title"><strong>{skill.name}</strong><span>{skill.rank}</span></div>
                <div className="gacha-preview-skill-facts">
                  {skill.recovery && <span className={`gacha-preview-skill-fact${/^auto/i.test(skill.recovery) ? ' auto' : /^(?:offensive|defensive)/i.test(skill.recovery) ? ' amber' : ''}`}>{skill.recovery}</span>}
                  {skill.activation && <span className={`gacha-preview-skill-fact${/^auto/i.test(skill.activation) ? ' auto' : /^manual/i.test(skill.activation) ? ' amber' : ''}`}>{skill.activation}</span>}
                  {skill.spCost !== null && <span className="gacha-preview-skill-fact sp">{skill.initialSp ?? 0}/{skill.spCost} SP</span>}
                  {skill.duration !== null && <span className="gacha-preview-skill-fact">{typeof skill.duration === 'number' || /^\d+(?:\.\d+)?$/.test(String(skill.duration)) ? `${skill.duration}s` : skill.duration}</span>}
                </div>
                <p>{skill.description || 'No skill description is available yet.'}</p>
              </div>}
            </section>}
            {!!details?.modules.length && <section className="gacha-preview-section gacha-preview-ability-section">
              <h3>Modules</h3>
              <div className="gacha-preview-tabs gacha-preview-module-tabs" role="group" aria-label="Select module">
                {details.modules.map((entry, index) => <button key={index} type="button" className={index === selectedModule ? 'active' : ''} aria-pressed={index === selectedModule} onClick={() => { setSelectedModule(index); setSelectedStage(Math.max(0, entry.stages.length - 1)); }}>{entry.name}</button>)}
              </div>
              {selectedModuleData?.stages.length ? <>
                <div className="gacha-preview-tabs" role="group" aria-label="Select module stage">
                  {selectedModuleData.stages.map((entry, index) => <button key={index} type="button" className={index === selectedStage ? 'active' : ''} aria-pressed={index === selectedStage} onClick={() => setSelectedStage(index)}>{entry.stage}</button>)}
                </div>
                {moduleStage && <div className="gacha-preview-entry">
                  {moduleStage.attributes && <div className="gacha-preview-meta">{moduleStage.attributes}</div>}
                  {moduleStage.label && <strong>{moduleStage.label}</strong>}
                  {moduleStage.effect && <p>{moduleStage.effect}</p>}
                </div>}
              </> : <p>Original trait; no module upgrades.</p>}
            </section>}
            {!!details?.baseSkills?.length && <section className="gacha-preview-section gacha-preview-ability-section">
              <h3>Base Skills</h3>
              <div className="gacha-preview-base-skills">
                {details.baseSkills.map((baseSkill, index) => <div className="gacha-preview-base-skill" key={`${baseSkill.name}-${index}`}>
                  {baseSkill.icon && <ContentImg src={baseSkill.icon} alt="" width={36} height={36} />}
                  <div>
                    <strong>{baseSkill.name}</strong>
                    {(baseSkill.facility || baseSkill.unlock) && <div className="gacha-preview-meta">{[baseSkill.facility, baseSkill.unlock].filter(Boolean).join(' · ')}</div>}
                    <p>{baseSkill.description}</p>
                  </div>
                </div>)}
              </div>
            </section>}
          </div>
        </div>
      </div>
    </div>
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
    <button type="button" className={`gacha-featured-chip gacha-featured-chip-${rarity}`} onClick={() => onSelect({ ...item, rarity })} aria-label={`View ${item.name} operator details`}>
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
        <button ref={closeButton} type="button" className="gacha-preview-close" onClick={onClose} aria-label="Close banner details">×</button>
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

// Draws `count` star icons in a row -- used throughout the FAQ modal
// so "6★" reads as six drawn stars rather than a number-plus-glyph.
function Stars({ count }: { count: number }) {
  return (
    <span className="gacha-stars-icons" aria-label={`${count} star`} role="img">
      {Array.from({ length: count }).map((_, i) => (
        <svg key={i} viewBox="0 0 20 20" width="13" height="13" fill="currentColor" aria-hidden="true">
          <path d="M10 1 L12.7 7.6 L19.8 8.3 L14.4 13 L16 20 L10 16.3 L4 20 L5.6 13 L0.2 8.3 L7.3 7.6 Z" />
        </svg>
      ))}
    </span>
  );
}

function TutorialRarityRow({ items }: { items: { n: number; content: JSX.Element }[] }) {
  return (
    <div className="gacha-tutorial-rarity-row">
      {items.map((item) => (
        <div key={item.n} className="gacha-tutorial-rarity-col">
          <Stars count={item.n} />
          {item.content}
        </div>
      ))}
    </div>
  );
}

function BasicsPageRarities() {
  return (
    <TutorialRarityRow
      items={[
        { n: 6, content: <span className="gacha-tutorial-pct">2%</span> },
        { n: 5, content: <span className="gacha-tutorial-pct">8%</span> },
        { n: 4, content: <span className="gacha-tutorial-pct">50%</span> },
        { n: 3, content: <span className="gacha-tutorial-pct">40%</span> },
      ]}
    />
  );
}

function BasicsPageFeaturedSplits() {
  const splits: Record<number, number[][]> = {
    6: [[50, 50], [35, 35, 30], [25, 25, 25, 25]],
    5: [[50, 50], [25, 25, 50], [16.7, 16.7, 16.7, 50]],
    4: [[50, 50]],
  };
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => s + 1), 2200);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="gacha-tutorial-splits">
      <div className="gacha-tutorial-splits-row">
        {[6, 5, 4].map((n) => {
          const variants = splits[n];
          const row = variants[step % variants.length];
          return (
            <div key={n} className="gacha-tutorial-rarity-col">
              <Stars count={n} />
              <div className="gacha-tutorial-split-row">
                {row.map((v, i) => (
                  <span key={i} className={`gacha-tutorial-split-chip${i === row.length - 1 ? ' off-banner' : ''}`}>
                    {v}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <p className="gacha-tutorial-footnote">Highlighted numbers are the featured operator(s)&apos; share; the last number is the off-banner share.</p>
    </div>
  );
}

function BasicsPageRampUp() {
  const [pull, setPull] = useState(48);
  useEffect(() => {
    const id = setInterval(() => setPull((p) => (p >= 65 ? 48 : p + 1)), 1100);
    return () => clearInterval(id);
  }, []);
  const rates = ratesAtPull(pull);
  const isRamping = pull > 50;
  return (
    <div className="gacha-tutorial-ramp">
      <div className={`gacha-tutorial-ramp-pull${isRamping ? ' ramping' : ''}`}>
        Pull #{pull}
        {isRamping && ' (soft pity)'}
      </div>
      <TutorialRarityRow
        items={[
          { n: 6, content: <span className="gacha-tutorial-pct">{(rates.six * 100).toFixed(isRamping ? 2 : 0)}%</span> },
          { n: 5, content: <span className="gacha-tutorial-pct">{(rates.five * 100).toFixed(isRamping ? 2 : 0)}%</span> },
          { n: 4, content: <span className="gacha-tutorial-pct">{(rates.four * 100).toFixed(isRamping ? 2 : 0)}%</span> },
          { n: 3, content: <span className="gacha-tutorial-pct">{(rates.three * 100).toFixed(isRamping ? 2 : 0)}%</span> },
        ]}
      />
    </div>
  );
}

// Two scenarios -- a low and a high starting pull count -- each doing
// the same build-up -> reset-to-0 -> count-up -> fade-out cycle, so
// it's clear the reset happens no matter how high the counter climbed
// first, not just for small numbers.
const RESET_SEQUENCES: { label: string; values: number[] }[] = [
  { label: 'Low pull count', values: [4, 5, 6, 7, 0, 1, 2, 3] },
  { label: 'High pull count', values: [45, 46, 47, 48, 0, 1, 2, 3] },
];
const RESET_HOLD_STEPS = 2; // extra steps to hold the fade-out before switching scenario

function BasicsPageReset() {
  const cycleLength = RESET_SEQUENCES[0].values.length + RESET_HOLD_STEPS;
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s + 1) % (cycleLength * RESET_SEQUENCES.length)), 550);
    return () => clearInterval(id);
  }, []);
  const scenarioIndex = Math.floor(step / cycleLength) % RESET_SEQUENCES.length;
  const localStep = step % cycleLength;
  const seq = RESET_SEQUENCES[scenarioIndex];
  const inSequence = localStep < seq.values.length;
  const isFading = !inSequence;
  const isResetMoment = localStep === 4;
  const count = inSequence ? seq.values[localStep] : seq.values[seq.values.length - 1];
  return (
    <div className={`gacha-tutorial-reset${isResetMoment ? ' hit' : ''}${isFading ? ' fading' : ''}`}>
      <span className="gacha-tutorial-reset-sublabel">{seq.label}</span>
      {isResetMoment ? (
        <>
          <Stars count={6} />
          <span className="gacha-tutorial-reset-label">Obtained! Resets.</span>
        </>
      ) : (
        <span className="gacha-tutorial-reset-label">Pulls since last 6★: {count}</span>
      )}
    </div>
  );
}

// Measures the actual horizontal center of each of `count` box
// elements relative to their shared container, so a floating chip can
// be positioned exactly above whichever box it's "at" -- guessing a
// fixed percentage (e.g. 25%/75%) breaks as soon as the row isn't
// perfectly symmetric, which it usually isn't once separators like
// "‹ shared ›" (much wider than "✕") are in the mix.
function useBoxCenters(count: number) {
  const containerRef = useRef<HTMLDivElement>(null);
  const boxRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [centers, setCenters] = useState<number[] | null>(null);
  useLayoutEffect(() => {
    function measure() {
      const container = containerRef.current;
      if (!container) return;
      const containerRect = container.getBoundingClientRect();
      setCenters(
        boxRefs.current.map((el) => {
          if (!el) return 0;
          const rect = el.getBoundingClientRect();
          return rect.left - containerRect.left + rect.width / 2;
        })
      );
    }
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [count]);
  const setBoxRef = (i: number) => (el: HTMLDivElement | null) => {
    boxRefs.current[i] = el;
  };
  return { containerRef, setBoxRef, centers };
}

// Slide 0 of BasicsPageCarryover (and reused by Kernel/Standard/
// Orienteering/Joint's own carryover pages) -- concrete pity-counter
// demo showing carryover actually succeeding (counter keeps climbing
// and lands a 6★), the mirror image of the isolated-pity flow's
// rejection. Pass fromLabel/toLabel directly for a genuine
// cross-category link (e.g. Standard -> Orienteering); repeatLabel is
// a shorthand for the same-category case (e.g. Featured -> Next
// Featured).
function CarryoverPityDemo({ repeatLabel, fromLabel, toLabel }: { repeatLabel?: string; fromLabel?: string; toLabel?: string }) {
  const left = fromLabel ?? repeatLabel ?? 'Featured';
  const right = toLabel ?? `Next ${repeatLabel ?? 'Featured'}`;
  const frames = [
    { pos: 0, value: 48, obtained: false },
    { pos: 0, value: 48, obtained: false },
    { pos: 1, value: 48, obtained: false },
    { pos: 1, value: 50, obtained: false },
    { pos: 1, value: 53, obtained: false },
    { pos: 1, value: 53, obtained: true },
    { pos: 1, value: 53, obtained: true },
  ];
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s + 1) % frames.length), 1200);
    return () => clearInterval(id);
  }, []);
  const frame = frames[step];
  const { containerRef, setBoxRef, centers } = useBoxCenters(2);
  return (
    <div className="gacha-tutorial-pity-flow" ref={containerRef}>
      <div className={`gacha-tutorial-pity-chip${frame.obtained ? ' obtained' : ''}`} style={{ left: centers ? centers[frame.pos] : 0, opacity: centers ? 1 : 0 }}>
        {frame.obtained ? 'Obtained 6★!' : `Pity: ${frame.value}`}
      </div>
      <div className="gacha-tutorial-pity-flow-row two">
        <div ref={setBoxRef(0)} className="gacha-tutorial-pity-flow-box linked">
          {left}
        </div>
        <span className="gacha-tutorial-carryover-link">‹ shared ›</span>
        <div ref={setBoxRef(1)} className="gacha-tutorial-pity-flow-box linked">
          {right}
        </div>
      </div>
    </div>
  );
}

// Slide 1 of TwoSlideCarryoverDemo -- a chip that bounces from the
// first banner type to the second and back once, showing pity is
// genuinely shared both ways rather than a one-time transfer, then
// holds in place for the rest of this slide's display time. Remounts
// fresh (and so re-plays) each time TwoSlideCarryoverDemo cycles back
// to this slide.
const CARRYOVER_BOUNCE_POSITIONS = [0, 1, 0];

function CarryoverBouncingPair({ pairLeft, pairRight }: { pairLeft: string; pairRight: string }) {
  const { containerRef, setBoxRef, centers } = useBoxCenters(2);
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (step >= CARRYOVER_BOUNCE_POSITIONS.length - 1) return;
    const id = setTimeout(() => setStep((s) => s + 1), 900);
    return () => clearTimeout(id);
  }, [step]);
  const pos = CARRYOVER_BOUNCE_POSITIONS[step];
  return (
    <div className="gacha-tutorial-pity-flow" ref={containerRef}>
      <div className="gacha-tutorial-pity-chip obtained" style={{ left: centers ? centers[pos] : 0, opacity: centers ? 1 : 0 }}>
        Pity
      </div>
      <div className="gacha-tutorial-pity-flow-row two">
        <div ref={setBoxRef(0)} className="gacha-tutorial-pity-flow-box linked">
          {pairLeft}
        </div>
        <span className="gacha-tutorial-carryover-link">‹ shared ›</span>
        <div ref={setBoxRef(1)} className="gacha-tutorial-pity-flow-box linked">
          {pairRight}
        </div>
      </div>
    </div>
  );
}

// A simpler 2-slide version of the carryover demo (pity demo, then a
// bouncing chip over the static shared pair) for banner types that
// don't need a third "isolated" slide -- currently Kernel, Standard,
// Orienteering, and Joint Operation. demoFromLabel/demoToLabel let the
// pity-demo slide show a genuine cross-category link (e.g. Standard ->
// Orienteering) instead of the same-category repeatLabel shorthand.
function TwoSlideCarryoverDemo({
  repeatLabel,
  pairLeft,
  pairRight,
  demoFromLabel,
  demoToLabel,
}: {
  repeatLabel?: string;
  pairLeft: string;
  pairRight: string;
  demoFromLabel?: string;
  demoToLabel?: string;
}) {
  const [slide, setSlide] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSlide((s) => (s + 1) % 2), 5700);
    return () => clearInterval(id);
  }, []);
  if (slide === 1) {
    return <CarryoverBouncingPair pairLeft={pairLeft} pairRight={pairRight} />;
  }
  return <CarryoverPityDemo repeatLabel={repeatLabel} fromLabel={demoFromLabel} toLabel={demoToLabel} />;
}

function BasicsPageCarryover() {
  const [slide, setSlide] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSlide((s) => (s + 1) % 3), 5700);
    return () => clearInterval(id);
  }, []);

  if (slide === 1) {
    return (
      <div className="gacha-tutorial-carryover">
        <div className="gacha-tutorial-carryover-shared-label">Share pity together:</div>
        <div className="gacha-tutorial-carryover-isolated-row">
          {['Featured', 'Standard', 'Joint Operation', 'Orienteering'].map((name) => (
            <div key={name} className="gacha-tutorial-carryover-box shared">
              {name}
            </div>
          ))}
        </div>
        <div className="gacha-tutorial-carryover-pair">
          <div className="gacha-tutorial-carryover-box">Kernel</div>
          <span className="gacha-tutorial-carryover-link">‹ shared ›</span>
          <div className="gacha-tutorial-carryover-box">Kernel Locating</div>
        </div>
      </div>
    );
  }
  if (slide === 2) {
    return (
      <div className="gacha-tutorial-carryover">
        <div className="gacha-tutorial-carryover-isolated-label">No carryover between or within these:</div>
        <div className="gacha-tutorial-carryover-isolated-row">
          {['Limited', 'Crossover', 'Celebration'].map((name) => (
            <div key={name} className="gacha-tutorial-carryover-box isolated">
              {name}
            </div>
          ))}
        </div>
      </div>
    );
  }
  return <CarryoverPityDemo />;
}

// A single mini pull-result card, reusing the real simulator's own
// slide-in-and-glow animation classes so this preview actually looks
// like a Pull x10 reveal -- just with a rarity label instead of an
// operator portrait, and no reliance on any specific operator's icon.
function TutorialPullCard({ rarity, index }: { rarity: 5 | 6 | 4 | 3; index: number }) {
  const slideDirection = index % 2 === 0 ? 'gacha-pull-slide-bottom' : 'gacha-pull-slide-top';
  const isHighlight = rarity === 5 || rarity === 6;
  return (
    <div key={index} className={`gacha-tutorial-pull-card${isHighlight ? ' highlight' : ''} ${slideDirection}`}>
      {isHighlight ? (
        <>
          <Stars count={1} />
          <span className="gacha-tutorial-pull-card-label">{rarity}★</span>
        </>
      ) : (
        <span className="gacha-tutorial-pull-card-label dim">{rarity}★</span>
      )}
    </div>
  );
}

// Four illustrative Pull x10 outcomes, all satisfying "at least one
// 5★-or-higher in the first 10" in different ways -- cycles through
// them on a loop, replaying the slide-in reveal each time.
const FIRST_TEN_SCENARIOS: (5 | 6 | 4 | 3)[][] = [
  [3, 4, 3, 4, 5, 4, 3, 4, 3, 4],
  [4, 5, 3, 4, 5, 3, 4, 5, 4, 3],
  [3, 4, 3, 3, 4, 6, 4, 3, 4, 3],
  [4, 3, 5, 4, 3, 4, 6, 3, 4, 3],
];

function BasicsPageFirstTen() {
  const [scenario, setScenario] = useState(0);
  useEffect(() => {
    // Changing every card's key at once is enough to force React to
    // unmount and remount all 10 in the same render, replaying the
    // slide-in animation together -- no need to briefly empty the grid
    // first, which was causing it to collapse and re-center each cycle.
    const id = setInterval(() => setScenario((s) => (s + 1) % FIRST_TEN_SCENARIOS.length), 2200);
    return () => clearInterval(id);
  }, []);
  const results = FIRST_TEN_SCENARIOS[scenario];
  return (
    <div className="gacha-tutorial-first-ten">
      <div className="gacha-tutorial-first-ten-title">First 10 Pulls</div>
      <div className="gacha-tutorial-pull-grid">
        {results.map((rarity, i) => <TutorialPullCard key={`${scenario}-${i}`} rarity={rarity} index={i} />)}
      </div>
    </div>
  );
}

function BasicsPageSixStarGuarantee() {
  return (
    <div className="gacha-tutorial-guarantee-examples">
      <span className="gacha-tutorial-guarantee-chip">Featured: 150-pull protection</span>
      <span className="gacha-tutorial-guarantee-chip">Limited: 300-pull free copy</span>
      <span className="gacha-tutorial-guarantee-chip">Crossover: 120-pull guarantee</span>
    </div>
  );
}

// Fixed closing celebration image -- next/image handles caching and
// optimization automatically (same as every other image on this page),
// and `priority` gets it preloaded rather than lazily loaded since
// it's the very last thing shown in the guide.
const BASICS_DONE_IMAGE = "/six-star-skins/Wiš'adel - I am Wiš'adel.webp";

function BasicsPageDone() {
  return (
    <div className="gacha-tutorial-done-row">
      <Image src={BASICS_DONE_IMAGE} alt="Wiš'adel" width={120} height={120} className="gacha-tutorial-done-image" priority />
      <span className="gacha-tutorial-done-thumb">👍</span>
    </div>
  );
}

const BASICS_PAGES: { Visual: () => JSX.Element; text: string }[] = [
  { Visual: BasicsPageRarities, text: 'The chance of obtaining each rarity in Arknights is the same for all banners.' },
  { Visual: BasicsPageFeaturedSplits, text: 'Depending on the type of banner, the chance of the featured six stars, five stars and four stars can be different.' },
  {
    Visual: BasicsPageRampUp,
    text: 'When you do not pull for a six star within 50 pulls, every pull after increases the chance of getting a six star by 2%. The chance of the other rarities decrease proportionately.',
  },
  { Visual: BasicsPageReset, text: 'The counter gets reset whenever you have obtained a six star.' },
  {
    Visual: BasicsPageCarryover,
    text: "This 'pity' counter can get carried over on certain banners: featured, standard, joint operation, and orienteering all share pity together, while kernel and kernel locating share pity separately from that group. Every other banner type is isolated. Please check on the specific banner tutorials to understand this better.",
  },
  { Visual: BasicsPageFirstTen, text: 'Every banner guarantees at least 1 five star or higher rarity in the first 10 pulls.' },
  {
    Visual: BasicsPageSixStarGuarantee,
    text: 'Certain banners have guarantee systems for six stars. Please check on the specific banner tutorials to understand this better.',
  },
  { Visual: BasicsPageDone, text: "That's all the basics that every banner of this game have!" },
];

// Same six-star roster used by Celebration's tutorial, reused here so
// Orienteering has real referenceable operators too instead of Greek
// letters standing in for nothing in particular.
const SIX_STAR_SHOWCASE_OPERATORS = ['Bagpipe', 'Aak', 'Nightingale', 'Passenger', 'Saria', 'Surtr'];
const ORIENTEERING_FIVE_OPERATORS = ['Blue Poison', 'Lappland', 'Specter', 'Platinum', 'Mayer', 'Glaucus'];
const ORIENTEERING_SIX_PICKED = [0, 2, 4];
const ORIENTEERING_FIVE_PICKED = [1, 3, 5];

function sixStarIconPath(name: string): string {
  return `/six-star-icons/${name} - Base.webp`;
}
function fiveStarIconPath(name: string): string {
  return `/five-star-icons/${name} - Base.webp`;
}

function OrienteeringPageSixSelection() {
  const totalSteps = 4; // 3 reveals + 1 hold, then loop
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s >= totalSteps ? 0 : s + 1)), 650);
    return () => clearInterval(id);
  }, []);
  const revealed = Math.min(step, 3);
  const showResult = step >= 3;
  return (
    <div className="gacha-tutorial-orienteering-row">
      {SIX_STAR_SHOWCASE_OPERATORS.map((name, i) => {
        const order = ORIENTEERING_SIX_PICKED.indexOf(i);
        const picked = order !== -1 && order < revealed;
        return (
          <div key={i} className={`gacha-tutorial-pick-slot${picked ? ' picked' : ''}`}>
            <Image src={sixStarIconPath(name)} alt={name} width={36} height={36} className="gacha-tutorial-pick-icon" />
            <span className="gacha-tutorial-pick-label small">{name}</span>
            {showResult && picked && <span className="gacha-tutorial-pick-pct">33.3%</span>}
          </div>
        );
      })}
    </div>
  );
}

// Unlike six-stars, the 3 NOT chosen still stay pullable here -- just
// at reduced weight -- so this animates two distinct reveal groups:
// the 3 chosen (60% shared, "picked") and the 3 remaining (40% shared,
// "included" -- a lighter highlight showing they're still live, just
// not preferred).
function OrienteeringPageFiveSelection() {
  const totalSteps = 7; // 3 chosen reveals + 3 remaining reveals + 1 hold, then loop
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s >= totalSteps ? 0 : s + 1)), 650);
    return () => clearInterval(id);
  }, []);
  const chosenRevealed = Math.min(step, 3);
  const remainingRevealed = Math.max(0, Math.min(step - 3, 3));
  const showResult = step >= 6;
  const remainingIndices = ORIENTEERING_FIVE_OPERATORS.map((_, i) => i).filter((i) => !ORIENTEERING_FIVE_PICKED.includes(i));
  return (
    <div className="gacha-tutorial-orienteering-row">
      {ORIENTEERING_FIVE_OPERATORS.map((name, i) => {
        const isChosen = ORIENTEERING_FIVE_PICKED.includes(i);
        const chosenOrder = ORIENTEERING_FIVE_PICKED.indexOf(i);
        const chosenShown = isChosen && chosenOrder < chosenRevealed;
        const remainingOrder = remainingIndices.indexOf(i);
        const remainingShown = !isChosen && remainingOrder !== -1 && remainingOrder < remainingRevealed;
        return (
          <div key={i} className={`gacha-tutorial-pick-slot${chosenShown ? ' picked' : remainingShown ? ' included' : ''}`}>
            <Image src={fiveStarIconPath(name)} alt={name} width={36} height={36} className="gacha-tutorial-pick-icon" />
            <span className="gacha-tutorial-pick-label small">{name}</span>
            {showResult && chosenShown && <span className="gacha-tutorial-pick-pct">20%</span>}
            {showResult && remainingShown && <span className="gacha-tutorial-pick-pct dim">13.3%</span>}
          </div>
        );
      })}
    </div>
  );
}

const ORIENTEERING_PAGES: { Visual: () => JSX.Element; text: string }[] = [
  {
    Visual: OrienteeringPageSixSelection,
    text: 'Choose 3 out of 6 six stars. They are the only ones pullable on the banner.',
  },
  {
    Visual: OrienteeringPageFiveSelection,
    text: 'Choose 3 out of 6 five stars as well. They take up 60% chance shared equally. The remaining 3 five stars are also pullable, sharing 40%.',
  },
  {
    Visual: () => <TwoSlideCarryoverDemo pairLeft="Standard" pairRight="Orienteering" demoFromLabel="Standard" demoToLabel="Orienteering" />,
    text: '6-star pity ramp up is shared with Featured and Standard banners -- it carries over between them, not isolated to this banner alone.',
  },
];

// A left-facing shopping trolley -- marks which of the selected
// six-star/five-star picks the player chose to make shop-buyable.
function TrolleyIcon() {
  return (
    <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" className="gacha-tutorial-trolley-icon" style={{ transform: 'scaleX(-1)' }}>
      <path d="M2 3h2l1.5 9h9L17 6H6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="8" cy="16" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="14" cy="16" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

// Kernel Locating shows the same 6 showcase operators per rarity as
// Orienteering, plus a "+6" marker since there are actually 12
// candidates of each rarity -- drawing all 12 would be excessive for
// an illustrative example. One picked six-star and one picked
// five-star show the trolley icon, marking them as the ones chosen to
// also be shop-buyable.
function KernelLocatingPageSelection() {
  const totalSteps = 7;
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s >= totalSteps ? 0 : s + 1)), 650);
    return () => clearInterval(id);
  }, []);
  const sixRevealed = Math.min(step, 3);
  const fiveRevealed = Math.max(0, Math.min(step - 3, 3));
  return (
    <div className="gacha-tutorial-orienteering">
      <div className="gacha-tutorial-orienteering-row">
        {SIX_STAR_SHOWCASE_OPERATORS.map((name, i) => {
          const order = ORIENTEERING_SIX_PICKED.indexOf(i);
          const picked = order !== -1 && order < sixRevealed;
          const isShopPick = order === 0 && picked;
          return (
            <div key={i} className={`gacha-tutorial-pick-slot${picked ? ' picked' : ''}`}>
              <Image src={sixStarIconPath(name)} alt={name} width={36} height={36} className="gacha-tutorial-pick-icon" />
              <span className="gacha-tutorial-pick-label small">{name}</span>
              {isShopPick && <TrolleyIcon />}
            </div>
          );
        })}
        <div className="gacha-tutorial-pick-slot more">
          <span className="gacha-tutorial-pick-more">+6</span>
        </div>
      </div>
      <div className="gacha-tutorial-orienteering-row">
        {ORIENTEERING_FIVE_OPERATORS.map((name, i) => {
          const order = ORIENTEERING_FIVE_PICKED.indexOf(i);
          const picked = order !== -1 && order < fiveRevealed;
          const isShopPick = order === 0 && picked;
          return (
            <div key={i} className={`gacha-tutorial-pick-slot${picked ? ' picked' : ''}`}>
              <Image src={fiveStarIconPath(name)} alt={name} width={36} height={36} className="gacha-tutorial-pick-icon" />
              <span className="gacha-tutorial-pick-label small">{name}</span>
              {isShopPick && <TrolleyIcon />}
            </div>
          );
        })}
        <div className="gacha-tutorial-pick-slot more">
          <span className="gacha-tutorial-pick-more">+6</span>
        </div>
      </div>
    </div>
  );
}

const KERNEL_LOCATING_PAGES: { Visual: () => JSX.Element; text: string }[] = [
  {
    Visual: KernelLocatingPageSelection,
    text: 'Choose 2 out of 12 six stars and 3 out of 12 five stars. You may choose which 6 stars and 5 stars are buyable in shop for 180 and 45 gold certs respectively.',
  },
  {
    Visual: KernelPageSplit,
    text: 'The 2 selected six stars share a 50% chance, and the 3 five stars also share their own 50% chance. The remainder of 6 stars and 5 stars remain in the off banner pool.',
  },
  { Visual: KernelPageAdvisory, text: 'It is not advisable to spend your pull resources on this banner, instead use your gold certificates to buy units that you would like.' },
  { Visual: KernelPageCarryover, text: '6-star pity ramp up can be inherited from a previous kernel locating or kernel banner or passed into future similar banners.' },
];

function JointPageFeatured() {
  const sixOps = SIX_STAR_SHOWCASE_OPERATORS.slice(0, 4);
  const fiveOps = ORIENTEERING_FIVE_OPERATORS;
  return (
    <div className="gacha-tutorial-orienteering">
      <div className="gacha-tutorial-orienteering-row">
        {sixOps.map((name) => (
          <div key={name} className="gacha-tutorial-pick-slot picked">
            <Image src={sixStarIconPath(name)} alt={name} width={36} height={36} className="gacha-tutorial-pick-icon" />
            <span className="gacha-tutorial-pick-label small">{name}</span>
            <span className="gacha-tutorial-pick-pct">25%</span>
          </div>
        ))}
      </div>
      <div className="gacha-tutorial-orienteering-row">
        {fiveOps.map((name) => (
          <div key={name} className="gacha-tutorial-pick-slot picked">
            <Image src={fiveStarIconPath(name)} alt={name} width={36} height={36} className="gacha-tutorial-pick-icon" />
            <span className="gacha-tutorial-pick-label small">{name}</span>
            <span className="gacha-tutorial-pick-pct">16.7%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const JOINT_PAGES: { Visual: () => JSX.Element; text: string }[] = [
  {
    Visual: JointPageFeatured,
    text: 'There are four featured six stars and 6 featured five stars, they will be the only ones pullable on the banner.',
  },
  {
    Visual: () => <TwoSlideCarryoverDemo pairLeft="Standard" pairRight="Joint Operation" demoFromLabel="Standard" demoToLabel="Joint Operation" />,
    text: '6-star pity ramp up is shared with Featured and Standard banners -- it carries over between them, not isolated to this banner alone.',
  },
];

const CELEBRATION_INITIALLY_OWNED = [0, 3];

function CelebrationPagePool() {
  return (
    <div className="gacha-tutorial-orienteering-row">
      {SIX_STAR_SHOWCASE_OPERATORS.map((name, i) => {
        const owned = CELEBRATION_INITIALLY_OWNED.includes(i);
        return (
          <div key={i} className={`gacha-tutorial-pick-slot${owned ? ' owned' : ' picked'}`}>
            <Image src={sixStarIconPath(name)} alt={name} width={36} height={36} className="gacha-tutorial-pick-icon" />
            <span className="gacha-tutorial-pick-label small">{name}</span>
            <span className="gacha-tutorial-pick-status">{owned ? 'Owned' : 'Available'}</span>
          </div>
        );
      })}
    </div>
  );
}

function CelebrationPageBlowOpen() {
  const [phase, setPhase] = useState(0); // 0 = before, 1 = obtaining, 2 = after
  useEffect(() => {
    const id = setInterval(() => setPhase((p) => (p + 1) % 3), 2300);
    return () => clearInterval(id);
  }, []);
  const justObtained = 2;
  return (
    <div className="gacha-tutorial-celebration-pool">
      <div className="gacha-tutorial-orienteering-row">
        {SIX_STAR_SHOWCASE_OPERATORS.map((name, i) => {
          let cls = 'picked';
          let status = 'Available';
          if (phase === 0) {
            if (CELEBRATION_INITIALLY_OWNED.includes(i)) {
              cls = 'owned';
              status = 'Owned';
            }
          } else if (phase === 1) {
            if (i === justObtained) {
              cls = 'just-obtained';
              status = 'Obtained!';
            } else if (CELEBRATION_INITIALLY_OWNED.includes(i)) {
              cls = 'owned';
              status = 'Owned';
            }
          }
          // phase 2 ("after"): every slot -- including the one just
          // obtained -- goes back to Available. Nothing stays excluded,
          // which is exactly why pulling further risks a duplicate.
          return (
            <div key={i} className={`gacha-tutorial-pick-slot ${cls}`}>
              <Image src={sixStarIconPath(name)} alt={name} width={36} height={36} className="gacha-tutorial-pick-icon" />
              <span className="gacha-tutorial-pick-label small">{name}</span>
              <span className="gacha-tutorial-pick-status">{status}</span>
            </div>
          );
        })}
      </div>
      <p className="gacha-tutorial-footnote">
        {phase === 0 ? 'Before: some already owned.' : phase === 1 ? 'You pull and obtain a new six star!' : 'After: pool fully reopens -- even the one you just got.'}
      </p>
    </div>
  );
}

function IsolatedPityFlowDemo({ label }: { label: string }) {
  // Two independent chips: "a" is the original 30-pity counter that
  // gets rejected and settles back at Previous Banner for good --
  // never moving again -- while "b" is a brand new counter that fades
  // in fresh at the current banner afterward and does the rest of the
  // journey on its own. Using one chip for both halves made it look
  // like the same counter was physically traveling back and forth.
  const steps: {
    a: { pos: number; value: number; shake: boolean };
    b: { pos: number; value: number; shake: boolean; visible: boolean; fizzling: boolean };
  }[] = [
    { a: { pos: 0, value: 30, shake: false }, b: { pos: 1, value: 0, shake: false, visible: false, fizzling: false } },
    { a: { pos: 0, value: 30, shake: false }, b: { pos: 1, value: 0, shake: false, visible: false, fizzling: false } },
    { a: { pos: 1, value: 30, shake: false }, b: { pos: 1, value: 0, shake: false, visible: false, fizzling: false } },
    { a: { pos: 1, value: 30, shake: true }, b: { pos: 1, value: 0, shake: false, visible: false, fizzling: false } },
    { a: { pos: 0, value: 30, shake: false }, b: { pos: 1, value: 0, shake: false, visible: false, fizzling: false } },
    { a: { pos: 0, value: 30, shake: false }, b: { pos: 1, value: 0, shake: false, visible: true, fizzling: false } },
    { a: { pos: 0, value: 30, shake: false }, b: { pos: 1, value: 3, shake: false, visible: true, fizzling: false } },
    { a: { pos: 0, value: 30, shake: false }, b: { pos: 1, value: 5, shake: false, visible: true, fizzling: false } },
    { a: { pos: 0, value: 30, shake: false }, b: { pos: 1, value: 8, shake: false, visible: true, fizzling: false } },
    { a: { pos: 0, value: 30, shake: false }, b: { pos: 2, value: 8, shake: false, visible: true, fizzling: false } },
    { a: { pos: 0, value: 30, shake: false }, b: { pos: 2, value: 8, shake: true, visible: true, fizzling: false } },
    { a: { pos: 0, value: 30, shake: false }, b: { pos: 2, value: 8, shake: false, visible: true, fizzling: true } },
    { a: { pos: 0, value: 30, shake: false }, b: { pos: 2, value: 8, shake: false, visible: false, fizzling: false } },
  ];
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s + 1) % steps.length), 1200);
    return () => clearInterval(id);
  }, []);
  const frame = steps[step];
  const { containerRef, setBoxRef, centers } = useBoxCenters(3);
  return (
    <div className="gacha-tutorial-pity-flow" ref={containerRef}>
      <div className={`gacha-tutorial-pity-chip${frame.a.shake ? ' shake' : ''}`} style={{ left: centers ? centers[frame.a.pos] : 0, opacity: centers ? 1 : 0 }}>
        Pity: {frame.a.value}
      </div>
      <div
        className={`gacha-tutorial-pity-chip${frame.b.shake ? ' shake' : ''}${frame.b.fizzling ? ' fizzling' : ''}`}
        style={{ left: centers ? centers[frame.b.pos] : 0, opacity: centers && frame.b.visible ? 1 : 0 }}
      >
        Pity: {frame.b.value}
      </div>
      <div className="gacha-tutorial-pity-flow-row">
        <div ref={setBoxRef(0)} className="gacha-tutorial-pity-flow-box">
          Previous Banner
        </div>
        <span className="gacha-tutorial-pity-flow-x">✕</span>
        <div ref={setBoxRef(1)} className="gacha-tutorial-pity-flow-box celebration">
          {label}
        </div>
        <span className="gacha-tutorial-pity-flow-x">✕</span>
        <div ref={setBoxRef(2)} className="gacha-tutorial-pity-flow-box">
          Future Banner
        </div>
      </div>
    </div>
  );
}

const CELEBRATION_PAGES: { Visual: () => JSX.Element; text: string }[] = [
  { Visual: CelebrationPagePool, text: 'This banner contains a pool of past six stars. Only the ones you do not have in your account are obtainable.' },
  {
    Visual: CelebrationPageBlowOpen,
    text: 'After you have obtained a new six star, all other six stars that you own will become available in the pool again so do not pull beyond the first six star.',
  },
  {
    Visual: () => <IsolatedPityFlowDemo label="Celebration" />,
    text: '6-star pity ramp up is isolated, starts from 0 for this banner and does not carry over to any future banners.',
  },
];

function KernelPageSplit() {
  return (
    <TutorialRarityRow
      items={[
        {
          n: 6,
          content: (
            <div className="gacha-tutorial-split-list">
              <div className="gacha-tutorial-split-row">
                <span className="gacha-tutorial-split-chip">25%</span>
                <span className="gacha-tutorial-split-chip">25%</span>
              </div>
              <span className="gacha-tutorial-footnote">2 featured, share 50%</span>
            </div>
          ),
        },
        {
          n: 5,
          content: (
            <div className="gacha-tutorial-split-list">
              <div className="gacha-tutorial-split-row">
                <span className="gacha-tutorial-split-chip">16.7%</span>
                <span className="gacha-tutorial-split-chip">16.7%</span>
                <span className="gacha-tutorial-split-chip">16.7%</span>
              </div>
              <span className="gacha-tutorial-footnote">3 featured, share 50%</span>
            </div>
          ),
        },
      ]}
    />
  );
}

// Fixed illustrative example -- deliberately NOT derived from the
// currently-selected banner, so this tutorial page keeps showing the
// same reference image regardless of which/how many kernel banners
// get added later.
// Fixed illustrative example -- deliberately NOT derived from the
// currently-selected banner, so this tutorial page keeps showing the
// same reference image regardless of which/how many banners of this
// type get added later.
const KERNEL_EXAMPLE_IMAGE = '/headhunting-banner-images/Kernel 57 (Global).webp';
const STANDARD_EXAMPLE_IMAGE = '/headhunting-banner-images/Standard Pool 171 (Global).webp';

function KernelPageShopOperator() {
  return (
    <div className="gacha-tutorial-kernel-shop">
      <div className="gacha-tutorial-kernel-shop-image-wrap">
        <Image src={KERNEL_EXAMPLE_IMAGE} alt="Kernel banner example" width={280} height={140} style={{ objectFit: 'cover', width: '100%', height: 'auto' }} />
      </div>
      <div className="gacha-tutorial-kernel-shop-legend">
        <p>
          <Stars count={6} /> Center -- Shop Operator (180 gold certificates)
        </p>
        <p>
          <Stars count={5} /> Leftmost -- Shop Operator (45 gold certificates)
        </p>
      </div>
    </div>
  );
}

function KernelPageAdvisory() {
  return (
    <div className="gacha-tutorial-advisory-row">
      <span className="gacha-tutorial-advisory-bad">✕ Spending pulls here</span>
      <span className="gacha-tutorial-advisory-good">✓ Spending gold certificates</span>
    </div>
  );
}

function KernelPageCarryover() {
  return <TwoSlideCarryoverDemo repeatLabel="Kernel" pairLeft="Kernel Locating" pairRight="Kernel" />;
}

const KERNEL_PAGES: { Visual: () => JSX.Element; text: string }[] = [
  { Visual: KernelPageSplit, text: '2 six stars are featured, sharing a 50% chance, 3 five stars are also featured, sharing their own 50% chance.' },
  {
    Visual: KernelPageShopOperator,
    text: 'The center six star is the shop operator, buyable for 180 gold certificates. The leftmost five star is also the shop operator, buyable for 45 gold certificates.',
  },
  { Visual: KernelPageAdvisory, text: 'It is not advisable to spend your pull resources on this banner, instead use your gold certificates to buy units that you would like.' },
  { Visual: KernelPageCarryover, text: '6-star pity ramp up can be inherited from a previous kernel locating or kernel banner or passed into future similar banners.' },
];

// Standard's tutorial mimics Kernel's own page structure entirely --
// its own split (page 1) and advisory (page 3) pages are literally the
// same components Kernel uses, since the underlying mechanics are the
// same shape; only the shop-operator page (2) and carryover page (4)
// have Standard-specific content.
function StandardPageShopOperator() {
  return (
    <div className="gacha-tutorial-kernel-shop">
      <div className="gacha-tutorial-kernel-shop-image-wrap">
        <Image src={STANDARD_EXAMPLE_IMAGE} alt="Standard banner example" width={280} height={140} style={{ objectFit: 'cover', width: '100%', height: 'auto' }} />
      </div>
      <div className="gacha-tutorial-kernel-shop-legend">
        <p>
          <Stars count={6} /> Elite 0 version -- Shop Operator (180 gold certificates)
        </p>
        <p>
          <Stars count={5} /> Middle of the three -- Shop Operator (45 gold certificates)
        </p>
      </div>
    </div>
  );
}

function StandardPageCarryover() {
  return <TwoSlideCarryoverDemo repeatLabel="Standard" pairLeft="Featured" pairRight="Standard" />;
}

const STANDARD_PAGES: { Visual: () => JSX.Element; text: string }[] = [
  { Visual: KernelPageSplit, text: '2 six stars are featured, sharing a 50% chance, 3 five stars are also featured, sharing their own 50% chance.' },
  {
    Visual: StandardPageShopOperator,
    text: 'The Elite 0 version six star is the shop operator, buyable for 180 gold certificates. The five star in the middle of the three is also the shop operator, buyable for 45 gold certificates.',
  },
  { Visual: KernelPageAdvisory, text: 'It is not advisable to spend your pull resources on this banner, instead use your gold certificates to buy units that you would like.' },
  { Visual: StandardPageCarryover, text: '6-star pity ramp up can be inherited from a previous featured or standard banner, or passed into future similar banners.' },
];

// Featured only ever has a single featured six-star (always 50/50 with
// off-banner), but the five-star slot varies banner to banner between
// exactly 1 or exactly 2 featured five-stars -- cycles between those
// two real shapes rather than showing an invented average.
function FeaturedPageSplit() {
  const fiveVariants = [[50, 50], [25, 25, 50]];
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => s + 1), 2200);
    return () => clearInterval(id);
  }, []);
  const fiveRow = fiveVariants[step % fiveVariants.length];
  return (
    <div className="gacha-tutorial-splits">
      <div className="gacha-tutorial-splits-row">
        <div className="gacha-tutorial-rarity-col">
          <Stars count={6} />
          <div className="gacha-tutorial-split-row">
            <span className="gacha-tutorial-split-chip">50</span>
            <span className="gacha-tutorial-split-chip off-banner">50</span>
          </div>
        </div>
        <div className="gacha-tutorial-rarity-col">
          <Stars count={5} />
          <div className="gacha-tutorial-split-row">
            {fiveRow.map((v, i) => (
              <span key={i} className={`gacha-tutorial-split-chip${i === fiveRow.length - 1 ? ' off-banner' : ''}`}>
                {v}
              </span>
            ))}
          </div>
        </div>
        <div className="gacha-tutorial-rarity-col">
          <Stars count={4} />
          <div className="gacha-tutorial-split-row">
            <span className="gacha-tutorial-split-chip">50</span>
            <span className="gacha-tutorial-split-chip off-banner">50</span>
          </div>
        </div>
      </div>
      <p className="gacha-tutorial-footnote">Highlighted numbers are the featured operator(s)&apos; share; the last number is the off-banner share.</p>
    </div>
  );
}

// Pulls 141-150 land no six-star at all -- protection is now active,
// but the next batch shows the guarantee only kicks in whenever the
// next six-star actually lands (here pull 155), not forced exactly at
// 150, and that six-star is automatically the featured one.
const FEATURED_150_FILLER: (5 | 6 | 4 | 3)[] = [3, 4, 3, 4, 3, 4, 3, 4, 4, 3];
const FEATURED_AFTER_150: (5 | 6 | 4 | 3)[] = [4, 3, 4, 3, 6];

function FeaturedPageProtection() {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setPhase((p) => (p + 1) % 2), 2400);
    return () => clearInterval(id);
  }, []);

  if (phase === 1) {
    return (
      <div className="gacha-tutorial-first-ten">
        <div className="gacha-tutorial-first-ten-title">
          Pulls 151-155 <span className="gacha-tutorial-pity-inline">Protection active</span>
        </div>
        <div className="gacha-tutorial-pull-grid">
          {FEATURED_AFTER_150.map((rarity, i) => (
            <TutorialPullCard key={`p1-${i}`} rarity={rarity} index={i} />
          ))}
        </div>
        <span className="gacha-tutorial-guarantee-label triggered">Next 6★ = guaranteed featured</span>
      </div>
    );
  }
  return (
    <div className="gacha-tutorial-first-ten">
      <div className="gacha-tutorial-first-ten-title">
        Pulls 141-150 <span className="gacha-tutorial-pity-inline">Pull count: 150</span>
      </div>
      <div className="gacha-tutorial-pull-grid">
        {FEATURED_150_FILLER.map((rarity, i) => (
          <TutorialPullCard key={`p0-${i}`} rarity={rarity} index={i} />
        ))}
      </div>
    </div>
  );
}

const FEATURED_PAGES: { Visual: () => JSX.Element; text: string }[] = [
  {
    Visual: FeaturedPageSplit,
    text: '1 six stars is featured obtaining at 50% chance, 1 or 2 five stars are also featured, taking up its own 50% chance. 4 stars may appear, taking up 50% chance.',
  },
  {
    Visual: FeaturedPageProtection,
    text: 'If you do not obtain the 6 star by 150 pulls, the next 6 star you obtain will be the featured. You do not necessarily obtain the 6 star at 150 pulls.',
  },
  { Visual: StandardPageCarryover, text: '6-star pity ramp up can be inherited from a previous featured or standard banner, or passed into future similar banners.' },
];

function LimitedPageFeaturedSplit() {
  return (
    <div className="gacha-tutorial-limited-cards">
      <div className="gacha-tutorial-pick-slot picked">
        <Stars count={6} />
        <span className="gacha-tutorial-pick-pct">35%</span>
      </div>
      <div className="gacha-tutorial-pick-slot picked">
        <Stars count={6} />
        <span className="gacha-limited-tag">LIMITED</span>
        <span className="gacha-tutorial-pick-pct">35%</span>
      </div>
      <div className="gacha-tutorial-pick-slot picked">
        <Stars count={5} />
        <span className="gacha-tutorial-pick-pct">50%</span>
      </div>
    </div>
  );
}

// Animates the off-banner card's bar at a baseline height while the 3
// rate-up cards' bars grow to 5x that height and back, looping, to
// make the multiplier visually obvious rather than just stating "5x".
function LimitedPageRateUps() {
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const id = setInterval(() => setGrown((g) => !g), 1400);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="gacha-tutorial-rateup-demo">
      <div className="gacha-tutorial-rateup-col">
        <div className="gacha-tutorial-rateup-bar" style={{ height: 16 }} />
        <Stars count={6} />
        <span className="gacha-tutorial-pick-status">Off-banner</span>
        <span className="gacha-tutorial-pick-pct">1x</span>
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="gacha-tutorial-rateup-col">
          <div className="gacha-tutorial-rateup-bar rateup" style={{ height: grown ? 80 : 16 }} />
          <Stars count={6} />
          <span className="gacha-rate-up-tag">RATE-UP</span>
          <span className="gacha-tutorial-pick-pct">{grown ? '5x' : '1x'}</span>
        </div>
      ))}
    </div>
  );
}

function LimitedPageSameChance() {
  return (
    <div className="gacha-tutorial-limited-cards">
      <div className="gacha-tutorial-pick-slot picked">
        <Stars count={6} />
        <span className="gacha-tutorial-pick-status">Same series</span>
      </div>
      <span className="gacha-tutorial-equals">=</span>
      <div className="gacha-tutorial-pick-slot picked">
        <Stars count={6} />
        <span className="gacha-tutorial-pick-status">Off-banner</span>
      </div>
    </div>
  );
}

// Pulls 281-290 and 291-300 both deliberately contain no natural 5★/6★
// hit -- the whole point of this page is that the guarantee exists
// because the player DIDN'T land the featured limited naturally by
// pull 300, so the reveal at the end has to be the thing that grants
// it. 301-310 then shows pity continuing to climb regardless (the
// guarantee doesn't reset it) until it naturally triggers on its own,
// landing an ordinary (non-limited) 6★.
const LIMITED_300_FILLER_A: (5 | 6 | 4 | 3)[] = [3, 4, 3, 4, 3, 4, 4, 3, 4, 3];
const LIMITED_300_FILLER_B: (5 | 6 | 4 | 3)[] = [4, 3, 3, 4, 3, 4, 3, 4, 4, 3];
const LIMITED_300_FILLER_C: (5 | 6 | 4 | 3)[] = [3, 4, 3, 4, 3, 4, 3, 4, 3, 6];

function LimitedPage300Guarantee() {
  const phases = ['a', 'b', 'reveal300', 'c'] as const;
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setPhase((p) => (p + 1) % phases.length), 2200);
    return () => clearInterval(id);
  }, []);
  const current = phases[phase];

  if (current === 'reveal300') {
    return (
      <div className="gacha-tutorial-first-ten">
        <div className="gacha-tutorial-first-ten-title">
          Pull #300 <span className="gacha-tutorial-pity-inline">Pity: 53</span>
        </div>
        <div className="gacha-tutorial-pull-grid">
          {LIMITED_300_FILLER_B.map((rarity, i) => (
            <TutorialPullCard key={`b-${i}`} rarity={rarity} index={i} />
          ))}
        </div>
        <div className="gacha-tutorial-guarantee-row">
          <div className="gacha-tutorial-pull-card highlight small">
            <Stars count={1} />
            <span className="gacha-tutorial-pull-card-label">6★</span>
          </div>
          <span className="gacha-tutorial-guarantee-label">+1 Limited Guarantee</span>
        </div>
      </div>
    );
  }

  const label = current === 'a' ? 'Pulls 281-290' : current === 'b' ? 'Pulls 291-300' : 'Pulls 301-310';
  const results = current === 'a' ? LIMITED_300_FILLER_A : current === 'b' ? LIMITED_300_FILLER_B : LIMITED_300_FILLER_C;
  const pity = current === 'a' ? 43 : current === 'b' ? 53 : null;
  return (
    <div className="gacha-tutorial-first-ten">
      <div className="gacha-tutorial-first-ten-title">
        {label}
        {pity !== null && <span className="gacha-tutorial-pity-inline">Pity: {pity}</span>}
      </div>
      <div className="gacha-tutorial-pull-grid">
        {results.map((rarity, i) => (
          <TutorialPullCard key={`${current}-${i}`} rarity={rarity} index={i} />
        ))}
      </div>
      {current === 'c' && <span className="gacha-tutorial-guarantee-label triggered">Pity triggered naturally!</span>}
    </div>
  );
}

function LimitedPageSparkStore() {
  return (
    <div className="gacha-tutorial-limited-cards">
      <div className="gacha-tutorial-pick-slot picked">
        <Stars count={6} />
        <span className="gacha-tutorial-pick-status">Current featured</span>
        <span className="gacha-tutorial-pick-pct">300</span>
      </div>
      <div className="gacha-tutorial-pick-slot picked">
        <Stars count={6} />
        <span className="gacha-tutorial-pick-status">Older limited</span>
        <span className="gacha-tutorial-pick-pct">200</span>
      </div>
      <div className="gacha-tutorial-pick-slot owned">
        <Stars count={5} />
        <span className="gacha-tutorial-pick-status">Not recommended</span>
        <span className="gacha-tutorial-pick-pct">75</span>
      </div>
    </div>
  );
}

const LIMITED_PAGES: { Visual: () => JSX.Element; text: string }[] = [
  {
    Visual: LimitedPageFeaturedSplit,
    text: 'There are two featured six stars, one of them being limited each taking 35% of the six stars odds. One featured five star takes up 50% of the five stars odds.',
  },
  {
    Visual: LimitedPageRateUps,
    text: '3 past limited operators are also given rate-ups. They take up 5x the chance of an off-banner six star in the 30% pool.',
  },
  {
    Visual: LimitedPageSameChance,
    text: 'Other limited operators of the same series can be pullable but they take the same chance as every other remaining off-banner.',
  },
  {
    Visual: LimitedPage300Guarantee,
    text: 'At 300 pulls, you will be given a copy of the featured limited 6 star regardless of whether you have an earlier copy before. This only happens once. It also does not affect the 6 star pity accumulated.',
  },
  {
    Visual: LimitedPageSparkStore,
    text: 'The current featured six stars along with limiteds of the same series are obtainable in the spark store for either 300 or 200 sparks (older limited six stars get the 200 treatment). The featured 5 star is available for 75 sparks but is not recommended to be bought.',
  },
  {
    Visual: () => <IsolatedPityFlowDemo label="Limited" />,
    text: 'Limited banner pity is isolated and can never be inherited from a previous banner or passed into future banners.',
  },
];

const BANNER_TUTORIAL_PAGES: Partial<Record<BannerType, { Visual: () => JSX.Element; text: string }[]>> = {
  orienteering: ORIENTEERING_PAGES,
  celebration: CELEBRATION_PAGES,
  kernel: KERNEL_PAGES,
  standard: STANDARD_PAGES,
  limited: LIMITED_PAGES,
  kernelLocating: KERNEL_LOCATING_PAGES,
  joint: JOINT_PAGES,
  featured: FEATURED_PAGES,
};

/** The banner's own tutorial, or null when its type has none (crossover, trio). Such a
 *  banner gets the Basics alone, never a "coming soon" page: placeholders stay hidden
 *  until they have content (the 2026-09-25 decision). */
function bannerTutorialPages(banner: BannerConfig | null) {
  return (banner && BANNER_TUTORIAL_PAGES[banner.type]) || null;
}

export default function GachaSimulator({ pools, banners, kernelLookup, releaseLookup, kernelExclusiveNames, howToObtainLookup, operatorSeriesMap, now }: Props) {
  const router = useRouter();
  // What is live or upcoming is judged on the reader's clock, not the server's: the
  // first render uses the request's `now`, so it matches the markup, and the reader's
  // clock takes over after mount (a tab left open follows a banner's end, too).
  const clock = useReaderClock(now, { tickMs: 60_000, onFocus: true });
  const bannersByCategory = useMemo(() => {
    const grouped: Record<DisplayCategory, HeadhuntingBanner[]> = {
      upcoming: [], featured: [], limited: [], standard: [], kernel: [], kernelLocating: [], joint: [], orienteering: [], celebration: [], crossover: [], trio: [], other: [],
    };
    for (const b of banners) {
      const cat: DisplayCategory = getMechanicType(b) || 'other';
      grouped[cat].push(b);
    }
    // Upcoming is additive: live and not-yet-started banners of every mechanic, in the
    // order lib/gacha/upcomingBanners.ts documents.
    grouped.upcoming = upcomingBanners(banners, clock);
    return grouped;
  }, [banners, clock]);

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

  // Deep-link support: /gacha?banner=<name> (used by the home page's
  // banner poster link) lands already on that specific banner, in the
  // default "upcoming" category. If the name isn't found in that
  // category's list, selectedBanner already falls back to
  // categoryBanners[0] elsewhere, so this degrades gracefully rather
  // than crashing.
  useEffect(() => {
    if (!router.isReady) return;
    const bannerParam = router.query.banner;
    if (typeof bannerParam === 'string' && bannerParam) {
      changeBanner(bannerParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.query.banner]);

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
    const hasObtainedAnyCelebrationSix = isCelebration && selectedBanner
      ? selectedBanner.six_stars.some((n) => (state.obtainedCounts[n] || 0) > 0)
      : false;
    const celebrationExcludeNames = isCelebration && selectedBanner
      ? hasObtainedAnyCelebrationSix
        ? []
        : selectedBanner.six_stars.filter((n) => !missingSixStars.has(n))
      : [];
    const base = buildRealBannerConfig(selectedBanner, pools, celebrationExcludeNames, kernelLookup, releaseLookup, new Set(kernelExclusiveNames), howToObtainLookup, operatorSeriesMap);

    // Recompute the general "everyone else" pools for all four rarities
    // using the eligibility rules derived directly from each operator's
    // own howToObtain + release/kernel-addition dates, rather than the
    // series-matching logic buildRealBannerConfig uses internally --
    // this is what actually makes newer 6-star through 3-star operators
    // (who may not be covered by the older series classification) show
    // up correctly in every banner they're eligible for.
    const bannerDate = parseBannerDate(selectedBanner);
    const mechanicType = getMechanicType(selectedBanner);
    const isKernelMechanic = mechanicType === 'kernel' || mechanicType === 'kernelLocating';
    const featuredSixNames = new Set(base.sixStarFeatured.map((o) => o.name));
    const featuredFiveNames = new Set(base.fiveStarFeatured.map((o) => o.name));
    const featuredFourNames = new Set((base.fourStarFeatured || []).map((o) => o.name));

    const eligibleOtherSix = buildEligiblePool(pools.six, howToObtainLookup, releaseLookup, kernelLookup, bannerDate, isKernelMechanic, featuredSixNames);
    const eligibleOtherFive = buildEligiblePool(pools.five, howToObtainLookup, releaseLookup, kernelLookup, bannerDate, isKernelMechanic, featuredFiveNames);
    const eligibleFour = buildEligiblePool(pools.four, howToObtainLookup, releaseLookup, kernelLookup, bannerDate, isKernelMechanic, featuredFourNames);
    const eligibleThree = buildEligiblePool(pools.three, howToObtainLookup, releaseLookup, kernelLookup, bannerDate, isKernelMechanic);

    // These mechanic types have NO "other" 6★/5★ pool at all -- the
    // featured roster IS the entire 6★/5★ chance, full stop. Preserve
    // buildRealBannerConfig's already-correctly-emptied values instead
    // of letting the general eligibility override below repopulate them.
    const noOtherPoolTypes = new Set(['orienteering', 'joint', 'celebration', 'trio']);
    const hasNoOtherPool = noOtherPoolTypes.has(mechanicType);

    // For Limited banners specifically, base.otherSixStarPool/otherFiveStarPool
    // (from buildRealBannerConfig's series-matching logic) and
    // eligibleOtherSix/eligibleOtherFive (from the Standard/Kernel-flag-based
    // eligibility rules) each catch operators the other misses: base correctly
    // includes genuinely Limited-exclusive operators via their derived series,
    // which eligibleOtherSix has no concept of at all (it only checks Standard/
    // Kernel Headhunting); eligibleOtherSix catches newer operators who may not
    // yet be reflected in the series derivation. Letting eligibleOtherSix fully
    // REPLACE base's result -- as this used to do -- silently dropped every
    // Limited-exclusive operator whose howToObtain has neither flag set to
    // "Yes", which is exactly what Limited-exclusive operators look like.
    function mergeByName(a: GachaItem[], b: GachaItem[]): GachaItem[] {
      const seen = new Set(a.map((item) => item.name));
      return [...a, ...b.filter((item) => !seen.has(item.name))];
    }

    const withEligibility: BannerConfig = {
      ...base,
      otherSixStarPool: hasNoOtherPool ? base.otherSixStarPool : mergeByName(base.otherSixStarPool, eligibleOtherSix),
      otherFiveStarPool: hasNoOtherPool ? base.otherFiveStarPool : mergeByName(base.otherFiveStarPool, eligibleOtherFive),
      fourStarPool: eligibleFour,
      threeStarPool: eligibleThree,
    };

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
    state.obtainedCounts,
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
    : isLineupPending(selectedBanner) ? LINEUP_PENDING_NOTE : 'No 6★ operators can be pulled on this banner.';

  function pull(count: number) {
    if (!banner || !pullable) return;
    const result = doPulls(banner, state, count);
    setState(result.state);
    setLastPulls(result.items);
  }

  function reset() {
    setState(createInitialState());
    setLastPulls([]);
  }

  return (
    <>
      <Head><title>Gacha Simulator — Arkpedia</title></Head>

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
          <div className="gacha-banner-sidebar" ref={bannerWindow.scrollerRef} role="region" aria-label="Banners" tabIndex={0}>
            {categoryBanners.length === 0 ? (
              <p className="hint">No banners in this category yet.</p>
            ) : (
              <>
                <div className="gacha-banner-sidebar-spacer" style={{ height: bannerWindow.before }} aria-hidden="true" />
                {visibleBanners.map((b) => {
                  const isCurrentlyActive = category === 'upcoming' && isBannerLive(b, clock);
                  return (
                    <button
                      key={b.name}
                      type="button"
                      className={`gacha-banner-sidebar-item${b.name === selectedBanner?.name ? ' active' : ''}`}
                      onClick={() => changeBanner(b.name)}
                      aria-pressed={b.name === selectedBanner?.name}
                      title={bannerDisplayName(b.name)}
                    >
                      {b.banner_image && (
                        <Image src={b.banner_image} alt="" fill sizes="260px" className="gacha-banner-sidebar-bg" />
                      )}
                      {isCurrentlyActive && <span className="gacha-banner-sidebar-live-badge">LIVE NOW</span>}
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
                <p className="hint">
                  This banner&apos;s type couldn&apos;t be confidently determined from the scraped data, so no
                  simulator is available for it. Showing what&apos;s known below.
                </p>
                {isLineupPending(selectedBanner) && <p className="hint">{LINEUP_PENDING_NOTE}</p>}
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
                    <h2 style={{ marginBottom: 4 }}>
                      {banner.label} <span className="gacha-banner-date">({bannerDateLabel(selectedBanner)})</span>
                    </h2>
                    {!selectedBanner?.global_date && <p className="hint">Global release date unannounced.</p>}
                    {selectedBanner?.banner_image ? (
                      <Image
                        src={selectedBanner.banner_image}
                        alt={banner.label}
                        width={1600}
                        height={900}
                        className="gacha-banner-main-image"
                      />
                    ) : (
                      /* No art yet (null until the image repository publishes it): an
                         empty frame the size the art will have, so switching between a
                         banner with art and one without moves nothing below it. */
                      <div className="gacha-banner-main-image gacha-banner-main-placeholder" aria-hidden="true" />
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
                      Pick every six-star from this banner you don&apos;t already have -- only your
                      chosen ones will populate as featured and be pullable.
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
                      disabled={missingSixStars.size === 0}
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
                {(isOrienteering && !orienteeringConfirmed) || (isCelebration && !celebrationConfirmed) || (isKernelLocating && !kernelLocatingConfirmed) ? (
                  isOrienteering ? (
                  <section className="op-section">
                    <div className="gacha-info-toggle-row" style={{ marginBottom: 10 }}>
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
                      five-star candidates -- only your chosen ones will be pullable.
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
                    <div className="gacha-info-toggle-row" style={{ marginBottom: 10 }}>
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
                      Kernel Locating: only your chosen 2 six-stars and 3 five-stars exist in this
                      banner&apos;s pool at all -- nothing else can appear.
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
                    <div className="gacha-pity-row">
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
                      {banner.type === 'featured' && (
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
                      {banner.type === 'limited' && (
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
                            {state.crossoverGuaranteeUsed
                              ? 'Used'
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
                      : Array.from({ length: 10 }, (_, i) => <span key={i} className="gacha-pull-tile gacha-pull-tile-empty" aria-hidden="true" />)}
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
                        <p className="hint">{LINEUP_PENDING_NOTE}</p>
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
                  <button
                    type="button"
                    className="ghost gacha-history-toggle"
                    aria-expanded={showHistory && state.history.length > 0}
                    disabled={state.history.length === 0}
                    onClick={() => setShowHistory((v) => !v)}
                  >
                    {showHistory && state.history.length > 0 ? '▾' : '▸'} Pull history{state.history.length > 0 ? ` (${state.history.length})` : ''}
                  </button>
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
      {previewedPull && <PullPreview item={previewedPull} onClose={() => setPreviewedPull(null)} />}

      {showSparkStore && banner && (
        <div className="modal-overlay" onClick={() => setShowSparkStore(false)}>
          <div className="modal-box gacha-spark-store-modal" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="modal-back-btn" onClick={() => setShowSparkStore(false)}>
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
              className="modal-back-btn"
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
                    <button type="button" className="ghost" disabled={guidePageIndex === 0} onClick={() => setGuidePageIndex((s) => s - 1)}>
                      ‹ Back
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

  const kernelLookup: KernelAdditionLookup = {};
  const releaseLookup: ReleaseDateLookup = {};
  const kernelExclusiveNames: string[] = [];
  const howToObtainLookup: HowToObtainLookup = {};
  for (const op of getAllOperators()) {
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
    category: '',
    cn_date: b.cn_date ?? null,
    global_date: b.global_date ?? null,
    global_date_estimated: b.global_date_estimated ?? false,
    ...(b.schedule_anchor ? { schedule_anchor: b.schedule_anchor } : {}),
    ...(b.global_window ? { global_window: b.global_window } : {}),
    ...(b.cn_window ? { cn_window: b.cn_window } : {}),
    banner_image: b.banner_image ?? null,
    ...(b.lineupSource ? { lineupSource: b.lineupSource } : {}),
    six_stars: b.six_stars ?? [],
    rate_up_six_stars: b.rate_up_six_stars ?? [],
    five_stars: b.five_stars ?? [],
    four_stars: b.four_stars ?? [],
    pull_type: b.pull_type ?? 'unknown',
    year: 0,
    linked_event: b.linked_event ?? null,
  }));

  return { props: { pools, banners: trimmedBanners, kernelLookup, releaseLookup, kernelExclusiveNames, howToObtainLookup, operatorSeriesMap } };
  // No request-time finalize: the content export runs this against the release's own
  // banners and calendar, so every estimate above arrives with the release. The old
  // hook re-estimated CN-only dates on each request from this deployment's bundled
  // banners and events, which lag the release (411 banners against its 412).
});
