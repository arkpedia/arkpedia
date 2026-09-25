import { PlannerSelect } from './PlannerSelect';
import { SkinsHelp } from './PlannerHelp';
import { useMemo, useState, type ReactNode } from 'react';
import { skinReservation, skinPurchasePlan, type PlannedSkin } from '@/lib/pulls/skins';
import type { SkinCollection } from '@/lib/pulls/skinCollections';
import { openSkinCollections } from '@/lib/pulls/currentPlan';
import { ContentImg } from '@/components/content/ContentImage';

export function SkinPlan({ catalogue, collections, today, ids, onChange, heldOP, extraOP, extraField, forecastOP }: {
  catalogue: PlannedSkin[]; collections: SkinCollection[]; today: string | null;
  ids: string[]; onChange: (ids: string[]) => void;
  forecastOP: (date: string) => number;
  heldOP: number; extraOP: number; extraField: ReactNode;
}) {
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(12);
  const [collectionId, setCollectionId] = useState('');
  const upcoming = useMemo(() => today ? openSkinCollections(collections, today) : collections, [collections, today]);
  const collection = upcoming.find(value => value.id === collectionId) ?? upcoming[0];
  const selection = useMemo(() => skinReservation(ids, catalogue, extraOP), [ids, catalogue, extraOP]);
  const purchases = useMemo(() => skinPurchasePlan(selection.skins, upcoming, extraOP), [selection.skins, upcoming, extraOP]);
  const matches = useMemo(() => {
    const words = query.normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/);
    const visible = new Set(collection?.skinIds);
    return catalogue.filter(skin => visible.has(skin.id) && words.every(word => `${skin.operator} ${skin.name}`.normalize('NFKC').toLocaleLowerCase().includes(word)));
  }, [catalogue, query, collection]);
  const toggle = (id: string) => onChange(ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id]);
  const short = Math.max(0, selection.reserved - heldOP);
  return <section className="pulls-panel" aria-labelledby="pulls-skins-heading">
    <div className="pulls-panel-head"><h2 id="pulls-skins-heading">Skins</h2><SkinsHelp /></div>
    <div className="pulls-skin-mobile-budget" aria-live="polite"><b>{selection.skins.length} skins · {selection.cost} OP</b><span className={short || selection.missing.length ? 'pulls-plan-warning' : 'pulls-plan-funded'}>{selection.missing.length ? 'Price missing' : short ? `${short} OP short` : `${heldOP - selection.reserved} OP left`}</span></div>
    <div className="pulls-skin-layout">
      <div className="pulls-skin-browser">
        <div className="pulls-skin-collection">
          {collection ? <>
            <div className="pulls-shop-field"><span>Event shop</span><PlannerSelect label="Skin collection" value={collection.id}
              onChange={value => { setCollectionId(value); setLimit(12); setQuery(''); }}
              options={upcoming.map(value => ({ value: value.id, label: value.name.replace(/^\[[^\]]*\]\s*/, ''),
                detail: `${value.start} – ${value.end}${value.estimated ? value.sourceRegion === 'cn' ? ' · CN-based estimate' : ' · Estimated' : ''}` }))} />
            </div>

          </> : <p className="hint">No upcoming shop rotations are listed.</p>}
        </div>
        <label className="pulls-skin-search">Search this shop<input type="search" value={query} onChange={event => { setQuery(event.target.value); setLimit(12); }} placeholder="Operator or outfit name" /></label>
        <div className="pulls-skin-grid">
          {matches.slice(0, limit).map(skin => <button key={skin.id} type="button" className={`pulls-skin-option${ids.includes(skin.id) ? ' on' : ''}`} aria-pressed={ids.includes(skin.id)} aria-label={`${skin.operator} — ${skin.name}, ${skin.op} OP`} onClick={() => toggle(skin.id)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {skin.image ? <ContentImg src={skin.image} alt="" loading="lazy" /> : <span className="pulls-skin-noart">Artwork unavailable</span>}
            <span><b>{skin.operator}</b><span>{skin.name}</span><strong>{ids.includes(skin.id) ? '✓ Selected · ' : '+ Add · '}{skin.op} OP</strong></span>
          </button>)}
        </div>
        {matches.length === 0 && collection && <p className="hint">No outfits match these filters.</p>}
        {matches.length > limit && <button type="button" className="pulls-quick-btn" onClick={() => setLimit(value => value + 12)}>Show more outfits ({matches.length - limit})</button>}
      </div>
      <aside className="pulls-skin-wishlist" aria-labelledby="pulls-skin-wishlist-title">
        <h3 id="pulls-skin-wishlist-title">Your skins <span>{selection.skins.length}</span></h3>
        <div className="pulls-skin-totals" role="status" aria-live="polite">
          <div><span>Skins total</span><strong>{selection.cost} OP</strong></div>
          <div><span>Current OP</span><strong>{heldOP} OP</strong></div>
          {extraOP > 0 && <div><span>Extra reserve</span><strong>{extraOP} OP</strong></div>}
          {(ids.length > 0 || extraOP > 0) && <p className={short || selection.missing.length ? 'pulls-plan-warning' : 'pulls-plan-funded'}>{selection.missing.length ? 'Review missing prices' : short ? `${short} more OP needed` : `${heldOP - selection.reserved} OP left for pulls`}</p>}
        </div>
        {ids.length === 0 && <p className="hint">Select the outfits you want to buy.</p>}
        <ul className="pulls-skin-chosen" aria-label="Selected skins">
          {selection.skins.map(skin => <li key={skin.id}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {skin.image && <ContentImg src={skin.image} alt="" loading="lazy" />}
            <span><b>{skin.operator}</b><span>{skin.name}</span><strong>{skin.op} OP</strong>{purchases.unscheduled.some(value => value.id === skin.id) && <span className="pulls-plan-warning">No listed shop window</span>}</span>
            <button type="button" className="pulls-quick-btn" aria-label={`Remove ${skin.operator} — ${skin.name}`} onClick={() => toggle(skin.id)}>Remove</button>
          </li>)}
          {selection.missing.map(id => <li key={id}><span className="pulls-plan-warning">{id}: price unavailable</span><button type="button" className="pulls-quick-btn" onClick={() => toggle(id)}>Remove</button></li>)}
        </ul>
        {purchases.windows.length > 0 && <div className="pulls-skin-deadlines"><h4>By each shop’s closing date</h4>
          {purchases.windows.map(window => {
            const balance = forecastOP(window.end) - window.reserved;
            return <div key={window.collection.id}><b>{window.collection.name}</b><span>{window.end}{window.collection.estimated ? ' · Estimated' : ''} · {window.cost} OP</span><strong className={balance < 0 ? 'pulls-plan-warning' : 'pulls-plan-funded'}>{selection.missing.length ? 'Review missing prices' : balance < 0 ? `${-balance} OP short` : 'Covered by projected OP'}</strong></div>;
          })}
        </div>}
        {purchases.unscheduled.length > 0 && <p className="pulls-plan-warning">No listed upcoming shop for {purchases.unscheduled.map(skin => skin.name).join(', ')}.</p>}
        <details className="pulls-disclosure pulls-skin-extra"><summary>Extra OP reserve{extraOP > 0 ? ` · ${extraOP} OP` : ''}</summary>{extraField}</details>
      </aside>
    </div>
  </section>;
}
