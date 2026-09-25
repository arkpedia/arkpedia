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
import { MATERIAL_SORT_ORDER } from '@/lib/farming/materialSortOrder';
import SkinZoomOverlay from '@/components/skins/SkinZoomOverlay';

const CAROUSEL_INTERVAL_MS = 8000;
const PAUSE_AFTER_CLICK_MS = 30000;

const MATERIAL_SORT_INDEX = new Map(MATERIAL_SORT_ORDER.map((n, i) => [n, i]));
// Unlike lib/farming/materialSortOrder.ts's own sortMaterials()
// (unknowns sort AFTER known materials -- correct there, since its
// lists are pure materials and an "unknown" only ever means a genuine
// data gap), this list mixes skins in with materials. Skin names are
// never part of MATERIAL_SORT_ORDER, so they're always the
// "unknowns" here -- and per spec, skins sort ahead of everything
// else, so the priority is flipped: unknown-vs-known now puts the
// unknown (skin) first instead of last.
function sortByMaterialOrder<T extends { name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const ai = MATERIAL_SORT_INDEX.get(a.name);
    const bi = MATERIAL_SORT_INDEX.get(b.name);
    if (ai !== undefined && bi !== undefined) return ai - bi; // both known materials -- normal tier order
    if (ai === undefined && bi === undefined) return a.name.localeCompare(b.name); // both skins -- alphabetical among themselves
    if (ai === undefined) return -1; // a is a skin, b is a material -- skin first
    return 1; // b is a skin, a is a material -- skin first
  });
}

function parseRewardQuantity(q: number | string): number {
  if (typeof q === 'number') return q;
  const m = String(q).trim().match(/^(\d+(?:\.\d+)?)\s*([KkMm]?)$/);
  if (!m) return parseFloat(String(q)) || 0;
  const base = parseFloat(m[1]);
  const suffix = m[2].toLowerCase();
  if (suffix === 'k') return Math.round(base * 1000);
  if (suffix === 'm') return Math.round(base * 1000000);
  return Math.round(base);
}

interface ResolvedRewardItem {
  name: string;
  quantity: number | string;
  price: number | null;
  currency: string;
  stock: string;
  iconPath: string | null;
}

interface ResolvedRewardStore {
  type: string;
  name: string;
  items: ResolvedRewardItem[];
}

interface RewardTotal {
  name: string;
  iconPath: string | null;
  total: number;
}

/** Total obtainable of each material across every FINITE-stock reward
 * listing combined -- reward_quantity x stock, summed across however
 * many stores/listings offer that same material. Unlimited-stock
 * listings are excluded from this entirely: not added to the total,
 * and not allowed to override it either, so a material with both a
 * finite listing (e.g. 200000 LMD from one store) and a separate
 * unlimited listing still just shows the finite 200000 -- the
 * unlimited option simply isn't part of the equation. A material
 * whose ONLY listings are unlimited has nothing finite to report, so
 * it doesn't appear in "All" at all (it still shows normally under
 * its own store's tab, with the real "unlimited" stock visible
 * there). */
function computeRewardTotals(stores: ResolvedRewardStore[]): RewardTotal[] {
  const totals = new Map<string, RewardTotal>();
  for (const store of stores) {
    for (const item of store.items) {
      if (item.stock === 'unlimited') continue;
      const stockCount = parseInt(item.stock, 10) || 0;
      const addAmount = parseRewardQuantity(item.quantity) * stockCount;
      const existing = totals.get(item.name);
      const prevTotal = existing?.total ?? 0;
      totals.set(item.name, { name: item.name, iconPath: item.iconPath, total: prevTotal + addAmount });
    }
  }
  return sortByMaterialOrder(Array.from(totals.values()));
}

interface Props {
  name: string;
  /** null while the image repository has not published it (see publishedArt). */
  poster: string | null;
  images: string[];
  dateRange: string;
  isPredicted: boolean;
  bannerName: string | null;
  bannerImage: string | null;
  /** The linked banner is out before its lineup is known (lineupSource 'pending'). */
  lineupPending: boolean;
  featuredOperators: FeaturedOperatorRate[];
  skins: Skin[];
  rewardStores: ResolvedRewardStore[];
}

type SectionKey = 'banner' | 'rewards' | 'skins' | 'packs' | 'misc';

const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: 'banner', label: 'Banner' },
  { key: 'rewards', label: 'Rewards' },
  { key: 'skins', label: 'Skins' },
  { key: 'packs', label: 'Packs' },
  { key: 'misc', label: 'Miscellaneous' },
];

function iconPathFor(name: string, rarity: 6 | 5 | 4): string {
  const folder = rarity === 6 ? 'six-star-icons' : rarity === 5 ? 'five-star-icons' : 'four-star-icons';
  return `/${folder}/${name} - Base.webp`;
}

