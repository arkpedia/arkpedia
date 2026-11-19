/**
 * A tier list as a link: the whole list travels in the address, after the #, so sharing
 * one stores nothing on Arkpedia and needs no account. The part after # never reaches a
 * server either.
 *
 * Three kinds of link (ShareMode):
 *   full      the list as it stands: rows, what is in them, the pool's filters;
 *   template  the rows and the filters, with nothing placed, to rank from scratch;
 *   quiz      the rows, empty, with the maker's placements as the answer (lib/tier-list/quiz.ts).
 *
 * The payload is a small JSON, deflated where the browser can and base64url-encoded. Its
 * first character says which: "1" deflated, "0" plain. The item ids inside are the
 * catalogue's (lib/tier-list/catalogue.ts) and are a public contract from here on: a link
 * made today must open after the game data changes, so they are never a position in a list.
 */
import { TIER_KINDS, TIER_RARITIES } from './catalogue';
import { solutionOf, type QuizSolution } from './quiz';
import { defaultTierList, parseTierList, TIER_LIST_VERSION, type TierListState } from './state';

export type ShareMode = 'full' | 'template' | 'quiz';
export interface SharedTierList { mode: ShareMode; state: TierListState; solution?: QuizSolution }

export const SHARE_PARAM = 'list';
/** Longest link payload read, and the most it may inflate to: a full list is a few KB. */
export const MAX_SHARE_CHARS = 60_000;
export const MAX_SHARE_BYTES = 400_000;
/** Past this an address starts being cut by chat apps and some browsers' share sheets. */
export const LONG_LINK_CHARS = 8_000;

/** m: the mode's first letter (absent in links made before modes: full). f: [rarities, kinds].
 *  n: 0 when name plates are off. */
interface Payload { v: number; m?: string; t: string; z: number; n?: number; f?: [number[], string[]]; r: [string, string, string[]][] }
const MODES: Record<string, ShareMode> = { f: 'full', t: 'template', q: 'quiz' };

const toBase64Url = (bytes: Uint8Array) => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromBase64Url = (text: string) => {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

async function pump(bytes: Uint8Array, through: TransformStream<BufferSource, Uint8Array>, limit: number): Promise<Uint8Array> {
  const writer = through.writable.getWriter();
  void writer.write(bytes as BufferSource).then(() => writer.close()).catch(() => {});
  const reader = through.readable.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    // Stop reading a payload that inflates past any real list, before it is all in memory.
    if (size > limit) { void reader.cancel(); throw new Error('too large'); }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) { out.set(chunk, at); at += chunk.length; }
  return out;
}

/** Any small JSON as a link payload: deflated where the browser can ("1"), plain otherwise ("0"). */
export async function packPayload(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  if (typeof CompressionStream === 'function') {
    try { return `1${toBase64Url(await pump(bytes, new CompressionStream('deflate-raw') as TransformStream<BufferSource, Uint8Array>, MAX_SHARE_BYTES))}`; } catch { /* plain below */ }
  }
  return `0${toBase64Url(bytes)}`;
}

/** The JSON a link payload holds, or null: too long, not base64url, or inflating past any real list. */
export async function unpackPayload(text: string): Promise<unknown> {
  if (!text || text.length > MAX_SHARE_CHARS || !/^[01][A-Za-z0-9_-]+$/.test(text)) return null;
  try {
    let bytes: Uint8Array = fromBase64Url(text.slice(1));
    if (text[0] === '1') {
      if (typeof DecompressionStream !== 'function') return null;
      bytes = await pump(bytes, new DecompressionStream('deflate-raw') as TransformStream<BufferSource, Uint8Array>, MAX_SHARE_BYTES);
    }
    if (bytes.length > MAX_SHARE_BYTES) return null;
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    return null;
  }
}

/** The link payload for a list (what follows `#list=`). */
export async function encodeTierList(state: TierListState, mode: ShareMode = 'full'): Promise<string> {
  const payload: Payload = {
    v: TIER_LIST_VERSION, m: mode[0], t: state.title, z: state.zoom, ...(state.names ? {} : { n: 0 }),
    f: [state.rarities, state.kinds],
    r: state.rows.map((row) => [row.label, row.color, mode === 'template' ? [] : row.items]),
  };
  return packPayload(payload);
}

/** What a link payload holds, or null for anything that is not a tier list. The list has
 *  been through parseTierList, so it is as safe to draw as a saved one. A quiz comes back
 *  with its rows emptied and the placements as `solution`. */
export async function decodeTierList(text: string): Promise<SharedTierList | null> {
  try {
    const payload = await unpackPayload(text) as Partial<Payload> | null;
    if (!payload || payload.v !== TIER_LIST_VERSION || !Array.isArray(payload.r)) return null;
    const mode = payload.m == null ? 'full' : MODES[payload.m];
    if (!mode) return null;
    const base = defaultTierList();
    const filters = Array.isArray(payload.f) ? payload.f : null;
    const state = parseTierList(JSON.stringify({
      ...base,
      title: payload.t,
      zoom: payload.z,
      names: payload.n !== 0,
      rarities: filters ? TIER_RARITIES.filter((r) => Array.isArray(filters[0]) && filters[0].includes(r)) : base.rarities,
      kinds: filters ? TIER_KINDS.filter((k) => Array.isArray(filters[1]) && filters[1].includes(k)) : base.kinds,
      rows: payload.r.map((row, i) => (Array.isArray(row) ? { id: `r${i + 1}`, label: row[0], color: row[1], items: mode === 'template' ? [] : row[2] } : null)),
    }));
    if (!state) return null;
    if (mode !== 'quiz') return { mode, state };
    const solution = solutionOf(state);
    if (!Object.keys(solution).length) return null; // a quiz with no answers asks nothing
    return { mode, state: { ...state, rows: state.rows.map((row) => ({ ...row, items: [] })) }, solution };
  } catch {
    return null;
  }
}

/** The payload in an address's fragment (`#list=...`), or null. */
export function sharePayload(hash: string, param: string = SHARE_PARAM): string | null {
  const value = new URLSearchParams(hash.replace(/^#/, '')).get(param);
  return value || null;
}
