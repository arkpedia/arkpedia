/**
 * A tier list as a link: the whole list travels in the address, after the #, so sharing
 * one stores nothing on Arkpedia and needs no account. The part after # never reaches a
 * server either.
 *
 * The payload is a small JSON (rows, the zoom and the list's name; not the pool's
 * filters, which are the maker's working state), deflated where the
 * browser can and base64url-encoded. Its first character says which: "1" deflated, "0" plain.
 * The item ids inside are the catalogue's (lib/tier-list/catalogue.ts) and are a public
 * contract from here on: a link made today must open after the game data changes, so they
 * are built from the game's own ids, never from a position in a list.
 */
import { defaultTierList, parseTierList, TIER_LIST_VERSION, type TierListState } from './state';

export const SHARE_PARAM = 'list';
/** Longest link payload read, and the most it may inflate to: a full list is a few KB. */
export const MAX_SHARE_CHARS = 60_000;
export const MAX_SHARE_BYTES = 400_000;
/** Past this an address starts being cut by chat apps and some browsers' share sheets. */
export const LONG_LINK_CHARS = 8_000;

interface Payload { v: number; t: string; z: number; r: [string, string, string[]][] }

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

/** The link payload for a list (what follows `#list=`). */
export async function encodeTierList(state: TierListState): Promise<string> {
  const payload: Payload = { v: TIER_LIST_VERSION, t: state.title, z: state.zoom, r: state.rows.map((row) => [row.label, row.color, row.items]) };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  if (typeof CompressionStream === 'function') {
    try { return `1${toBase64Url(await pump(bytes, new CompressionStream('deflate-raw') as TransformStream<BufferSource, Uint8Array>, MAX_SHARE_BYTES))}`; } catch { /* plain below */ }
  }
  return `0${toBase64Url(bytes)}`;
}

/** The list a link payload holds, or null for anything that is not one. The result has been
 *  through parseTierList, so it is as safe to draw as a saved list. */
export async function decodeTierList(text: string): Promise<TierListState | null> {
  if (!text || text.length > MAX_SHARE_CHARS || !/^[01][A-Za-z0-9_-]+$/.test(text)) return null;
  try {
    let bytes: Uint8Array = fromBase64Url(text.slice(1));
    if (text[0] === '1') {
      if (typeof DecompressionStream !== 'function') return null;
      bytes = await pump(bytes, new DecompressionStream('deflate-raw') as TransformStream<BufferSource, Uint8Array>, MAX_SHARE_BYTES);
    }
    if (bytes.length > MAX_SHARE_BYTES) return null;
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as Partial<Payload> | null;
    if (!payload || payload.v !== TIER_LIST_VERSION || !Array.isArray(payload.r)) return null;
    const base = defaultTierList();
    return parseTierList(JSON.stringify({
      ...base,
      title: payload.t,
      zoom: payload.z,
      rows: payload.r.map((row, i) => (Array.isArray(row) ? { id: `r${i + 1}`, label: row[0], color: row[1], items: row[2] } : null)),
    }));
  } catch {
    return null;
  }
}

/** The payload in an address's fragment (`#list=...`), or null. */
export function sharePayload(hash: string): string | null {
  const value = new URLSearchParams(hash.replace(/^#/, '')).get(SHARE_PARAM);
  return value || null;
}
