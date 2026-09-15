// Server-only -- uses getAllOperators/getOperatorAppearances (both
// touch the filesystem) plus a direct fs read for lyrics. Only ever
// import this from getStaticProps (pages/music/index.tsx,
// pages/music/discover.tsx). NEVER import this from
// musicPlayerContext.tsx, MusicPlayer.tsx, or anything else that's
// mounted client-side -- see albumsData.ts's own comment for why.
import fs from 'fs';
import path from 'path';
import albumsRaw from '@/data/albums.json';
import { getAllSongsFull, MonsterSirenSong, RawCredit } from './albumsData';
import { getAllOperators } from '@/lib/operators/operators';
import { getOperatorAppearances } from '@/lib/operators/operatorAppearances';

export interface CharacterArt {
  name: string;
  path: string | null; // null if no resolvable rarity/base art exists for this name
}

export interface LyricLine {
  time: number; // seconds
  text: string;
}

export interface SongDetail extends MonsterSirenSong {
  characterArt: CharacterArt[];
  lyrics: LyricLine[] | null; // each line's own timestamp preserved, for karaoke-style sync -- null if this song has no lyric file
}

export interface AlbumSummary {
  albumId: string;
  albumName: string;
  albumAltName: string;
  coverPath: string | null;
  releaseDate: string;
  albumCategory: string[];
  albumGenre: string[];
  characters: string[];
  songCount: number;
}

interface RawAlbum {
  albumId: string;
  albumName: string;
  albumAltName?: string;
  coverFilename?: string;
  releaseDate?: string;
  characters?: string[];
  albumCategory?: string[];
  albumGenre?: string[];
  songs?: { videoId?: string }[];
}

// Built once per build -- a lightweight name -> rarity lookup, not the
// full operator dataset (skills/talents/etc.), just enough to know
// which rarity-tiered icon/skin folder to check.
let rarityByName: Map<string, number | null> | null = null;
function getRarityMap(): Map<string, number | null> {
  if (!rarityByName) {
    rarityByName = new Map();
    for (const op of getAllOperators()) {
      rarityByName.set(op.name, op.rarity ?? null);
    }
  }
  return rarityByName;
}

function resolveCharacterArt(names: string[], prefer: 'icon' | 'full' = 'full'): CharacterArt[] {
  const rarities = getRarityMap();
  return names.map((name) => {
    const rarity = rarities.get(name);
    if (rarity == null) return { name, path: null };
    const appearances = getOperatorAppearances({ name, rarity });
    const base = appearances.find((a) => a.label.toLowerCase() === 'base');
    const path = prefer === 'icon' ? base?.iconPath || base?.fullPath || null : base?.fullPath || base?.iconPath || null;
    return { name, path };
  });
}

// Parses LRC timestamp tags ([mm:ss.xx]) into seconds, keeping each
// line's own timing intact -- this is what powers karaoke-style sync
// (bolding + auto-scrolling the currently-singing line as playback
// advances) on the /music player page. A line can carry more than one
// timestamp tag (repeated choruses reusing the same text at different
// points in the song), each becomes its own entry. Metadata tag lines
// ([ar:...], [ti:...], [by:...], etc.) and empty-text timing markers
// (pure pause/rest beats with no lyric on that line) are dropped
// entirely, same as before.
function parseLrc(content: string): LyricLine[] {
  const TIME_TAG = /\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\]/g;
  const lines: LyricLine[] = [];
  for (const rawLine of content.split(/\r?\n/)) {
    const matches = Array.from(rawLine.matchAll(TIME_TAG));
    if (matches.length === 0) continue;
    const text = rawLine.replace(TIME_TAG, '').trim();
    if (!text || /^\[[a-z]+:.*\]$/i.test(text)) continue;
    for (const m of matches) {
      const minutes = parseInt(m[1], 10);
      const seconds = parseInt(m[2], 10);
      const fraction = m[3] ? parseFloat(`0.${m[3]}`) : 0;
      lines.push({ time: minutes * 60 + seconds + fraction, text });
    }
  }
  return lines.sort((a, b) => a.time - b.time);
}

const lyricsCache = new Map<string, LyricLine[] | null>();

function getLyricsText(lyricFilename: string | null): LyricLine[] | null {
  if (!lyricFilename) return null;
  if (lyricsCache.has(lyricFilename)) return lyricsCache.get(lyricFilename)!;
  let result: LyricLine[] | null = null;
  try {
    const content = fs.readFileSync(path.join(process.cwd(), 'data', 'lyrics', lyricFilename), 'utf-8');
    const lines = parseLrc(content);
    result = lines.length > 0 ? lines : null;
  } catch {
    result = null; // file missing -- not an error, just no lyrics available for this song
  }
  lyricsCache.set(lyricFilename, result);
  return result;
}

