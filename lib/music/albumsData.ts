// The song list, flattened from data/albums.json -- plain JSON import, no filesystem
// access in this file. Read at build and export time only: by getStaticProps (through
// lib/music/albumsDataServer.ts), the song guesser's catalogue, and
// scripts/build/build-music-catalogue.ts, which publishes the player's queue in the content
// release. It must never reach the browser: the player used to import it, which shipped the
// whole catalogue as a 421 kB chunk and froze the queue at the deploy's copy of the data.
// next.config.js fails the build if data/albums.json reaches a client chunk again.
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
