import { withContentPage } from '@/lib/content/server';
import { useEffect, useRef, useState } from 'react';
import { GetStaticPaths, GetStaticProps } from 'next';
import Image from '@/components/content/ContentImage';
import Link from 'next/link';
import { getEventCalendar } from '@/lib/home/frontPageContent';
import { getBannerForEvent } from '@/lib/gacha/headhuntingBanners';
import { getAllHeadhuntingBanners } from '@/lib/gacha/headhuntingBannerData';
import { isLineupPending, lineupPendingNote, RETURNING_LIMITED_NOTE } from '@/lib/gacha/bannerLineup';
import { getFeaturedOperatorRates, splitEventBannerRates, FeaturedOperatorRate } from '@/lib/gacha/eventBannerRates';
import { getAllSkins } from '@/lib/skins/skins';
import { getSkinsForEvent } from '@/lib/schedule/scheduleSkinMatch';
import { Skin } from '@/lib/skins/skinTypes';
import { parsePrices } from '@/lib/skins/skinPrice';
import PriceDisplay from '@/components/ui/PriceDisplay';
import { getEventCgImages } from '@/lib/events/eventCg';
import { getEventRewards, wikiStoreBlocks, type EventRewardBlock, type EventStoresFile } from '@/lib/events/loadEventsData';
import { rewardIconPath } from '@/lib/events/rewardIcons';
import { publicFileExists } from '@/lib/assets/publicAssets';
import { findSkinIconPath } from '@/lib/skins/skinIconLookup';
import { materialOrderFor } from '@/lib/farming/materialSortOrder';
import { checkMaterialCatalogue } from '@/lib/farming/materialCatalogue.mjs';
import { withMaterialOrder } from '@/lib/content/materialOrderFallback';
import SkinZoomOverlay from '@/components/skins/SkinZoomOverlay';
import PageHeader from '@/components/ui/PageHeader';
import Tabs, { tabPanelProps } from '@/components/ui/Tabs';
import { useSwitchHold } from '@/components/ui/useSwitchHold';
import Rarity from '@/components/ui/Rarity';
import { computeRewardTotals, type ResolvedRewardItem, type ResolvedRewardStore, type RewardTotal } from '@/lib/events/rewardTotals';
import { eventExtras, furniturePieceSource, NO_EXTRAS, tableRewardStores, type EventExtras, type EventRewardsFile } from '@/lib/events/tableRewards';
import { ALL_TAB, eventLink, EXTRA_TABS, readEventLink, rewardTabsFor, shownRewardTab } from '@/lib/events/rewardTabs';
import { eventTitle, isRerun } from '@/lib/events/eventName.mjs';
import { EventFurniture, EventNotices, EventPacks } from '@/components/events/EventExtras';
import { RewardSummaryCard } from '@/components/events/RewardSummary';
import { RewardTile } from '@/components/events/RewardTile';
import { rewardSummary, type RewardSummary } from '@/lib/events/rewardSummary';
import { getAllOperators } from '@/lib/operators/operators';
import { getOperatorIconPath } from '@/lib/operators/operatorIcon';

const CAROUSEL_INTERVAL_MS = 8000;
const PAUSE_AFTER_CLICK_MS = 30000;

interface Props {
  name: string;
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
  skins: Skin[];
  rewardStores: ResolvedRewardStore[];
  /** Packs, furniture sets and announced gifts. Absent from a release compiled before them. */
  extras?: EventExtras;
  /** The free rewards as the shareable card (All). Absent from a release compiled before it. */
  summary?: RewardSummary | null;
  /** Where the rewards come from when not this event's own Global data (a rerun's original, CN). */
  rewardNote?: string | null;
  /** The release's material catalogue order (data/material-catalogue.json), for the reward
   *  names this event lists: what the reward totals sort by. */
  materialOrder: string[];
}

type SectionKey = 'banner' | 'rewards' | 'skins';

/* A section with nothing linked is left out. Packs and Miscellaneous were sections
   once, two tabs that only ever said "Coming soon", which pushed the row onto a second
   line at 390; an event's packs are a tab inside Rewards now (rewardTabsFor), beside
   its announced gifts and furniture. */
const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: 'banner', label: 'Banner' },
  { key: 'rewards', label: 'Rewards' },
  { key: 'skins', label: 'Skins' },
];

/** The page's address with this hash, without a scroll or a history entry. */
function setLink(hash: string) {
  if (typeof window === 'undefined') return;
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}#${hash}`);
}

/** The poster's shape: the game's event banner art is 1024x328. */
const POSTER_ASPECT = '1024 / 328';
const CG_ASPECT = '16 / 9';

function iconPathFor(name: string, rarity: 6 | 5 | 4): string {
  const folder = rarity === 6 ? 'six-star-icons' : rarity === 5 ? 'five-star-icons' : 'four-star-icons';
  return `/${folder}/${name} - Base.webp`;
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
        <div key={`${item.name}-${i}`} className="event-reward-panel" title={item.name}>
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
        </div>
      ))}
    </div>
  );
}

