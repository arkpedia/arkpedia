import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import SegmentedControl from '@/components/ui/SegmentedControl';
import XButton from '@/components/ui/XButton';
import { useHeightFloor } from '@/components/ui/useHeightFloor';
import { matchesSearch } from '@/lib/search/searchNormalize';
import { catalogueItems, TIER_KINDS, TIER_RARITIES, type TierCatalogue } from '@/lib/tier-list/catalogue';
import { AXIS_ENDS, AXIS_LINES, AXIS_OF, cellLabelColor, CHART_KINDS, CHART_SIDE, chartPlaced, chartPool, clearChart, defaultChart, MAX_CHART_LABEL, MAX_CHART_TITLE, placeInCell, placePoint, removeGridLine, resizeGrid, setAxis, setAxisLine, setCellColor, setCellLabel, setChartKind, setGridLabel, unplace, type ChartKind, type ChartState } from '@/lib/tier-list/chart';
import { CHART_PARAM, decodeChart, encodeChart, type ChartShareMode, type SharedChart } from '@/lib/tier-list/chartShare';
import { chartQuizPool, scoreChartQuiz, type QuizScore } from '@/lib/tier-list/quiz';
import { useChart, writeChart } from '@/lib/tier-list/chartStore';
import { CHART_STRINGS as C } from '@/lib/tier-list/chartStrings';
import { sharePayload } from '@/lib/tier-list/share';
import { clampZoom, labelInk } from '@/lib/tier-list/state';
import { TIER_LIST_STRINGS as T } from '@/lib/tier-list/strings';
import ChartShareImage from './ChartShareImage';
import { KindFilters, PoolWindow, Tile, TileControls } from './makerParts';
import ShareLinkDialog from './ShareLinkDialog';
import { useTierDrag, type TierDrop } from './useTierDrag';
import styles from './TierList.module.css';

type Change = (state: ChartState) => ChartState;
const CELL = 'cell:';
const CELL_VERDICTS = { right: C.quizRight, wrong: C.quizWrong };

/** The chart on screen and the one way to change it: the reader's saved chart, or one opened
 *  from a link (`#chart=`), which is held in memory so it can never overwrite theirs unless
 *  they keep it (the Tier List maker's rule, components/community/TierListMaker.tsx). */
function useShownChart() {
  const [saved, save] = useChart();
  const [shared, setShared] = useState<SharedChart | null>(null);
  const [broken, setBroken] = useState(false);
  const sharedRef = useRef(shared);
  useEffect(() => { sharedRef.current = shared; }, [shared]);
  useEffect(() => {
    let current = 0;
    const read = () => {
      const turn = ++current;
      const payload = sharePayload(window.location.hash, CHART_PARAM);
      if (!payload) { setShared(null); return; }
      void decodeChart(payload).then((chart) => { if (turn === current) { setShared(chart); setBroken(!chart); } });
    };
    read();
    window.addEventListener('hashchange', read);
    return () => { current += 1; window.removeEventListener('hashchange', read); };
  }, []);
  const update = useCallback((change: Change) => {
    if (sharedRef.current) setShared((chart) => (chart ? { ...chart, state: change(chart.state) } : chart)); else save(change);
  }, [save]);
  const leave = useCallback((keep: boolean) => {
    // A quiz is never kept: its grid is someone's answer sheet, not a chart of the reader's.
    if (keep && sharedRef.current && sharedRef.current.mode !== 'quiz') writeChart(sharedRef.current.state);
    window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
    setShared(null);
  }, []);
  return { state: shared?.state ?? saved, update, shared, broken, dismissBroken: () => setBroken(false), leave };
}

