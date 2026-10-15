import { useEffect, useState } from 'react';
import type { SongArt } from './monsterSirenArt';
import { trackSource } from './trackId';

/**
 * The playing song's picture and artist wherever the catalogue has none, and the lock screen's
 * artwork list (lib/music/useMsrMediaSession.ts).
 *
 * The catalogue gives a song its album cover (/album-covers/<file>.webp) once the album sync has
 * published it, and its artist only when the album credits one; a new album's songs can have
 * neither, and iOS then drew a blank white square and "Monster Siren Records" on the lock screen.
 * So the player falls back, in order: Monster Siren's own album cover and artists for a song it
 * has (pages/api/music-art/[id]), the song's YouTube thumbnail for one on YouTube, and last the
 * site's own icon. Monster Siren is asked for every song its audio plays (the lock screen's JPEG)
 * and for any song with no cover; a song missing only its artist is not asked for, as Monster
 * Siren mostly credits its own label there.
 *
 * Monster Siren's cover is never shown from its own CDN: web.hycdn.cn answers 403 to a request
 * carrying another site's Referer (an <img> here, the lock screen's artwork fetch), so it is
 * served from this site (pages/api/music-cover/[id], msrCoverPath), and sessionArtwork refuses
 * an address on that CDN outright.
 */

/** Monster Siren's label as its API credits it ("塞壬唱片-MSR"), said the way the player says it. */
export const MSR_LABEL = 'Monster Siren Records';
const LABEL_CREDITS = new Set(['塞壬唱片-MSR', '塞壬唱片', 'MSR', 'Monster Siren Records']);

/** The artists as one credit line, the label's own credit in English; null for none. */
export function artistLine(artists: readonly string[] | null | undefined): string | null {
  if (!artists?.length) return null;
  return [...new Set(artists.map((name) => (LABEL_CREDITS.has(name) ? MSR_LABEL : name)))].join(', ');
}

/** The song's YouTube thumbnail (480x360 JPEG), for a song on YouTube; null for a Monster Siren id. */
export function youtubeThumbnail(id: string | null | undefined): string | null {
  const source = id ? trackSource(id) : null;
  return source?.kind === 'youtube' && /^[A-Za-z0-9_-]{11}$/.test(source.videoId) ? `https://i.ytimg.com/vi/${source.videoId}/hqdefault.jpg` : null;
}

/** The site's own icon, the artwork of last resort (a 256x256 WebP in arkpedia-image-assets). */
export const SITE_ICON_PATH = '/essential-icons/Arkpedia.webp';
const SITE_ICON_SIZE = '256x256';
/** Album covers, Monster Siren's and the site's copy of them alike, are 500x500. */
const COVER_SIZE = '500x500';

