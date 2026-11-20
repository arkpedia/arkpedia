/**
 * The chart maker's data: versions kept side by side so switching between
 * them loses nothing.
 *
 *   grid   a table of cells the reader sizes and labels, each holding items in order;
 *   bingo  a five-by-five board with column letters and an optional free space;
 *   axes   a plane with a label at each end of its two axes, where an item sits anywhere.
 *
 * The pool is the Tier List maker's (the same catalogue and filters); an item that is in
 * the version on screen is out of the pool.
 */
import { TIER_KINDS, TIER_RARITIES, type TierItem, type TierKind } from './catalogue';
import { clampZoom, passesFilters, ZOOM } from './state';

export const CHART_VERSION = 1;
export const CHART_SIDE = { min: 1, max: 7 } as const;
export const BINGO_COLUMNS = ['B', 'I', 'N', 'G', 'O'] as const;
export const BINGO_SIDE = BINGO_COLUMNS.length;
export const BINGO_CENTER = Math.floor(BINGO_SIDE ** 2 / 2);
export const MAX_CHART_LABEL = 40;
export const MAX_CHART_TITLE = 80;
export const MAX_POINTS = 2000;

export type ChartKind = 'grid' | 'bingo' | 'axes';
export const CHART_KINDS: readonly ChartKind[] = ['grid', 'bingo', 'axes'];
export type AxisEnd = 'top' | 'bottom' | 'left' | 'right';
/** The plane's two axes: the horizontal one runs left to right, the vertical one top to bottom. */
export type AxisLine = 'horizontal' | 'vertical';
export const AXIS_LINES: readonly AxisLine[] = ['horizontal', 'vertical'];
/** The ends each axis has, and so the labels that go with it. */
export const AXIS_OF: Record<AxisEnd, AxisLine> = { top: 'vertical', bottom: 'vertical', left: 'horizontal', right: 'horizontal' };
export const AXIS_ENDS: readonly AxisEnd[] = ['top', 'bottom', 'left', 'right'];

/** `color` is the label bar's, when the reader chose one (#rrggbb); else the cell wears the
 *  accent its place in the grid gives it (cellColor). */
export interface ChartCell { label: string; items: string[]; color?: string }
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
  bingo?: { title: string; cells: ChartCell[]; free: boolean };
  axes: Record<AxisEnd, string>;
  /** Which of the two axes are drawn: a reader who ranks along one line hides the other,
   *  and its labels with it. Items still sit anywhere on the plane. */
  lines: Record<AxisLine, boolean>;
  points: ChartPoint[];
}

/** The classic three by three, as the grid a new chart opens on. */
const CLASSIC = ['Lawful Good', 'Neutral Good', 'Chaotic Good', 'Lawful Neutral', 'True Neutral', 'Chaotic Neutral', 'Lawful Evil', 'Neutral Evil', 'Chaotic Evil'];

export function defaultChart(): ChartState {
  return {
    version: CHART_VERSION, kind: 'grid', title: '', rarities: [6, 5], kinds: ['icons'], zoom: ZOOM.base, names: true,
    cols: 3, rows: 3, cells: CLASSIC.map((label) => ({ label, items: [] })),
    axes: { top: '', bottom: '', left: '', right: '' }, lines: { horizontal: true, vertical: true }, points: [],
  };
}

const HEX = /^#[0-9a-f]{6}$/i;
const side = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isInteger(value) ? Math.max(CHART_SIDE.min, Math.min(CHART_SIDE.max, value)) : fallback);
const text = (value: unknown, max: number) => (typeof value === 'string' ? value.slice(0, max) : '');
const isId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 200;
const unit = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.5);

