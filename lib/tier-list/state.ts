/**
 * The reader's tier list, as pure data and the changes it allows. The page keeps one of
 * these and lib/tier-list/store.ts is the only place it is saved.
 *
 * An item is in a row or it is not; one that is not is in the pool when the filters let it
 * through. The filters choose the pool only: unticking a rarity never takes a placed item
 * out of its row.
 */
import { OPERATOR_KINDS, TIER_KINDS, TIER_RARITIES, type TierItem, type TierKind } from './catalogue';

export const TIER_LIST_VERSION = 1;
export const MAX_LABEL = 60;
export const MAX_TITLE = 80;
export const MAX_ROWS = 100;

/** The tiles' zoom, in percent of their base size: full illustrations need more room than icons. */
export const ZOOM = { min: 50, max: 300, step: 25, base: 100 } as const;
export const clampZoom = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? Math.max(ZOOM.min, Math.min(ZOOM.max, Math.round(value / ZOOM.step) * ZOOM.step)) : ZOOM.base);

export interface TierRow { id: string; label: string; color: string; items: string[] }
export interface TierListState {
  version: typeof TIER_LIST_VERSION;
  title: string;
  rows: TierRow[];
  rarities: number[];
  kinds: TierKind[];
  /** How large the tiles are drawn, in percent (ZOOM). */
  zoom: number;
  /** Whether tiles carry their name plate. */
  names: boolean;
}

/** The label colours offered as swatches; the first five are the default rows'. */
export const ROW_COLORS: readonly string[] = ['#ff7f7f', '#ffbf7f', '#ffdf7f', '#bfff7f', '#7fbfff', '#7f7fff', '#ff7fff', '#bf7fbf', '#3b3b3b', '#cfcfcf'];
const DEFAULT_LABELS = ['S', 'A', 'B', 'C', 'D'];

export function defaultTierList(): TierListState {
  return {
    version: TIER_LIST_VERSION,
    title: '',
    rows: DEFAULT_LABELS.map((label, i) => ({ id: `r${i + 1}`, label, color: ROW_COLORS[i], items: [] })),
    rarities: [6, 5],
    kinds: ['icons'],
    zoom: ZOOM.base,
    names: true,
  };
}

const HEX = /^#[0-9a-f]{6}$/i;
const isId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 200;

/** A saved tier list, or null for anything this page did not write. Lenient inside a valid
 *  shape: a bad colour becomes a swatch, a repeated item keeps its first place. */
export function parseTierList(raw: string | null): TierListState | null {
  if (!raw) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!value || typeof value !== 'object') return null;
  const data = value as Record<string, unknown>;
  if (data.version !== TIER_LIST_VERSION || !Array.isArray(data.rows)) return null;
  const seen = new Set<string>();
  const rowIds = new Set<string>();
  const take = (list: unknown) => (Array.isArray(list) ? list : []).filter((id): id is string => isId(id) && !seen.has(id) && !!seen.add(id));
  const rows: TierRow[] = [];
  for (const [i, entry] of data.rows.slice(0, MAX_ROWS).entries()) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    let id = isId(row.id) ? row.id : `r${i + 1}`;
    while (rowIds.has(id)) id = `${id}x`;
    rowIds.add(id);
    rows.push({
      id,
      label: typeof row.label === 'string' ? row.label.slice(0, MAX_LABEL) : '',
      color: typeof row.color === 'string' && HEX.test(row.color) ? row.color.toLowerCase() : ROW_COLORS[i % ROW_COLORS.length],
      items: take(row.items),
    });
  }
  return {
    version: TIER_LIST_VERSION,
    title: typeof data.title === 'string' ? data.title.slice(0, MAX_TITLE) : '',
    rows,
    rarities: TIER_RARITIES.filter((r) => Array.isArray(data.rarities) && data.rarities.includes(r)),
    kinds: TIER_KINDS.filter((k) => Array.isArray(data.kinds) && data.kinds.includes(k)),
    zoom: clampZoom(data.zoom),
    names: data.names !== false,
  };
}

/** Whether the checkboxes let an item into a pool. The rarity boxes narrow what is an
 *  operator's; an enemy, a faction or a story has no rarity. */
export function passesFilters(item: TierItem, filters: { rarities: readonly number[]; kinds: readonly TierKind[] }): boolean {
  return filters.kinds.includes(item.kind) && (!OPERATOR_KINDS.has(item.kind) || filters.rarities.includes(item.rarity));
}

/** The pool: every item the filters let through that is in no row. */
export function poolItems(items: readonly TierItem[], state: TierListState): TierItem[] {
  const held = new Set(state.rows.flatMap((row) => row.items));
  return items.filter((item) => passesFilters(item, state) && !held.has(item.id));
}

