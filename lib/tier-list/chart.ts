/**
 * The chart maker's data: one chart in two versions, kept side by side so switching between
 * them loses nothing.
 *
 *   grid   a table of cells the reader sizes and labels, each holding items in order;
 *   axes   a plane with a label at each end of its two axes, where an item sits anywhere.
 *
 * The pool is the Tier List maker's (the same catalogue and filters); an item that is in
 * the version on screen is out of the pool.
 */
import { TIER_KINDS, TIER_RARITIES, type TierItem, type TierKind } from './catalogue';
import { clampZoom, passesFilters, ZOOM } from './state';

export const CHART_VERSION = 1;
export const CHART_SIDE = { min: 1, max: 7 } as const;
export const MAX_CHART_LABEL = 40;
export const MAX_CHART_TITLE = 80;
export const MAX_POINTS = 2000;

export type ChartKind = 'grid' | 'axes';
export const CHART_KINDS: readonly ChartKind[] = ['grid', 'axes'];
export type AxisEnd = 'top' | 'bottom' | 'left' | 'right';
export const AXIS_ENDS: readonly AxisEnd[] = ['top', 'bottom', 'left', 'right'];

export interface ChartCell { label: string; items: string[] }
/** An item on the plane: its centre, as fractions of the plane's width and height from the top left. */
export interface ChartPoint { id: string; x: number; y: number }
export interface ChartState {
  version: typeof CHART_VERSION;
  kind: ChartKind;
  title: string;
  rarities: number[];
  kinds: TierKind[];
  zoom: number;
  names: boolean;
  cols: number;
  rows: number;
  /** rows × cols cells, row by row. */
  cells: ChartCell[];
  axes: Record<AxisEnd, string>;
  points: ChartPoint[];
}

/** The classic three by three, as the grid a new chart opens on. */
const CLASSIC = ['Lawful Good', 'Neutral Good', 'Chaotic Good', 'Lawful Neutral', 'True Neutral', 'Chaotic Neutral', 'Lawful Evil', 'Neutral Evil', 'Chaotic Evil'];

export function defaultChart(): ChartState {
  return {
    version: CHART_VERSION, kind: 'grid', title: '', rarities: [6, 5], kinds: ['icons'], zoom: ZOOM.base, names: true,
    cols: 3, rows: 3, cells: CLASSIC.map((label) => ({ label, items: [] })),
    axes: { top: '', bottom: '', left: '', right: '' }, points: [],
  };
}

const side = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isInteger(value) ? Math.max(CHART_SIDE.min, Math.min(CHART_SIDE.max, value)) : fallback);
const text = (value: unknown, max: number) => (typeof value === 'string' ? value.slice(0, max) : '');
const isId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 200;
const unit = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.5);

/** A saved chart, or null for anything this page did not write. Lenient inside a valid
 *  shape: the grid is cut or padded to its stated size, an item is held once per version. */
export function parseChart(raw: string | null): ChartState | null {
  if (!raw) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  if (data.version !== CHART_VERSION || !Array.isArray(data.cells)) return null;
  const cols = side(data.cols, 3), rows = side(data.rows, 3);
  const inGrid = new Set<string>();
  const cells: ChartCell[] = Array.from({ length: rows * cols }, (_, i) => {
    const cell = (data.cells as unknown[])[i];
    const entry = cell && typeof cell === 'object' ? cell as Record<string, unknown> : {};
    return { label: text(entry.label, MAX_CHART_LABEL), items: (Array.isArray(entry.items) ? entry.items : []).filter((id): id is string => isId(id) && !inGrid.has(id) && !!inGrid.add(id)) };
  });
  const onPlane = new Set<string>();
  const points = (Array.isArray(data.points) ? data.points : []).slice(0, MAX_POINTS).flatMap((point): ChartPoint[] => {
    const entry = point && typeof point === 'object' ? point as Record<string, unknown> : {};
    return isId(entry.id) && !onPlane.has(entry.id) && onPlane.add(entry.id) ? [{ id: entry.id, x: unit(entry.x), y: unit(entry.y) }] : [];
  });
  const axes = data.axes && typeof data.axes === 'object' ? data.axes as Record<string, unknown> : {};
  return {
    version: CHART_VERSION,
    kind: data.kind === 'axes' ? 'axes' : 'grid',
    title: text(data.title, MAX_CHART_TITLE),
    rarities: TIER_RARITIES.filter((r) => Array.isArray(data.rarities) && data.rarities.includes(r)),
    kinds: TIER_KINDS.filter((k) => Array.isArray(data.kinds) && data.kinds.includes(k)),
    zoom: clampZoom(data.zoom),
    names: data.names !== false,
    cols, rows, cells,
    axes: { top: text(axes.top, MAX_CHART_LABEL), bottom: text(axes.bottom, MAX_CHART_LABEL), left: text(axes.left, MAX_CHART_LABEL), right: text(axes.right, MAX_CHART_LABEL) },
    points,
  };
}

