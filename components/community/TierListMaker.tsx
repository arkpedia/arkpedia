import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import ImportDialog from '@/components/account/ImportDialog';
import { ContentImg } from '@/components/content/ContentImage';
import SearchInput from '@/components/ui/SearchInput';
import XButton from '@/components/ui/XButton';
import { useHeightFloor } from '@/components/ui/useHeightFloor';
import { matchesSearch } from '@/lib/search/searchNormalize';
import { catalogueItems, TIER_KINDS, TIER_RARITIES, type TierCatalogue, type TierItem } from '@/lib/tier-list/catalogue';
import { decodeTierList, encodeTierList, LONG_LINK_CHARS, MAX_SHARE_CHARS, SHARE_PARAM, sharePayload } from '@/lib/tier-list/share';
import { addRow, clearRows, defaultTierList, deleteRow, labelInk, moveRow, placeItems, poolItems, returnToPool, ROW_COLORS, setZoom, toggleKind, toggleRarity, updateRow, MAX_LABEL, MAX_TITLE, ZOOM, type TierListState, type TierRow } from '@/lib/tier-list/state';
import { useTierList, writeTierList } from '@/lib/tier-list/store';
import { TIER_LIST_STRINGS as T } from '@/lib/tier-list/strings';
import TierListShareImage from './TierListShareImage';
import { tileImage } from './tierTile';
import { useTierDrag, type TierDrop } from './useTierDrag';
import styles from './TierList.module.css';

type Change = (state: TierListState) => TierListState;

/** A tile is dragged, never pressed: it is a picture with a name, not a button. */
const Tile = memo(function Tile({ item }: { item: TierItem }) {
  return (
    <div className={styles.tile} data-item={item.id} data-kind={item.kind} role="img" aria-label={item.name} title={item.name}>
      <ContentImg src={tileImage(item)} alt="" width={64} height={64} draggable={false} />
    </div>
  );
});

const rowStyle = (color: string) => ({ '--tier-color': color }) as CSSProperties;

function RowDialog({ row, index, count, onChange, onMove, onAddBelow, onDelete, onClose }: { row: TierRow; index: number; count: number; onChange: (change: { label?: string; color?: string }) => void; onMove: (by: -1 | 1) => void; onAddBelow: () => void; onDelete: () => void; onClose: () => void }) {
  return (
    <ImportDialog title={T.rowDialog} onClose={onClose} className={styles.dialog}>
      <div className={styles.dialogBody}>
        <label className={styles.field}>
          <span className="label-tag">{T.rowDialogLabel}</span>
          <input type="text" value={row.label} maxLength={MAX_LABEL} placeholder={T.rowLabelPlaceholder} onChange={(event) => onChange({ label: event.target.value })} />
        </label>
        <div className={styles.field}>
          <span className="label-tag" id="tier-row-colour">{T.rowDialogColor}</span>
          <div className={styles.swatches} role="radiogroup" aria-labelledby="tier-row-colour">
            {ROW_COLORS.map((color) => (
              <button key={color} type="button" role="radio" aria-checked={row.color === color} aria-label={T.swatch(color)} title={color} className={`btn-bare ${styles.swatch}`} style={rowStyle(color)} onClick={() => onChange({ color })} />
            ))}
            <label className={styles.custom}>
              <input type="color" value={row.color} aria-label={T.customColor} onChange={(event) => onChange({ color: event.target.value })} />
              <span>{T.customColor}</span>
            </label>
          </div>
        </div>
        <div className={styles.dialogActions}>
          <button type="button" className="ghost" disabled={index === 0} onClick={() => onMove(-1)}>{T.moveUp}</button>
          <button type="button" className="ghost" disabled={index === count - 1} onClick={() => onMove(1)}>{T.moveDown}</button>
          <button type="button" className="ghost" onClick={onAddBelow}>{T.addBelow}</button>
          <button type="button" className="danger" onClick={onDelete}>{T.deleteThisRow}</button>
          <button type="button" className={`primary btn-sm ${styles.done}`} onClick={onClose}>{T.done}</button>
        </div>
      </div>
    </ImportDialog>
  );
}

/**
 * The list on screen and the one way to change it. The reader's own list is the saved one
 * (lib/tier-list/store.ts). A list opened from a link (`#list=`) is held here instead, in
 * memory: while it is shown every change goes to it and none to the store, so looking at
 * someone's list can never overwrite the reader's own. "Keep as mine" is the only way in.
 */
