import { useMemo, useState, type ReactNode } from 'react';
import SkinZoomOverlay from './SkinZoomOverlay';
import LoadOnScroll from '@/components/ui/LoadOnScroll';
import SearchInput from '@/components/ui/SearchInput';
import SegmentedControl from '@/components/ui/SegmentedControl';
import OwnedFilter, { countOwned } from '@/components/account/OwnedFilter';
import { useAccount, type OwnedFilter as Owned } from '@/lib/account/accountStore';
import { ContentImg } from '@/components/content/ContentImage';
import { skinPurchasePlan, type PlannedSkin } from '@/lib/pulls/skins';
import type { SkinCollection } from '@/lib/pulls/skinCollections';
import { openSkinCollections } from '@/lib/pulls/currentPlan';

/*
 * The skin plan, by the event shops that sell each outfit (lib/pulls/skinCollections): every
 * shop open now or coming, soonest first, with its outfits to plan or unplan, and a summary of
 * what the plan costs by each shop's closing date. The Skin Planner page and the Pull
 * Planner's skin section are both this, on the one shared plan (lib/skins/skinPlan); the Pull
 * Planner adds its OP budget (`budget`).
 */

export interface SkinBudget {
  heldOP: number;
  extraOP: number;
  /** The OP the Pull Planner projects on a day. */
  forecastOP: (date: string) => number;
  extraField: ReactNode;
}

type ShopOrder = 'closing' | 'opening';
const ORDER_OPTIONS = [{ value: 'closing' as const, label: 'Closing soonest' }, { value: 'opening' as const, label: 'Opening soonest' }];
const shopName = (name: string) => name.replace(/^\[[^\]]*\]\s*/, '');

/** "closes in 5 days", "closes today", "opens in 6 days": how long a shop has, from the
 *  reader's server day (YYYY-MM-DD, inclusive of the shop's last day). */
function shopCountdown(shop: { start: string; end: string }, today: string): string {
  const days = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
  if (today < shop.start) { const n = days(today, shop.start); return n === 1 ? 'opens tomorrow' : `opens in ${n} days`; }
  const n = days(today, shop.end);
  return n <= 0 ? 'closes today' : n === 1 ? 'closes tomorrow' : `closes in ${n} days`;
}

/** Reserve the card's artwork space, but give the image a URL only near the reader. */
function SkinPlannerArt({ image }: { image: string | null }) {
  const [ready, setReady] = useState(false);
  return <span className="skin-plan-art">
    {!image ? <span className="skin-plan-noart">Artwork unavailable</span> : ready ? <ContentImg src={image} alt="" /> : <LoadOnScroll inline shown={0} total={1} onMore={() => setReady(true)} />}
  </span>;
}

