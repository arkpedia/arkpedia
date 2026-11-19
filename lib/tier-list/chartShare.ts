/**
 * A chart as a link, carried whole in the address after the # like a tier list
 * (lib/tier-list/share.ts): `full` is the chart as it stands, `template` its version,
 * size, labels and filters with nothing placed.
 */
import { CHART_VERSION, defaultChart, parseChart, type ChartState } from './chart';
import { packPayload, unpackPayload } from './share';

export const CHART_PARAM = 'chart';
export type ChartShareMode = 'full' | 'template';
export interface SharedChart { mode: ChartShareMode; state: ChartState }

/** k: the version on screen; g: [cols, rows, [label, items][]]; a: the four axis labels
 *  (top, bottom, left, right); p: [id, x, y][] in thousandths; f: [rarities, kinds]. Only
 *  the version on screen travels: the other is the maker's own business. */
interface Payload { v: number; m: 'f' | 't'; k: 'g' | 'a'; t: string; z: number; n?: number; f: [number[], string[]]; g?: [number, number, [string, string[]][]]; a?: string[]; p?: [string, number, number][] }

export async function encodeChart(state: ChartState, mode: ChartShareMode = 'full'): Promise<string> {
  const bare = mode === 'template';
  const payload: Payload = {
    v: CHART_VERSION, m: bare ? 't' : 'f', k: state.kind === 'grid' ? 'g' : 'a', t: state.title, z: state.zoom, ...(state.names ? {} : { n: 0 }),
    f: [state.rarities, state.kinds],
    ...(state.kind === 'grid'
      ? { g: [state.cols, state.rows, state.cells.map((cell): [string, string[]] => [cell.label, bare ? [] : cell.items])] }
      : { a: [state.axes.top, state.axes.bottom, state.axes.left, state.axes.right], p: bare ? [] : state.points.map((point): [string, number, number] => [point.id, Math.round(point.x * 1000), Math.round(point.y * 1000)]) }),
  };
  return packPayload(payload);
}

/** What a link payload holds, or null for anything that is not a chart. It has been through
 *  parseChart, so it is as safe to draw as a saved one. */
export async function decodeChart(text: string): Promise<SharedChart | null> {
  const payload = await unpackPayload(text) as Partial<Payload> | null;
  if (!payload || typeof payload !== 'object' || payload.v !== CHART_VERSION || (payload.m !== 'f' && payload.m !== 't') || (payload.k !== 'g' && payload.k !== 'a')) return null;
  const base = defaultChart();
  const grid = payload.k === 'g' && Array.isArray(payload.g) ? payload.g : null;
  const axes = payload.k === 'a' && Array.isArray(payload.a) ? payload.a : null;
  if (!grid && !axes) return null;
  const bare = payload.m === 't';
  const state = parseChart(JSON.stringify({
    ...base,
    kind: grid ? 'grid' : 'axes',
    title: payload.t, zoom: payload.z, names: payload.n !== 0,
    rarities: Array.isArray(payload.f?.[0]) ? payload.f[0] : base.rarities,
    kinds: Array.isArray(payload.f?.[1]) ? payload.f[1] : base.kinds,
    ...(grid ? { cols: grid[0], rows: grid[1], cells: (Array.isArray(grid[2]) ? grid[2] : []).map((cell) => (Array.isArray(cell) ? { label: cell[0], items: bare ? [] : cell[1] } : {})) } : {}),
    ...(axes ? { axes: { top: axes[0], bottom: axes[1], left: axes[2], right: axes[3] }, points: bare || !Array.isArray(payload.p) ? [] : payload.p.map((point) => (Array.isArray(point) ? { id: point[0], x: Number(point[1]) / 1000, y: Number(point[2]) / 1000 } : {})) } : {}),
  }));
  return state ? { mode: bare ? 'template' : 'full', state } : null;
}
