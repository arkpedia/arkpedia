// The song list, flattened from data/albums.json -- plain JSON import, no filesystem
// access in this file. Read at build and export time only: by getStaticProps (through
// lib/music/albumsDataServer.ts), the song guesser's catalogue, and
// scripts/build/build-music-catalogue.ts, which publishes the player's queue in the content
// release. It must never reach the browser: the player used to import it, which shipped the
// whole catalogue as a 421 kB chunk and froze the queue at the deploy's copy of the data.
// next.config.js fails the build if data/albums.json reaches a client chunk again.
import albumsData from '@/data/albums.json';
import { msrTrackId } from './trackId';

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
  /** Monster Siren's song id (cid). */
  songId: string;
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
const INSTRUMENTAL_SUFFIX = / \(Instrumental\)$/i;

function resolveLyricFilename(song: RawSong, albumSongs: RawSong[]): string | null {
  if (song.lyricFilename) return song.lyricFilename;
  if (!INSTRUMENTAL_SUFFIX.test(song.songName)) return null;
  const vocalTitle = song.songName.replace(INSTRUMENTAL_SUFFIX, '');
  const vocalSibling = albumSongs.find((s) => s.songName === vocalTitle && s.lyricFilename);
  return vocalSibling?.lyricFilename || null;
}

/** Where an album's cover is published, or null while it has none: the album sync fills
 * coverFilename only once arkpedia-image-assets has the file (scripts/sync/sync-albums.mjs),
 * so a new album arrives without one and shows the placeholder (components/music/AlbumCover). */
export function albumCoverPath(album: Pick<RawAlbum, 'coverFilename'>): string | null {
  return album.coverFilename ? `/album-covers/${album.coverFilename}` : null;
}

/** Every song across every album that has a real YouTube videoId,
 * flattened with its parent album's cover/characters attached. */
export function getAllSongsFull(): MonsterSirenSong[] {
  if (cachedSongs) return cachedSongs;
  cachedSongs = songsFromAlbums(albumsData as RawAlbum[]);
  return cachedSongs;
}

/** Every song with no YouTube upload yet, flattened like getAllSongsFull: the player plays these
 * from Monster Siren's own audio (trackId msr:<songId>, videoId ''). Kept apart from
 * getAllSongsFull, whose callers (the song guesser, operator EPs, Discover's song list) key on
 * the YouTube video id. */
export function getMonsterSirenOnlySongs(): MonsterSirenSong[] {
  if (cachedMonsterSirenOnly) return cachedMonsterSirenOnly;
  cachedMonsterSirenOnly = monsterSirenOnlySongsFromAlbums(albumsData as RawAlbum[]);
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
    const albumSongs = album.songs || [];
    for (const song of albumSongs) {
      if (!include(song)) continue;
      const lyricFilename = resolveLyricFilename(song, albumSongs);
      songs.push({
        trackId: song.videoId || msrTrackId(song.songId),
        videoId: song.videoId || '',
        songId: song.songId,
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
        copyright: song.copyright === 'yes',
        length: song.length || '',
        lyricFilename,
        hasLyrics: Boolean(lyricFilename),
      });
    }
  }
  return songs;
}
