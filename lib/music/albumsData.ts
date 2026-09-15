// Client-safe song data -- plain JSON import only, NO filesystem
// access anywhere in this file. musicPlayerContext.tsx loads this module
// dynamically when music is used, keeping the catalogue out of every
// page's initial bundle. Character base-skin ART
// and LYRICS TEXT both need a filesystem read and live in the separate
// lib/music/albumsDataServer.ts instead, which must only ever be
// imported from getStaticProps.
import albumsData from '@/data/albums.json';

export interface RawCredit {
  role: string;
  names: string[];
}

interface RawSong {
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

interface RawAlbum {
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
  videoId: string;
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

/** Every song across every album that has a real YouTube videoId,
 * flattened with its parent album's cover/characters attached. */
export function getAllSongsFull(): MonsterSirenSong[] {
  if (cachedSongs) return cachedSongs;
  const albums = albumsData as RawAlbum[];
  const songs: MonsterSirenSong[] = [];
  for (const album of albums) {
    const coverPath = album.coverFilename ? `/album-covers/${album.coverFilename}` : null;
    const albumSongs = album.songs || [];
    for (const song of albumSongs) {
      if (!song.videoId) continue;
      const lyricFilename = resolveLyricFilename(song, albumSongs);
      songs.push({
        videoId: song.videoId,
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
        coverPath,
        copyright: song.copyright === 'yes',
        length: song.length || '',
        lyricFilename,
        hasLyrics: Boolean(lyricFilename),
      });
    }
  }
  cachedSongs = songs;
  return songs;
}

export interface GetAllSongsOptions {
  excludeCopyrighted?: boolean;
}

/** Main entry point for the music player's queue. Stream-safe mode
 * (excludeCopyrighted) filters out the small handful of songs (11 of
 * 897 in the current catalog) that are actually copyrighted, so
 * streamers using the site can avoid them entirely. */
export function getAllSongs(options: GetAllSongsOptions = {}): MonsterSirenSong[] {
  const all = getAllSongsFull();
  if (options.excludeCopyrighted) return all.filter((s) => !s.copyright);
  return all;
}
