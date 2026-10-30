import { loadAllEventYears } from '@/lib/events/loadEventsData';
import PageMeta from '@/components/layout/PageMeta';
import { scheduleModeRelease } from '@/lib/schedule/modeReleases';
import type { ScheduleEvent } from '@/lib/schedule/scheduleTypes';
import { permanentEventListing, modeDetails, type ModeDetails } from '@/lib/events/modeDetails';
import { useRegionalTime } from '@/lib/time/useRegionalTime';
import { regionalArt, regionalRange, regionalScheduleSlice, type RegionalSchedules } from '@/lib/time/regional';
import { withContentPage } from '@/lib/content/server';
import { readPublishedContentPageProps } from '@/lib/content/release';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { GetStaticPaths, GetStaticProps } from 'next';
import Image from '@/components/content/ContentImage';
import Link from 'next/link';
import { getEventCalendar, PREDICTED_GAP_DAYS } from '@/lib/home/frontPageContent';
import { getBannerForEvent } from '@/lib/gacha/headhuntingBanners';
import { getAllHeadhuntingBanners } from '@/lib/gacha/headhuntingBannerData';
import { isLineupPending, lineupPendingNote, RETURNING_LIMITED_NOTE } from '@/lib/gacha/bannerLineup';
import { getFeaturedOperatorRates, splitEventBannerRates, FeaturedOperatorRate } from '@/lib/gacha/eventBannerRates';
import { getAllSkins } from '@/lib/skins/skins';
import { eventSkins } from '@/lib/events/eventSkins';
import confirmed from '@/data/skin-availability-windows.json';
import rotations from '@/data/skin-shop-rotations.json';
import { Skin } from '@/lib/skins/skinTypes';
import { parsePrices } from '@/lib/skins/skinPrice';
import PriceDisplay from '@/components/ui/PriceDisplay';
import { getEventCgImages } from '@/lib/events/eventCg';
import { getEventRewards, wikiStoreBlocks, type EventRewardBlock, type EventStoresFile } from '@/lib/events/loadEventsData';
import { rewardIconPath } from '@/lib/events/rewardIcons';
import { publicFileExists } from '@/lib/assets/publicAssets';
import { publishedArt } from '@/lib/art/publishedArt';
import packArt from '@/data/event-pack-art.json';
import { findSkinIconPath } from '@/lib/skins/skinIconLookup';
import { materialOrderFor } from '@/lib/farming/materialSortOrder';
import { loadMaterialCatalogue } from '@/lib/farming/materialCatalogueServer';
import { withMaterialOrder } from '@/lib/content/materialOrderFallback';
import SkinZoomOverlay from '@/components/skins/SkinZoomOverlay';
import PageHeader from '@/components/ui/PageHeader';
import Tabs, { tabPanelProps } from '@/components/ui/Tabs';
import { useSwitchHold } from '@/components/ui/useSwitchHold';
import Rarity from '@/components/ui/Rarity';
import InfoPopover from '@/components/ui/InfoPopover';
import { LazyOperatorPreview } from '@/components/operators/LazyOperatorPreview';
import type { OperatorPreviewItem } from '@/components/operators/OperatorPreview';
import { allFreeRewards, eventRewardOperators, eventWelfareOperators, withWelfareEventLinks, type EventWelfareOperator, type FreeReward } from '@/lib/pulls/freeRewards';
import { computeRewardTotals, type ResolvedRewardItem, type ResolvedRewardStore, type RewardTotal } from '@/lib/events/rewardTotals';
import { eventExtras, furniturePieceSource, NO_EXTRAS, tableRewardStores, type EventExtras, type EventRewardsFile } from '@/lib/events/tableRewards';
import { ALL_TAB, eventLink, EXTRA_TABS, readEventLink, rewardTabsFor, shownRewardTab } from '@/lib/events/rewardTabs';
import { eventTitle, isRerun } from '@/lib/events/eventName.mjs';
import { furnitureKey } from '@/lib/events/furnitureName.mjs';
import { announcedRewards } from '@/lib/events/announcements';
import { RewardClick, RewardDetailsProvider, type ResolvedTicket } from '@/components/events/RewardDetails';
import { EventFurniture, EventLoginDays, EventNews, EventNotices, EventPacks, type LoginDetails } from '@/components/events/EventExtras';
import { RewardSummaryCard } from '@/components/events/RewardSummary';
import { EventVideos } from '@/components/events/EventVideos';
import EventModeOverview from '@/components/events/EventModeOverview';
import type { EventVideo, EventVideosFile } from '@/lib/events/eventVideos';
import { RewardTile } from '@/components/events/RewardTile';
import { rewardSummary, type RewardSummary } from '@/lib/events/rewardSummary';
import { getAllOperators } from '@/lib/operators/operators';
import { getOperatorIconPath } from '@/lib/operators/operatorIcon';
import { operatorHref } from '@/lib/operators/operatorHref';

const CAROUSEL_INTERVAL_MS = 8000;
const PAUSE_AFTER_CLICK_MS = 30000;