const without = (list: string[], gone: ReadonlySet<string>) => (list.some((id) => gone.has(id)) ? list.filter((id) => !gone.has(id)) : list);

/** Put items in a row, at `index` among the row's other items (the end when omitted). They
 *  leave whichever row held them. An unknown row changes nothing. */
export function placeItems(state: TierListState, ids: readonly string[], rowId: string, index?: number): TierListState {
  if (!ids.length || !state.rows.some((row) => row.id === rowId)) return state;
  const moving = new Set(ids);
  const order = [...moving];
  return {
    ...state,
    rows: state.rows.map((row) => {
      if (row.id !== rowId) return { ...row, items: without(row.items, moving) };
      // `index` counts the row as drawn, moved items included: step back over those before it.
      const before = index == null ? Infinity : index - row.items.slice(0, index).filter((id) => moving.has(id)).length;
      const rest = row.items.filter((id) => !moving.has(id));
      const at = Math.max(0, Math.min(rest.length, before));
      return { ...row, items: [...rest.slice(0, at), ...order, ...rest.slice(at)] };
    }),
  };
}

/** Back to the pool: out of every row. */
export function returnToPool(state: TierListState, ids: readonly string[]): TierListState {
  if (!ids.length) return state;
  const moving = new Set(ids);
  return { ...state, rows: state.rows.map((row) => ({ ...row, items: without(row.items, moving) })) };
}

export const setZoom = (state: TierListState, zoom: number): TierListState => ({ ...state, zoom: clampZoom(zoom) });

function nextRowId(rows: readonly TierRow[]): string {
  const ids = new Set(rows.map((row) => row.id));
  let n = rows.length + 1;
  while (ids.has(`r${n}`)) n += 1;
  return `r${n}`;
}

/** A new empty row under `afterId` (at the end when omitted), in the next swatch colour. */
export function addRow(state: TierListState, afterId?: string): TierListState {
  if (state.rows.length >= MAX_ROWS) return state;
  const used = new Set(state.rows.map((row) => row.color));
  const color = ROW_COLORS.find((c) => !used.has(c)) ?? ROW_COLORS[state.rows.length % ROW_COLORS.length];
  const row: TierRow = { id: nextRowId(state.rows), label: '', color, items: [] };
  const at = afterId ? state.rows.findIndex((r) => r.id === afterId) : -1;
  const rows = at < 0 ? [...state.rows, row] : [...state.rows.slice(0, at + 1), row, ...state.rows.slice(at + 1)];
  return { ...state, rows };
}

/** Delete a row; what it held goes back to the pool. */
export const deleteRow = (state: TierListState, rowId: string): TierListState => ({ ...state, rows: state.rows.filter((row) => row.id !== rowId) });

export function updateRow(state: TierListState, rowId: string, change: { label?: string; color?: string }): TierListState {
  return {
    ...state,
    rows: state.rows.map((row) => (row.id !== rowId ? row : {
      ...row,
      ...(change.label != null ? { label: change.label.slice(0, MAX_LABEL) } : {}),
      ...(change.color != null && HEX.test(change.color) ? { color: change.color.toLowerCase() } : {}),
    })),
  };
}

export function moveRow(state: TierListState, rowId: string, by: -1 | 1): TierListState {
  const from = state.rows.findIndex((row) => row.id === rowId);
  const to = from + by;
  if (from < 0 || to < 0 || to >= state.rows.length) return state;
  const rows = [...state.rows];
  [rows[from], rows[to]] = [rows[to], rows[from]];
  return { ...state, rows };
}

export function toggleRarity(state: TierListState, rarity: number, on: boolean): TierListState {
  return { ...state, rarities: TIER_RARITIES.filter((r) => (r === rarity ? on : state.rarities.includes(r))) };
}
export function toggleKind(state: TierListState, kind: TierKind, on: boolean): TierListState {
  return { ...state, kinds: TIER_KINDS.filter((k) => (k === kind ? on : state.kinds.includes(k))) };
}

/** Empty every row; the rows and their labels stay. */
export const clearRows = (state: TierListState): TierListState => ({ ...state, rows: state.rows.map((row) => (row.items.length ? { ...row, items: [] } : row)) });

/** Dark or light ink for text on a label colour, by its luminance (WCAG relative luminance). */
export function labelInk(color: string): 'dark' | 'light' {
  const [r, g, b] = [1, 3, 5].map((at) => {
    const c = parseInt(color.slice(at, at + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.179 ? 'dark' : 'light';
}