function parseCells(input: unknown[], count: number): ChartCell[] {
  const seen = new Set<string>();
  return Array.from({ length: count }, (_, i) => {
    const cell = input[i];
    const entry = cell && typeof cell === 'object' ? cell as Record<string, unknown> : {};
    return {
      label: text(entry.label, MAX_CHART_LABEL),
      items: (Array.isArray(entry.items) ? entry.items : []).filter((id): id is string => isId(id) && !seen.has(id) && !!seen.add(id)),
      ...(typeof entry.color === 'string' && HEX.test(entry.color) ? { color: entry.color.toLowerCase() } : {}),
    };
  });
}

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
  const cells = parseCells(data.cells, rows * cols);
  const savedBingo = data.bingo && typeof data.bingo === 'object' ? data.bingo as Record<string, unknown> : {};
  const bingo = Array.isArray(savedBingo.cells)
    ? { title: text(savedBingo.title ?? data.title, MAX_CHART_TITLE), cells: parseCells(savedBingo.cells, BINGO_SIDE ** 2), free: savedBingo.free === true }
    : undefined;
  const onPlane = new Set<string>();
  const points = (Array.isArray(data.points) ? data.points : []).slice(0, MAX_POINTS).flatMap((point): ChartPoint[] => {
    const entry = point && typeof point === 'object' ? point as Record<string, unknown> : {};
    return isId(entry.id) && !onPlane.has(entry.id) && onPlane.add(entry.id) ? [{ id: entry.id, x: unit(entry.x), y: unit(entry.y) }] : [];
  });
  const axes = data.axes && typeof data.axes === 'object' ? data.axes as Record<string, unknown> : {};
  const lines = data.lines && typeof data.lines === 'object' ? data.lines as Record<string, unknown> : {};
  return {
    version: CHART_VERSION,
    kind: data.kind === 'axes' ? 'axes' : data.kind === 'bingo' && bingo ? 'bingo' : 'grid',
    title: text(data.title, MAX_CHART_TITLE),
    rarities: TIER_RARITIES.filter((r) => Array.isArray(data.rarities) && data.rarities.includes(r)),
    kinds: TIER_KINDS.filter((k) => Array.isArray(data.kinds) && data.kinds.includes(k)),
    zoom: clampZoom(data.zoom),
    names: data.names !== false,
    cols, rows, cells,
    ...(bingo ? { bingo } : {}),
    axes: { top: text(axes.top, MAX_CHART_LABEL), bottom: text(axes.bottom, MAX_CHART_LABEL), left: text(axes.left, MAX_CHART_LABEL), right: text(axes.right, MAX_CHART_LABEL) },
    // Drawn unless the chart says otherwise: one saved before the toggles has both.
    lines: { horizontal: lines.horizontal !== false, vertical: lines.vertical !== false },
    points,
  };
}

/** The dimensions and cells used by the editor and the exported image. */
export function chartGrid(state: ChartState): Pick<ChartState, 'cols' | 'rows' | 'cells'> {
  return state.kind === 'bingo' && state.bingo
    ? { cols: BINGO_SIDE, rows: BINGO_SIDE, cells: state.bingo.cells }
    : state;
}

export const isBingoFreeCell = (state: ChartState, index: number) => state.kind === 'bingo' && state.bingo?.free === true && index === BINGO_CENTER;

export const chartTitle = (state: ChartState) => state.kind === 'bingo' ? state.bingo?.title ?? '' : state.title;

export function setChartTitle(state: ChartState, text: string): ChartState {
  const title = text.slice(0, MAX_CHART_TITLE);
  return state.kind === 'bingo' && state.bingo ? { ...state, bingo: { ...state.bingo, title } } : { ...state, title };
}

export function setBingoFree(state: ChartState, free: boolean): ChartState {
  return state.bingo ? { ...state, bingo: { ...state.bingo, free } } : state;
}

function replaceChartCells(state: ChartState, cells: ChartCell[]): ChartState {
  return state.kind === 'bingo' && state.bingo
    ? { ...state, bingo: { ...state.bingo, cells } }
    : { ...state, cells };
}

/** What the version on screen holds. */
export function chartPlaced(state: ChartState): string[] {
  return state.kind === 'axes'
    ? state.points.map((point) => point.id)
    : chartGrid(state).cells.flatMap((cell, index) => isBingoFreeCell(state, index) ? [] : cell.items);
}

/** The pool: every item the filters let through that is not on the version on screen. */
export function chartPool(items: readonly TierItem[], state: ChartState): TierItem[] {
  const held = new Set(chartPlaced(state));
  return items.filter((item) => passesFilters(item, state) && !held.has(item.id));
}