function RewardTotalsRow({ totals }: { totals: RewardTotal[] }) {
  if (totals.length === 0) return <p className="hint">Nothing here.</p>;
  return (
    <div className="op-cost-row">
      {totals.map((t, i) => (
        <span key={i} className="op-cost-item" title={t.name}>
          {/* No icon published yet: the name, or the chip would read "×1" alone. */}
          {t.iconPath ? <Image src={t.iconPath} alt={t.name} width={36} height={36} /> : t.name}
          <b>×{t.total}</b>
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
    <div className="event-rewards-scroll-grid">
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
            <span className="event-reward-panel-meta">
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
  poster,
  images,
  dateRange,
  isPredicted,
  bannerName,
  bannerImage,
  lineupPending,
  featuredOperators,
  skins,
  rewardStores,
}: Props) {
  const [activeSection, setActiveSection] = useState<SectionKey>('banner');
  const [imgIndex, setImgIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const resumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeImage = images[Math.min(imgIndex, images.length - 1)];

  const rewardTypes = Array.from(new Set(rewardStores.map((s) => s.type)));
  const [activeRewardTab, setActiveRewardTab] = useState<string>('all');
  const rewardTotals = computeRewardTotals(rewardStores);
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
      <header>
        {/* Straight to the Schedule page rather than through /events, which redirects
            there: a back link should not cost a round trip. Its default view is the
            list, which is the page this came from. */}
        <Link prefetch={false} href="/schedule" className="hint">
          ← Back to Events
        </Link>
        <div className="eyebrow">Rhodes Island // Operation Log</div>
        <div className="event-detail-header-row">
          <div>
            <h1>{name}</h1>
            <p className="sub">
              {isPredicted ? 'Predicted release: ' : 'Release: '}
              {dateRange}
            </p>
          </div>
          {poster && (
            <div className="event-detail-header-poster">
              <Image
                src={poster}
                alt={name}
                fill
                sizes="480px"
                style={{ objectFit: 'cover', objectPosition: 'top right' }}
              />
            </div>
          )}
        </div>
      </header>

      <main className="event-detail-layout">
        <div className="event-detail-carousel">
          <div className="event-detail-image-wrap">
            {activeImage && <Image src={activeImage} alt={name} fill sizes="600px" style={{ objectFit: 'contain' }} />}
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

        <div className="event-detail-right">
          <div className="op-section-tabs">
            {SECTIONS.map((s) => (
              <button
                type="button"
                key={s.key}
                className={s.key === activeSection ? 'primary' : 'ghost'}
                onClick={() => setActiveSection(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>

          {activeSection === 'banner' && (
            <section className="op-section">
              {bannerName ? (
                <>
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
                        <Image src={iconPathFor(op.name, op.rarity)} alt={op.name} width={52} height={52} />
                        <span>{op.name}</span>
                        <span className="hint">{op.percent !== null ? `${op.percent.toFixed(1)}%` : `${op.rarity}★`}</span>
                      </div>)}
                    </div>
                  </div>)}
                </>
              ) : (
                <p className="hint">No banner linked to this event.</p>
              )}
            </section>
          )}

          {activeSection === 'rewards' && (
            <section className="op-section">
              {rewardStores.length > 0 ? (
                <>
                  <div className="event-rewards-tabs">
                    <button
                      type="button"
                      className={activeRewardTab === 'all' ? 'primary' : 'ghost'}
                      onClick={() => setActiveRewardTab('all')}
                    >
                      All
                    </button>
                    {rewardTypes.map((t) => (
                      <button
                        type="button"
                        key={t}
                        className={activeRewardTab === t ? 'primary' : 'ghost'}
                        onClick={() => setActiveRewardTab(t)}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  {activeRewardTab === 'all' ? (
                    <RewardTotalsRow totals={rewardTotals} />
                  ) : (
                    <RewardStorePanelGrid items={activeStoreItems} />
                  )}
                </>
              ) : (
                <p className="hint">No reward store linked to this event.</p>
              )}
            </section>
          )}

          {activeSection === 'skins' && (
            <section className="op-section">
              {skins.length > 0 ? (
                <div className="event-detail-skins">
                  {skins.map((skin) => {
                    const prices = parsePrices(skin.howToObtain);
                    return (
                      <button
                        type="button"
                        key={skin.name}
                        className="event-detail-skin-item"
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
              ) : (
                <p className="hint">No skins linked to this event.</p>
              )}
            </section>
          )}

          {activeSection === 'packs' && (
            <section className="op-section">
              <p className="hint">Coming soon.</p>
            </section>
          )}

          {activeSection === 'misc' && (
            <section className="op-section">
              <p className="hint">Coming soon.</p>
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
      dateRange: event.dateRange,
      isPredicted: event.isPredicted,
      bannerName: banner?.name || null,
      bannerImage: banner?.banner_image || null,
      lineupPending: banner ? isLineupPending(banner) : false,
      featuredOperators,
      skins,
      rewardStores,
    },
  };
});