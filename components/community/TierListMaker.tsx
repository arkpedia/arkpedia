import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import ImportDialog from '@/components/account/ImportDialog';
import XButton from '@/components/ui/XButton';
import { useHeightFloor } from '@/components/ui/useHeightFloor';
import { matchesSearch } from '@/lib/search/searchNormalize';
import { catalogueItems, type TierCatalogue } from '@/lib/tier-list/catalogue';
import { quizPool, scoreQuiz, type QuizScore } from '@/lib/tier-list/quiz';
import { decodeTierList, encodeTierList, SHARE_PARAM, sharePayload, type SharedTierList, type ShareMode } from '@/lib/tier-list/share';
import { addRow, clearRows, defaultTierList, deleteRow, labelInk, moveRow, placeItems, poolItems, returnToPool, ROW_COLORS, setZoom, toggleKind, toggleRarity, updateRow, MAX_LABEL, MAX_TITLE, type TierListState, type TierRow } from '@/lib/tier-list/state';
import { useTierList, writeTierList } from '@/lib/tier-list/store';
import { TIER_LIST_STRINGS as T } from '@/lib/tier-list/strings';
import ShareLinkDialog from './ShareLinkDialog';
import TierListShareImage from './TierListShareImage';
import { KindFilters, PoolWindow, Tile, TileControls } from './makerParts';
import { useTierDrag, type TierDrop } from './useTierDrag';
import styles from './TierList.module.css';

type Change = (state: TierListState) => TierListState;

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

export default function TierListMaker({ catalogue }: { catalogue: TierCatalogue }) {
  const items = useMemo(() => catalogueItems(catalogue), [catalogue]);
  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const { state, update, shared, broken, dismissBroken, leave } = useShownTierList();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  // Popped out when the page opens, so the reader sees that the pool can float; Collapse pins it.
  const [detached, setDetached] = useState(true);
  const [imaging, setImaging] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [score, setScore] = useState<QuizScore | null>(null);

  const root = useRef<HTMLDivElement>(null);
  const ghost = useRef<HTMLDivElement>(null);
  const mark = useRef<HTMLDivElement>(null);
  const floor = useHeightFloor('tier-list');

  useTierDrag({
    root, ghost, mark,
    carried: useCallback((id: string) => [id], []),
    onDrop: useCallback((ids: string[], drop: TierDrop) => {
      update((current) => ('row' in drop ? placeItems(current, ids, drop.row, drop.index) : returnToPool(current, ids)));
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

      {/* A quiz sets its own pool. */}
      {!quiz && <KindFilters rarities={state.rarities} kinds={state.kinds} onRarity={(rarity, on) => update((current) => toggleRarity(current, rarity, on))} onKind={(kind, on) => update((current) => toggleKind(current, kind, on))} />}

      <section className="op-section" aria-labelledby="tier-board">
        <h2 id="tier-board">{T.boardHeading}</h2>
        <div ref={floor.ref}>
          {/* The list's name, and how its tiles are drawn: beside the tiles they change. */}
          <div className={styles.boardHead}>
            <input type="text" className={styles.name} value={state.title} maxLength={MAX_TITLE} readOnly={!!quiz} aria-label={T.titleLabel} placeholder={T.titlePlaceholder} onChange={(event) => update((current) => ({ ...current, title: event.target.value }))} />
            <TileControls names={state.names} zoom={state.zoom} onNames={(names) => update((current) => ({ ...current, names }))} onZoom={(zoom) => update((current) => setZoom(current, zoom))} />
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

      <PoolWindow items={shown} query={query} onQuery={setQuery} detached={detached} onDetached={setDetached} empty={empty} floorKey="tier-list-pool" />

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
      {sharing && (
        <ShareLinkDialog title={T.shareDialog} param={SHARE_PARAM} note={T.shareNote} onClose={() => setSharing(false)}
          modes={(['full', 'template', 'quiz'] as const).map((mode) => ({ id: mode, ...T.shareModes[mode], needsItems: mode !== 'template' }))}
          hasItems={placedCount > 0} encode={(mode) => encodeTierList(state, mode as ShareMode)} />
      )}
    </div>
  );
}