/** Put items in a grid cell, at `index` among the cell's tiles as drawn (the end when omitted). */
export function placeInCell(state: ChartState, ids: readonly string[], cell: number, index?: number): ChartState {
  const { cells } = chartGrid(state);
  if (!ids.length || !cells[cell] || isBingoFreeCell(state, cell)) return state;
  const moving = new Set(ids);
  return replaceChartCells(state, cells.map((entry, i) => {
    if (i !== cell) return entry.items.some((id) => moving.has(id)) ? { ...entry, items: entry.items.filter((id) => !moving.has(id)) } : entry;
    const before = index == null ? Infinity : index - entry.items.slice(0, index).filter((id) => moving.has(id)).length;
    const rest = entry.items.filter((id) => !moving.has(id));
    const at = Math.max(0, Math.min(rest.length, before));
    return { ...entry, items: [...rest.slice(0, at), ...moving, ...rest.slice(at)] };
  }));
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
  return state.kind === 'axes'
    ? { ...state, points: state.points.filter((point) => !moving.has(point.id)) }
    : replaceChartCells(state, chartGrid(state).cells.map((cell) => cell.items.some((id) => moving.has(id)) ? { ...cell, items: cell.items.filter((id) => !moving.has(id)) } : cell));
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

/** Take one column or one row out of the grid, wherever it is. The others keep their labels
 *  and items; what the removed line held goes back to the pool. A grid keeps at least one. */
export function removeGridLine(state: ChartState, line: 'col' | 'row', index: number): ChartState {
  const count = line === 'col' ? state.cols : state.rows;
  if (count <= CHART_SIDE.min || index < 0 || index >= count) return state;
  const cells = state.cells.filter((_, i) => (line === 'col' ? i % state.cols : Math.floor(i / state.cols)) !== index);
  return line === 'col' ? { ...state, cols: state.cols - 1, cells } : { ...state, rows: state.rows - 1, cells };
}

export const setCellLabel = (state: ChartState, cell: number, label: string): ChartState => replaceChartCells(state, chartGrid(state).cells.map((entry, i) => i === cell ? { ...entry, label: label.slice(0, MAX_CHART_LABEL) } : entry));
/** Give a cell's label a colour of the reader's own, or (null) hand it back to its accent. */
export function setCellColor(state: ChartState, cell: number, color: string | null): ChartState {
  if (color !== null && !HEX.test(color)) return state;
  return replaceChartCells(state, chartGrid(state).cells.map((entry, i) => { if (i !== cell) return entry; const { color: _old, ...rest } = entry; return color ? { ...rest, color: color.toLowerCase() } : rest; }));
}

export const setAxis = (state: ChartState, end: AxisEnd, label: string): ChartState => ({ ...state, axes: { ...state.axes, [end]: label.slice(0, MAX_CHART_LABEL) } });
export const setAxisLine = (state: ChartState, line: AxisLine, shown: boolean): ChartState => (state.lines[line] === shown ? state : { ...state, lines: { ...state.lines, [line]: shown } });
export function setChartKind(state: ChartState, kind: ChartKind): ChartState {
  if (kind === 'bingo' && !state.bingo) {
    const cells = resizeGrid(state, BINGO_SIDE, BINGO_SIDE).cells.map((cell, index) => {
      const row = Math.floor(index / BINGO_SIDE), col = index % BINGO_SIDE;
      const label = state.cols === 3 && state.rows === 3 && row < 3 && col < 3 && cell.label === CLASSIC[row * 3 + col] ? '' : cell.label;
      return { ...cell, label };
    });
    const center = cells[BINGO_CENTER];
    return { ...state, kind, bingo: { title: state.title, cells, free: !center.label && !center.items.length } };
  }
  return state.kind === kind ? state : { ...state, kind };
}

/** Empty the version on screen; its labels and size stay. */
export function clearChart(state: ChartState): ChartState {
  return state.kind === 'axes'
    ? { ...state, points: [] }
    : replaceChartCells(state, chartGrid(state).cells.map((cell) => cell.items.length ? { ...cell, items: [] } : cell));
}

/** A cell's accent, from its place in the grid: the hue runs across the columns and the
 *  shade down the rows, so a grid reads as a field of colour without anyone choosing any.
 *  As #rrggbb, the form a colour field takes and a reader's own choice is kept in. */
export function cellColor(index: number, cols: number, rows: number): string {
  const col = cols > 1 ? (index % cols) / (cols - 1) : 0.5, row = rows > 1 ? Math.floor(index / cols) / (rows - 1) : 0.5;
  const h = 190 - col * 180, sat = 0.62, light = 0.64 - row * 0.16;
  const a = sat * Math.min(light, 1 - light);
  const channel = (n: number) => { const k = (n + h / 30) % 12; return Math.round(255 * (light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0'); };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

/** The colour a cell's label bar is drawn in: the reader's, or the cell's accent. */
export function cellLabelColor(state: ChartState, index: number): string {
  const { cells, cols, rows } = chartGrid(state);
  return cells[index]?.color ?? cellColor(index, cols, rows);
}