/** Every album that has at least one playable (videoId-having) song,
 * with its cover path resolved and character list carried through. */
function getAllAlbums(): AlbumSummary[] {
  const albums = albumsRaw as RawAlbum[];
  return albums
    .map((a) => ({
      albumId: a.albumId,
      albumName: a.albumName,
      albumAltName: a.albumAltName || a.albumName,
      coverPath: a.coverFilename ? `/album-covers/${a.coverFilename}` : null,
      releaseDate: a.releaseDate || '',
      albumCategory: a.albumCategory || [],
      albumGenre: a.albumGenre || [],
      characters: a.characters || [],
      songCount: (a.songs || []).filter((s) => s.videoId).length,
    }))
    .filter((a) => a.songCount > 0);
}

/** Every song, each with its character base-skin art and lyrics text
 * already resolved -- built once and reused, since resolving these for
 * ~900 songs (most with zero characters and/or no lyric file, so
 * effectively free for those) is a one-time build cost. */
let cachedSongDetails: SongDetail[] | null = null;
function getAllSongDetails(): SongDetail[] {
  if (cachedSongDetails) return cachedSongDetails;
  cachedSongDetails = getAllSongsFull().map((s) => ({
    ...s,
    characterArt: resolveCharacterArt(s.characters),
    lyrics: getLyricsText(s.lyricFilename),
  }));
  return cachedSongDetails;
}

// Lean shape for pages/music/index.tsx's queue-click-to-modal lookup
// specifically -- that page needs SOME way to enrich a bare QueueTrack
// (id/title/artist/composer/character NAMES only, from the client-safe
// queue) into full modal detail for ANY of the ~900 songs in the
// catalog, since the queue is the whole catalog. Shipping the FULL
// SongDetail (credits + characterArt + lyrics + copyright + length +
// lyricFilename) for every single song in that page's static props was
// the actual cause of the 418kB page-data warning -- full lyrics text
// for the ~180 songs that have any was by far the biggest piece of
// that, with 14 repeated field names across ~900 objects adding a lot
// of pure JSON-key overhead on top. This keeps only what the modal
// actually renders from the bulk lookup (see SongDetailModal.tsx):
// title, album name/cover, full credits, character art, and a cheap
// hasLyrics flag. The actual lyrics TEXT is deliberately not embedded
// here at all -- see writeLyricsFilesToPublic below, which is how the
// modal gets the real text on demand instead.
export interface SongModalLookupEntry {
  videoId: string;
  title: string;
  albumName: string;
  coverPath: string | null;
  credits: RawCredit[];
  characterArt: CharacterArt[];
  hasLyrics: boolean;
}

let cachedModalLookup: SongModalLookupEntry[] | null = null;
export function getAllSongModalLookup(): SongModalLookupEntry[] {
  if (cachedModalLookup) return cachedModalLookup;
  cachedModalLookup = getAllSongDetails().map((s) => ({
    videoId: s.videoId,
    title: s.title,
    albumName: s.albumName,
    coverPath: s.coverPath,
    credits: s.credits,
    characterArt: s.characterArt,
    hasLyrics: s.lyrics != null && s.lyrics.length > 0,
  }));
  return cachedModalLookup;
}

// Writes each song's lyrics (only the ~180 that have any) to its own
// small file, public/lyrics/{videoId}.json -- one array of strings
// each, rather than a single combined index. This means a click on
// "Lyrics" only ever downloads THAT song's own few hundred bytes, not
// every lyric-having song's text in one request (which a single
// combined file would have meant, unnecessarily). Same standard
// static-export pattern as writing any other generated static asset
// from getStaticProps -- these end up served straight off Vercel's (or
// any static host's) CDN, exactly like the hundreds of individual
// icon/skin image files already under public/ elsewhere on this site,
// not through a server or serverless function at request time. Call
// this from exactly ONE page's getStaticProps (pages/music/index.tsx)
// -- calling it from multiple pages would just repeat the same writes
// pointlessly.
export function writeLyricsFilesToPublic(): void {
  const dir = path.join(process.cwd(), 'public', 'lyrics');
  fs.mkdirSync(dir, { recursive: true });
  for (const s of getAllSongDetails()) {
    if (s.lyrics && s.lyrics.length > 0) {
      const outPath = path.join(dir, `${s.videoId}.json`);
      fs.writeFileSync(outPath, JSON.stringify(s.lyrics), 'utf-8');
    }
  }
}

// ---------------------------------------------------------------------
// /music/discover -- deliberately lean, unlike SongDetail/getAllSongDetails
// above. That shape (credits + characterArt + lyrics) is right for a
// single song's detail view; shipping it for all ~900 songs into a
// browse/search page's props is exactly the mistake documented on
// SongModalLookupEntry above (the 418kB page-data warning). This omits
// credits, lyrics, lyricFilename, and characterArt entirely -- none of
// it is needed to browse, search, or click through to a song -- and
// precomputes facet counts server-side, once, rather than making the
// client iterate every song on load just to build the genre/character/
// artist browse lists.
export interface DiscoverSong {
  videoId: string;
  title: string;
  altTitle: string | null;
  albumId: string;
  albumName: string;
  coverPath: string | null;
  characters: string[];
  origin: string[];
  artist: string | null;
}

