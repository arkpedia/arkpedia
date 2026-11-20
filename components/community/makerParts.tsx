import { memo, useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { ContentImg } from '@/components/content/ContentImage';
import SearchInput from '@/components/ui/SearchInput';
import { useHeightFloor } from '@/components/ui/useHeightFloor';
import { OPERATOR_KINDS, TIER_KINDS, TIER_RARITIES, type TierItem, type TierKind } from '@/lib/tier-list/catalogue';
import { ZOOM } from '@/lib/tier-list/state';
import { TIER_LIST_STRINGS as T } from '@/lib/tier-list/strings';
import { tileImage } from './tierTile';
import styles from './TierList.module.css';

/*
 * The parts the makers share (the Tier List maker and the chart maker): the tile, the
 * checkboxes that choose the pool, the tile controls, and the pool itself.
 */

const TIER_VERDICTS = { right: T.quizRight, wrong: T.quizWrong };

/** A tile is dragged, never pressed: it is a picture with a name, not a button. The plate
 *  names whose it is and, for a skill, an outfit or a promotion, which of theirs. `style`
 *  places a tile that is not in a row's flow (a point on a chart's plane). */
export const Tile = memo(function Tile({ item, mark, style, verdicts = TIER_VERDICTS }: { item: TierItem; mark?: 'right' | 'wrong'; style?: CSSProperties; /** What a quiz's marks are called: "right tier", "wrong cell". */ verdicts?: { right: string; wrong: string } }) {
  const name = mark ? `${item.name} (${verdicts[mark]})` : item.name;
  return (
    <div className={styles.tile} data-item={item.id} data-kind={item.kind} data-mark={mark} role="img" aria-label={name} title={item.name} style={style}>
      <ContentImg src={tileImage(item)} alt="" width={64} height={64} draggable={false} />
      <span className={styles.plate} aria-hidden="true"><span>{item.label}</span>{item.sub && <span>{item.sub}</span>}</span>
    </div>
  );
});

/** What goes in the pool, in three labelled rows on one grid: the operator art, the
 *  rarities that narrow it, and the kinds that have no rarity. */
export function KindFilters({ rarities, kinds, onRarity, onKind }: { rarities: readonly number[]; kinds: readonly TierKind[]; onRarity: (rarity: number, on: boolean) => void; onKind: (kind: TierKind, on: boolean) => void }) {
  return (
    <section className="op-section" aria-labelledby="tier-setup">
      <h2 id="tier-setup">{T.setupHeading}</h2>
      <div className={`panel ${styles.setup}`}>
        {([
          ['tier-operator-kinds', T.operatorGroup, TIER_KINDS.filter((kind) => OPERATOR_KINDS.has(kind))],
          ['tier-other-kinds', T.otherGroup, TIER_KINDS.filter((kind) => !OPERATOR_KINDS.has(kind))],
        ] as const).map(([id, label, group], index) => [
          <span key={`${id}-label`} className="label-tag" id={id}>{label}</span>,
          <div key={id} className={styles.checks} role="group" aria-labelledby={id}>
            {group.map((kind) => (
              <label key={kind} className="check">
                <input type="checkbox" aria-label={T.kindNames[kind]} checked={kinds.includes(kind)} onChange={(event) => onKind(kind, event.target.checked)} />
                {T.kinds[kind]}
              </label>
            ))}
          </div>,
          // The rarities sit under the operator art they narrow.
          ...(index === 0 ? [
            <span key="rarity-label" className="label-tag" id="tier-rarity">{T.rarityGroup}</span>,
            <div key="rarity" className={styles.checks} role="group" aria-labelledby="tier-rarity">
              {TIER_RARITIES.map((rarity) => (
                <label key={rarity} className="check">
                  <input type="checkbox" aria-label={T.rarityName(rarity)} checked={rarities.includes(rarity)} onChange={(event) => onRarity(rarity, event.target.checked)} />
                  {T.rarity(rarity)}
                </label>
              ))}
            </div>,
          ] : []),
        ])}
      </div>
    </section>
  );
}

/** How the tiles are drawn: their name plates and their zoom. */
export function TileControls({ names, zoom, onNames, onZoom }: { names: boolean; zoom: number; onNames: (on: boolean) => void; onZoom: (zoom: number) => void }) {
  return <>
    <label className="check">
      <input type="checkbox" checked={names} onChange={(event) => onNames(event.target.checked)} />
      {T.names}
    </label>
    <div className={styles.zoom} role="group" aria-label={T.zoomGroup}>
      <svg className={styles.zoomIcon} viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M10.4 10.4L14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
      <button type="button" className="ghost btn-icon" aria-label={T.zoomOut} title={zoom <= ZOOM.min ? T.zoomSmallest : T.zoomOut} disabled={zoom <= ZOOM.min} onClick={() => onZoom(zoom - ZOOM.step)}>
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3.5 8h9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
      </button>
      <output className={styles.zoomValue} aria-label={T.zoomName(zoom)}>{T.zoomValue(zoom)}</output>
      <button type="button" className="ghost btn-icon" aria-label={T.zoomIn} title={zoom >= ZOOM.max ? T.zoomLargest : T.zoomIn} disabled={zoom >= ZOOM.max} onClick={() => onZoom(zoom + ZOOM.step)}>
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3.5 8h9M8 3.5v9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
      </button>
    </div>
  </>;
}

/** The floating pool's place on a wide screen: null until the reader moves it (CSS parks it
 *  in the bottom right corner), then a corner kept inside the window. */
function usePoolPlace() {
  const box = useRef<HTMLElement>(null);
  const [place, setPlace] = useState<{ x: number; y: number } | null>(null);
  const clamp = useCallback((x: number, y: number) => {
    const size = box.current?.getBoundingClientRect();
    const w = size?.width ?? 0, h = Math.min(size?.height ?? 0, 48);
    // Never under the site's bar, which is fixed above everything: the head would be out of reach.
    const bar = Math.max(0, document.querySelector('.site-nav')?.getBoundingClientRect().bottom ?? 0);
    return { x: Math.max(0, Math.min(window.innerWidth - w, x)), y: Math.max(bar, Math.min(window.innerHeight - h, y)) };
  }, []);
  useEffect(() => {
    const again = () => setPlace((current) => (current ? clamp(current.x, current.y) : current));
    window.addEventListener('resize', again);
    return () => window.removeEventListener('resize', again);
  }, [clamp]);
  const grab = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || (event.target as Element).closest('button, input, a') || !box.current) return;
    const rect = box.current.getBoundingClientRect();
    const dx = event.clientX - rect.left, dy = event.clientY - rect.top;
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const move = (next: PointerEvent) => setPlace(clamp(next.clientX - dx, next.clientY - dy));
    const done = () => { handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', done); handle.removeEventListener('pointercancel', done); };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', done);
    handle.addEventListener('pointercancel', done);
  }, [clamp]);
  return { box, place, grab };
}

