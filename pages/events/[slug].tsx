import { withContentPage } from '@/lib/content/server';
import { useEffect, useRef, useState } from 'react';
import { GetStaticPaths, GetStaticProps } from 'next';
import Image from '@/components/content/ContentImage';
import Link from 'next/link';
import { getEventCalendar } from '@/lib/home/frontPageContent';
import { getBannerForEvent } from '@/lib/gacha/headhuntingBanners';
import { getAllHeadhuntingBanners } from '@/lib/gacha/headhuntingBannerData';
import { isLineupPending, LINEUP_PENDING_NOTE, RETURNING_LIMITED_NOTE } from '@/lib/gacha/bannerLineup';
import { getFeaturedOperatorRates, splitEventBannerRates, FeaturedOperatorRate } from '@/lib/gacha/eventBannerRates';
import { getAllSkins } from '@/lib/skins/skins';
import { getSkinsForEvent } from '@/lib/schedule/scheduleSkinMatch';
import { Skin } from '@/lib/skins/skinTypes';
import { parsePrices } from '@/lib/skins/skinPrice';
import PriceDisplay from '@/components/ui/PriceDisplay';
import { getEventCgImages } from '@/lib/events/eventCg';
import { getEventRewards } from '@/lib/events/loadEventsData';
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
  /** The linked banner is out before its lineup is known (lineupSource 'pending'). */
  lineupPending: boolean;
  featuredOperators: FeaturedOperatorRate[];
  skins: Skin[];
  rewardStores: ResolvedRewardStore[];
  /** The release's material catalogue order (data/material-catalogue.json), for the reward
   *  names this event lists: what the reward totals sort by. */
  materialOrder: string[];
}

type SectionKey = 'banner' | 'rewards' | 'skins';

/* Packs and Miscellaneous are gone until there is something to put in them: two
   tabs that only ever said "Coming soon" pushed the row onto a second line at 390
   and were the tallest-to-shortest switch on the page. A section with nothing
   linked is left out the same way. */
const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: 'banner', label: 'Banner' },
  { key: 'rewards', label: 'Rewards' },
  { key: 'skins', label: 'Skins' },
];

/** The poster's shape: the game's event banner art is 1024x328. */
const POSTER_ASPECT = '1024 / 328';
const CG_ASPECT = '16 / 9';

function iconPathFor(name: string, rarity: 6 | 5 | 4): string {
  const folder = rarity === 6 ? 'six-star-icons' : rarity === 5 ? 'five-star-icons' : 'four-star-icons';
  return `/${folder}/${name} - Base.webp`;
}

function RewardTotalsRow({ totals }: { totals: RewardTotal[] }) {
  if (totals.length === 0) return <p className="hint">Nothing here.</p>;
  return (
    <div className="event-reward-totals">
      {totals.map((t, i) => (
        <span key={i} className="event-reward-total">
          {/* No icon published yet: the frame holds its place. */}
          <span className="event-reward-total-icon">
            {t.iconPath && <Image src={t.iconPath} alt="" width={40} height={40} />}
          </span>
          {/* The name on the tile, not only in a tooltip a phone cannot reach. */}
          <span className="event-reward-total-name">{t.name}</span>
          <b>×{t.total.toLocaleString('en-US')}</b>
        </span>
      ))}
    </div>
  );
}

/** A specific store's own listing -- real per-purchase price and
 * stock, laid out as a 3-row horizontally-scrolling panel grid. The
 * reward_quantity (how many of the item one purchase actually grants)
 * is shown as a small badge on the icon's bottom-right corner, rather
 * than as inline text next to the name. */
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
}: Props) {
  const sections = SECTIONS.filter((section) => (
    section.key === 'banner' ? !!bannerName : section.key === 'rewards' ? rewardStores.length > 0 : skins.length > 0
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
  }
  const [imgIndex, setImgIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const resumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeImage = images[Math.min(imgIndex, images.length - 1)];

  const rewardTypes = Array.from(new Set(rewardStores.map((s) => s.type)));
  const [activeRewardTab, setActiveRewardTab] = useState<string>('all');
  /* A store is a long grid and All is one row of totals: the same hold as a section
     change, taken in the handler, so the switch cannot shorten the page under the
     reader. */
  function changeRewardTab(next: string) {
    hold.capture();
    setActiveRewardTab(next);
  }
  const rewardTotals = computeRewardTotals(rewardStores, materialOrder);
  const activeStoreItems = rewardStores.filter((s) => s.type === activeRewardTab).flatMap((s) => s.items);

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
        eyebrow={<>Rhodes Island // <Link prefetch={false} href="/schedule">Events</Link></>}
        title={name}
        sub={`${isPredicted ? 'Predicted release: ' : 'Release: '}${dateRange}`}
      />

      <main className="event-detail-layout">
        <div className="event-detail-carousel">
          {/* The event's art, once: it used to be here AND as a poster in the header. */}
          <div className="event-detail-image-wrap" style={{ aspectRatio: artAspect }}>
            {activeImage && <Image src={activeImage} alt={name} fill sizes="600px" style={{ objectFit: 'cover' }} />}
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
              {lineupPending && <p className="hint">{LINEUP_PENDING_NOTE}</p>}
              {!lineupPending && Object.entries(splitEventBannerRates(featuredOperators)).map(([group, operators]) => operators.length > 0 && <div key={group}>
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
              <Tabs
                label="Reward store"
                id="event-store"
                className="event-rewards-tabs"
                value={activeRewardTab}
                onChange={changeRewardTab}
                options={[{ value: 'all', label: 'All' }, ...rewardTypes.map((t) => ({ value: t, label: t }))]}
              />
              <div {...tabPanelProps('event-store', activeRewardTab)}>
                {activeRewardTab === 'all' ? (
                  <RewardTotalsRow totals={rewardTotals} />
                ) : (
                  <RewardStorePanelGrid items={activeStoreItems} />
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
              <button type="button" className="modal-back-btn" onClick={() => setActiveSkin(null)}>
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

      {zooming && activeSkin?.image && (
        <SkinZoomOverlay image={activeSkin.image} name={activeSkin.name} onClose={() => setZooming(false)} />
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
  const rawStores = getEventRewards(event.name);
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
      iconPath: rewardIconPath(item, (skinName) => findSkinIconPath(skinName) || skinImageByName.get(skinName) || null, publicFileExists),
    })),
  }));

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
      lineupPending: banner ? isLineupPending(banner) : false,
      featuredOperators,
      skins,
      rewardStores,
      materialOrder: materialOrderFor(
        checkMaterialCatalogue((await import('@/data/material-catalogue.json')).default),
        rewardStores.flatMap((store) => store.items.map((item) => item.name)),
      ),
    },
  };
}, {
  // A release exported before reward totals carried their order: this deployment's catalogue fills it in.
  finalize: (props) => withMaterialOrder(props, (page) => page.rewardStores.flatMap((store) => store.items.map((item) => item.name))),
});