export default function ChartMaker({ catalogue }: { catalogue: TierCatalogue }) {
  const items = useMemo(() => catalogueItems(catalogue), [catalogue]);
  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const { state, update, shared, broken, dismissBroken, leave } = useShownChart();
  const [query, setQuery] = useState('');
  // The pool sits under the chart until opened as a floating tool.
  const [detached, setDetached] = useState(false);
  const [imaging, setImaging] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [score, setScore] = useState<QuizScore | null>(null);

  const root = useRef<HTMLDivElement>(null);
  const ghost = useRef<HTMLDivElement>(null);
  const mark = useRef<HTMLDivElement>(null);
  const floor = useHeightFloor('chart-maker');

  useTierDrag({
    root, ghost, mark,
    carried: useCallback((id: string) => [id], []),
    onDrop: useCallback((ids: string[], drop: TierDrop) => {
      update((current) => {
        if ('row' in drop && drop.row.startsWith(CELL) && current.kind === 'grid') return placeInCell(current, ids, Number(drop.row.slice(CELL.length)), drop.index);
        if ('plane' in drop && current.kind === 'axes') return ids.reduce((next, id) => placePoint(next, id, drop.x, drop.y), current);
        return unplace(current, ids);
      });
      setScore(null); // a quiz's marks are for the placements they were worked out from
    }, [update]),
  });

  const quiz = shared?.mode === 'quiz' ? shared.solution ?? null : null;
  const pool = useMemo(() => (quiz ? chartQuizPool(items, state, quiz) : chartPool(items, state)), [items, state, quiz]);
  const markOf = (id: string) => (score?.right.has(id) ? 'right' as const : score?.wrong.has(id) ? 'wrong' as const : undefined);
  // A quiz from another address is another quiz: its marks go with it.
  useEffect(() => { setScore(null); }, [quiz]);
  const shown = useMemo(() => (query.trim() ? pool.filter((item) => matchesSearch(item.name, query)) : pool), [pool, query]);
  const placedCount = chartPlaced(state).length;
  const canMakeImage = placedCount > 0 || (state.kind === 'grid' && !state.showCellLabels);
  const empty = query.trim() && pool.length ? T.poolEmptySearch : quiz ? T.poolEmptyQuiz : !state.kinds.length ? T.poolEmptyFilters : T.poolEmptyDone;
  const makerStyle = { '--zoom': state.zoom / 100 } as CSSProperties;
  const gridHeaders = (line: 'col' | 'row') => {
    const column = line === 'col';
    const labels = column ? state.columnLabels : state.rowLabels;
    const labelOf = column ? C.columnLabel : C.rowLabel;
    const placeholderOf = column ? C.columnPlaceholder : C.rowPlaceholder;
    const remove = column ? C.removeColumn : C.removeRow;
    const canRemove = !quiz && labels.length > CHART_SIDE.min;
    if (!state.showGridHeaders && !canRemove) return null;
    return labels.map((label, index) => (
      <div key={index} className={styles.gridHeader} style={{ gridColumn: column ? index + 2 : 1, gridRow: column ? 1 : index + 2 }}>
        {state.showGridHeaders && (quiz
          ? <span className={styles.gridHeaderText}>{label}</span>
          : <textarea rows={2} className={styles.axisLabel} value={label} maxLength={MAX_CHART_LABEL} aria-label={labelOf(index + 1)} placeholder={placeholderOf(index + 1)} onChange={(event) => update((current) => setGridLabel(current, line, index, event.target.value))} />)}
        {canRemove && <XButton dense label={remove(index + 1)} title={remove(index + 1)} onClick={() => update((current) => removeGridLine(current, line, index))} />}
      </div>
    ));
  };

  return (
    <div ref={root} className={styles.maker} style={makerStyle} data-detached={detached ? '' : undefined} data-names={state.names ? '' : undefined}>
      {(shared || broken) && (
        <div className={`panel ${styles.shared}`} role="status">
          <span>{shared ? C.sharedNotice[shared.mode] : C.sharedBroken}</span>
          {shared ? <>
            {!quiz && <button type="button" className="primary btn-sm" onClick={() => { if (window.confirm(C.keepSharedConfirm)) leave(true); }}>{T.keepShared}</button>}
            <button type="button" className="ghost" onClick={() => leave(false)}>{T.backToMine}</button>
          </> : <XButton label={T.done} onClick={dismissBroken} />}
        </div>
      )}

      {/* A quiz sets its own pool, and its grid is locked: the cells are the question. */}
      {!quiz && <KindFilters rarities={state.rarities} kinds={state.kinds}
        onRarity={(rarity, on) => update((current) => ({ ...current, rarities: TIER_RARITIES.filter((r) => (r === rarity ? on : current.rarities.includes(r))) }))}
        onKind={(kind, on) => update((current) => ({ ...current, kinds: TIER_KINDS.filter((k) => (k === kind ? on : current.kinds.includes(k))) }))} />}

      <section className="op-section" aria-labelledby="chart-board">
        <h2 id="chart-board">{C.boardHeading}</h2>
        <div ref={floor.ref}>
          <div className={styles.boardHead}>
            <input type="text" className={styles.name} value={state.title} maxLength={MAX_CHART_TITLE} readOnly={!!quiz} aria-label={C.titleLabel} placeholder={C.titlePlaceholder} onChange={(event) => update((current) => ({ ...current, title: event.target.value }))} />
            <TileControls names={state.names} zoom={state.zoom} onNames={(names) => update((current) => ({ ...current, names }))} onZoom={(zoom) => update((current) => ({ ...current, zoom: clampZoom(zoom) }))} />
          </div>
          {!quiz && <div className={styles.chartBar}>
            <SegmentedControl label={C.version} value={state.kind} onChange={(kind: ChartKind) => update((current) => setChartKind(current, kind))} options={CHART_KINDS.map((kind) => ({ value: kind, label: C.kinds[kind] }))} />
            {/* Either axis can go, or both: for a chart that ranks along one line, or none. */}
            {state.kind === 'grid' ? (
              <div className={styles.checks} role="group" aria-label={C.gridLabels}>
                <label className="check">
                  <input type="checkbox" checked={state.showGridHeaders} onChange={(event) => update((current) => ({ ...current, showGridHeaders: event.target.checked }))} />
                  {C.showGridHeaders}
                </label>
                <label className="check">
                  <input type="checkbox" checked={state.showCellLabels} onChange={(event) => update((current) => ({ ...current, showCellLabels: event.target.checked }))} />
                  {C.showCellLabels}
                </label>
              </div>
            ) : (
              <div className={styles.checks} role="group" aria-label={C.axisLines}>
                {AXIS_LINES.map((line) => (
                  <label key={line} className="check">
                    <input type="checkbox" checked={state.lines[line]} onChange={(event) => update((current) => setAxisLine(current, line, event.target.checked))} />
                    {C.axisLine[line]}
                  </label>
                ))}
              </div>
            )}
          </div>}

          {state.kind === 'grid' ? (
            <div className={state.showGridHeaders ? styles.chartScroll : undefined}>
              <div className={styles.chartFrame} data-headers={state.showGridHeaders ? '' : undefined} data-cell-labels={state.showCellLabels ? '' : undefined} style={{ '--chart-cols': state.cols, '--chart-rows': state.rows } as CSSProperties}>
                {gridHeaders('col')}
                {gridHeaders('row')}
                <div className={styles.chartGrid}>
                  {state.cells.map((cell, index) => {
                    const row = Math.floor(index / state.cols) + 1, col = (index % state.cols) + 1;
                    const color = cellLabelColor(state, index);
                    const labels = state.showGridHeaders ? [state.rowLabels[row - 1], state.columnLabels[col - 1]] : [];
                    if (state.showCellLabels) labels.push(cell.label);
                    const label = labels.map((value) => value.trim()).filter(Boolean).join(', ');
                    return (
                      <div key={index} className={styles.chartCell} style={{ '--cell-color': color } as CSSProperties} data-ink={labelInk(color)}>
                        <div className={styles.cellItems} data-row={`${CELL}${index}`} role="group" aria-label={C.cellItems(label, row, col)}>
                          {cell.items.map((id) => { const item = byId.get(id); return item ? <Tile key={id} item={item} mark={markOf(id)} verdicts={CELL_VERDICTS} /> : null; })}
                        </div>
                        {/* The label bar: its text, and the colour the reader gives it (its accent until they do). */}
                        {state.showCellLabels && <div className={styles.cellBar}>
                          <input type="text" className={styles.cellLabel} value={cell.label} maxLength={MAX_CHART_LABEL} readOnly={!!quiz} aria-label={C.cellLabel(row, col)} placeholder={C.cellPlaceholder} onChange={(event) => update((current) => setCellLabel(current, index, event.target.value))} />
                          {/* The colour field is the whole swatch: the tier list's edit pencil, in the bar's ink, over the native picker. */}
                          {!quiz && <label className={styles.cellColor} title={C.cellColor(row, col)}>
                            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M2.5 13.5l.7-3 7.6-7.6a1.4 1.4 0 0 1 2 0l.3.3a1.4 1.4 0 0 1 0 2l-7.6 7.6-3 .7zM9.8 3.9l2.3 2.3" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round" /></svg>
                            <input type="color" value={color} aria-label={C.cellColor(row, col)} onChange={(event) => update((current) => setCellColor(current, index, event.target.value))} />
                          </label>}
                        </div>}
                      </div>
                    );
                  })}
                </div>
                {!quiz && <button type="button" className={`ghost ${styles.lineAdd}`} data-line="col" aria-label={C.addColumn} title={state.cols >= CHART_SIDE.max ? C.gridFull(CHART_SIDE.max) : C.addColumn} disabled={state.cols >= CHART_SIDE.max} onClick={() => update((current) => resizeGrid(current, current.cols + 1, current.rows))}>
                  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3.5 8h9M8 3.5v9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                </button>}
                {!quiz && <button type="button" className={`ghost ${styles.lineAdd}`} data-line="row" aria-label={C.addRow} title={state.rows >= CHART_SIDE.max ? C.gridFull(CHART_SIDE.max) : C.addRow} disabled={state.rows >= CHART_SIDE.max} onClick={() => update((current) => resizeGrid(current, current.cols, current.rows + 1))}>
                  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3.5 8h9M8 3.5v9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                </button>}
              </div>
            </div>
          ) : (
            // The labels stand outside the plane, one at each end of each axis, so nothing lies
            // over an item placed on it. The frame keeps their places when an axis is hidden.
            <div className={styles.planeFrame}>
              {AXIS_ENDS.filter((end) => state.lines[AXIS_OF[end]]).map((end) => (
                <input key={end} type="text" className={styles.axisLabel} data-end={end} value={state.axes[end]} maxLength={MAX_CHART_LABEL} aria-label={C.axisLabel[end]} placeholder={C.axisPlaceholder[end]} onChange={(event) => update((current) => setAxis(current, end, event.target.value))} />
              ))}
              <div className={styles.plane} data-plane="" data-no-horizontal={state.lines.horizontal ? undefined : ''} data-no-vertical={state.lines.vertical ? undefined : ''} role="group" aria-label={C.plane}>
                {state.points.map((point) => { const item = byId.get(point.id); return item ? <Tile key={point.id} item={item} style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }} /> : null; })}
                {/* Where a dragged item will land: lines to both axes, drawn while one is over the plane. */}
                <span className={styles.planeGuide} aria-hidden="true" />
              </div>
            </div>
          )}

          {quiz ? <>
            <div className={styles.boardActions}>
              <button type="button" className="primary btn-sm" disabled={!placedCount} title={placedCount ? undefined : T.quizNothing} onClick={() => setScore(scoreChartQuiz(state, quiz, (id) => byId.has(id)))}>{T.quizCheck}</button>
              <button type="button" className="ghost" disabled={!placedCount} title={placedCount ? undefined : T.quizNothing} onClick={() => { update(clearChart); setScore(null); }}>{T.quizRetry}</button>
            </div>
            {/* The score keeps its place and size before it is known, so checking moves nothing. */}
            <p className={styles.score} role="status" data-score={score ? score.percent : undefined}>
              <span className="label-tag">{T.quizScoreLabel}</span>
              <strong>{score ? T.quizPercent(score.percent) : T.quizUnchecked}</strong>
              <span className="hint">{score ? C.quizDetail(score.correct, score.total) : T.quizHint}</span>
            </p>
          </> : <>
            <div className={styles.boardActions}>
              <button type="button" className="ghost" onClick={() => setSharing(true)}>{C.share}</button>
              <button type="button" className="ghost" disabled={!canMakeImage} title={canMakeImage ? undefined : C.emptyNothing} onClick={() => setImaging(true)}>{T.makeImage}</button>
              <button type="button" className="ghost" disabled={!placedCount} title={placedCount ? undefined : C.emptyNothing} onClick={() => update(clearChart)}>{C.empty}</button>
              <button type="button" className="danger" onClick={() => { if (window.confirm(C.startOverConfirm)) { update(() => defaultChart()); setQuery(''); } }}>{C.startOver}</button>
            </div>
            <p className={`hint ${styles.notice}`} role="status">{shared ? C.notSaved : C.saved}</p>
          </>}
          {floor.spacer}
        </div>
      </section>

      <PoolWindow items={shown} query={query} onQuery={setQuery} detached={detached} onDetached={setDetached} empty={empty} floorKey="chart-maker-pool" hint={C.hint} />

      <div ref={ghost} className={styles.ghost} hidden aria-hidden="true"><span data-art /><span data-count hidden /></div>
      <div ref={mark} className={styles.mark} hidden aria-hidden="true" />

      {imaging && <ChartShareImage state={state} byId={byId} onClose={() => setImaging(false)} />}
      {sharing && (
        <ShareLinkDialog title={C.shareDialog} param={CHART_PARAM} note={T.shareNote} onClose={() => setSharing(false)}
          modes={(state.kind === 'grid' ? ['full', 'template', 'quiz'] as const : ['full', 'template'] as const).map((mode) => ({ id: mode, ...C.shareModes[mode], needsItems: mode !== 'template' }))}
          hasItems={placedCount > 0} encode={(mode) => encodeChart(state, mode as ChartShareMode)} />
      )}
    </div>
  );
}