export default function EventDetailPage({
  name,
  images,
  artAspect,
  dateRange,
  isPredicted,
  bannerName,
  bannerImage,
  lineupPending,
  featuredOperators,
  skins,
  rewardStores,
  materialOrder,
  extras = NO_EXTRAS,
  summary = null,
  rewardNote = null,
}: Props) {
  const hasExtras = extras.packs.length + extras.furniture.length + extras.notices.length > 0;
  const sections = SECTIONS.filter((section) => (
    section.key === 'banner' ? !!bannerName : section.key === 'rewards' ? rewardStores.length > 0 || hasExtras : skins.length > 0
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
  const activeImage = images[Math.min(imgIndex, images.length - 1)];

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
  const [zooming, setZooming] = useState(false);
  useEffect(() => {
    if (!activeSkin) setZooming(false);
  }, [activeSkin]);

  useEffect(() => {
    if (paused || images.length <= 1) return;
    const interval = setInterval(() => {
      setImgIndex((i) => (i + 1) % images.length);
    }, CAROUSEL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [paused, images.length]);

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
    <>
      <PageHeader
        back={{ href: '/schedule', label: 'Events' }}
        eyebrow={<>Rhodes Island // <Link prefetch={false} href="/schedule">Events</Link></>}
        title={name}
        sub={`${isPredicted ? 'Predicted release: ' : 'Release: '}${dateRange}`}
      />

      <main className="event-detail-layout">
        {/* The event's art across the top, the sections below it (2026-10-04: a column of art
            beside the sections left most of the page's left side empty). At most 420px tall, so
            a 16:9 CG set does not fill the screen; a poster is full width well under that. */}
        <div className="event-detail-carousel" style={{ maxWidth: `calc(420px * ${artAspect})` }}>
          <div className="event-detail-image-wrap" style={{ aspectRatio: artAspect }}>
            {activeImage && <Image src={activeImage} alt={name} fill sizes="(max-width: 1240px) 100vw, 1200px" style={{ objectFit: 'cover' }} />}
          </div>
          {images.length > 1 && (
            <div className="event-detail-carousel-dots">
              {images.map((_, i) => (
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
          {sections.length === 0 && <p className="hint">No banner, reward store or skins are linked to this event yet.</p>}

          {activeSection === 'banner' && bannerName && (
            <section className="op-section" {...tabPanelProps('event-section', 'banner')}>
              {/* The frame stays when the art is not published yet, empty at the
                  same size, rather than the section closing up around it. */}
              <div className="event-detail-banner-art-wrap">
                {bannerImage && <Image src={bannerImage} alt={bannerName} fill sizes="600px" style={{ objectFit: 'contain' }} />}
              </div>
              <p className="hint">{bannerName}</p>
              {pendingNote && <p className="hint">{pendingNote}</p>}
              {!pendingNote && Object.entries(splitEventBannerRates(featuredOperators)).map(([group, operators]) => operators.length > 0 && <div key={group}>
                <h3>{group === 'featured' ? 'Featured operators' : 'Returning limited operators'}</h3>
                {group === 'returning' && <p className="hint">{RETURNING_LIMITED_NOTE}</p>}
                <div className="event-detail-featured-ops">
                  {operators.map(op => <div key={`${op.rarity}-${op.name}`} className="event-detail-featured-op">
                    <Image src={iconPathFor(op.name, op.rarity)} alt={op.name} width={52} height={52} className={`tier-${op.rarity}`} />
                    <span>{op.name}</span>
                    <span className="event-detail-featured-meta">
                      <Rarity n={op.rarity} />
                      {op.percent !== null && <span className="event-detail-featured-pct">{op.percent.toFixed(1)}%</span>}
                    </span>
                  </div>)}
                </div>
              </div>)}
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
                        <RewardStorePanelGrid items={store.items} />
                      </div>
                    ))
                    : <RewardStorePanelGrid items={activeStores[0]?.items ?? []} />
                )}
              </div>
            </section>
          )}

          {activeSection === 'skins' && (
            <section className="op-section" {...tabPanelProps('event-section', 'skins')}>
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
    </>
  );
}

/* Every event on the calendar has a page, past ones included. The set used to be the
   events ongoing or upcoming when the content was exported, so a release published
   after an event ended dropped its page and every link to it hit a 404 while the
   record was still there. Only a record that is gone now leaves no page. */
export const getStaticPaths: GetStaticPaths = async () => {
  const listings = getEventCalendar();
  return {
    paths: listings.map((e) => ({ params: { slug: e.name } })),
    fallback: 'blocking',
  };
};

export const getStaticProps: GetStaticProps<Props> = withContentPage<Props>("/events/[slug]", async ({ params }) => {
  const name = params?.slug as string;
  const listings = getEventCalendar();
  const event = listings.find((e) => e.name === name);
  if (!event) return { notFound: true };

  const banner = getBannerForEvent(event.name, event.isPredicted ? null : event.dateRange, getAllHeadhuntingBanners());
  const featuredOperators = banner ? getFeaturedOperatorRates(banner) : [];

  const allSkins = getAllSkins();
  const skins = getSkinsForEvent(event.name, allSkins, listings.map((e) => e.name));

  const cgImages = getEventCgImages(event.name);
  const images = cgImages.length > 0 ? cgImages : event.poster ? [event.poster] : [];
  const artAspect = cgImages.length > 0 ? CG_ASPECT : POSTER_ASPECT;

  const skinImageByName = new Map(allSkins.filter((s) => s.image).map((s) => [s.name, s.image as string]));
  const eventRewards = (await import('@/data/event-rewards.json')).default as EventRewardsFile;
  // The store's Chinese item names in English, where the Global tables have them.
  const storeNames = eventRewards.storeNames ?? {};
  const rewardEntry = eventRewards.events[event.name];
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
      ? 'From the CN release: Global has not had this event yet, and its rewards may differ there. Items Global does not have yet keep their CN names.'
      : isRerun(event.name) && (rewardEntry?.groups ?? []).some((g) => g.kind === 'first-clear')
        ? 'First-clear rewards are once per account: a stage cleared in the original run gives none in the rerun.'
        : null;
  // The furniture this event names, by name: its rewards' and its set's pieces, each with its
  // game id. A store row (the wiki's, a name only) finds its piece's icon through it; two
  // events' "Duel Trophy" are different pieces, so the name is looked up in this event alone.
  const furnitureIds = new Map<string, string>();
  for (const group of rewardEntry?.groups ?? []) {
    for (const item of group.items) if (item.kind === 'furniture' && /^furni_/.test(item.id)) furnitureIds.set(item.name, item.id);
    for (const piece of group.pieces ?? []) furnitureIds.set(piece.name, piece.id);
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
      iconPath: rewardIconPath({ ...item, id: item.type === 'furniture' ? furnitureIds.get(item.name) ?? null : null }, (skinName) => findSkinIconPath(skinName) || skinImageByName.get(skinName) || null, publicFileExists),
    })),
  }));
  // The rewards the game tables list beyond the store: sign-in events, gifts, missions and
  // first clears (data/event-rewards.json), as blocks beside it.
  const tableRewards = rewardEntry?.groups ?? [];
  // The roster, read once for an event with any reward: the table rewards' operator icons, and
  // the reward card telling an operator from an item by name.
  const roster = tableRewards.length || rawStores.some((store) => store.items.length) ? getAllOperators() : [];
  rewardStores.push(...tableRewardStores(tableRewards, (item) => {
    if (item.kind === 'operator') {
      const op = roster.find((o) => o.name === item.name);
      return op ? getOperatorIconPath(op) : null;
    }
    // A daily free roll is a headhunting roll: the permit's picture.
    if (item.kind === 'free-roll') return rewardIconPath({ name: 'Headhunting Permit', type: 'material', id: null }, () => null, publicFileExists);
    return rewardIconPath(
      { name: item.name, type: item.kind === 'outfit' ? 'skin' : 'material', id: item.id ?? null },
      (skinName) => findSkinIconPath(skinName.split(' / ').pop() ?? skinName) || null,
      publicFileExists,
    );
  }));

  const catalogue = checkMaterialCatalogue((await import('@/data/material-catalogue.json')).default);
  const materialOrder = materialOrderFor(catalogue, rewardStores.flatMap((store) => store.items.map((item) => item.name)));
  const builtExtras = eventExtras(tableRewards, (itemName) => rewardIconPath({ name: itemName, type: 'material', id: null }, () => null, publicFileExists));
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
      poster: event.poster,
      images,
      artAspect,
      dateRange: event.dateRange,
      isPredicted: event.isPredicted,
      bannerName: banner?.name || null,
      bannerImage: banner?.banner_image || null,
      lineupPending: banner && isLineupPending(banner) ? lineupPendingNote(banner) : null,
      featuredOperators,
      skins,
      rewardStores,
      extras,
      rewardNote,
      summary: rewardSummary(rewardStores, {
        groups: catalogue.groups,
        operators: new Set(roster.map((op) => op.name)),
        outfits: new Set([...rawStores.flatMap((s) => s.items.filter((i) => i.type === 'skin').map((i) => i.name)), ...tableRewards.flatMap((g) => g.items.filter((i) => i.kind === 'outfit').map((i) => i.name))]),
        furniture: new Set([...extras.furniture.flatMap((set) => set.pieces.map((p) => p.name)), ...(eventRewards.storeFurniture ?? []).map((n) => storeNames[n] ?? n), ...rawStores.flatMap((s) => s.items.filter((i) => i.type === 'furniture').map((i) => i.name))]),
        kinds: new Map(tableRewards.flatMap((g) => g.items.map((i) => [i.name, i.kind] as [string, string]))),
      }, materialOrder),
      materialOrder,
    },
  };
}, {
  // A release exported before reward totals carried their order: this deployment's catalogue fills it in.
  finalize: (props) => withMaterialOrder(props, (page) => page.rewardStores.flatMap((store) => store.items.map((item) => item.name))),
});