export default function SkinPlanner({ catalogue, collections, today, ids, onChange, owned, budget }: {
  catalogue: PlannedSkin[];
  collections: SkinCollection[];
  /** YYYY-MM-DD, for which shops are over; null before the reader's clock is known. */
  today: string | null;
  ids: string[];
  onChange: (ids: string[]) => void;
  /** The game skin ids the imported account owns (lib/account), or null without an import. */
  owned: Set<string> | null;
  budget?: SkinBudget;
}) {
  const [viewing, setViewing] = useState<PlannedSkin | null>(null);
  const [query, setQuery] = useState('');
  const [order, setOrder] = useState<ShopOrder>('closing');
  const [fashionOnly, setFashionOnly] = useState(false);
  const [plannedOnly, setPlannedOnly] = useState(false);
  const [ownedFilter, setOwnedFilter] = useState<Owned>('all');
  // Only to know whether there is an import to filter by; what is owned is the `owned` prop.
  const account = useAccount();
  // Shops a few at a time, more as the reader scrolls, as every long list on the site grows.
  const SHOPS_PER_STEP = 6;
  const [shopLimit, setShopLimit] = useState(SHOPS_PER_STEP);
  const [cardLimits, setCardLimits] = useState<Record<string, number>>({});
  const CARDS_PER_STEP = 12;

  const byId = useMemo(() => new Map(catalogue.map((skin) => [skin.id, skin])), [catalogue]);
  const isOwned = (skin: PlannedSkin) => !!owned && !!skin.skinId && owned.has(skin.skinId);
  const planned = useMemo(() => new Set(ids), [ids]);
  const shops = useMemo(() => {
    const open = today ? openSkinCollections(collections, today) : collections;
    return [...open].sort((a, b) => (order === 'closing' ? a.end.localeCompare(b.end) || a.start.localeCompare(b.start) : a.start.localeCompare(b.start) || a.end.localeCompare(b.end)));
  }, [collections, today, order]);

  // What the plan costs: outfits the account already owns are left out.
  const plannedSkins = ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  const toBuy = plannedSkins.filter((skin) => !isOwned(skin));
  const ownedPlanned = plannedSkins.length - toBuy.length;
  const missing = ids.filter((id) => !byId.has(id));
  const cost = toBuy.reduce((sum, skin) => sum + skin.op, 0);
  const extra = budget?.extraOP ?? 0;
  const purchases = useMemo(() => skinPurchasePlan(toBuy, shops, extra), [toBuy, shops, extra]);
  const short = budget ? Math.max(0, cost + extra - budget.heldOP) : 0;

  const words = query.normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const matches = (skin: PlannedSkin) => (!plannedOnly || planned.has(skin.id))
    && words.every((word) => `${skin.operator} ${skin.name}`.normalize('NFKC').toLocaleLowerCase().includes(word));
  const shows = (skin: PlannedSkin) => matches(skin) && (!owned || ownedFilter === 'all' || (ownedFilter === 'owned') === isOwned(skin));
  /* What each Owned option would show under the other filters, each outfit once though a
     returning one is in more than one shop. */
  const ownedCounts = countOwned([...new Map(shops.flatMap((shop) => shop.skinIds.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])))
    .filter(matches).map((skin) => [skin.id, skin])).values()], isOwned);
  // The shops with something to show under the search and the chips.
  const visibleShops = shops.filter(shop => !!shop.fashionReview === fashionOnly).map((shop) => ({ shop, skins: shop.skinIds.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])).filter(shows) }))
    .filter(({ skins }) => skins.length > 0);
  // One event can have several returning batches and a separate Fashion Review shop.
  const groups = new Map<string, { id: string; name: string; shops: typeof visibleShops }>();
  for (const row of visibleShops) {
    const name = shopName(row.shop.name).split(' · ')[0];
    const id = `${name} / ${row.shop.start.slice(0, 4)}`;
    const group = groups.get(id) ?? { id, name, shops: [] };
    group.shops.push(row);
    groups.set(id, group);
  }
  const eventGroups = [...groups.values()];
  const toggle = (id: string) => onChange(planned.has(id) ? ids.filter((value) => value !== id) : [...ids, id]);

  const card = (skin: PlannedSkin) => {
    const isPlanned = planned.has(skin.id), has = isOwned(skin);
    return (
      <article key={skin.id} className={`pick-card pick-card-picture skin-plan-card${has ? ' skin-plan-owned' : ''}`}>
        <button type="button" className="btn-bare skin-plan-view" aria-label={`View ${skin.operator} — ${skin.name} artwork`}
          disabled={!skin.image} onClick={() => setViewing(skin)}>
          <SkinPlannerArt image={skin.image} />
          <span className="skin-plan-card-text">
            <span className="skin-plan-card-operator">{skin.operator}</span>
            <b>{skin.name}</b>
          </span>
        </button>
        <button type="button" className="btn-bare skin-plan-card-foot" aria-pressed={isPlanned}
          aria-label={`${skin.operator} — ${skin.name}, ${skin.op} OP${has ? ', owned' : ''}`}
          onClick={() => toggle(skin.id)}>
          <span>{skin.op} OP</span><strong>{has ? 'Owned' : isPlanned ? '✓ Planned' : '+ Plan'}</strong>
        </button>
      </article>
    );
  };

  const unscheduledPlanned = purchases.unscheduled.filter(shows);
  return (
    <div className="skin-plan">
      {viewing?.image && <SkinZoomOverlay image={viewing.image} name={`${viewing.operator} — ${viewing.name}`} dynamic={viewing.dynamic ?? null} alternate={viewing.alternate ?? null} details={<div><h2>{viewing.name}</h2><p>{viewing.operator} · {viewing.series} · {viewing.op} OP</p>{viewing.illustrator && <p>Illustrator: {viewing.illustrator}</p>}{viewing.description && <p>{viewing.description}</p>}{viewing.howToObtain && <p>{viewing.howToObtain}</p>}</div>} onClose={() => setViewing(null)} />}
      <div className="skin-plan-main">
        {/* The search, then the filters on the left and the order on the right: the roster's and
            the skins gallery's row, with the owned filter in the same place. */}
        <div className="skin-plan-toolbar">
          <SearchInput className="skin-plan-search" label="Search outfits" value={query} onChange={setQuery} placeholder="Operator or outfit" />
          <div className="skin-plan-filter-row">
            <button type="button" className="filter-chip" aria-pressed={plannedOnly} onClick={() => setPlannedOnly(!plannedOnly)}>Planned only</button>
            <button type="button" className="filter-chip" aria-pressed={fashionOnly} onClick={() => { setFashionOnly(!fashionOnly); setShopLimit(SHOPS_PER_STEP); }}>Fashion Review</button>
            <OwnedFilter label="Outfits you own" value={ownedFilter} onChange={setOwnedFilter} account={account} counts={ownedCounts} />
            <span className="toolbar-spacer" aria-hidden="true" />
            <SegmentedControl label="Order shops by" value={order} options={ORDER_OPTIONS} onChange={setOrder} />
          </div>
        </div>
        {shops.length === 0 && <p className="hint">No shop that sells outfits for Originite Prime is open or listed ahead.</p>}
        {eventGroups.slice(0, shopLimit).map((group) => {
          const ownedSkins = [...new Map(group.shops.flatMap(row => row.skins).filter(isOwned).map(skin => [skin.id, skin])).values()];
          const ownedLimit = cardLimits[`${group.id}:owned`] ?? CARDS_PER_STEP;
          return <section key={group.id} className="skin-plan-shop" aria-label={group.name}>
            <h3 className="section-title skin-plan-event">{group.name}</h3>
            <div className="skin-plan-shop">
              {group.shops.map(({ shop, skins }) => {
                const inPlan = shop.skinIds.filter((id) => planned.has(id) && byId.has(id) && !isOwned(byId.get(id)!));
                const limit = cardLimits[shop.id] ?? CARDS_PER_STEP;
                const sorted = skins.filter(skin => !isOwned(skin));
                return <section key={shop.id} className="skin-plan-shop" aria-label={shopName(shop.name)}>
                  <div className="skin-plan-shop-head">
                    <h4>{shopName(shop.name).split(' · ').slice(1).join(' · ') || 'Outfits'}</h4>
                    <span className="hint">{shop.start} – {shop.end}{today ? ` · ${shopCountdown(shop, today)}` : ''}{shop.estimated ? (shop.sourceRegion === 'cn' ? ' · CN-based estimate' : ' · Estimated') : ''}
                      {inPlan.length ? ` · ${inPlan.length} planned, ${inPlan.reduce((sum, id) => sum + byId.get(id)!.op, 0)} OP` : ''}</span>
                  </div>
                  <div className="skin-plan-grid">{sorted.slice(0, limit).map(card)}</div>
                  <LoadOnScroll shown={Math.min(limit, sorted.length)} total={sorted.length} onMore={() => setCardLimits(value => ({ ...value, [shop.id]: limit + CARDS_PER_STEP }))} />
                </section>;
              })}
              {ownedSkins.length > 0 && <section className="skin-plan-shop" aria-label="Owned outfits"><h4>Owned outfits</h4><div className="skin-plan-grid">{ownedSkins.slice(0, ownedLimit).map(card)}</div><LoadOnScroll shown={Math.min(ownedLimit, ownedSkins.length)} total={ownedSkins.length} onMore={() => setCardLimits(value => ({ ...value, [`${group.id}:owned`]: ownedLimit + CARDS_PER_STEP }))} /></section>}
            </div>
          </section>;
        })}
        <LoadOnScroll shown={Math.min(shopLimit, eventGroups.length)} total={eventGroups.length} onMore={() => setShopLimit(value => value + SHOPS_PER_STEP)} />
        {shops.length > 0 && eventGroups.length === 0 && <p className="hint">No outfits match these filters.</p>}
        {unscheduledPlanned.length > 0 && (
          <section className="skin-plan-shop" aria-label="Planned, in no listed shop">
            <div className="skin-plan-shop-head">
              <h3 className="section-title">In no listed shop</h3>
              <span className="hint">Planned outfits no open or coming shop lists yet: counted in the plan from now.</span>
            </div>
            <div className="skin-plan-grid">{unscheduledPlanned.map(card)}</div>
          </section>
        )}
      </div>

      <aside className="skin-plan-summary" aria-label="Your skin plan">
        <h3 className="section-title">Your plan <span className="hint">{plannedSkins.length}</span></h3>
        <div className="skin-plan-totals" role="status" aria-live="polite">
          <div><span>To buy</span><strong>{cost} OP</strong></div>
          {budget && <div><span>Current OP</span><strong>{budget.heldOP} OP</strong></div>}
          {budget && extra > 0 && <div><span>Extra reserve</span><strong>{extra} OP</strong></div>}
          {budget && (ids.length > 0 || extra > 0) && (
            <p className={short ? 'pulls-plan-warning' : 'pulls-plan-funded'}>
              {short ? `${short} more OP needed` : `${budget.heldOP - cost - extra} OP left for pulls`}
            </p>
          )}
          {ownedPlanned > 0 && <p className="hint">{ownedPlanned} planned {ownedPlanned === 1 ? 'outfit is' : 'outfits are'} already yours, and not counted.</p>}
        </div>
        {ids.length === 0 && <p className="hint">Plan the outfits you want: here, or with ☆ on the Skins page.</p>}
        {purchases.windows.length > 0 && (
          <div className="skin-plan-deadlines">
            <h4>By each shop’s closing date</h4>
            {purchases.windows.map((window) => {
              const balance = budget ? budget.forecastOP(window.end) - window.reserved : null;
              return (
                <div key={window.collection.id}>
                  <b>{shopName(window.collection.name)}</b>
                  <span>{window.end}{window.collection.estimated ? ' · Estimated' : ''} · {window.cost} OP</span>
                  {balance != null && <strong className={balance < 0 ? 'pulls-plan-warning' : 'pulls-plan-funded'}>{balance < 0 ? `${-balance} OP short` : 'Covered by projected OP'}</strong>}
                </div>
              );
            })}
          </div>
        )}
        {/* Wishlisted on the Skins page but not sold for Originite Prime (certificates, event
            rewards): kept in the plan, and not priced. */}
        {missing.length > 0 && <p className="hint">Not sold for Originite Prime, so not counted: {missing.join(', ')}.</p>}
        {budget && <details className="pulls-disclosure skin-plan-extra"><summary>Extra OP reserve{extra > 0 ? ` · ${extra} OP` : ''}</summary>{budget.extraField}</details>}
      </aside>
    </div>
  );
}
