// The song list, flattened from data/albums.json -- plain JSON import, no filesystem
// access in this file. Read at build and export time only: by getStaticProps (through
// lib/music/albumsDataServer.ts), the song guesser's catalogue, and
// scripts/build/build-music-catalogue.ts, which publishes the player's queue in the content
// release. It must never reach the browser: the player used to import it, which shipped the
// whole catalogue as a 421 kB chunk and froze the queue at the deploy's copy of the data.
// next.config.js fails the build if data/albums.json reaches a client chunk again.
import albumsData from '@/data/albums.json';
// Arknights: Endfield's albums (scripts/sync/sync-endfield-albums.mjs), kept apart from Monster
// Siren's: every album there says game "endfield". Guarded like albums.json (next.config.js).
import endfieldAlbumsData from '@/data/endfield-albums.json';
import { msrTrackId } from './trackId';
import { hasMusicClaimRisk } from './claimRisk';
import type { MusicGame } from './songFilter';
import { findSongVersion, isInstrumentalVersion } from './songVersions';

export interface RawCredit {
  role: string;
  names: string[];
}

export interface RawSong {
  songId: string;
  songName: string;
  songAltName?: string;
  albumId: string;
  credits?: RawCredit[];
  videoId: string;
  length?: string;
  songCategory?: string[];
  songGenre?: string[];
  copyright?: string; // "yes" | "no"
  lyricFilename?: string;
}

export interface RawAlbum {
  albumId: string;
  albumName: string;
  albumAltName?: string;
  /** The game the album is from: "endfield" in data/endfield-albums.json, absent (Arknights) in
   *  data/albums.json. Read through albumGame. */
  game?: string;
  /** Where the album's cover is fetched from: Monster Siren's CDN, or for an Endfield album its
   *  first song's YouTube thumbnail, which the site draws directly until the cover cut from it is
   *  published (albumCoverPath). */
  coverUrl?: string;
  /** An Endfield album's YouTube album playlist (OLAK5uy_...), which its sync reads. */
  youtubePlaylistId?: string;
  coverFilename?: string;
  releaseDate?: string;
  origin?: string[]; // the in-game story event this album is tied to, e.g. ["Heart of Surging Flame"] -- absent for most operator EPs, which aren't tied to any specific event
  characters?: string[];
  albumCategory?: string[];
  albumGenre?: string[];
  songs?: RawSong[];
}

export interface MonsterSirenSong {
  /** What the player calls it (lib/music/trackId.ts): the YouTube video id, or msr:<songId> for
   *  a song with no YouTube upload, which plays Monster Siren's own audio. */
  trackId: string;
  /** '' for a song with no YouTube upload (getMonsterSirenOnlySongs). */
  videoId: string;
  /** Monster Siren's song id (cid); `endfield-<videoId>` for an Endfield song, never digits. */
  songId: string;
  /** The game the song's album is from (albumGame). */
  game: MusicGame;
  title: string;
  altTitle: string | null; // songAltName -- a translation of `title`, used for the cross-fade title display
  artist: string | null; // "singer" -- the `artist` credit role specifically
  composer: string | null;
  credits: RawCredit[]; // every credited role (composer, arranger, producer, lyrics, artist, performer) -- for displays that want the full participant list, not just composer/artist
  genre: string[]; // song's own songGenre if present, else falls back to the parent album's albumGenre -- was typed on RawSong/RawAlbum but never actually reached this type until now
  characters: string[]; // inherited from the song's parent album
  origin: string[]; // inherited from the song's parent album -- the story event it's tied to, if any (most operator EPs have none)
  albumId: string;
  albumName: string;
  /** The album's own (usually Chinese) name, when albumName is its English one: searchable too. */
  albumOriginalName: string;
  coverPath: string | null; // /album-covers/{coverFilename}
  copyright: boolean; // true = copyrighted -- excluded when stream-safe mode is on
  length: string;
  lyricFilename: string | null; // just the filename -- actually READING it needs fs, see albumsDataServer.ts
  lyricTrackId?: string; // The track that supplies an instrumental’s lyric file.
  hasLyrics: boolean; // cheap flag (just Boolean(lyricFilename)) -- lets any component show a Lyrics button and fetch the actual text on demand, without needing the text itself preloaded
}