function useShownTierList() {
  const [saved, save] = useTierList();
  const [shared, setShared] = useState<TierListState | null>(null);
  const [broken, setBroken] = useState(false);
  const sharedRef = useRef(shared);
  useEffect(() => { sharedRef.current = shared; }, [shared]);

  useEffect(() => {
    let current = 0;
    const read = () => {
      const turn = ++current;
      const payload = sharePayload(window.location.hash);
      if (!payload) { setShared(null); return; }
      void decodeTierList(payload).then((list) => { if (turn === current) { setShared(list); setBroken(!list); } });
    };
    read();
    window.addEventListener('hashchange', read);
    return () => { current += 1; window.removeEventListener('hashchange', read); };
  }, []);

  const update = useCallback((change: Change) => {
    if (sharedRef.current) setShared((list) => (list ? change(list) : list)); else save(change);
  }, [save]);
  const leave = useCallback((keep: boolean) => {
    if (keep && sharedRef.current) writeTierList(sharedRef.current);
    window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
    setShared(null);
  }, []);
  return { state: shared ?? saved, update, shared: !!shared, broken, dismissBroken: () => setBroken(false), leave };
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

export default function TierListMaker({ catalogue }: { catalogue: TierCatalogue }) {
  const items = useMemo(() => catalogueItems(catalogue), [catalogue]);
  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const { state, update, shared, broken, dismissBroken, leave } = useShownTierList();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [detached, setDetached] = useState(false);
  const [imaging, setImaging] = useState(false);
  const [notice, setNotice] = useState('');

  const root = useRef<HTMLDivElement>(null);
  const ghost = useRef<HTMLDivElement>(null);
  const mark = useRef<HTMLDivElement>(null);
  const floor = useHeightFloor('tier-list');
  // Detaching the pool takes it out of the page under a reader who is at the page's end.
  const dock = useHeightFloor('tier-list-pool');
  const poolPlace = usePoolPlace();

  useTierDrag({
    root, ghost, mark,
    carried: useCallback((id: string) => [id], []),
    onDrop: useCallback((ids: string[], drop: TierDrop) => {
      update((current) => ('pool' in drop ? returnToPool(current, ids) : placeItems(current, ids, drop.row, drop.index)));
    }, [update]),
  });

  const pool = useMemo(() => poolItems(items, state), [items, state]);
  const shown = useMemo(() => (query.trim() ? pool.filter((item) => matchesSearch(item.name, query)) : pool), [pool, query]);
  const placedCount = state.rows.reduce((n, row) => n + row.items.length, 0);
  const editingIndex = state.rows.findIndex((row) => row.id === editing);
  const rowName = (row: TierRow, index: number) => T.rowName(row.label, index + 1);
  const empty = query.trim() && pool.length ? T.poolEmptySearch : !state.rarities.length || !state.kinds.length ? T.poolEmptyFilters : T.poolEmptyDone;

  async function copyLink() {
    let address: string;
    try {
      const payload = await encodeTierList(state);
      // The same limit the reader's side applies: never hand out a link that will not open.
      if (payload.length > MAX_SHARE_CHARS) { setNotice(T.linkTooLong); return; }
      address = `${window.location.origin}${window.location.pathname}#${SHARE_PARAM}=${payload}`;
    } catch { setNotice(T.linkFailed); return; }
    try {
      await navigator.clipboard.writeText(address);
      setNotice(address.length > LONG_LINK_CHARS ? T.linkCopiedLong : T.linkCopied);
    } catch {
      // No clipboard here (a page not served over https, a refused permission): show the
      // link to copy by hand.
      window.prompt(T.linkManual, address);
    }
  }

  const makerStyle = { '--zoom': state.zoom / 100 } as CSSProperties;
  const poolStyle = detached && poolPlace.place ? ({ '--pool-x': `${poolPlace.place.x}px`, '--pool-y': `${poolPlace.place.y}px` } as CSSProperties) : undefined;

  return (
    <div ref={root} className={styles.maker} style={makerStyle} data-detached={detached ? '' : undefined}>
      {(shared || broken) && (
        <div className={`panel ${styles.shared}`} role="status">
          <span>{shared ? T.sharedNotice : T.sharedBroken}</span>
          {shared ? <>
            <button type="button" className="primary btn-sm" onClick={() => { if (window.confirm(T.keepSharedConfirm)) leave(true); }}>{T.keepShared}</button>
            <button type="button" className="ghost" onClick={() => leave(false)}>{T.backToMine}</button>
          </> : <XButton label={T.done} onClick={dismissBroken} />}
        </div>
      )}

      <section className="op-section" aria-labelledby="tier-setup">
        <h2 id="tier-setup">{T.setupHeading}</h2>
        <div className={`panel ${styles.setup}`}>
          <div className={styles.group} role="group" aria-labelledby="tier-rarity">
            <span className="label-tag" id="tier-rarity">{T.rarityGroup}</span>
            <div className={styles.checks}>
              {TIER_RARITIES.map((rarity) => (
                <label key={rarity} className="check">
                  <input type="checkbox" aria-label={T.rarityName(rarity)} checked={state.rarities.includes(rarity)} onChange={(event) => update((current) => toggleRarity(current, rarity, event.target.checked))} />
                  {T.rarity(rarity)}
                </label>
              ))}
            </div>
          </div>
          <div className={styles.group} role="group" aria-labelledby="tier-kind">
            <span className="label-tag" id="tier-kind">{T.kindGroup}</span>
            <div className={styles.checks}>
              {TIER_KINDS.map((kind) => (
                <label key={kind} className="check">
                  <input type="checkbox" aria-label={T.kindNames[kind]} checked={state.kinds.includes(kind)} onChange={(event) => update((current) => toggleKind(current, kind, event.target.checked))} />
                  {T.kinds[kind]}
                </label>
              ))}
            </div>
          </div>
          <div className={styles.group} role="group" aria-labelledby="tier-zoom">
            <span className="label-tag" id="tier-zoom">{T.zoomGroup}</span>
            <div className={styles.zoom}>
              <svg className={styles.zoomIcon} viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M10.4 10.4L14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
              <button type="button" className="ghost btn-icon" aria-label={T.zoomOut} title={state.zoom <= ZOOM.min ? T.zoomSmallest : T.zoomOut} disabled={state.zoom <= ZOOM.min} onClick={() => update((current) => setZoom(current, current.zoom - ZOOM.step))}>
                <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3.5 8h9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
              </button>
              <output className={styles.zoomValue} aria-label={T.zoomName(state.zoom)}>{T.zoomValue(state.zoom)}</output>
              <button type="button" className="ghost btn-icon" aria-label={T.zoomIn} title={state.zoom >= ZOOM.max ? T.zoomLargest : T.zoomIn} disabled={state.zoom >= ZOOM.max} onClick={() => update((current) => setZoom(current, current.zoom + ZOOM.step))}>
                <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3.5 8h9M8 3.5v9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="op-section" aria-labelledby="tier-board">
        <h2 id="tier-board">{T.boardHeading}</h2>
        <div ref={floor.ref}>
          <input type="text" className={styles.name} value={state.title} maxLength={MAX_TITLE} aria-label={T.titleLabel} placeholder={T.titlePlaceholder} onChange={(event) => update((current) => ({ ...current, title: event.target.value }))} />
          {state.rows.length ? (
            <ol className={styles.board}>
              {state.rows.map((row, index) => {
                const name = rowName(row, index);
                return (
                  <li key={row.id} className={styles.row}>
                    <div className={styles.label} style={rowStyle(row.color)} data-ink={labelInk(row.color)}>
                      <span aria-hidden="true">{row.label || T.rowLabelPlaceholder}{'\u200b'}</span>
                      <textarea rows={1} value={row.label} maxLength={MAX_LABEL} aria-label={T.rowLabel(index + 1)} placeholder={T.rowLabelPlaceholder} onChange={(event) => update((current) => updateRow(current, row.id, { label: event.target.value.replace(/\n/g, ' ') }))} />
                    </div>
                    <div className={styles.items} data-row={row.id} role="group" aria-label={T.rowItems(name)}>
                      {row.items.map((id) => { const item = byId.get(id); return item ? <Tile key={id} item={item} /> : null; })}
                    </div>
                    <div className={styles.rowActions}>
                      <button type="button" className="ghost btn-icon" aria-label={T.editRow(name)} title={T.editRow(name)} onClick={() => setEditing(row.id)}>
                        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2.5 13.5l.7-3 7.6-7.6a1.4 1.4 0 0 1 2 0l.3.3a1.4 1.4 0 0 1 0 2l-7.6 7.6-3 .7zM9.8 3.9l2.3 2.3" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round" /></svg>
                      </button>
                      <XButton className={styles.rowDelete} label={T.deleteRow(name)} title={T.deleteRow(name)} onClick={() => update((current) => deleteRow(current, row.id))} />
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : <p className={`hint ${styles.noRows}`}>{T.noRows}</p>}
          <div className={styles.boardActions}>
            <button type="button" className="btn-sm" onClick={() => update((current) => addRow(current))}>{T.addRow}</button>
            <button type="button" className="ghost" disabled={!placedCount} title={placedCount ? undefined : T.linkEmpty} onClick={() => void copyLink()}>{T.copyLink}</button>
            <button type="button" className="ghost" disabled={!placedCount} title={placedCount ? undefined : T.linkEmpty} onClick={() => setImaging(true)}>{T.makeImage}</button>
            <button type="button" className="ghost" disabled={!placedCount} title={placedCount ? undefined : T.emptyRowsNothing} onClick={() => update(clearRows)}>{T.emptyRows}</button>
            <button type="button" className="danger" onClick={() => { if (window.confirm(T.startOverConfirm)) { update(() => defaultTierList()); setQuery(''); setNotice(''); } }}>{T.startOver}</button>
          </div>
          <p className={`hint ${styles.notice}`} role="status">{notice || (shared ? T.notSaved : T.saved)}</p>
          {floor.spacer}
        </div>
      </section>

      {/* The pool: pinned under the tier list, or detached (the arrow) into a window that
          floats over the page, a sheet at the bottom of a phone. Either way it is inside this
          root, where the drag hook listens. */}
      <div ref={dock.ref}>
        <section ref={poolPlace.box} className={`${detached ? 'panel ' : 'op-section '}${styles.pool}`} data-pool-window="" data-detached={detached ? '' : undefined} data-moved={detached && poolPlace.place ? '' : undefined} style={poolStyle} aria-labelledby="tier-pool">
          <div className={styles.poolHead} onPointerDown={detached ? poolPlace.grab : undefined} title={detached ? T.movePool : undefined}>
            <h2 id="tier-pool" className={detached ? 'section-title' : undefined}>{T.poolHeading}</h2>
            <span className="hint" role="status">{T.poolCount(shown.length)}</span>
            <SearchInput className={styles.search} label={T.searchLabel} placeholder={T.searchPlaceholder} value={query} onChange={setQuery} />
            <button type="button" className={`ghost btn-icon ${styles.pin}`} aria-pressed={detached} aria-label={detached ? T.pinPool : T.detachPool} title={detached ? T.pinPool : T.detachPool} onClick={() => setDetached((now) => !now)}>
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d={detached ? 'M4 6l4 4 4-4' : 'M4 10l4-4 4 4'} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
          <p className={`hint ${styles.status}`}>{T.hint}</p>
          <div className={styles.poolItems} data-pool-list="" role="group" aria-label={T.poolHeading}>
            {shown.length ? shown.map((item) => <Tile key={item.id} item={item} />) : <p className={`hint ${styles.poolEmpty}`}>{empty}</p>}
          </div>
        </section>
        {dock.spacer}
      </div>

      <div ref={ghost} className={styles.ghost} hidden aria-hidden="true"><span data-art /><span data-count hidden /></div>
      <div ref={mark} className={styles.mark} hidden aria-hidden="true" />

      {editing && editingIndex >= 0 && (
        <RowDialog
          row={state.rows[editingIndex]} index={editingIndex} count={state.rows.length}
          onChange={(change) => update((current) => updateRow(current, editing, change))}
          onMove={(by) => update((current) => moveRow(current, editing, by))}
          onAddBelow={() => update((current) => addRow(current, editing))}
          onDelete={() => { update((current) => deleteRow(current, editing)); setEditing(null); }}
          onClose={() => setEditing(null)}
        />
      )}
      {imaging && <TierListShareImage state={state} byId={byId} onClose={() => setImaging(false)} />}
    </div>
  );
}
