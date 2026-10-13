// The music player's queue catalogue: one small row per playable song. It is a game record
// like any other, so it is published with the content release (release/public/
// music-catalogue.json, written at export by scripts/build/build-music-catalogue.ts) and
// fetched through contentUrl, and a song the release adds reaches the queue, shuffle and
// song count without a redeploy. This module is loaded by the player on every page, so it
// must never import data/: next.config.js fails the build if data/albums.json reaches a
// client chunk, which is how the whole catalogue used to ship (chunk 9679, 421 kB).
import type { MonsterSirenSong } from './albumsData';

export const MUSIC_CATALOGUE_PATH = '/music-catalogue.json';

/** What the queue shows and filters by. Credits, characters and lyrics come from the /music
 * page's own release props (its songLookup), not from here. */
export interface MusicCatalogueSong {
  videoId: string;
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

export interface MusicCatalogue {
  songs: MusicCatalogueSong[];
}

/** The published projection of the full song list, the fields above and nothing else. */
export function projectMusicCatalogue(songs: readonly MonsterSirenSong[]): MusicCatalogue {
  return {
    songs: songs.map((song) => ({
      videoId: song.videoId,
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

function isSong(value: unknown): value is MusicCatalogueSong {
  const row = value as Partial<MusicCatalogueSong> | null;
  return Boolean(row) && typeof row!.videoId === 'string' && row!.videoId !== '' && typeof row!.title === 'string'
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
  const seen = new Set<string>();
  return data.songs.filter(isSong).filter((song) => !seen.has(song.videoId) && Boolean(seen.add(song.videoId)));
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