interface Props {
  name: string;
  mode?: ModeDetails | null;
  /** null while the image repository has not published it (see publishedArt). */
  poster: string | null;
  images: string[];
  /** The carousel box's aspect ratio, from the art it shows: a CG set is 16:9, and
   *  an event poster is the game's 1024x328 banner. A 16:9 box around the poster
   *  left 43% of it as letterbox. */
  artAspect: string;
  dateRange: string;
  isPredicted: boolean;
  bannerName: string | null;
  bannerImage: string | null;
  /** The linked banner is out before its lineup is known (lineupSource 'pending'): what it says in
   *  the lineup's place. `true` from a release compiled before it carried the note's text. */
  lineupPending: string | boolean | null;
  featuredOperators: FeaturedOperatorRate[];
  /** The welfare operators this event gives (the Reward Tracker's rows, lib/pulls/freeRewards.ts
   *  eventWelfareOperators). Absent from a release compiled before them. */
  welfareOperators?: EventWelfareOperator[];
  /** Operators the event's own rewards give besides those (a sign-in day, a store, missions):
   *  each with the reward list it is in. Absent from a release compiled before them. */
  rewardOperators?: EventWelfareOperator[];
  skins: Skin[];
  rewardStores: ResolvedRewardStore[];
  /** Packs, furniture sets and announced gifts. Absent from a release compiled before them. */
  extras?: EventExtras;
  tickets?: Record<string, ResolvedTicket>;
  loginDetails?: Record<string, LoginDetails>;
  /** The free rewards as the shareable card (All). Absent from a release compiled before it. */
  summary?: RewardSummary | null;
  /** Where the rewards come from when not this event's own Global data (a rerun's original, CN). */
  rewardNote?: string | null;
  /** The release's material catalogue order (data/material-catalogue.json), for the reward
   *  names this event lists: what the reward totals sort by. */
  materialOrder: string[];
  /** The event's official videos (data/event-videos.json). Absent from a release compiled before them. */
  videos?: EventVideo[];
}

type SectionKey = 'overview' | 'banner' | 'rewards' | 'skins' | 'news' | 'pvs';

/* A section with nothing linked is left out. Packs and Miscellaneous were sections
   once, two tabs that only ever said "Coming soon", which pushed the row onto a second
   line at 390; an event's packs are a tab inside Rewards now (rewardTabsFor), beside
   its announced gifts and furniture. */
const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'banner', label: 'Operators' },
  { key: 'rewards', label: 'Rewards' },
  { key: 'skins', label: 'Skins' },
  /* The rest of the event's official announcement: a Sanity limit raised, a recruitment pool, a
     store's redeemables, a Kernel Locating banner (build-event-rewards.mjs `news`). */
  { key: 'news', label: 'News' },
  /* The event's PVs and the official videos made for it, from the official YouTube channels
     (scripts/sync/sync-official-videos.mjs): a thumbnail each until the reader presses play. */
  { key: 'pvs', label: 'PVs' },
];

/** The page's address with this hash, without a scroll or a history entry. */
function setLink(hash: string) {
  if (typeof window === 'undefined') return;
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}#${hash}`);
}

/** The poster's shape: the game's event banner art is 1024x328. */
const POSTER_ASPECT = '1024 / 328';
const CG_ASPECT = '16 / 9';

const STAR_FOLDERS = ['one', 'two', 'three', 'four', 'five', 'six'];
function iconPathFor(name: string, rarity: number): string {
  return `/${STAR_FOLDERS[Math.min(6, Math.max(1, rarity)) - 1]}-star-icons/${name} - Base.webp`;
}

/** A tile's line, wrapping only between words: a stage code ("17-13") never splits at its hyphen. */
function Words({ text }: { text: string }) {
  return <>{text.split(' ').map((word, i) => <span key={i}>{i > 0 && ' '}<span className="event-detail-word">{word}</span></span>)}</>;
}

/** An operator on the Operators tab: its icon, name and rarity, a button that opens the site's
 *  operator quick preview (the gacha simulator's pop-up). `children`: the lines under the name. */
function OperatorTile({ name, rarity, size = 52, onPreview, children }: { name: string; rarity: number; size?: number; onPreview: (item: OperatorPreviewItem) => void; children?: ReactNode }) {
  const icon = iconPathFor(name, rarity);
  return <button type="button" className="btn-bare event-detail-featured-op" aria-haspopup="dialog" aria-label={`${name}: operator preview`}
    onClick={() => onPreview({ name, icon, rarity })}>
    <Image src={icon} alt="" width={size} height={size} className={`tier-${rarity}`} />
    <span>{name}</span>
    {children}
  </button>;
}

/** All as a row of totals: what a release compiled before the reward card (summary) shows. */
function RewardTotalsRow({ totals }: { totals: RewardTotal[] }) {
  if (totals.length === 0) return <p className="hint">Nothing here.</p>;
  return (
    <div className="event-reward-totals">
      {totals.map((t) => <RewardTile key={t.name} name={t.name} iconPath={t.iconPath} count={t.total} />)}
    </div>
  );
}

/** Any reward block's own listing -- a store's, a sign-in's, the missions', the first clears',
 * the banner's gifts -- laid out as a 3-row horizontally-scrolling panel grid, each with its
 * per-purchase price, or 'Free' where it has none (every block but a store). The quantity
 * (how many of the item one purchase or one claim grants) is shown as a small badge on the
 * icon's bottom-right corner, rather than as inline text next to the name. */
function RewardStorePanelGrid({ items }: { items: ResolvedRewardItem[] }) {
  if (items.length === 0) return <p className="hint">Nothing here.</p>;
  return (
    <div className="sidescroll event-rewards-grid">
      {items.map((item, i) => (
        <RewardClick key={`${item.name}-${i}`} name={item.name} className="panel event-reward-panel">
          <div className="event-reward-icon-wrap">
            {item.iconPath && (
              <Image src={item.iconPath} alt={item.name} width={40} height={40} style={{ objectFit: 'contain' }} />
            )}
            <span className="event-reward-qty-badge">×{item.quantity}</span>
          </div>
          <div className="event-reward-panel-text">
            <span className="event-reward-panel-name">{item.name}</span>
            <span className="event-reward-panel-meta" title={item.price !== null ? `${item.price} ${item.currency}` : undefined}>
              {item.price !== null ? `${item.price} ${item.currency}` : 'Free'}
            </span>
          </div>
        </RewardClick>
      ))}
    </div>
  );
}