function getCreditRole(credits: RawCredit[] | undefined, role: string): string | null {
  if (!credits) return null;
  const c = credits.find((cred) => cred.role === role);
  if (!c || !c.names || c.names.length === 0) return null;
  return c.names.join(', ');
}

// Computed once and reused -- albums.json is large (291 albums, ~900
// songs) and this list doesn't change within a single build/session.
let cachedSongs: MonsterSirenSong[] | null = null;
let cachedMonsterSirenOnly: MonsterSirenSong[] | null = null;

// Instrumental versions typically ship with no lyric file of their
// own -- the vocal take usually shares an identical title minus this
// suffix, within the SAME album. Borrowing the vocal version's lyrics
// lets the instrumental still be used karaoke-style, rather than
// showing "no lyrics available" for a song that clearly has words,
// just not sung on this particular take.
const versionedSong = (song: RawSong) => ({ ...song, id: song.songId, title: song.songName, altTitle: song.songAltName, album: song.albumId });

function lyricSource(song: RawSong, albumSongs: RawSong[]): RawSong | undefined {
  if (!isInstrumentalVersion(versionedSong(song))) return song.lyricFilename ? song : undefined;
  const matched = findSongVersion(versionedSong(song), albumSongs.map(versionedSong))?.song;
  const vocal = matched?.lyricFilename ? matched : undefined;
  return song.lyricFilename && song.lyricFilename !== vocal?.lyricFilename ? song : vocal;
}

/** The game an album is from. Only the two values: an unknown one is a data error, refused
 * by catalogueAlbums at build rather than shown as Arknights music. */
export function albumGame(album: Pick<RawAlbum, 'game'>): MusicGame {
  return album.game === 'endfield' ? 'endfield' : 'arknights';
}

/** A YouTube thumbnail, the one cover address the site draws straight from its source. */
export const YOUTUBE_COVER = /^https:\/\/i\.ytimg\.com\/vi\/[\w-]{11}\/(?:maxres|hq)default\.jpg$/;

/** Where an album's cover is published, or null while it has none: the album sync fills
 * coverFilename only once arkpedia-image-assets has the file (scripts/sync/sync-albums.mjs),
 * so a new album arrives without one and shows the placeholder (components/music/AlbumCover).
 * An Endfield album is drawn from its YouTube thumbnail (coverUrl) until it has a published
 * cover: the album's square art on a plain frame, which every cover's square crop shows whole.
 * Its stage publishes that square and fills coverFilename (scripts/sync/sync-endfield-albums.mjs). */
export function albumCoverPath(album: Pick<RawAlbum, 'coverFilename' | 'coverUrl' | 'game'>): string | null {
  if (album.coverFilename) return `/album-covers/${album.coverFilename}`;
  if (albumGame(album) === 'endfield' && YOUTUBE_COVER.test(album.coverUrl ?? '')) return album.coverUrl!;
  return null;
}

/**
 * Every album the music pages and the player's catalogue are built from: Monster Siren's, then
 * Endfield's. Refuses a mix-up at build, where it can be fixed, rather than at a reader: an album
 * in Endfield's file not marked "endfield" (the Endfield setting would not hide it), an album in
 * Monster Siren's that names a game, or an album or song id the two files share.
 */
export function catalogueAlbums(arknights: readonly RawAlbum[], endfield: readonly RawAlbum[]): RawAlbum[] {
  for (const album of arknights) {
    if (album.game !== undefined && album.game !== 'arknights') throw new Error(`data/albums.json: album ${album.albumId} says game ${album.game}; Monster Siren's albums are Arknights`);
  }
  for (const album of endfield) {
    if (album.game !== 'endfield') throw new Error(`data/endfield-albums.json: album ${album.albumId} says game ${album.game ?? '(none)'}, not endfield`);
    for (const song of album.songs || []) {
      if (!song.videoId || /^\d+$/.test(song.songId)) throw new Error(`data/endfield-albums.json: song ${song.songId} needs its YouTube upload and a non-numeric id`);
    }
  }
  const albumIds = new Set<string>(), songIds = new Set<string>();
  for (const album of [...arknights, ...endfield]) {
    if (albumIds.has(album.albumId) && endfield.includes(album)) throw new Error(`Album id ${album.albumId} is in both data/albums.json and data/endfield-albums.json`);
    albumIds.add(album.albumId);
  }
  for (const album of endfield) for (const song of album.songs || []) {
    if (songIds.has(song.songId)) throw new Error(`data/endfield-albums.json lists song ${song.songId} twice`);
    songIds.add(song.songId);
  }
  return [...arknights, ...endfield];
}