/** What the version on screen holds. */
export function chartPlaced(state: ChartState): string[] {
  return state.kind === 'grid' ? state.cells.flatMap((cell) => cell.items) : state.points.map((point) => point.id);
}

/** The pool: every item the filters let through that is not on the version on screen. */
export function chartPool(items: readonly TierItem[], state: ChartState): TierItem[] {
  const held = new Set(chartPlaced(state));
  return items.filter((item) => passesFilters(item, state) && !held.has(item.id));
}

/** Put items in a grid cell, at `index` among the cell's tiles as drawn (the end when omitted). */
export function placeInCell(state: ChartState, ids: readonly string[], cell: number, index?: number): ChartState {
  if (!ids.length || !state.cells[cell]) return state;
  const moving = new Set(ids);
  return {
    ...state,
    cells: state.cells.map((entry, i) => {
      if (i !== cell) return entry.items.some((id) => moving.has(id)) ? { ...entry, items: entry.items.filter((id) => !moving.has(id)) } : entry;
      const before = index == null ? Infinity : index - entry.items.slice(0, index).filter((id) => moving.has(id)).length;
      const rest = entry.items.filter((id) => !moving.has(id));
      const at = Math.max(0, Math.min(rest.length, before));
      return { ...entry, items: [...rest.slice(0, at), ...moving, ...rest.slice(at)] };
    }),
  };
}

/** Put an item on the plane, or move it there. The newest sits on top of the others. */
export function placePoint(state: ChartState, id: string, x: number, y: number): ChartState {
  const rest = state.points.filter((point) => point.id !== id);
  if (rest.length >= MAX_POINTS) return state;
  return { ...state, points: [...rest, { id, x: unit(x), y: unit(y) }] };
}

/** Back to the pool, from the version on screen. */
export function unplace(state: ChartState, ids: readonly string[]): ChartState {
  if (!ids.length) return state;
  const moving = new Set(ids);
  return state.kind === 'grid'
    ? { ...state, cells: state.cells.map((cell) => (cell.items.some((id) => moving.has(id)) ? { ...cell, items: cell.items.filter((id) => !moving.has(id)) } : cell)) }
    : { ...state, points: state.points.filter((point) => !moving.has(point.id)) };
}

/** Resize the grid. A cell keeps its column and row; what a removed cell held goes back to the pool. */
export function resizeGrid(state: ChartState, cols: number, rows: number): ChartState {
  const nextCols = side(cols, state.cols), nextRows = side(rows, state.rows);
  if (nextCols === state.cols && nextRows === state.rows) return state;
  const cells = Array.from({ length: nextRows * nextCols }, (_, i): ChartCell => {
    const row = Math.floor(i / nextCols), col = i % nextCols;
    return row < state.rows && col < state.cols ? state.cells[row * state.cols + col] : { label: '', items: [] };
  });
  return { ...state, cols: nextCols, rows: nextRows, cells };
}

export const setCellLabel = (state: ChartState, cell: number, label: string): ChartState => ({ ...state, cells: state.cells.map((entry, i) => (i === cell ? { ...entry, label: label.slice(0, MAX_CHART_LABEL) } : entry)) });
export const setAxis = (state: ChartState, end: AxisEnd, label: string): ChartState => ({ ...state, axes: { ...state.axes, [end]: label.slice(0, MAX_CHART_LABEL) } });
export const setChartKind = (state: ChartState, kind: ChartKind): ChartState => (state.kind === kind ? state : { ...state, kind });

/** Empty the version on screen; its labels and size stay. */
export function clearChart(state: ChartState): ChartState {
  return state.kind === 'grid' ? { ...state, cells: state.cells.map((cell) => (cell.items.length ? { ...cell, items: [] } : cell)) } : { ...state, points: [] };
}

/** A cell's accent, from its place in the grid: the hue runs across the columns and the
 *  shade down the rows, so a grid reads as a field of colour without anyone choosing any. */
export function cellColor(index: number, cols: number, rows: number): string {
  const col = cols > 1 ? (index % cols) / (cols - 1) : 0.5, row = rows > 1 ? Math.floor(index / cols) / (rows - 1) : 0.5;
  return `hsl(${Math.round(190 - col * 180)} 62% ${Math.round(64 - row * 16)}%)`;
}
