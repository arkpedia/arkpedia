/**
 * A chart as a link, carried whole in the address after the # like a tier list
 * (lib/tier-list/share.ts): `full` is the chart as it stands, `template` its version,
 * size, labels and filters with nothing placed, and `quiz` (the grid only) the grid empty
 * with the maker's placements as the answer (lib/tier-list/quiz.ts).
 */
import { chartGrid, chartTitle, CHART_VERSION, defaultChart, isBingoFreeCell, parseChart, type ChartState } from './chart';
import { chartSolutionOf, type ChartSolution } from './quiz';
import { packPayload, unpackPayload } from './share';

export const CHART_PARAM = 'chart';
export type ChartShareMode = 'full' | 'template' | 'quiz';
export interface SharedChart { mode: ChartShareMode; state: ChartState; solution?: ChartSolution }
const MODES: Record<string, ChartShareMode> = { f: 'full', t: 'template', q: 'quiz' };

/** k: the version on screen; g: [cols, rows, [label, items, colour?][]]; a: the four axis labels
 *  (top, bottom, left, right); h: [show grid headers, column labels, row labels]; b: 0 when
 *  cell labels are hidden; bs: 1 for a Bingo free space; l: [horizontal, vertical] as 0 or 1, present only when an
 *  axis is hidden; p: [id, x, y][] in thousandths; f: [rarities, kinds]. Only
 *  the version on screen travels: the other is the maker's own business. */
interface Payload { v: number; m: 'f' | 't' | 'q'; k: 'g' | 'a' | 'b'; t: string; z: number; n?: number; f: [number[], string[]]; g?: [number, number, [string, string[], string?][]]; h?: [number, string[], string[]]; b?: 0; bs?: 1; a?: string[]; l?: [number, number]; p?: [string, number, number][] }

export async function encodeChart(state: ChartState, mode: ChartShareMode = 'full'): Promise<string> {
  // A quiz is a grid's: the plane has no cells to be right or wrong in.
  if (mode === 'quiz' && state.kind !== 'grid') throw new Error('a quiz is made from the grid');
  const bare = mode === 'template';
  const { cols, rows, cells } = chartGrid(state);
  const payload: Payload = {
    v: CHART_VERSION, m: mode[0] as Payload['m'], k: state.kind === 'bingo' ? 'b' : state.kind === 'grid' ? 'g' : 'a', t: chartTitle(state), z: state.zoom, ...(state.names ? {} : { n: 0 }),
    f: [state.rarities, state.kinds],
    ...(state.kind !== 'axes'
      ? { g: [cols, rows, cells.map((cell, index): [string, string[], string?] => {
        if (isBingoFreeCell(state, index)) return ['', []];
        const contents: [string, string[], string?] = [cell.label, bare ? [] : cell.items];
        if (cell.color) contents.push(cell.color);
        return contents;
      })], ...(state.kind === 'bingo' && state.bingo?.free ? { bs: 1 as const } : {}) }
      : { a: [state.axes.top, state.axes.bottom, state.axes.left, state.axes.right], ...(state.lines.horizontal && state.lines.vertical ? {} : { l: [state.lines.horizontal ? 1 : 0, state.lines.vertical ? 1 : 0] as [number, number] }), p: bare ? [] : state.points.map((point): [string, number, number] => [point.id, Math.round(point.x * 1000), Math.round(point.y * 1000)]) }),
  };
  if (state.kind === 'grid' && (state.showGridHeaders || state.columnLabels.some(Boolean) || state.rowLabels.some(Boolean))) {
    payload.h = [state.showGridHeaders ? 1 : 0, state.columnLabels, state.rowLabels];
  }
  if (state.kind === 'grid' && !state.showCellLabels) payload.b = 0;
  return packPayload(payload);
}

/** What a link payload holds, or null for anything that is not a chart. It has been through
 *  parseChart, so it is as safe to draw as a saved one. */
export async function decodeChart(text: string): Promise<SharedChart | null> {
  const payload = await unpackPayload(text) as Partial<Payload> | null;
  if (!payload || typeof payload !== 'object' || payload.v !== CHART_VERSION || typeof payload.m !== 'string' || !MODES[payload.m] || !['g', 'a', 'b'].includes(payload.k ?? '')) return null;
  const base = defaultChart();
  const grid = payload.k !== 'a' && Array.isArray(payload.g) ? payload.g : null;
  const axes = payload.k === 'a' && Array.isArray(payload.a) ? payload.a : null;
  if (!grid && !axes) return null;
  const mode = MODES[payload.m];
  if (mode === 'quiz' && payload.k !== 'g') return null;
  const bare = mode === 'template';
  const cells = (Array.isArray(grid?.[2]) ? grid[2] : []).map((cell) => Array.isArray(cell) ? { label: cell[0], items: bare ? [] : cell[1], color: cell[2] } : {});
  const headers = payload.k === 'g' && Array.isArray(payload.h) ? payload.h : [];
  const state = parseChart(JSON.stringify({
    ...base,
    kind: payload.k === 'b' ? 'bingo' : grid ? 'grid' : 'axes',
    title: payload.k === 'b' ? base.title : payload.t, zoom: payload.z, names: payload.n !== 0,
    rarities: Array.isArray(payload.f?.[0]) ? payload.f[0] : base.rarities,
    kinds: Array.isArray(payload.f?.[1]) ? payload.f[1] : base.kinds,
    showCellLabels: payload.k !== 'g' || payload.b !== 0,
    showGridHeaders: headers[0] === 1, columnLabels: headers[1], rowLabels: headers[2],
    ...(payload.k === 'b' ? { bingo: { title: payload.t, cells, free: payload.bs === 1 } } : grid ? { cols: grid[0], rows: grid[1], cells } : {}),
    ...(axes ? { axes: { top: axes[0], bottom: axes[1], left: axes[2], right: axes[3] }, lines: Array.isArray(payload.l) ? { horizontal: payload.l[0] !== 0, vertical: payload.l[1] !== 0 } : undefined, points: bare || !Array.isArray(payload.p) ? [] : payload.p.map((point) => (Array.isArray(point) ? { id: point[0], x: Number(point[1]) / 1000, y: Number(point[2]) / 1000 } : {})) } : {}),
  }));
  if (!state) return null;
  if (mode !== 'quiz') return { mode, state };
  const solution = chartSolutionOf(state);
  if (!Object.keys(solution).length) return null; // a quiz with no answers asks nothing
  return { mode, state: { ...state, cells: state.cells.map((cell) => ({ ...cell, items: [] })) }, solution };
}