export default function EventDetailPage({
  poster,
  name,
  mode = null,
  images,
  artAspect,
  dateRange: globalDateRange,
  isPredicted: globalPredicted,
  bannerName,
  bannerImage,
  lineupPending,
  featuredOperators,
  welfareOperators = [],
  rewardOperators = [],
  skins,
  rewardStores,
  materialOrder,
  extras = NO_EXTRAS,
  tickets = {}, loginDetails = {},
  summary = null,
  rewardNote = null,
  videos = [],
}: Props) {
  const { server, schedule } = useRegionalTime();
  const regionalWindow = schedule?.events?.[name];
  /* The server's own window where it has one, else Global's date or prediction marked
     predicted, as every list has it (lib/time/regional.ts). */
  const ownWindow = server !== 'en' && regionalWindow ? regionalWindow : null;
  const dateRange = ownWindow ? regionalRange(ownWindow, server) : globalDateRange;
  const isPredicted = ownWindow ? false : globalPredicted || (server !== 'en' && !!globalDateRange);
  /* JP's and KR's own key art, from their in-game boards (regionalArt), else Global's. Read after
     hydration like the dates: both sit in boxes of a fixed shape, so the swap moves nothing. A CG
     set stays: the board's art stands in for the poster only. */
  const modeImages = mode?.poster ? [mode.poster] : images;
  const shownImages = artAspect === POSTER_ASPECT && server !== 'en' ? [regionalArt(regionalWindow, modeImages[0] ?? null, server)].filter((src): src is string => !!src) : modeImages;
  const shownBannerImage = bannerName ? regionalArt(schedule?.banners?.[bannerName], bannerImage, server) : bannerImage;
  const hasExtras = extras.packs.length + extras.furniture.length + extras.notices.length > 0;
  // A page compiled by a release from before the News tab has no `news` at all.
  const news = extras.news ?? [];
  const board = extras.board ?? [];
  const sections = SECTIONS.filter((section) => (
    section.key === 'overview' ? !!mode : section.key === 'banner' ? !!bannerName || welfareOperators.length + rewardOperators.length > 0 : section.key === 'rewards' ? rewardStores.length > 0 || hasExtras : section.key === 'news' ? news.length + board.length > 0 : section.key === 'pvs' ? videos.length > 0 : skins.length > 0
  ));
  const [chosenSection, setActiveSection] = useState<SectionKey | null>(sections[0]?.key ?? null);
  /* The section on screen: the one chosen if this event has it, else the event's
     first. Null only when nothing is linked at all -- that event shows its one hint
     and no section body. It fell back to 'banner' before, so an event with nothing
     linked said "No banner, reward store or skins are linked" AND "No banner linked
     to this event" (scripts/tests/test-event-page-sections.ts). Derived rather than
     stored, so it also follows a client-side move to an event with other sections. */
  const activeSection = sections.find((section) => section.key === chosenSection)?.key ?? sections[0]?.key ?? null;
  /* Switching from Rewards (tall) to Skins (short) near the bottom of the page used to
     clamp the scroll and throw the tab row 435px down the screen at 390. The Anti-Page
     Jump rule's handler pattern (arkpedia-ui skill): the press works out how tall the
     panel must stay for the document to still reach the bottom of the reader's screen,
     and that hold is applied as the panel's min-height in the same render as the new
     tab, so the page is never shorter than the reader's position and there is nothing
     to clamp. It is only what this position needs (nothing at the top of the page), and
     it melts as the reader scrolls back up. useHeightFloor, which reserves after the
     switch, lost the race with the clamp here and still moved the tab row 150px at 390;
     holding the tallest tab for good left a screen of nothing under Banner. Per event.
     components/ui/useSwitchHold is that pattern, shared with /schedule. */
  const hold = useSwitchHold(name);
  function changeSection(next: SectionKey) {
    hold.capture();
    setActiveSection(next);
    setLink(eventLink(next, activeRewardTab, rewardTabs));
  }
  const [imgIndex, setImgIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const resumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeImage = shownImages[Math.min(imgIndex, shownImages.length - 1)];

  const rewardTypes = Array.from(new Set(rewardStores.map((s) => s.type)));
  // One list for the Tabs and for reading a link: All only when there are blocks to total.
  const rewardTabs = rewardTabsFor(rewardTypes, extras);
  const [chosenRewardTab, setRewardTab] = useState<string>(ALL_TAB);
  /* The reward tab on screen, derived like the section: an event whose rewards are only packs,
     an announcement or furniture has no All and opens on its first tab. */
  const activeRewardTab = shownRewardTab(chosenRewardTab, rewardTabs) ?? ALL_TAB;
  /* A store is a long grid and the All card a short one: the same hold as a section
     change, taken in the handler, so the switch cannot shorten the page under the
     reader. */
  function changeRewardTab(next: string) {
    hold.capture();
    setRewardTab(next);
    setLink(eventLink('rewards', next, rewardTabs));
  }
  /* A link names the section and reward tab it shows (#skins, #rewards/packs), so a shared link
     opens on what the reader was looking at. Read once the page is on screen, and kept in step
     with the tabs by replaceState, which neither scrolls nor adds history. readEventLink reads
     the hash as it stands: a '%' in it can no longer throw and take the page down. */
  useEffect(() => {
    const follow = () => {
      const link = readEventLink(window.location.hash, sections.map((s) => s.key), rewardTabs);
      if (!link) return;
      setActiveSection(link.section);
      if (link.rewardTab !== undefined) setRewardTab(link.rewardTab);
    };
    follow();
    // A link to another tab of this page followed in place (replaceState fires no hashchange).
    window.addEventListener('hashchange', follow);
    return () => window.removeEventListener('hashchange', follow);
    // Per event: the tabs keep the link in step after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);
  const rewardTotals = computeRewardTotals(rewardStores, materialOrder);
  /* A release compiled before the note's text carries `true`: that still hid the lineup, but drew
     an empty hint where "Lineup to be confirmed." belongs. */
  const pendingNote = typeof lineupPending === 'string' ? lineupPending : lineupPending ? lineupPendingNote({}) : null;
  // Every block of the tab apart, each under its own name when there are several (two sign-ins,
  // two stores, the banner's gift and its free rolls): never one grid that repeats an item.
  const activeStores = rewardStores.filter((s) => s.type === activeRewardTab);

  // Skin detail modal + zoom -- same pattern as SkinsCarousel.tsx
  // (home page), pages/skins.tsx, pages/schedule.tsx, and
  // pages/operators/[name].tsx, all reusing the same SkinZoomOverlay.
  const [activeSkin, setActiveSkin] = useState<Skin | null>(null);
  const [preview, setPreview] = useState<OperatorPreviewItem | null>(null);
  const closePreview = useCallback(() => setPreview(null), []);
  /* The banner card's title: its name, its leading tag ("[Celebration]") apart on the right. */
  const bannerTag = bannerName ? /^\[([^\]]+)\]\s*/.exec(bannerName) : null;
  const bannerTitle = { title: bannerName ? bannerName.slice(bannerTag?.[0].length ?? 0) : '', tag: bannerTag?.[1] ?? null };
  /* A line each under the banner: the welfare operators, then the free ones its rewards give. */
  const extraOperators = [...welfareOperators.map(op => ({ ...op, kind: 'welfare' as const })), ...rewardOperators.map(op => ({ ...op, kind: 'free' as const }))];
  const [zooming, setZooming] = useState(false);
  useEffect(() => {
    if (!activeSkin) setZooming(false);
  }, [activeSkin]);

  useEffect(() => {
    if (paused || shownImages.length <= 1) return;
    const interval = setInterval(() => {
      setImgIndex((i) => (i + 1) % shownImages.length);
    }, CAROUSEL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [paused, shownImages.length]);

  useEffect(() => {
    return () => {
      if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current);
    };
  }, []);

  function selectImage(i: number) {
    setImgIndex(i);
    setPaused(true);
    if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current);
    resumeTimeoutRef.current = setTimeout(() => setPaused(false), PAUSE_AFTER_CLICK_MS);
  }

  return (
    <RewardDetailsProvider tickets={tickets}>
      <PageMeta title={name} description={`${name}, an Arknights event${dateRange ? ` (${dateRange})` : ''}: its banner, rewards, outfits and news.`} path={`/events/${encodeURIComponent(name)}`} image={images[0] ?? poster ?? bannerImage} />
      <PageHeader
        back={{ href: '/schedule', label: 'Events' }}
        eyebrow={<>Rhodes Island // <Link prefetch={false} href="/schedule">Events</Link></>}
        title={name}
        sub={`${isPredicted ? (mode ? 'Predicted launch: ' : 'Predicted release: ') : (mode ? 'Launch: ' : 'Release: ')}${dateRange}${mode ? ' · Permanent mode' : ''}`}
      />

      <main className="event-detail-layout">
        {/* The event's art across the top, the sections below it (2026-10-04: a column of art
            beside the sections left most of the page's left side empty). At most 420px tall, so
            a 16:9 CG set does not fill the screen; a poster is full width well under that. */}
        <div className="event-detail-carousel" style={{ maxWidth: `calc(420px * ${artAspect})` }}>
          <div className="event-detail-image-wrap" style={{ aspectRatio: artAspect }}>
            {activeImage && <Image src={activeImage} alt={name} fill sizes="(max-width: 1240px) 100vw, 1200px" style={{ objectFit: mode?.poster ? 'contain' : 'cover' }} />}
          </div>
          {shownImages.length > 1 && (
            <div className="event-detail-carousel-dots">
              {shownImages.map((_, i) => (
                <button
                  type="button"
                  key={i}
                  className={`event-detail-carousel-dot${i === imgIndex ? ' active' : ''}`}
                  onClick={() => selectImage(i)}
                  aria-label={`Image ${i + 1}`}
                />
              ))}
            </div>
          )}
        </div>

        <div className="event-detail-right" ref={hold.ref} style={hold.style}>
          {sections.length > 1 && activeSection && (
            <Tabs<SectionKey>
              label="Event sections"
              id="event-section"
              className="event-detail-tabs"
              value={activeSection}
              onChange={changeSection}
              options={sections.map((section) => ({ value: section.key, label: section.label }))}
            />
          )}
          {activeSection === 'overview' && mode && (
            <section className="op-section" {...tabPanelProps('event-section', 'overview')}>
              <EventModeOverview mode={mode} />
            </section>
          )}
          {sections.length === 0 && <p className="hint">No banner, reward store or skins are linked to this event yet.</p>}

          {activeSection === 'banner' && (bannerName || extraOperators.length > 0) && (
            <section className="op-section event-detail-operators" {...tabPanelProps('event-section', 'banner')}>
              {/* One card: the banner's name and tag, its art beside its rate-up and returning
                  limited lineups, then a line per operator the event gives (welfare, free). Every
                  operator opens the operator preview. */}
              <div className="panel event-banner-card">
                {bannerName && <>
                  <div className="event-banner-head">
                    <h3 className="entity-title entity-title-name">{bannerTitle.title}</h3>
                    {bannerTitle.tag && <span className="event-banner-tag">[{bannerTitle.tag}]</span>}
                  </div>
                  <div className="event-banner-body">
                    {/* The frame stays when the art is not published yet, empty at the
                        same size, rather than the card closing up around it. */}
                    <div className="event-detail-banner-art-wrap">
                      {shownBannerImage && <Image src={shownBannerImage} alt={bannerName} fill sizes="(max-width: 960px) 100vw, 640px" style={{ objectFit: 'contain' }} />}
                    </div>
                    <div className="event-banner-lineups">
                      {pendingNote ? <p className="hint">{pendingNote}</p>
                        : Object.entries(splitEventBannerRates(featuredOperators)).map(([group, operators]) => operators.length > 0 && <div key={group} className="event-detail-lineup">
                          <h4>{group === 'returning' ? <>Returning limited <InfoPopover label="About returning limited operators"><p>{RETURNING_LIMITED_NOTE}</p></InfoPopover></> : 'Rate-up operators'}</h4>
                          <div className="event-detail-featured-ops">
                            {operators.map(op => <OperatorTile key={`${op.rarity}-${op.name}`} name={op.name} rarity={op.rarity} size={88} onPreview={setPreview}>
                              <span className="event-detail-featured-meta">
                                <Rarity n={op.rarity} />
                                {op.percent !== null && <><span aria-hidden="true">·</span><span className="event-detail-featured-pct">{+op.percent.toFixed(1)}%</span></>}
                              </span>
                            </OperatorTile>)}
                          </div>
                        </div>)}
                    </div>
                  </div>
                </>}
                {extraOperators.length > 0 && <ul className="event-banner-extras" aria-label="Operators the event gives">
                  {extraOperators.map(op => <li key={`${op.kind}-${op.name}`}>
                    <span className="event-banner-extra-label">{op.kind === 'welfare' ? 'Welfare operator' : 'Free operator'}</span>
                    <button type="button" className="btn-bare event-banner-extra" aria-haspopup="dialog" aria-label={`${op.name}: operator preview`}
                      onClick={() => setPreview({ name: op.name, icon: iconPathFor(op.name, op.rarity), rarity: op.rarity })}>
                      <Image src={iconPathFor(op.name, op.rarity)} alt="" width={56} height={56} className={`tier-${op.rarity}`} />
                      <span className="event-banner-extra-name">{op.name}</span>
                      <span className="event-banner-sep" aria-hidden="true" />
                      {op.rarity >= 1 && op.rarity <= 6 ? <Rarity n={op.rarity as 1 | 2 | 3 | 4 | 5 | 6} /> : <span />}
                      <span className="event-banner-sep" aria-hidden="true" />
                      <span className="event-banner-extra-how"><Words text={op.task ?? op.source} /></span>
                    </button>
                  </li>)}
                </ul>}
              </div>
              {preview && <LazyOperatorPreview key={preview.name} item={preview} onClose={closePreview} nativeModal />}
            </section>
          )}

          {activeSection === 'rewards' && (
            <section className="op-section" {...tabPanelProps('event-section', 'rewards')}>
              {rewardNote && <p className="hint event-reward-note">{rewardNote}</p>}
              <Tabs
                label="Reward store"
                id="event-store"
                className="event-rewards-tabs"
                value={activeRewardTab}
                onChange={changeRewardTab}
                options={rewardTabs}
              />
              <div {...tabPanelProps('event-store', activeRewardTab)}>
                {activeRewardTab === ALL_TAB ? (
                  summary && summary.rows.length ? <RewardSummaryCard eventName={name} summary={summary} /> : <RewardTotalsRow totals={rewardTotals} />
                ) : activeRewardTab === EXTRA_TABS.packs ? (
                  <EventPacks groups={extras.packs} />
                ) : activeRewardTab === EXTRA_TABS.furniture ? (
                  <EventFurniture sets={extras.furniture} />
                ) : activeRewardTab === EXTRA_TABS.notices ? (
                  <EventNotices notices={extras.notices} />
                ) : (
                  activeStores.length > 1
                    ? activeStores.map((store) => (
                      <div key={store.name} className="event-reward-block">
                        <h3 className="event-reward-block-title">{store.name}</h3>
                        {loginDetails[store.name]?.days.length
                          ? <EventLoginDays details={loginDetails[store.name]} />
                          : <>{loginDetails[store.name]?.description && <p className="hint">{loginDetails[store.name].description}</p>}<RewardStorePanelGrid items={store.items} /></>}
                      </div>
                    ))
                    : <RewardStorePanelGrid items={activeStores[0]?.items ?? []} />
                )}
              </div>
            </section>
          )}

          {activeSection === 'skins' && (
            <section className="op-section" {...tabPanelProps('event-section', 'skins')}>
              {globalPredicted && <p className="hint">CN outfit inventory; Global availability awaits confirmation.</p>}
              <div className="event-detail-skins">
                {skins.map((skin) => {
                  const prices = parsePrices(skin.howToObtain);
                  return (
                    <button
                      type="button"
                      key={skin.name}
                      className="btn-bare event-detail-skin-item"
                      onClick={() => setActiveSkin(skin)}
                    >
                      {skin.image && (
                        <Image src={skin.image} alt={skin.name} width={120} height={160} style={{ objectFit: 'cover' }} />
                      )}
                      <span>{skin.model ? `${skin.model} - ${skin.name}` : skin.name}</span>
                      {prices.length > 0 ? (
                        <span className="hint">
                          <PriceDisplay prices={prices} />
                        </span>
                      ) : skin.howToObtain ? (
                        <span className="hint">{skin.howToObtain}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {activeSection === 'news' && (
            <section className="op-section" {...tabPanelProps('event-section', 'news')}>
              <EventNews news={news} board={board} />
            </section>
          )}

          {activeSection === 'pvs' && (
            <section className="op-section" {...tabPanelProps('event-section', 'pvs')}>
              <EventVideos videos={videos} run={isRerun(name) ? 'rerun' : 'launch'} />
            </section>
          )}

        </div>
      </main>

      {activeSkin && (() => {
        const activePrices = parsePrices(activeSkin.howToObtain);
        return (
          <div className="modal-overlay" onClick={() => setActiveSkin(null)}>
            <div className="modal-box skin-modal" onClick={(e) => e.stopPropagation()}>
              <button type="button" className="back-btn" onClick={() => setActiveSkin(null)}>
                ‹ Back
              </button>
              <div className="skin-modal-image-wrap-full">
                {activeSkin.image && (
                  <button
                    type="button"
                    onClick={() => setZooming(true)}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'zoom-in', display: 'block', width: '100%' }}
                    aria-label={`Zoom in on ${activeSkin.name}`}
                  >
                    <Image
                      src={activeSkin.image}
                      alt={activeSkin.name}
                      width={1600}
                      height={900}
                      style={{ maxWidth: '100%', maxHeight: '60vh', width: 'auto', height: 'auto', objectFit: 'contain' }}
                    />
                  </button>
                )}
              </div>
              <div className="skin-modal-info">
                <div className="eyebrow">
                  {activeSkin.series}
                  {activeSkin.code ? ` · ${activeSkin.code}` : ''}
                </div>
                <h2>{activeSkin.model ? `${activeSkin.model} - ${activeSkin.name}` : activeSkin.name}</h2>
                {activeSkin.illustrator && <p className="hint">Illustrator: {activeSkin.illustrator}</p>}
                {activeSkin.description && <p style={{ marginTop: 10 }}>{activeSkin.description}</p>}
                {activeSkin.release && (
                  <p className="hint" style={{ marginTop: 10 }}>
                    Release: {activeSkin.release}
                  </p>
                )}
                {activePrices.length > 0 && (
                  <p className="hint">
                    Price: <PriceDisplay prices={activePrices} />
                  </p>
                )}
                {activeSkin.howToObtain && <p className="hint">How to obtain: {activeSkin.howToObtain}</p>}
              </div>
              <div className="modal-actions">
                <Link prefetch={false} href="/skins" className="ghost">
                  View all skins
                </Link>
                <button type="button" className="primary" onClick={() => setActiveSkin(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Animated art is offered on /skins and the operator pages, which carry its pointers. */}
      {zooming && activeSkin?.image && (
        <SkinZoomOverlay image={activeSkin.image} name={activeSkin.name} dynamic={null} onClose={() => setZooming(false)} />
      )}
    </RewardDetailsProvider>
  );
}

/* Every event on the calendar has a page, past ones included. The set used to be the
   events ongoing or upcoming when the content was exported, so a release published
   after an event ended dropped its page and every link to it hit a 404 while the
   record was still there. Only a record that is gone now leaves no page. */
export const getStaticPaths: GetStaticPaths = async () => {
  const listings = [...getEventCalendar(), ...(loadAllEventYears() as ScheduleEvent[]).flatMap(event => { const listing = permanentEventListing(scheduleModeRelease(event, PREDICTED_GAP_DAYS)); return listing ? [listing] : []; })];
  return {
    paths: listings.map((e) => ({ params: { slug: e.name } })),
    fallback: 'blocking',
  };
};

/** A page from a release compiled before the Operators tab has no welfare or reward operators:
 *  the welfare ones are the Reward Tracker's published rows linked to this page (the same rows
 *  the page's own compile reads), the reward ones its own reward lists'. A release compiled by
 *  this code carries both, and they are kept. */
async function withEventOperators(props: Props): Promise<Props> {
  let welfareOperators = props.welfareOperators;
  if (!welfareOperators) {
    const tracker = await readPublishedContentPageProps<{ freeRewards?: FreeReward[] }>('/free-op').catch(() => null);
    // Rows from before welfare rows carried their page are linked by their event's title, as the
    // Reward Tracker links them (withWelfareEventLinks), against this page's event.
    welfareOperators = eventWelfareOperators(withWelfareEventLinks(tracker?.freeRewards ?? [], [{ name: props.name }]), `/events/${encodeURIComponent(props.name)}`);
  }
  return { ...props, welfareOperators, rewardOperators: props.rewardOperators ?? eventRewardOperators(props.rewardStores, welfareOperators) };
}

function withNewsArt(props: Props): Props {
  if (!props.extras) return props;
  // A release from before the servers were told apart: its items are Global's, each with its art.
  return { ...props, extras: { ...props.extras, board: (props.extras.board ?? []).map((item) => ({ ...item, server: item.server ?? 'en', name: item.name ?? null, image: item.image ?? null })),
    news: (props.extras.news ?? []).map((section) => ({ ...section, art: section.art ?? [], postArt: section.postArt ?? null })) } };
}

/** The page's regional table cut to its own event and banner (lib/time/regional.ts). */
function withRegionalSlice<T extends Props>(props: T): T {
  const tables = (props as T & { __contentTables?: Record<string, unknown> }).__contentTables;
  const table = tables?.['regional-schedules'] as RegionalSchedules | undefined;
  if (!tables || !table?.servers) return props;
  return { ...props, __contentTables: { ...tables, 'regional-schedules': regionalScheduleSlice(table, { events: [props.name], banners: props.bannerName ? [props.bannerName] : [] }) } };
}

export const getStaticProps: GetStaticProps<Props> = withContentPage<Props>("/events/[slug]", async ({ params }) => {
  const name = params?.slug as string;
  const listings = [...getEventCalendar(), ...(loadAllEventYears() as ScheduleEvent[]).flatMap(event => { const listing = permanentEventListing(scheduleModeRelease(event, PREDICTED_GAP_DAYS)); return listing ? [listing] : []; })];
  const event = listings.find((e) => e.name === name);
  if (!event) return { notFound: true };

  const banner = getBannerForEvent(event.name, event.isPredicted ? null : event.dateRange, getAllHeadhuntingBanners());
  const featuredOperators = banner ? getFeaturedOperatorRates(banner) : [];
  const free = (await import('@/data/free-rewards.json')).default as unknown as { rewards: FreeReward[]; beginnerRewards?: FreeReward[] };
  const welfareOperators = eventWelfareOperators(withWelfareEventLinks(allFreeRewards(free), listings), `/events/${encodeURIComponent(event.name)}`);

  const allSkins = getAllSkins();
  const skins = eventSkins(event.name, allSkins, listings.map((e) => e.name), { confirmed, rotations });

  const cgImages = getEventCgImages(event.name);
  const images = cgImages.length > 0 ? cgImages : event.poster ? [event.poster] : [];
  const artAspect = cgImages.length > 0 ? CG_ASPECT : POSTER_ASPECT;

  const skinImageByName = new Map(allSkins.filter((s) => s.image).map((s) => [s.name, s.image as string]));
  const skinNameById = new Map(allSkins.filter((s) => s.skinId && s.name).map((s) => [s.skinId as string, s.name]));
  const eventRewards = (await import('@/data/event-rewards.json')).default as EventRewardsFile;
  const videos = ((await import('@/data/event-videos.json')).default as EventVideosFile).events[event.name] ?? [];
  // The store's Chinese item names in English, where the Global tables have them.
  const storeNames = eventRewards.storeNames ?? {};
  const originalEntry = eventRewards.events[event.name];
  const announced = announcedRewards(event.name, originalEntry?.groups ?? []);
  const rewardEntry = originalEntry ? { ...originalEntry, groups: announced.groups } : { groups: announced.groups };

  // A rerun's store is its own (tokens for the operator, other stock), so it is never filled in
  // from the original run's: only the missions, first clears and furniture a rerun repeats are.
  // The store as the wiki lists it now (data/event-stores.json, refreshed by the event-stores
  // stage; a rerun's from its /Rerun page), else the event record's one-off wiki import.
  const wikiStores = ((await import('@/data/event-stores.json')).default as EventStoresFile).events[event.name]?.stores;
  const rawStores: EventRewardBlock[] = wikiStores?.length
    ? wikiStoreBlocks(wikiStores)
    : getEventRewards(event.name).map((store) => ({ ...store, items: store.items.map((item) => ({ ...item, name: storeNames[item.name] ?? item.name })) }));
  const fromOriginal = !!rewardEntry?.inheritsFrom && (rewardEntry.groups ?? []).some((g) => g.inherited);
  const fromCn = rewardEntry?.region === 'CN' || (rewardEntry?.groups ?? []).some((g) => g.region === 'CN');
  const rewardNote = fromOriginal
    ? `Missions, first clears and furniture are the original run's (${eventTitle(rewardEntry!.inheritsFrom!)}) until this rerun's own are in the game data: a rerun repeats them. Its store is its own. First-clear rewards are once per account: a stage cleared before gives none again.`
    : fromCn
      ? 'Rewards marked CN come from this run’s CN game data. Global dates and rewards await confirmation; first clears remain once per account.'
      : isRerun(event.name) && (rewardEntry?.groups ?? []).some((g) => g.kind === 'first-clear')
        ? 'First-clear rewards are once per account: a stage cleared in the original run gives none in the rerun.'
        : null;
  // The furniture this event names, by name: its rewards' and its set's pieces, each with its
  // game id. A store row (the wiki's, a name only) finds its piece's icon through it; two
  // events' "Duel Trophy" are different pieces, so the name is looked up in this event alone.
  const furnitureIds = new Map<string, string>();
  for (const group of rewardEntry?.groups ?? []) {
    for (const item of group.items) if (item.kind === 'furniture' && /^furni_/.test(item.id)) furnitureIds.set(furnitureKey(item.name), item.id);
    for (const piece of group.pieces ?? []) furnitureIds.set(furnitureKey(piece.name), piece.id);
  }
  const rewardStores: ResolvedRewardStore[] = rawStores.map((store) => ({
    type: store.type,
    name: store.name,
    items: store.items.map((item) => ({
      name: item.name,
      // Not every reward item has all three of these -- a Login Event
      // or Free Gifts entry may have no price at all, and getStaticProps
      // fails outright (JSON can't serialize `undefined`) if any of
      // these come through as-is from source data that's missing the
      // field, rather than genuinely being null. Coercing here once,
      // rather than trusting the raw shape, is what actually fixes
      // that -- not just narrowing the type.
      quantity: item.reward_quantity ?? 1,
      price: item.price ?? item.price_cork_stoppers ?? null,
      currency: store.currency || '',
      stock: item.stock ?? '1',
      // Null while the image repository has not published the icon: the row keeps its
      // box without a broken image, and the release quarantines it (rewardIconPath).
      iconPath: rewardIconPath({ ...item, id: item.type === 'furniture' ? furnitureIds.get(furnitureKey(item.name)) ?? null : null }, (skinName) => findSkinIconPath(skinName) || skinImageByName.get(skinName) || null, publicFileExists),
    })),
  }));
  // The rewards the game tables list beyond the store: sign-in events, gifts, missions and
  // first clears (data/event-rewards.json), as blocks beside it.
  const tableRewards = rewardEntry?.groups ?? [];
  // The roster, read once for an event with any reward: the table rewards' operator icons, and
  // the reward card telling an operator from an item by name.
  const roster = tableRewards.length || rawStores.some((store) => store.items.length) ? getAllOperators() : [];
  const tableIcon = (item: import('@/lib/events/tableRewards').TableRewardItem) => {
    if (item.kind === 'operator') {
      const op = roster.find((o) => o.name.toLowerCase() === item.name.toLowerCase());
      return op ? getOperatorIconPath(op) : null;
    }
    // A daily free roll is a headhunting roll: the permit's picture.
    if (item.kind === 'free-roll') return rewardIconPath({ name: 'Headhunting Permit', type: 'material', id: null }, () => null, publicFileExists);
    return rewardIconPath(
      { name: item.name, iconName: item.iconName, type: item.kind === 'outfit' ? 'skin' : 'material', id: item.id ?? null },
      // By the skin id first: a CN reward names its outfit in Chinese ("阿罗玛 / 舒心野趣"),
      // and the icon is under the English name the outfit record gives that id.
      (skinName) => findSkinIconPath((item.id && skinNameById.get(item.id)) || (skinName.split(' / ').pop() ?? skinName)) || null,
      publicFileExists,
    );
  };
  rewardStores.push(...tableRewardStores(tableRewards, tableIcon));

  const rewardOperators = eventRewardOperators(rewardStores, welfareOperators);

  const catalogue = await loadMaterialCatalogue();
  const materialOrder = materialOrderFor(catalogue, rewardStores.flatMap((store) => store.items.map((item) => item.name)));
  const builtExtras = eventExtras(tableRewards, (itemName) => rewardIconPath({ name: itemName, type: 'material', id: null }, () => null, publicFileExists), (packName) => publishedArt((packArt as Record<string, string>)[packName]), publicFileExists);
  /* The furniture set as a checklist: each piece with where this event gives it (its missions,
     its sign-in, its store and the price there), else how the game says it is obtained (the
     furniture store). Its pieces are in the other tabs too; this says which of the set they are. */
  const extras = {
    ...builtExtras,
    furniture: builtExtras.furniture.map((set) => ({ ...set, pieces: set.pieces.map((piece) => ({ ...piece, obtain: furniturePieceSource(piece.name, rewardStores) ?? piece.obtain })) })),
  };
  return {
    props: {
      name: event.name,
      mode: modeDetails(event.name),
      poster: event.poster,
      images,
      artAspect,
      dateRange: event.dateRange,
      isPredicted: event.isPredicted,
      bannerName: banner?.name || null,
      bannerImage: banner?.banner_image || null,
      lineupPending: banner && isLineupPending(banner) ? lineupPendingNote(banner) : null,
      featuredOperators,
      welfareOperators,
      rewardOperators,
      skins,
      rewardStores,
      extras,
      loginDetails: Object.fromEntries(tableRewards.filter(g => g.kind === 'login' && (g.daily?.length || g.description)).map(g => [g.title, { description: g.description ?? null, days: (g.daily ?? []).map(day => day.map(item => ({ name: item.name, count: item.count, iconPath: tableIcon(item) }))) }])),
      tickets: Object.fromEntries(Object.entries(announced.tickets).map(([ticketName, ticket]) => [ticketName, {
        ...ticket,
        operators: ticket.operators.map(operatorName => {
          const nameKey = (name: string) => name.normalize('NFKD').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
          const op = roster.find(o => [o.name, ...(o.aliases ?? [])].some(name => nameKey(name) === nameKey(operatorName)));
          if (!op) throw new Error(`Unknown selector operator: ${operatorName}`);
          return { name: op.name, iconPath: getOperatorIconPath(op), href: operatorHref(op.name, null) };
        }),
      }])),
      rewardNote,
      summary: rewardSummary(rewardStores, {
        groups: catalogue.groups,
        operators: new Set(roster.map((op) => op.name)),
        outfits: new Set([...rawStores.flatMap((s) => s.items.filter((i) => i.type === 'skin').map((i) => i.name)), ...tableRewards.flatMap((g) => g.items.filter((i) => i.kind === 'outfit').map((i) => i.name))]),
        furniture: new Set([...extras.furniture.flatMap((set) => set.pieces.map((p) => p.name)), ...(eventRewards.storeFurniture ?? []).map((n) => storeNames[n] ?? n), ...rawStores.flatMap((s) => s.items.filter((i) => i.type === 'furniture').map((i) => i.name))]),
        kinds: new Map(tableRewards.flatMap((g) => g.items.map((i) => [i.name, i.kind] as [string, string]))),
      }, materialOrder),
      materialOrder,
      videos,
    },
  };
}, {
  // A release exported before reward totals carried their order: this deployment's catalogue fills it in.
  // One exported before the News tab's official art has none: no board items, no pictures.
  // Each page keeps only its own event's and banner's regional windows (regionalScheduleSlice).
  finalize: async (props) => {
    const ordered = await withMaterialOrder(props, (page) => page.rewardStores.flatMap((store) => store.items.map((item) => item.name)));
    return withRegionalSlice(withNewsArt(await withEventOperators({ ...ordered, mode: modeDetails(props.name) ?? props.mode ?? null })));
  },
});