let cachedAlbums: RawAlbum[] | null = null;
/** catalogueAlbums for this build's data files. */
export function getAllAlbums(): RawAlbum[] {
  if (!cachedAlbums) cachedAlbums = catalogueAlbums(albumsData as RawAlbum[], endfieldAlbumsData as RawAlbum[]);
  return cachedAlbums;
}

/** Every song across every album that has a real YouTube videoId,
 * flattened with its parent album's cover/characters attached. */
export function getAllSongsFull(): MonsterSirenSong[] {
  if (cachedSongs) return cachedSongs;
  cachedSongs = songsFromAlbums(getAllAlbums());
  return cachedSongs;
}

/** Every song with no YouTube upload yet, flattened like getAllSongsFull: the player plays these
 * from Monster Siren's own audio (trackId msr:<songId>, videoId ''). Kept apart from
 * getAllSongsFull, whose callers (the song guesser, operator EPs, Discover's song list) key on
 * the YouTube video id. */
export function getMonsterSirenOnlySongs(): MonsterSirenSong[] {
  if (cachedMonsterSirenOnly) return cachedMonsterSirenOnly;
  cachedMonsterSirenOnly = monsterSirenOnlySongsFromAlbums(getAllAlbums());
  return cachedMonsterSirenOnly;
}

/** Every song the player can play: on YouTube first, then the ones only Monster Siren has. */
export function getAllPlayerSongs(): MonsterSirenSong[] {
  return [...getAllSongsFull(), ...getMonsterSirenOnlySongs()];
}

/** getAllSongsFull for any catalogue: the pure part, which the tests call with fixtures. */
export function songsFromAlbums(albums: readonly RawAlbum[]): MonsterSirenSong[] {
  return flattenSongs(albums, (song) => Boolean(song.videoId));
}

/** getMonsterSirenOnlySongs for any catalogue. A song needs its Monster Siren id to be played. */
export function monsterSirenOnlySongsFromAlbums(albums: readonly RawAlbum[]): MonsterSirenSong[] {
  return flattenSongs(albums, (song) => !song.videoId && /^\d{1,12}$/.test(song.songId || ''));
}

function flattenSongs(albums: readonly RawAlbum[], include: (song: RawSong) => boolean): MonsterSirenSong[] {
  const songs: MonsterSirenSong[] = [];
  for (const album of albums) {
    const coverPath = albumCoverPath(album);
    const game = albumGame(album);
    const albumSongs = album.songs || [];
    for (const song of albumSongs) {
      if (!include(song)) continue;
      const source = lyricSource(song, albumSongs);
      const lyricFilename = source?.lyricFilename || null;
      songs.push({
        trackId: song.videoId || msrTrackId(song.songId),
        videoId: song.videoId || '',
        songId: song.songId,
        game,
        title: song.songName,
        altTitle: song.songAltName || null,
        artist: getCreditRole(song.credits, 'artist'),
        composer: getCreditRole(song.credits, 'composer'),
        credits: song.credits || [],
        genre: song.songGenre && song.songGenre.length > 0 ? song.songGenre : album.albumGenre || [],
        characters: album.characters || [],
        origin: album.origin || [],
        albumId: album.albumId,
        albumName: album.albumAltName || album.albumName,
        albumOriginalName: album.albumName,
        coverPath,
        copyright: hasMusicClaimRisk({ copyright: song.copyright === 'yes', credits: song.credits }),
        length: song.length || '',
        lyricFilename,
        ...(source && isInstrumentalVersion(versionedSong(song)) ? { lyricTrackId: source.videoId || msrTrackId(source.songId) } : {}),
        hasLyrics: Boolean(lyricFilename),
      });
    }
  }
  return songs;
}
