import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import SegmentedControl from '@/components/ui/SegmentedControl';
import XButton from '@/components/ui/XButton';
import { useHeightFloor } from '@/components/ui/useHeightFloor';
import { matchesSearch } from '@/lib/search/searchNormalize';
import { catalogueItems, TIER_KINDS, TIER_RARITIES, type TierCatalogue } from '@/lib/tier-list/catalogue';
import { AXIS_ENDS, cellColor, CHART_KINDS, CHART_SIDE, chartPlaced, chartPool, clearChart, defaultChart, MAX_CHART_LABEL, MAX_CHART_TITLE, placeInCell, placePoint, resizeGrid, setAxis, setCellLabel, setChartKind, unplace, type ChartKind, type ChartState } from '@/lib/tier-list/chart';
import { CHART_PARAM, decodeChart, encodeChart, type ChartShareMode, type SharedChart } from '@/lib/tier-list/chartShare';
import { useChart, writeChart } from '@/lib/tier-list/chartStore';
import { CHART_STRINGS as C } from '@/lib/tier-list/chartStrings';
import { sharePayload } from '@/lib/tier-list/share';
import { clampZoom } from '@/lib/tier-list/state';
import { TIER_LIST_STRINGS as T } from '@/lib/tier-list/strings';
import ChartShareImage from './ChartShareImage';
import { KindFilters, PoolWindow, Tile, TileControls } from './makerParts';
import ShareLinkDialog from './ShareLinkDialog';
import { useTierDrag, type TierDrop } from './useTierDrag';
import styles from './TierList.module.css';

type Change = (state: ChartState) => ChartState;
const CELL = 'cell:';

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
    if (keep && sharedRef.current) writeChart(sharedRef.current.state);
    window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
    setShared(null);
  }, []);
  return { state: shared?.state ?? saved, update, shared, broken, dismissBroken: () => setBroken(false), leave };
}

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <div className={styles.stepper} role="group" aria-label={label}>
      <span className="label-tag">{label}</span>
      <button type="button" className="ghost btn-icon" aria-label={C.fewer(label)} title={value <= CHART_SIDE.min ? C.atLeast(label) : C.fewer(label)} disabled={value <= CHART_SIDE.min} onClick={() => onChange(value - 1)}>
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3.5 8h9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
      </button>
      <output className={styles.zoomValue}>{value}</output>
      <button type="button" className="ghost btn-icon" aria-label={C.more(label)} title={value >= CHART_SIDE.max ? C.atMost(label, CHART_SIDE.max) : C.more(label)} disabled={value >= CHART_SIDE.max} onClick={() => onChange(value + 1)}>
        <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3.5 8h9M8 3.5v9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
      </button>
    </div>
  );
}