export interface DiscoverFacet {
  name: string;
  count: number;
}

// Characters need richer data than a plain facet: a portrait (their
// base-skin art) and a recency signal (their most recent song's
// release date), so the browse row can feature whoever most recently
// got new music first, rather than just whoever has the most songs
// overall -- a returning visitor cares more about "who's new" than
// "who's prolific".
export interface DiscoverCharacter {
  name: string;
  count: number;
  artPath: string | null;
  mostRecentDate: string; // YYYY/MM/DD, empty string if unknown
}

export interface DiscoverAlbum {
  albumId: string;
  albumName: string;
  albumAltName: string;
  coverPath: string | null;
  releaseDate: string;
}

export interface DiscoverPageData {
  songs: DiscoverSong[];
  characters: DiscoverCharacter[]; // sorted by mostRecentDate desc, NOT by count -- see DiscoverCharacter's own comment
  origins: DiscoverFacet[]; // sorted by count desc -- the story event an album is tied to. NO "unspecified" bucket like genre's Ungenred: most operator EPs simply aren't tied to any event at all, so a catch-all bucket here would just be "most of the catalog" and add no discovery value. Songs with no origin are omitted from this facet entirely, same as characters already does.
  artists: DiscoverFacet[]; // sorted by count desc
  recentAlbums: DiscoverAlbum[]; // sorted by releaseDate desc, capped
}

const RECENT_ALBUMS_LIMIT = 12;

function countBy(values: string[]): DiscoverFacet[] {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

let cachedDiscoverData: DiscoverPageData | null = null;
export function getDiscoverPageData(): DiscoverPageData {
  if (cachedDiscoverData) return cachedDiscoverData;

  const fullSongs = getAllSongsFull();
  const songs: DiscoverSong[] = fullSongs.map((s) => ({
    videoId: s.videoId,
    title: s.title,
    altTitle: s.altTitle,
    albumId: s.albumId,
    albumName: s.albumName,
    coverPath: s.coverPath,
    characters: s.characters,
    origin: s.origin,
    artist: s.artist,
  }));

  const allCharacterNames = fullSongs.flatMap((s) => s.characters);
  const allArtistNames = fullSongs.map((s) => s.artist).filter((a): a is string => !!a);
  const allOriginNames = fullSongs.flatMap((s) => s.origin);

  const albums = getAllAlbums();

  // Each character's most recent release date -- releaseDate lives on
  // the ALBUM (characters are inherited down to each song from there,
  // same as everywhere else in this file), so this is computed by
  // walking albums directly rather than the flattened song list, which
  // would just redundantly re-check the same date once per song on a
  // multi-song album.
  const characterRecency = new Map<string, string>();
  for (const album of albums) {
    for (const name of album.characters) {
      const existing = characterRecency.get(name);
      if (!existing || album.releaseDate > existing) characterRecency.set(name, album.releaseDate);
    }
  }
  const characterCounts = countBy(allCharacterNames);
  const characterArtList = resolveCharacterArt(characterCounts.map((c) => c.name), 'icon');
  const artPathByName = new Map(characterArtList.map((a) => [a.name, a.path]));
  // Sorted by recency, NOT by song count -- featuring whoever most
  // recently got new music first is the whole point of this row (see
  // DiscoverCharacter's own comment).
  const characters: DiscoverCharacter[] = characterCounts
    .map((c) => ({
      name: c.name,
      count: c.count,
      artPath: artPathByName.get(c.name) || null,
      mostRecentDate: characterRecency.get(c.name) || '',
    }))
    .sort((a, b) => b.mostRecentDate.localeCompare(a.mostRecentDate)); // YYYY/MM/DD sorts correctly as a plain string

  const recentAlbums: DiscoverAlbum[] = albums
    .filter((a) => a.releaseDate)
    .sort((a, b) => b.releaseDate.localeCompare(a.releaseDate)) // YYYY/MM/DD sorts correctly as a plain string
    .slice(0, RECENT_ALBUMS_LIMIT)
    .map((a) => ({
      albumId: a.albumId,
      albumName: a.albumName,
      albumAltName: a.albumAltName,
      coverPath: a.coverPath,
      releaseDate: a.releaseDate,
    }));

  cachedDiscoverData = {
    songs,
    characters,
    origins: countBy(allOriginNames),
    artists: countBy(allArtistNames),
    recentAlbums,
  };
  return cachedDiscoverData;
}