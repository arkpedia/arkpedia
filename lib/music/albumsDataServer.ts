// Server-only -- uses getAllOperators/getOperatorAppearances (both
// touch the filesystem) plus a direct fs read for lyrics. Only ever
// import this from getStaticProps (pages/music/index.tsx,
// pages/music/discover.tsx). NEVER import this from
// musicPlayerContext.tsx, MusicPlayer.tsx, or anything else that's
// mounted client-side -- see albumsData.ts's own comment for why.
import fs from 'fs';
import path from 'path';
import albumsRaw from '@/data/albums.json';
import { albumCoverPath, getAllSongsFull, songsFromAlbums, MonsterSirenSong, RawAlbum, RawCredit } from './albumsData';
import { getAllOperators } from '@/lib/operators/operators';
import { getOperatorAppearances } from '@/lib/operators/operatorAppearances';
import { normalizeReleaseDate, parseReleaseDate } from './releaseDate.mjs';

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
  /** Songs with a YouTube videoId: what the player can queue. */
  songCount: number;
  /** Songs Monster Siren published that have no videoId yet (the album sync flags each). */
  pendingCount: number;
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
/**
 * Roles that open a credit line, taken from the 182 published LRC files rather than
 * imagined: 54 of them begin with a credits block, in Chinese, English or both
 * ("作曲 Composer: Yocke"). Monster Siren puts it in the lyric file itself, so without
 * this the player spends a song's first forty seconds highlighting an engineer's name.
 */
const CREDIT_ROLE = /作曲|作词|编曲|制作人|录音|混音|母带|演唱|歌手|主唱|领唱|合唱|和声|吉他|贝斯|鼓|弦乐|大提琴|音乐设计|监制|乐器|Composer|Composed|Arrang|Producer|Vocal|Lyric|Songwriter|Recording|Mixing|Mastering|Guitar|Bass|Drums|Strings|Chorus|Instrument/i;
/** A few credit lines carry no colon at all. Matched whole, never by prefix. */
const CREDIT_PREAMBLE = /^(?:Presented by .+|(?:Music and Lyrics|Vocals|Words and Music) by .+)$/i;

/**
 * Is this one of the credit lines that open the file?
 *
 * Only ever applied to the LEADING run, and that restriction is load bearing: real
 * lyrics do contain a colon -- "We cry:" and "I'm calling:" are both sung lines in
 * this catalogue -- so a rule that swept the whole file would delete them. Stopping
 * at the first line that is not credit-shaped cannot reach them.
 */
function isCreditLine(text: string): boolean {
  if (!text) return true;
  if (CREDIT_PREAMBLE.test(text)) return true;
  const label = text.match(/^(.{1,44}?)\s*[:：]\s*\S/);
  return Boolean(label && CREDIT_ROLE.test(label[1]));
}

export function parseLrc(content: string): LyricLine[] {
  const TIME_TAG = /\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\]/g;
  const lines: LyricLine[] = [];
  let inCreditsBlock = true;
  for (const rawLine of content.split(/\r?\n/)) {
    const matches = Array.from(rawLine.matchAll(TIME_TAG));
    if (matches.length === 0) continue;
    const text = rawLine.replace(TIME_TAG, '').trim();
    if (!text || /^\[[a-z]+:.*\]$/i.test(text)) continue;
    if (inCreditsBlock) {
      if (isCreditLine(text)) continue;
      inCreditsBlock = false;
    }
    for (const m of matches) {
      const minutes = parseInt(m[1], 10);
      const seconds = parseInt(m[2], 10);
      const fraction = m[3] ? parseFloat(`0.${m[3]}`) : 0;
      lines.push({ time: minutes * 60 + seconds + fraction, text });
    }
  }
  if (!lines.length && !/\[\d{1,3}:\d{2}/.test(content)) return content.split(/\r?\n/).map(text => text.trim()).filter(text => text && !/^\[[a-z]+:.*\]$/i.test(text) && !isCreditLine(text)).map(text => ({ time: 0, text }));
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

/**
 * Every album with at least one song, with its cover path resolved (null until its cover is
 * published) and character list carried through.
 *
 * Not only the albums with a playable song: a new Monster Siren album arrives with neither a
 * YouTube videoId (a person adds it) nor a cover (published by the image repository later),
 * and requiring a videoId here kept every new album off /music/discover until someone added
 * one -- 1014 月明人间 and 0232 逐影集趣ost sat that way from 2026-09-25. Its songs show as
 * not on YouTube yet, and its tile shows the placeholder cover.
 */
export function albumSummaries(albums: readonly RawAlbum[]): AlbumSummary[] {
  return albums
    .map((a) => ({
      albumId: a.albumId,
      albumName: a.albumName,
      albumAltName: a.albumAltName || a.albumName,
      coverPath: albumCoverPath(a),
      // Stored form (YYYY/MM/DD) or '' -- a date written any other way that still names a
      // day is read as that day; one that names none counts as unknown.
      releaseDate: normalizeReleaseDate(a.releaseDate) ?? '',
      albumCategory: a.albumCategory || [],
      albumGenre: a.albumGenre || [],
      characters: a.characters || [],
      songCount: (a.songs || []).filter((s) => s.videoId).length,
      pendingCount: (a.songs || []).filter((s) => !s.videoId).length,
    }))
    .filter((a) => a.songCount + a.pendingCount > 0);
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
  /** False while none of its songs has a YouTube videoId: the player has nothing to queue. */
  playable: boolean;
}

/** A song Monster Siren published that has no YouTube videoId yet, so the player cannot queue
 * it; Discover lists it with a link to the song on Monster Siren instead. */
export interface DiscoverPendingSong {
  songId: string;
  title: string;
  altTitle: string | null;
  albumId: string;
  albumName: string;
  coverPath: string | null;
  characters: string[];
  origin: string[];
  artist: null;
}

export interface DiscoverPageData {
  songs: DiscoverSong[];
  characters: DiscoverCharacter[]; // sorted by mostRecentDate desc, NOT by count -- see DiscoverCharacter's own comment
  origins: DiscoverFacet[]; // sorted by count desc -- the story event an album is tied to. NO "unspecified" bucket like genre's Ungenred: most operator EPs simply aren't tied to any event at all, so a catch-all bucket here would just be "most of the catalog" and add no discovery value. Songs with no origin are omitted from this facet entirely, same as characters already does.
  artists: DiscoverFacet[]; // sorted by count desc
  recentAlbums: DiscoverAlbum[]; // sorted by releaseDate desc, capped
  pendingSongs: DiscoverPendingSong[];
}

const RECENT_ALBUMS_LIMIT = 12;

/** The day as a number to sort by; an unknown date sorts after every known one. */
function releaseDay(date: string): number {
  return parseReleaseDate(date) ?? Number.NEGATIVE_INFINITY;
}

/**
 * The albums with a known release date, newest first -- by the day each names, not by
 * the text: comparing the strings put "October 8, 2025" above every 2026 album. An album
 * with no readable date has no place in a list ordered by recency, so it is left out
 * (the album sync fills a blank date from its cover's upload day, see releaseDate.mjs).
 */
export function newestFirst<T extends { releaseDate: string }>(albums: T[]): T[] {
  return albums
    .map((album) => ({ album, day: parseReleaseDate(normalizeReleaseDate(album.releaseDate)) }))
    .filter((row): row is { album: T; day: number } => row.day !== null)
    .sort((a, b) => b.day - a.day)
    .map((row) => row.album);
}

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
  cachedDiscoverData = discoverPageData(albumsRaw as RawAlbum[]);
  return cachedDiscoverData;
}