export default function ChartMaker({ catalogue }: { catalogue: TierCatalogue }) {
  const items = useMemo(() => catalogueItems(catalogue), [catalogue]);
  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const { state, update, shared, broken, dismissBroken, leave } = useShownChart();
  const [query, setQuery] = useState('');
  // Popped out when the page opens, so the reader sees that the pool can float; its arrow pins it.
  const [detached, setDetached] = useState(true);
  const [imaging, setImaging] = useState(false);
  const [sharing, setSharing] = useState(false);

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
    }, [update]),
  });

  const pool = useMemo(() => chartPool(items, state), [items, state]);
  const shown = useMemo(() => (query.trim() ? pool.filter((item) => matchesSearch(item.name, query)) : pool), [pool, query]);
  const placedCount = chartPlaced(state).length;
  const empty = query.trim() && pool.length ? T.poolEmptySearch : !state.kinds.length ? T.poolEmptyFilters : T.poolEmptyDone;
  const makerStyle = { '--zoom': state.zoom / 100 } as CSSProperties;

  return (
    <div ref={root} className={styles.maker} style={makerStyle} data-detached={detached ? '' : undefined} data-names={state.names ? '' : undefined}>
      {(shared || broken) && (
        <div className={`panel ${styles.shared}`} role="status">
          <span>{shared ? C.sharedNotice[shared.mode] : C.sharedBroken}</span>
          {shared ? <>
            <button type="button" className="primary btn-sm" onClick={() => { if (window.confirm(C.keepSharedConfirm)) leave(true); }}>{T.keepShared}</button>
            <button type="button" className="ghost" onClick={() => leave(false)}>{T.backToMine}</button>
          </> : <XButton label={T.done} onClick={dismissBroken} />}
        </div>
      )}

      <KindFilters rarities={state.rarities} kinds={state.kinds}
        onRarity={(rarity, on) => update((current) => ({ ...current, rarities: TIER_RARITIES.filter((r) => (r === rarity ? on : current.rarities.includes(r))) }))}
        onKind={(kind, on) => update((current) => ({ ...current, kinds: TIER_KINDS.filter((k) => (k === kind ? on : current.kinds.includes(k))) }))} />

      <section className="op-section" aria-labelledby="chart-board">
        <h2 id="chart-board">{C.boardHeading}</h2>
        <div ref={floor.ref}>
          <div className={styles.boardHead}>
            <input type="text" className={styles.name} value={state.title} maxLength={MAX_CHART_TITLE} aria-label={C.titleLabel} placeholder={C.titlePlaceholder} onChange={(event) => update((current) => ({ ...current, title: event.target.value }))} />
            <TileControls names={state.names} zoom={state.zoom} onNames={(names) => update((current) => ({ ...current, names }))} onZoom={(zoom) => update((current) => ({ ...current, zoom: clampZoom(zoom) }))} />
          </div>
          <div className={styles.chartBar}>
            <SegmentedControl label={C.version} value={state.kind} onChange={(kind: ChartKind) => update((current) => setChartKind(current, kind))} options={CHART_KINDS.map((kind) => ({ value: kind, label: C.kinds[kind] }))} />
            {state.kind === 'grid' && <>
              <Stepper label={C.columns} value={state.cols} onChange={(cols) => update((current) => resizeGrid(current, cols, current.rows))} />
              <Stepper label={C.rows} value={state.rows} onChange={(rows) => update((current) => resizeGrid(current, current.cols, rows))} />
            </>}
          </div>

          {state.kind === 'grid' ? (
            <div className={styles.chartGrid} style={{ '--chart-cols': state.cols } as CSSProperties}>
              {state.cells.map((cell, index) => {
                const row = Math.floor(index / state.cols) + 1, col = (index % state.cols) + 1;
                return (
                  <div key={index} className={styles.chartCell} style={{ '--cell-color': cellColor(index, state.cols, state.rows) } as CSSProperties}>
                    <div className={styles.cellItems} data-row={`${CELL}${index}`} role="group" aria-label={C.cellItems(cell.label, row, col)}>
                      {cell.items.map((id) => { const item = byId.get(id); return item ? <Tile key={id} item={item} /> : null; })}
                    </div>
                    <input type="text" className={styles.cellLabel} value={cell.label} maxLength={MAX_CHART_LABEL} aria-label={C.cellLabel(row, col)} placeholder={C.cellPlaceholder} onChange={(event) => update((current) => setCellLabel(current, index, event.target.value))} />
                  </div>
                );
              })}
            </div>
          ) : (
            <div className={styles.plane} data-plane="" role="group" aria-label={C.plane}>
              {state.points.map((point) => { const item = byId.get(point.id); return item ? <Tile key={point.id} item={item} style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }} /> : null; })}
              {AXIS_ENDS.map((end) => (
                <input key={end} type="text" className={styles.axisLabel} data-end={end} value={state.axes[end]} maxLength={MAX_CHART_LABEL} aria-label={C.axisLabel[end]} placeholder={C.axisPlaceholder[end]} onChange={(event) => update((current) => setAxis(current, end, event.target.value))} />
              ))}
            </div>
          )}

          <div className={styles.boardActions}>
            <button type="button" className="ghost" onClick={() => setSharing(true)}>{C.share}</button>
            <button type="button" className="ghost" disabled={!placedCount} title={placedCount ? undefined : C.emptyNothing} onClick={() => setImaging(true)}>{T.makeImage}</button>
            <button type="button" className="ghost" disabled={!placedCount} title={placedCount ? undefined : C.emptyNothing} onClick={() => update(clearChart)}>{C.empty}</button>
            <button type="button" className="danger" onClick={() => { if (window.confirm(C.startOverConfirm)) { update(() => defaultChart()); setQuery(''); } }}>{C.startOver}</button>
          </div>
          <p className={`hint ${styles.notice}`} role="status">{shared ? C.notSaved : C.saved}</p>
          {floor.spacer}
        </div>
      </section>

      <PoolWindow items={shown} query={query} onQuery={setQuery} detached={detached} onDetached={setDetached} empty={empty} floorKey="chart-maker-pool" hint={C.hint} />

      <div ref={ghost} className={styles.ghost} hidden aria-hidden="true"><span data-art /><span data-count hidden /></div>
      <div ref={mark} className={styles.mark} hidden aria-hidden="true" />

      {imaging && <ChartShareImage state={state} byId={byId} onClose={() => setImaging(false)} />}
      {sharing && (
        <ShareLinkDialog title={C.shareDialog} param={CHART_PARAM} note={T.shareNote} onClose={() => setSharing(false)}
          modes={(['full', 'template'] as const).map((mode) => ({ id: mode, ...C.shareModes[mode], needsItems: mode === 'full' }))}
          hasItems={placedCount > 0} encode={(mode) => encodeChart(state, mode as ChartShareMode)} />
      )}
    </div>
  );
}
