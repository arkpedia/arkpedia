// The music player's queue catalogue: one small row per playable song. It is a game record
// like any other, so it is published with the content release (release/public/
// music-catalogue.json, written at export by scripts/build/build-music-catalogue.ts) and
// fetched through contentUrl, and a song the release adds reaches the queue, shuffle and
// song count without a redeploy. This module is loaded by the player on every page, so it
// must never import data/: next.config.js fails the build if data/albums.json reaches a
// client chunk, which is how the whole catalogue used to ship (chunk 9679, 421 kB).
import type { MonsterSirenSong } from './albumsData';
import { msrTrackId } from './trackId';

export const MUSIC_CATALOGUE_PATH = '/music-catalogue.json';

/** One published row: what the queue shows and filters by. Credits, characters and lyrics come
 * from the /music page's own release props (its songLookup), not from here.
 *
 * A song on YouTube has its `videoId`; a song with no YouTube upload has its Monster Siren id
 * (`cid`) instead and plays Monster Siren's own audio. A row has exactly one of the two. A
 * player older than Monster Siren playback reads only rows with a videoId (its isSong), so it
 * drops the others and carries on as before. */
export interface PublishedCatalogueSong {
  videoId?: string;
  cid?: string;
  title: string;
  altTitle?: string;
  artist?: string;
  /** The album's English name where it has one (its own name otherwise), for the song row's
   *  second line; albumOriginal is its own name when that differs, kept for search. */
  album?: string;
  albumOriginal?: string;
  /** /album-covers/<file>, the song row's art: absent until the album's cover is published. */
  cover?: string;
  /** Present, and true, only for the few copyrighted songs stream-safe mode leaves out. */
  copyright?: true;
}

/** A row as the player holds it: with its track id (lib/music/trackId.ts), the YouTube video id
 *  or msr:<cid>, which the queue, favourites and playlists store. */
export interface MusicCatalogueSong extends PublishedCatalogueSong {
  id: string;
}

export interface MusicCatalogue {
  songs: PublishedCatalogueSong[];
}

/** The published projection of the full song list, the fields above and nothing else. */
export function projectMusicCatalogue(songs: readonly MonsterSirenSong[]): MusicCatalogue {
  return {
    songs: songs.map((song) => ({
      ...(song.videoId ? { videoId: song.videoId } : { cid: song.songId }),
      title: song.title,
      ...(song.altTitle ? { altTitle: song.altTitle } : {}),
      ...(song.artist ? { artist: song.artist } : {}),
      ...(song.albumName ? { album: song.albumName } : {}),
      ...(song.albumOriginalName && song.albumOriginalName !== song.albumName ? { albumOriginal: song.albumOriginalName } : {}),
      ...(song.coverPath ? { cover: song.coverPath } : {}),
      ...(song.copyright ? { copyright: true as const } : {}),
    })),
  };
}

/** The row's track id, or null for a row that names no playable song. */
function rowId(row: Partial<PublishedCatalogueSong>): string | null {
  if (typeof row.videoId === 'string' && row.videoId !== '') return row.videoId;
  if (row.videoId === undefined && typeof row.cid === 'string' && /^\d{1,12}$/.test(row.cid)) return msrTrackId(row.cid);
  return null;
}

function isSong(value: unknown): value is PublishedCatalogueSong {
  const row = value as Partial<PublishedCatalogueSong> | null;
  return Boolean(row) && rowId(row!) !== null && typeof row!.title === 'string'
    && (row!.altTitle === undefined || typeof row!.altTitle === 'string')
    && (row!.artist === undefined || typeof row!.artist === 'string')
    && (row!.album === undefined || typeof row!.album === 'string')
    && (row!.albumOriginal === undefined || typeof row!.albumOriginal === 'string')
    && (row!.cover === undefined || (typeof row!.cover === 'string' && row!.cover.startsWith('/album-covers/')));
}

type FetchCatalogue = (input: string, init?: RequestInit) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;

async function fetchMusicCatalogue(url: string, signal: AbortSignal | undefined, fetcher: FetchCatalogue): Promise<MusicCatalogueSong[]> {
  const response = await fetcher(url, { signal });
  if (!response.ok) throw new Error(`Music catalogue returned ${response.status}`);
  const data = await response.json() as { songs?: unknown };
  if (!Array.isArray(data?.songs) || !data.songs.length) throw new Error('Music catalogue is invalid');
  // One row per video, the first listing kept: a song on two albums under two credits is one
  // YouTube upload. The release listed ZCiLqOcjA0Y twice (2026-10-13), so the default queue,
  // built from this list, played it twice per cycle and its rows shared a React key. Read here,
  // where the queue and the Library both load it, so releases already published are covered.
  // Read by track id, so a Monster Siren row (no videoId) is a song of its own too.
  const seen = new Set<string>();
  return data.songs.filter(isSong).map((song) => ({ ...song, id: rowId(song)! }))
    .filter((song) => !seen.has(song.id) && Boolean(seen.add(song.id)));
}

/**
 * The release's catalogue, or the copy this deployment was built with when the release
 * cannot give one -- a page with no release (the community pages), a release published
 * before the catalogue existed, a network failure. The same fail-safe the operator search
 * uses: a missing file must never leave the site with a player that plays nothing.
 */
export async function loadMusicCatalogue(
  releaseUrl: string,
  signal?: AbortSignal,
  fetcher: FetchCatalogue = fetch,
): Promise<MusicCatalogueSong[]> {
  try {
    return await fetchMusicCatalogue(releaseUrl, signal, fetcher);
  } catch (error) {
    if (signal?.aborted || releaseUrl === MUSIC_CATALOGUE_PATH) throw error;
    return fetchMusicCatalogue(MUSIC_CATALOGUE_PATH, signal, fetcher);
  }
}
