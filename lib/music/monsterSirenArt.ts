/**
 * A Monster Siren song's album art, artists and album name, read from its public API, for
 * pages/api/music-art/[id] (server only: the browser asks that route, never Monster Siren).
 *
 *   GET https://monster-siren.hypergryph.com/api/song/<cid>            → { code: 0, data: { cid, albumCid, artists } }
 *   GET https://monster-siren.hypergryph.com/api/album/<albumCid>/data → { code: 0, data: { cid, name, coverUrl } }
 *
 * Nothing is passed on that Monster Siren does not vouch for: each answer must be code 0 and
 * name the cid asked for, the album id must be digits before it goes into an address, and the
 * cover must be https on Monster Siren's own hosts (*.hycdn.cn, its CDN, or *.hypergryph.com).
 * Artists and the album name are plain strings, trimmed and capped.
 */

export interface SongArt {
  /** The album's cover (a 500x500 JPEG on Monster Siren's CDN), or null. */
  cover: string | null;
  artists: string[];
  albumName: string | null;
}

const MSR_ID = /^\d{1,12}$/;
const API = 'https://monster-siren.hypergryph.com/api';
const MAX_ARTISTS = 12;
const MAX_TEXT = 200;

type Fetcher = (url: string) => Promise<Pick<Response, 'ok' | 'json'>>;

/** An address on Monster Siren's own hosts, over https, or null. */
export function monsterSirenImage(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  try {
    const url = new URL(value);
    const host = url.hostname;
    const own = host.endsWith('.hycdn.cn') || host === 'hypergryph.com' || host.endsWith('.hypergryph.com');
    return url.protocol === 'https:' && own && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, MAX_TEXT) : null;
}

async function read(fetcher: Fetcher, url: string): Promise<Record<string, unknown> | null> {
  const response = await fetcher(url);
  if (!response.ok) return null;
  const body = await response.json() as { code?: unknown; data?: unknown };
  return body && body.code === 0 && body.data && typeof body.data === 'object' ? body.data as Record<string, unknown> : null;
}

/** The song's art and credits; throws when Monster Siren does not answer for the song itself.
 *  An album that cannot be read leaves the cover and album name null, the artists kept. */
export async function monsterSirenSongArt(cid: string, fetcher: Fetcher): Promise<SongArt> {
  if (!MSR_ID.test(cid)) throw new Error('Not a Monster Siren song id');
  const song = await read(fetcher, `${API}/song/${cid}`);
  if (!song || String(song.cid) !== cid) throw new Error('Song unavailable');
  const artists = Array.isArray(song.artists) ? song.artists.map(text).filter((name): name is string => Boolean(name)).slice(0, MAX_ARTISTS) : [];
  const albumCid = typeof song.albumCid === 'string' || typeof song.albumCid === 'number' ? String(song.albumCid) : '';
  let cover: string | null = null;
  let albumName: string | null = null;
  if (MSR_ID.test(albumCid)) {
    try {
      const album = await read(fetcher, `${API}/album/${albumCid}/data`);
      if (album && String(album.cid) === albumCid) {
        cover = monsterSirenImage(album.coverUrl);
        albumName = text(album.name);
      }
    } catch { /* the song's own answer still stands */ }
  }
  return { cover, artists, albumName };
}