/**
 * The pool: pinned under the board, or detached into a window that floats over
 * the page, a sheet at the bottom of a phone. It must be rendered inside the maker's root,
 * where the drag hook listens. Detaching takes it out of the page under a reader who is at
 * the page's end, so its dock keeps their place.
 */
export function PoolWindow({ items, query, onQuery, detached, onDetached, empty, floorKey, hint = T.hint }: { items: readonly TierItem[]; query: string; onQuery: (query: string) => void; detached: boolean; onDetached: (detached: boolean) => void; empty: string; floorKey: string; hint?: string }) {
  const dock = useHeightFloor(floorKey);
  const poolPlace = usePoolPlace();
  const poolStyle = detached && poolPlace.place ? ({ '--pool-x': `${poolPlace.place.x}px`, '--pool-y': `${poolPlace.place.y}px` } as CSSProperties) : undefined;
  return (
    <div ref={dock.ref}>
      <section ref={poolPlace.box} className={`${detached ? 'panel ' : 'op-section '}${styles.pool}`} data-pool-window="" data-detached={detached ? '' : undefined} data-moved={detached && poolPlace.place ? '' : undefined} style={poolStyle} aria-labelledby="tier-pool">
        <div className={styles.poolHead} onPointerDown={detached ? poolPlace.grab : undefined} title={detached ? T.movePool : undefined}>
          <h2 id="tier-pool" className={detached ? 'section-title' : undefined}>{T.poolHeading}</h2>
          <span className="hint" role="status">{T.poolCount(items.length)}</span>
          <SearchInput className={styles.search} label={T.searchLabel} placeholder={T.searchPlaceholder} value={query} onChange={onQuery} />
          <button type="button" className={`ghost ${styles.pin}`} title={detached ? T.pinPoolHint : T.detachPoolHint} onClick={() => onDetached(!detached)}>
            {detached ? T.pinPool : T.detachPool}
          </button>
        </div>
        <p className={`hint ${styles.status}`}>{hint}</p>
        <div className={styles.poolItems} data-pool-list="" role="group" aria-label={T.poolHeading}>
          {items.length ? items.map((item) => <Tile key={item.id} item={item} />) : <p className={`hint ${styles.poolEmpty}`}>{empty}</p>}
        </div>
      </section>
      {dock.spacer}
    </div>
  );
}