/** getDiscoverPageData for any catalogue: the pure part, which the tests call with fixtures. */
export function discoverPageData(rawAlbums: readonly RawAlbum[]): DiscoverPageData {
  const fullSongs = songsFromAlbums(rawAlbums);
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

  const albums = albumSummaries(rawAlbums);
  const pendingSongs: DiscoverPendingSong[] = rawAlbums.flatMap((album) => (album.songs || [])
    .filter((song) => !song.videoId)
    .map((song) => ({
      songId: song.songId,
      title: song.songName,
      altTitle: song.songAltName || null,
      albumId: album.albumId,
      albumName: album.albumAltName || album.albumName,
      coverPath: albumCoverPath(album),
      characters: album.characters || [],
      origin: album.origin || [],
      artist: null,
    })));

  // Each character's most recent release date -- releaseDate lives on
  // the ALBUM (characters are inherited down to each song from there,
  // same as everywhere else in this file), so this is computed by
  // walking albums directly rather than the flattened song list, which
  // would just redundantly re-check the same date once per song on a
  // multi-song album.
  const characterRecency = new Map<string, string>();
  for (const album of newestFirst(albums)) {
    for (const name of album.characters) {
      if (!characterRecency.has(name)) characterRecency.set(name, album.releaseDate);
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
    .sort((a, b) => releaseDay(b.mostRecentDate) - releaseDay(a.mostRecentDate));

  const recentAlbums: DiscoverAlbum[] = newestFirst(albums)
    .slice(0, RECENT_ALBUMS_LIMIT)
    .map((a) => ({
      albumId: a.albumId,
      albumName: a.albumName,
      albumAltName: a.albumAltName,
      coverPath: a.coverPath,
      releaseDate: a.releaseDate,
      playable: a.songCount > 0,
    }));

  return {
    songs,
    characters,
    origins: countBy(allOriginNames),
    artists: countBy(allArtistNames),
    recentAlbums,
    pendingSongs,
  };
}

/** The Discover page's props, as a release this code compiled carries them or as an older
 * one does. */
type DiscoverReleaseProps = Omit<DiscoverPageData, 'pendingSongs' | 'recentAlbums'> & {
  pendingSongs?: DiscoverPendingSong[];
  recentAlbums: (Omit<DiscoverAlbum, 'playable'> & { playable?: boolean })[];
};

/**
 * Discover's props with `pendingSongs` and each recent album's `playable`, whichever release
 * they came from.
 *
 * A release compiled before those two existed has neither, and production renders the live
 * release, which after a deploy is still the one the previous code compiled (the release
 * gate holds the next one until production runs this code). On it the page crashed as soon
 * as a reader searched, picked a facet or opened an album (`pendingSongs.filter` of
 * undefined), and every recent album said "Not on YouTube yet" (2026-09-26 verification).
 * Such a release listed only albums with a song on YouTube and no song without one, so an
 * album is playable when `songs` lists it, and there is nothing pending. A release this code
 * compiled passes through unchanged (the same object).
 * scripts/tests/test-previous-release-props.ts renders the page from the live release's copy.
 */
export function discoverFromRelease<P extends DiscoverReleaseProps>(props: P): P & Pick<DiscoverPageData, 'pendingSongs' | 'recentAlbums'> {
  const complete = Array.isArray(props.pendingSongs) && props.recentAlbums.every((a) => typeof a.playable === 'boolean');
  if (complete) return props as P & Pick<DiscoverPageData, 'pendingSongs' | 'recentAlbums'>;
  const onYouTube = new Set(props.songs.map((s) => s.albumId));
  return {
    ...props,
    pendingSongs: Array.isArray(props.pendingSongs) ? props.pendingSongs : [],
    recentAlbums: props.recentAlbums.map((a) => (typeof a.playable === 'boolean' ? a as DiscoverAlbum : { ...a, playable: onYouTube.has(a.albumId) })),
  };
}
