import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import ImportDialog from '@/components/account/ImportDialog';
import { ContentImg } from '@/components/content/ContentImage';
import SearchInput from '@/components/ui/SearchInput';
import XButton from '@/components/ui/XButton';
import { useHeightFloor } from '@/components/ui/useHeightFloor';
import { matchesSearch } from '@/lib/search/searchNormalize';
import { catalogueItems, OPERATOR_KINDS, TIER_KINDS, TIER_RARITIES, type TierCatalogue, type TierItem } from '@/lib/tier-list/catalogue';
import { quizPool, scoreQuiz, type QuizScore } from '@/lib/tier-list/quiz';
import { decodeTierList, sharePayload, type SharedTierList } from '@/lib/tier-list/share';
import { addRow, clearRows, defaultTierList, deleteRow, labelInk, moveRow, placeItems, poolItems, returnToPool, ROW_COLORS, setZoom, toggleKind, toggleRarity, updateRow, MAX_LABEL, MAX_TITLE, ZOOM, type TierListState, type TierRow } from '@/lib/tier-list/state';
import { useTierList, writeTierList } from '@/lib/tier-list/store';
import { TIER_LIST_STRINGS as T } from '@/lib/tier-list/strings';
import TierListShareDialog from './TierListShareDialog';
import TierListShareImage from './TierListShareImage';
import { tileImage } from './tierTile';
import { useTierDrag, type TierDrop } from './useTierDrag';
import styles from './TierList.module.css';

type Change = (state: TierListState) => TierListState;

/** A tile is dragged, never pressed: it is a picture with a name, not a button. The plate
 *  names whose it is and, for a skill, an outfit or a promotion, which of theirs. */