/** An image's MIME type from its file extension (the Media Session wants one; iOS is picky). */
export function imageType(src: string): string {
  const ext = /\.([a-z0-9]+)(?:[?#]|$)/i.exec(src)?.[1]?.toLowerCase();
  return ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'avif' ? 'image/avif' : 'image/jpeg';
}

/** An absolute, percent-encoded address: `new URL` encodes a non-ASCII path (an album cover
 *  named in Chinese) and leaves an already encoded one as it is. */
export function absoluteUrl(src: string, base: string): string | null {
  try {
    const url = new URL(src, base);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

/** Monster Siren's cover for the song `cid`, as this site serves it (pages/api/music-cover). */
export function msrCoverPath(cid: string): string {
  return `/api/music-cover/${encodeURIComponent(cid)}`;
}

/** A cover address drawn as a plain <img> (components/music/AlbumCover.tsx): an absolute one, or
 *  Monster Siren's cover as this site serves it; anything else is a content path. */
export function isDirectImage(src: string): boolean {
  return /^https:\/\//.test(src) || src.startsWith('/api/music-cover/');
}

/** Hosts that refuse a request carrying another site's Referer (hotlink protection): an address
 *  there is never handed to the lock screen, which would be refused and show nothing. */
const REFERER_CHECKED = /(^|\.)hycdn\.cn$/i;

export interface ArtworkSources {
  /** Monster Siren's album cover as this site serves it (msrCoverPath), and its image type (its
   *  CDN's covers are JPEGs). */
  msrCover?: string | null;
  msrCoverType?: string;
  /** The catalogue's cover, already resolved to its published address (WebP). */
  cover?: string | null;
  /** The song's YouTube thumbnail. */
  youtube?: string | null;
  /** The site's icon, resolved: only when there is nothing else. */
  icon: string;
  /** What relative addresses are read against (the page's address). */
  base: string;
}

/**
 * The Media Session's artwork: exactly one picture, the best there is -- Monster Siren's own cover
 * (a 500x500 JPEG, served from this site), else the site's copy of it (WebP, the same size), else
 * YouTube's thumbnail, else the site's icon. Absolute and encoded, with its size and type.
 *
 * One, not a list to choose from: given Monster Siren's JPEG, the site's WebP and the icon, an
 * iPhone showed the icon (2026-10-14), and given the WebP alone, a blank white square. Which one
 * Safari takes from a list, and whether it falls back when one fails, is not something to lean on.
 */
export function sessionArtwork({ msrCover, msrCoverType, cover, youtube, icon, base }: ArtworkSources): MediaImage[] {
  const entry = (src: string | null | undefined, sizes: string, type?: string): MediaImage | null => {
    const href = src ? absoluteUrl(src, base) : null;
    if (!href || REFERER_CHECKED.test(new URL(href).hostname)) return null;
    return { src: href, sizes, type: type ?? imageType(href) };
  };
  const best = entry(msrCover, COVER_SIZE, msrCoverType ?? 'image/jpeg') ?? entry(cover, COVER_SIZE)
    ?? entry(youtube, '480x360') ?? entry(icon, SITE_ICON_SIZE);
  return best ? [best] : [];
}

function validArt(value: unknown): SongArt | null {
  const art = value as Partial<SongArt> | null;
  if (!art || typeof art !== 'object') return null;
  const cover = typeof art.cover === 'string' && /^https:\/\//.test(art.cover) ? art.cover : null;
  const artists = Array.isArray(art.artists) ? art.artists.filter((name): name is string => typeof name === 'string' && Boolean(name)) : [];
  const albumName = typeof art.albumName === 'string' && art.albumName ? art.albumName : null;
  return { cover, artists, albumName };
}

/** One request per song per page load, shared by every caller; a failure is forgotten, so the
 *  next time the song plays it is asked again. */
const requests = new Map<string, Promise<SongArt | null>>();
export function loadSongArt(cid: string): Promise<SongArt | null> {
  let request = requests.get(cid);
  if (!request) {
    request = fetch(`/api/music-art/${encodeURIComponent(cid)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then(validArt)
      .catch(() => null)
      .then((art) => { if (!art) requests.delete(cid); return art; });
    requests.set(cid, request);
  }
  return request;
}

export interface SongArtState {
  /** Monster Siren's art, once it has answered; null while it has not, and when it cannot. */
  art: SongArt | null;
  /** Nothing more to wait for: it answered, it failed, or there was nothing to ask. */
  settled: boolean;
}

/** Monster Siren's art for the song `cid` (undefined: nothing to ask), and whether it is still
 *  being asked for: the lock screen waits a moment for it rather than show a lesser picture first
 *  (lib/music/useMsrMediaSession.ts). */
export function useSongArt(cid: string | undefined): SongArtState {
  const [art, setArt] = useState<{ cid: string; art: SongArt | null } | null>(null);
  useEffect(() => {
    if (!cid) return;
    let live = true;
    void loadSongArt(cid).then((result) => { if (live) setArt({ cid, art: result }); });
    return () => { live = false; };
  }, [cid]);
  if (!cid) return { art: null, settled: true };
  return art?.cid === cid ? { art: art.art, settled: true } : { art: null, settled: false };
}
