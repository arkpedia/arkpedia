import { withCrossoverPageMusic } from './crossoverPageMusic';
import { hasMusicClaimRisk } from './claimRisk';
// The music player's queue catalogue: one small row per playable song. It is a game record
// like any other, so it is published with the content release (release/public/
// music-catalogue.json, written at export by scripts/build/build-music-catalogue.ts) and
// fetched through contentUrl, and a song the release adds reaches the queue, shuffle and
// song count without a redeploy. This module is loaded by the player on every page, so it
// must never import data/: next.config.js fails the build if data/albums.json reaches a
// client chunk, which is how the whole catalogue used to ship (chunk 9679, 421 kB).
import type { MonsterSirenSong } from './albumsData';
import { msrTrackId } from './trackId';
import type { MusicGame } from './songFilter';

export const MUSIC_CATALOGUE_PATH = '/music-catalogue.json';

/** One published row: what the queue shows and filters by. Credits, characters and lyrics come
 * from the /music page's own release props (its songLookup), not from here.
 *
 * A song on YouTube has its `videoId`, and its Monster Siren id (`cid`) too where the albums
 * have one; a song with no YouTube upload has only its `cid`. The track id (lib/music/trackId.ts)
 * is the videoId wherever there is one, so a row with both is still named by its videoId, and the
 * cid only says the song can also be played from Monster Siren's own audio (the player does, unless
 * the reader turned on Data saver: lib/music/musicPlayerContext.tsx). A player older than Monster
 * Siren playback reads only rows with a videoId (its isSong) and ignores the extra field; one from
 * before cids on YouTube rows names a row by its videoId first, so it plays them from YouTube. */
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
  /** /album-covers/<file>, the song row's art: absent until the album's cover is published. An
   *  Endfield album's is its YouTube thumbnail until then (lib/music/albumsData.ts albumCoverPath). */
  cover?: string;
  /** Present, and true, only for the few copyrighted songs stream-safe mode leaves out. */
  copyright?: true;
  /** Present only for a song from another game than Arknights: 'endfield', which the player
   *  leaves out until the reader turns Endfield music on (lib/music/songFilter.ts). A player from
   *  before the field reads only the rows it can draw: an Endfield row's YouTube cover fails its
   *  isSong, so it never queued Endfield songs it could not tell apart. */
  game?: Exclude<MusicGame, 'arknights'>;
}

/** A row as the player holds it: with its track id (lib/music/trackId.ts), the YouTube video id
 *  or msr:<cid>, which the queue, favourites and playlists store. */
export interface MusicCatalogueSong extends PublishedCatalogueSong {
  id: string;
}

export interface MusicCatalogue {
  songs: PublishedCatalogueSong[];
}

/** lib/music/albumsData.ts's YOUTUBE_COVER, repeated: this module must not import that one, which
 *  imports the catalogue files themselves. */
const YOUTUBE_COVER = /^https:\/\/i\.ytimg\.com\/vi\/[\w-]{11}\/(?:maxres|hq)default\.jpg$/;

/** A Monster Siren song id, the rule lib/music/trackId.ts and pages/api/music-guesser apply. */
const MSR_CID = /^\d{1,12}$/;
const validCid = (cid: unknown): cid is string => typeof cid === 'string' && MSR_CID.test(cid);

/** The published projection of the full song list, the fields above and nothing else. */
export function projectMusicCatalogue(songs: readonly MonsterSirenSong[]): MusicCatalogue {
  return {
    songs: songs.map((song) => ({
      ...(song.videoId ? { videoId: song.videoId } : {}),
      ...(MSR_CID.test(song.songId || '') ? { cid: song.songId } : {}),
      title: song.title,
      ...(song.altTitle ? { altTitle: song.altTitle } : {}),
      ...(song.artist ? { artist: song.artist } : {}),
      ...(song.albumName ? { album: song.albumName } : {}),
      ...(song.albumOriginalName && song.albumOriginalName !== song.albumName ? { albumOriginal: song.albumOriginalName } : {}),
      ...(song.coverPath ? { cover: song.coverPath } : {}),
      ...(hasMusicClaimRisk(song) ? { copyright: true as const } : {}),
      ...(song.game === 'endfield' ? { game: 'endfield' as const } : {}),
    })),
  };
}

/** The row's track id, or null for a row that names no playable song. */
function rowId(row: Partial<PublishedCatalogueSong>): string | null {
  if (typeof row.videoId === 'string' && row.videoId !== '') return row.videoId;
  if (row.videoId === undefined && validCid(row.cid)) return msrTrackId(row.cid);
  return null;
}

function isSong(value: unknown): value is PublishedCatalogueSong {
  const row = value as Partial<PublishedCatalogueSong> | null;
  return Boolean(row) && rowId(row!) !== null && typeof row!.title === 'string'
    && (row!.altTitle === undefined || typeof row!.altTitle === 'string')
    && (row!.artist === undefined || typeof row!.artist === 'string')
    && (row!.album === undefined || typeof row!.album === 'string')
    && (row!.albumOriginal === undefined || typeof row!.albumOriginal === 'string')
    && (row!.cover === undefined || (typeof row!.cover === 'string' && (row!.cover.startsWith('/album-covers/') || YOUTUBE_COVER.test(row!.cover))))
    && (row!.game === undefined || row!.game === 'endfield');
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
  const validSongs = data.songs.filter(isSong);
  // Duplicate album listings may credit the same recording differently. Keep the
  // first display row, but retain an exclusion attached to any of its listings.
  const excludedIds = new Set(validSongs.filter(hasMusicClaimRisk).map(song => rowId(song)!));
  // A cid that is not a Monster Siren id is dropped, not the row: the song still plays from YouTube.
  return validSongs.map((song) => {
    const { cid, ...row } = song;
    // Existing content releases may predate an artist exclusion. Apply it at read
    // time too, before queue entries copy the compact copyright flag.
    return { ...row, ...(excludedIds.has(rowId(song)!) ? { copyright: true as const } : {}), ...(validCid(cid) ? { cid } : {}), id: rowId(song)! };
  }).filter((song) => !seen.has(song.id) && Boolean(seen.add(song.id)));
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
    return withCrossoverPageMusic(await fetchMusicCatalogue(releaseUrl, signal, fetcher));
  } catch (error) {
    if (signal?.aborted || releaseUrl === MUSIC_CATALOGUE_PATH) throw error;
    return withCrossoverPageMusic(await fetchMusicCatalogue(MUSIC_CATALOGUE_PATH, signal, fetcher));
  }
}