const Tile = memo(function Tile({ item, mark }: { item: TierItem; mark?: 'right' | 'wrong' }) {
  const name = mark ? `${item.name} (${mark === 'right' ? T.quizRight : T.quizWrong})` : item.name;
  return (
    <div className={styles.tile} data-item={item.id} data-kind={item.kind} data-mark={mark} role="img" aria-label={name} title={item.name}>
      <ContentImg src={tileImage(item)} alt="" width={64} height={64} draggable={false} />
      <span className={styles.plate} aria-hidden="true"><span>{item.label}</span>{item.sub && <span>{item.sub}</span>}</span>
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
  const [shared, setShared] = useState<SharedTierList | null>(null);
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
    if (sharedRef.current) setShared((list) => (list ? { ...list, state: change(list.state) } : list)); else save(change);
  }, [save]);
  const leave = useCallback((keep: boolean) => {
    // A quiz is never kept: its rows are someone's answer sheet, not a list of the reader's.
    if (keep && sharedRef.current && sharedRef.current.mode !== 'quiz') writeTierList(sharedRef.current.state);
    window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
    setShared(null);
  }, []);
  return { state: shared?.state ?? saved, update, shared, broken, dismissBroken: () => setBroken(false), leave };
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
  // Popped out when the page opens, so the reader sees that the pool can float; its arrow pins it.
  const [detached, setDetached] = useState(true);
  const [imaging, setImaging] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [score, setScore] = useState<QuizScore | null>(null);

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
      setScore(null); // a quiz's marks are for the placements they were worked out from
    }, [update]),
  });

  const quiz = shared?.mode === 'quiz' ? shared.solution ?? null : null;
  const pool = useMemo(() => (quiz ? quizPool(items, state, quiz) : poolItems(items, state)), [items, state, quiz]);
  const shown = useMemo(() => (query.trim() ? pool.filter((item) => matchesSearch(item.name, query)) : pool), [pool, query]);
  const placedCount = state.rows.reduce((n, row) => n + row.items.length, 0);
  const editingIndex = state.rows.findIndex((row) => row.id === editing);
  const rowName = (row: TierRow, index: number) => T.rowName(row.label, index + 1);
  const empty = query.trim() && pool.length ? T.poolEmptySearch : quiz ? T.poolEmptyQuiz : !state.kinds.length ? T.poolEmptyFilters : T.poolEmptyDone;
  const markOf = (id: string) => (score?.right.has(id) ? 'right' as const : score?.wrong.has(id) ? 'wrong' as const : undefined);
  // A quiz from another address is another quiz: its marks go with it.
  useEffect(() => { setScore(null); }, [quiz]);

  const makerStyle = { '--zoom': state.zoom / 100 } as CSSProperties;
  const poolStyle = detached && poolPlace.place ? ({ '--pool-x': `${poolPlace.place.x}px`, '--pool-y': `${poolPlace.place.y}px` } as CSSProperties) : undefined;

  return (
    <div ref={root} className={styles.maker} style={makerStyle} data-detached={detached ? '' : undefined} data-names={state.names ? '' : undefined}>
      {(shared || broken) && (
        <div className={`panel ${styles.shared}`} role="status">
          <span>{shared ? T.sharedNotice[shared.mode] : T.sharedBroken}</span>
          {shared ? <>
            {!quiz && <button type="button" className="primary btn-sm" onClick={() => { if (window.confirm(T.keepSharedConfirm)) leave(true); }}>{T.keepShared}</button>}
            <button type="button" className="ghost" onClick={() => leave(false)}>{T.backToMine}</button>
          </> : <XButton label={T.done} onClick={dismissBroken} />}
        </div>
      )}

      {/* What goes in the pool, in three labelled rows on one grid: the operator art, the
          rarities that narrow it, and the kinds that have no rarity. A quiz sets its own pool. */}
      {!quiz && (
        <section className="op-section" aria-labelledby="tier-setup">
          <h2 id="tier-setup">{T.setupHeading}</h2>
          <div className={`panel ${styles.setup}`}>
            {([
              ['tier-operator-kinds', T.operatorGroup, TIER_KINDS.filter((kind) => OPERATOR_KINDS.has(kind))],
              ['tier-other-kinds', T.otherGroup, TIER_KINDS.filter((kind) => !OPERATOR_KINDS.has(kind))],
            ] as const).map(([id, label, kinds], index) => [
              <span key={`${id}-label`} className="label-tag" id={id}>{label}</span>,
              <div key={id} className={styles.checks} role="group" aria-labelledby={id}>
                {kinds.map((kind) => (
                  <label key={kind} className="check">
                    <input type="checkbox" aria-label={T.kindNames[kind]} checked={state.kinds.includes(kind)} onChange={(event) => update((current) => toggleKind(current, kind, event.target.checked))} />
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
                      <input type="checkbox" aria-label={T.rarityName(rarity)} checked={state.rarities.includes(rarity)} onChange={(event) => update((current) => toggleRarity(current, rarity, event.target.checked))} />
                      {T.rarity(rarity)}
                    </label>
                  ))}
                </div>,
              ] : []),
            ])}
          </div>
        </section>
      )}

      <section className="op-section" aria-labelledby="tier-board">
        <h2 id="tier-board">{T.boardHeading}</h2>
        <div ref={floor.ref}>
          {/* The list's name, and how its tiles are drawn: beside the tiles they change. */}
          <div className={styles.boardHead}>
            <input type="text" className={styles.name} value={state.title} maxLength={MAX_TITLE} readOnly={!!quiz} aria-label={T.titleLabel} placeholder={T.titlePlaceholder} onChange={(event) => update((current) => ({ ...current, title: event.target.value }))} />
            <label className="check">
              <input type="checkbox" checked={state.names} onChange={(event) => update((current) => ({ ...current, names: event.target.checked }))} />
              {T.names}
            </label>
            <div className={styles.zoom} role="group" aria-label={T.zoomGroup}>
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
          {state.rows.length ? (
            <ol className={styles.board}>
              {state.rows.map((row, index) => {
                const name = rowName(row, index);
                return (
                  <li key={row.id} className={styles.row}>
                    <div className={styles.label} style={rowStyle(row.color)} data-ink={labelInk(row.color)}>
                      <span aria-hidden="true">{row.label || T.rowLabelPlaceholder}{'\u200b'}</span>
                      <textarea rows={1} value={row.label} maxLength={MAX_LABEL} readOnly={!!quiz} aria-label={T.rowLabel(index + 1)} placeholder={T.rowLabelPlaceholder} onChange={(event) => update((current) => updateRow(current, row.id, { label: event.target.value.replace(/\n/g, ' ') }))} />
                    </div>
                    <div className={styles.items} data-row={row.id} role="group" aria-label={T.rowItems(name)}>
                      {row.items.map((id) => { const item = byId.get(id); return item ? <Tile key={id} item={item} mark={markOf(id)} /> : null; })}
                    </div>
                    {!quiz && <div className={styles.rowActions}>
                      <button type="button" className="ghost btn-icon" aria-label={T.editRow(name)} title={T.editRow(name)} onClick={() => setEditing(row.id)}>
                        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2.5 13.5l.7-3 7.6-7.6a1.4 1.4 0 0 1 2 0l.3.3a1.4 1.4 0 0 1 0 2l-7.6 7.6-3 .7zM9.8 3.9l2.3 2.3" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round" /></svg>
                      </button>
                      <XButton className={styles.rowDelete} label={T.deleteRow(name)} title={T.deleteRow(name)} onClick={() => update((current) => deleteRow(current, row.id))} />
                    </div>}
                  </li>
                );
              })}
            </ol>
          ) : <p className={`hint ${styles.noRows}`}>{T.noRows}</p>}
          {quiz ? (
            <div className={styles.boardActions}>
              <button type="button" className="primary btn-sm" disabled={!placedCount} title={placedCount ? undefined : T.quizNothing} onClick={() => setScore(scoreQuiz(state, quiz, (id) => byId.has(id)))}>{T.quizCheck}</button>
              <button type="button" className="ghost" disabled={!placedCount} title={placedCount ? undefined : T.quizNothing} onClick={() => { update(clearRows); setScore(null); }}>{T.quizRetry}</button>
            </div>
          ) : (
            <div className={styles.boardActions}>
              <button type="button" className="btn-sm" onClick={() => update((current) => addRow(current))}>{T.addRow}</button>
              <button type="button" className="ghost" onClick={() => setSharing(true)}>{T.share}</button>
              <button type="button" className="ghost" disabled={!placedCount} title={placedCount ? undefined : T.linkEmpty} onClick={() => setImaging(true)}>{T.makeImage}</button>
              <button type="button" className="ghost" disabled={!placedCount} title={placedCount ? undefined : T.emptyRowsNothing} onClick={() => update(clearRows)}>{T.emptyRows}</button>
              <button type="button" className="danger" onClick={() => { if (window.confirm(T.startOverConfirm)) { update(() => defaultTierList()); setQuery(''); } }}>{T.startOver}</button>
            </div>
          )}
          {quiz ? (
            // The score keeps its place and size before it is known, so checking moves nothing.
            <p className={styles.score} role="status" data-score={score ? score.percent : undefined}>
              <span className="label-tag">{T.quizScoreLabel}</span>
              <strong>{score ? T.quizPercent(score.percent) : T.quizUnchecked}</strong>
              <span className="hint">{score ? T.quizDetail(score.correct, score.total) : T.quizHint}</span>
            </p>
          ) : <p className={`hint ${styles.notice}`} role="status">{shared ? T.notSaved : T.saved}</p>}
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
      {sharing && <TierListShareDialog state={state} onClose={() => setSharing(false)} />}
    </div>
  );
}
