// Server-only -- uses getAllOperators/getOperatorAppearances (both
// touch the filesystem) plus a direct fs read for lyrics. Only ever
// import this from getStaticProps (pages/music/index.tsx,
// pages/music/discover.tsx). NEVER import this from
// musicPlayerContext.tsx, MusicPlayer.tsx, or anything else that's
// mounted client-side -- see albumsData.ts's own comment for why.
import fs from 'fs';
import path from 'path';
import { albumCoverPath, albumGame, getAllAlbums, getAllPlayerSongs, songsFromAlbums, MonsterSirenSong, RawAlbum, RawCredit } from './albumsData';
import { lyricsPath } from './trackId';
import { isLyricCredit } from './lyricCredits';
import { getAllOperators } from '@/lib/operators/operators';
import { getOperatorAppearances } from '@/lib/operators/operatorAppearances';
import { normalizeReleaseDate, parseReleaseDate } from './releaseDate.mjs';
import { characterPortrait } from './characterPortraits.mjs';
import { artistFacets } from './artistCredits';
import { RECENT_ALBUMS_LIMIT } from './discoverFilter';
import { servedAssetExists } from '@/lib/assets/publicAssets';

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
  /** Present only for an Endfield album (lib/music/songFilter.ts). */
  game?: 'endfield';
  coverPath: string | null;
  releaseDate: string;
  albumCategory: string[];
  albumGenre: string[];
  characters: string[];
  /** Songs with a YouTube videoId. */
  songCount: number;
  /** Songs Monster Siren published that have no videoId yet (the album sync flags each); the
   *  player plays these from Monster Siren (lib/music/trackId.ts). */
  pendingCount: number;
}

// Built once per build -- a lightweight name -> rarity lookup, not the
// full operator dataset (skills/talents/etc.), just enough to know
// which rarity-tiered icon/skin folder to check.
let rarityByName: Map<string, number | null> | null = null;
let operatorByFold: Map<string, string> | null = null;
/* Letters and digits only: an album credit and the operator record can spell one character
   differently. The albums credit "Kal'tsit - Esperanta" where the Global record is "Kal'tsit
   Esperanta" (2026-10-20), and the exact match found no operator, so she had no art. */
export const foldCharacterName = (name: string) => name.normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
function getRarityMap(): Map<string, number | null> {
  if (!rarityByName) {
    rarityByName = new Map();
    operatorByFold = new Map();
    for (const op of getAllOperators()) {
      rarityByName.set(op.name, op.rarity ?? null);
      operatorByFold.set(foldCharacterName(op.name), op.name);
    }
  }
  return rarityByName;
}
/** The operator record a credited name is: the same name, else the one spelled the same apart from punctuation and spaces. */
function operatorName(name: string): string | null {
  const rarities = getRarityMap();
  if (rarities.has(name)) return name;
  return operatorByFold?.get(foldCharacterName(name)) ?? null;
}

/** A character's art: an operator's Base outfit, else the game's own portrait of a character
 *  who is not one (lib/music/characterPortraits.mjs), else null and the page draws initials. */
function resolveCharacterArt(names: string[], prefer: 'icon' | 'full' = 'full'): CharacterArt[] {
  const rarities = getRarityMap();
  return names.map((name) => {
    const operator = operatorName(name);
    const rarity = operator ? rarities.get(operator) : null;
    if (operator == null || rarity == null) return { name, path: characterPortrait(name, servedAssetExists) };
    const appearances = getOperatorAppearances({ name: operator, rarity });
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
      if (isLyricCredit(text)) continue;
      inCreditsBlock = false;
    }
    for (const m of matches) {
      const minutes = parseInt(m[1], 10);
      const seconds = parseInt(m[2], 10);
      const fraction = m[3] ? parseFloat(`0.${m[3]}`) : 0;
      lines.push({ time: minutes * 60 + seconds + fraction, text });
    }
  }
  if (!lines.length && !/\[\d{1,3}:\d{2}/.test(content)) return content.split(/\r?\n/).map(text => text.trim()).filter(text => text && !/^\[[a-z]+:.*\]$/i.test(text) && !isLyricCredit(text)).map(text => ({ time: 0, text }));
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
      ...endfieldMark(albumGame(a)),
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

/** The game field as the pages' props carry it: only on an Endfield record, so Arknights' many
 *  records (and a release from before the field) read the same as before (lib/music/songFilter.ts). */
const endfieldMark = (game: string | undefined): { game?: 'endfield' } => (game === 'endfield' ? { game: 'endfield' } : {});

/** Every song, each with its character base-skin art and lyrics text
 * already resolved -- built once and reused, since resolving these for
 * ~900 songs (most with zero characters and/or no lyric file, so
 * effectively free for those) is a one-time build cost. */
let cachedSongDetails: SongDetail[] | null = null;
function getAllSongDetails(): SongDetail[] {
  if (cachedSongDetails) return cachedSongDetails;
  // The songs only Monster Siren has too: the player plays them, with their credits and lyrics.
  cachedSongDetails = getAllPlayerSongs().map((s) => ({
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
  /** The track id (lib/music/trackId.ts): the YouTube video id, or msr:<cid> for a song that
   *  plays from Monster Siren. Named videoId since releases carry it by that name. */
  videoId: string;
  title: string;
  albumId?: string;
  albumName: string;
  coverPath: string | null;
  credits: RawCredit[];
  lyricTrackId?: string;
  hasLyrics: boolean;
}

let cachedModalLookup: SongModalLookupEntry[] | null = null;
export function getAllSongModalLookup(): SongModalLookupEntry[] {
  if (cachedModalLookup) return cachedModalLookup;
  cachedModalLookup = getAllSongDetails().map((s) => ({
    videoId: s.trackId,
    title: s.title,
    albumId: s.albumId,
    albumName: s.albumName,
    coverPath: s.coverPath,
    credits: s.credits,
    ...(s.lyricTrackId ? { lyricTrackId: s.lyricTrackId } : {}),
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
      const outPath = path.join(process.cwd(), 'public', lyricsPath(s.trackId));
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
  /** Present only for an Endfield song: the page hides it while Endfield music is off. */
  game?: 'endfield';
  title: string;
  altTitle: string | null;
  albumTrack?: number;
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
  game?: 'endfield';
  coverPath: string | null;
  releaseDate: string;
  /** False while none of its songs has a YouTube videoId. Kept for releases that carry it; the
   *  page no longer marks such an album, since its songs play from Monster Siren. */
  playable: boolean;
}

/** An album as Browse by album lists it: every album with a song the player can play. */
export interface DiscoverBrowseAlbum {
  albumId: string;
  game?: 'endfield';
  /** Its own name, often Chinese. */
  albumName: string;
  /** Its English name, or its own where it has none: what the tile shows. */
  albumAltName: string;
  coverPath: string | null;
  /** YYYY/MM/DD, or '' when unknown (such an album is listed after every dated one). */
  releaseDate: string;
  /** The songs its tile opens: those on YouTube and those only Monster Siren has. */
  songCount: number;
}

/** A song Monster Siren published that has no YouTube videoId yet, so the player cannot queue
 * it; Discover lists it with a link to the song on Monster Siren instead. */
export interface DiscoverPendingSong {
  songId: string;
  title: string;
  altTitle: string | null;
  albumTrack?: number;
  albumId: string;
  albumName: string;
  coverPath: string | null;
  characters: string[];
  origin: string[];
  artist: string | null;
}

export interface DiscoverPageData {
  songs: DiscoverSong[];
  characters: DiscoverCharacter[]; // sorted by mostRecentDate desc, NOT by count -- see DiscoverCharacter's own comment
  origins: DiscoverFacet[]; // sorted by count desc -- the story event an album is tied to. NO "unspecified" bucket like genre's Ungenred: most operator EPs simply aren't tied to any event at all, so a catch-all bucket here would just be "most of the catalog" and add no discovery value. Songs with no origin are omitted from this facet entirely, same as characters already does.
  artists: DiscoverFacet[]; // one entry per artist (lib/music/artistCredits.ts), most songs first, then by name
  recentAlbums: DiscoverAlbum[]; // sorted by releaseDate desc, capped
  /** Every album, newest first, undated last: Browse by album. */
  albums: DiscoverBrowseAlbum[];
  pendingSongs: DiscoverPendingSong[];
}


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

/**
 * Every album newest first by the day it names, the undated ones after them in the catalogue's
 * order. Unlike newestFirst nothing is left out: Browse by album lists the whole catalogue.
 */
export function newestFirstKeepingUndated<T extends { releaseDate: string }>(albums: readonly T[]): T[] {
  return albums
    .map((album, index) => ({ album, index, day: releaseDay(normalizeReleaseDate(album.releaseDate) ?? '') }))
    .sort((a, b) => (b.day === a.day ? a.index - b.index : b.day > a.day ? 1 : -1))
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
  cachedDiscoverData = discoverPageData(getAllAlbums());
  return cachedDiscoverData;
}

/** getDiscoverPageData for any catalogue: the pure part, which the tests call with fixtures. */
export function discoverPageData(rawAlbums: readonly RawAlbum[]): DiscoverPageData {
  const fullSongs = songsFromAlbums(rawAlbums);
  const positions = new Map(rawAlbums.flatMap(album => (album.songs ?? []).map((song, index) => [album.albumId + '/' + song.songId, index] as const)));
  const songs: DiscoverSong[] = fullSongs.map((s) => ({
    videoId: s.videoId,
    ...endfieldMark(s.game),
    albumTrack: positions.get(s.albumId + '/' + s.songId) ?? 0,
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
  const allOriginNames = fullSongs.flatMap((s) => s.origin);

  const albums = albumSummaries(rawAlbums);
  const pendingSongs: DiscoverPendingSong[] = rawAlbums.flatMap((album) => (album.songs || [])
    .filter((song) => !song.videoId)
    .map((song) => ({
      songId: song.songId,
      albumTrack: positions.get(album.albumId + '/' + song.songId) ?? 0,
      title: song.songName,
      altTitle: song.songAltName || null,
      albumId: album.albumId,
      albumName: album.albumAltName || album.albumName,
      coverPath: albumCoverPath(album),
      characters: album.characters || [],
      origin: album.origin || [],
      artist: song.credits?.find(credit => credit.role === 'artist')?.names.join(', ') ?? null,
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

  // The newest of each game, newest first: the page shows the first RECENT_ALBUMS_LIMIT of
  // those the reader's settings let in, so a reader without Endfield music still sees a full row.
  const perGame = new Map<string, number>();
  const recentAlbums: DiscoverAlbum[] = newestFirst(albums)
    .filter((a) => {
      const seen = perGame.get(a.game ?? 'arknights') ?? 0;
      perGame.set(a.game ?? 'arknights', seen + 1);
      return seen < RECENT_ALBUMS_LIMIT;
    })
    .map((a) => ({
      albumId: a.albumId,
      albumName: a.albumName,
      albumAltName: a.albumAltName,
      ...endfieldMark(a.game),
      coverPath: a.coverPath,
      releaseDate: a.releaseDate,
      playable: a.songCount > 0,
    }));

  // Every album with a song to play; albumSummaries leaves out an album with none, and a song
  // with no YouTube upload plays from Monster Siren, so no album is listed that opens on nothing.
  const browseAlbums: DiscoverBrowseAlbum[] = newestFirstKeepingUndated(albums).map((a) => ({
    albumId: a.albumId,
    ...endfieldMark(a.game),
    albumName: a.albumName,
    albumAltName: a.albumAltName,
    coverPath: a.coverPath,
    releaseDate: a.releaseDate,
    songCount: a.songCount + a.pendingCount,
  }));

  return {
    songs,
    characters,
    origins: countBy(allOriginNames),
    artists: artistFacets(songs),
    recentAlbums,
    albums: browseAlbums,
    pendingSongs,
  };
}

/**
 * Browse by album's list from what a release compiled before it existed does carry: one entry
 * per album its songs name, in the order they name them, with the counts its tile opens on. The
 * dates come from Recently added, the only albums such a release dates, so those lead (newest
 * first) and the rest follow newest first by the catalogue's order, which adds each album after
 * the ones before it. The next release this code compiles carries the real list.
 */
export function browseAlbumsFromSongs(
  songs: readonly Pick<DiscoverSong, 'albumId' | 'albumName' | 'coverPath'>[],
  recentAlbums: readonly Pick<DiscoverAlbum, 'albumId' | 'albumName' | 'albumAltName' | 'releaseDate'>[],
): DiscoverBrowseAlbum[] {
  const recent = new Map(recentAlbums.map((a) => [a.albumId, a]));
  const byId = new Map<string, DiscoverBrowseAlbum>();
  for (const song of songs) {
    const known = byId.get(song.albumId);
    if (known) { known.songCount += 1; continue; }
    const dated = recent.get(song.albumId);
    byId.set(song.albumId, {
      albumId: song.albumId,
      albumName: dated?.albumName ?? song.albumName,
      albumAltName: dated?.albumAltName ?? song.albumName,
      coverPath: song.coverPath,
      releaseDate: dated?.releaseDate ?? '',
      songCount: 1,
    });
  }
  const all = Array.from(byId.values());
  const leading = newestFirst(all.filter((a) => a.releaseDate));
  return [...leading, ...all.filter((a) => !leading.includes(a)).reverse()];
}

/** The Discover page's props, as a release this code compiled carries them or as an older
 * one does. */
type DiscoverReleaseProps = Omit<DiscoverPageData, 'pendingSongs' | 'recentAlbums' | 'albums'> & {
  pendingSongs?: DiscoverPendingSong[];
  albums?: DiscoverBrowseAlbum[];
  recentAlbums: (Omit<DiscoverAlbum, 'playable'> & { playable?: boolean })[];
};

/**
 * Discover's props with `pendingSongs`, each recent album's `playable` and Browse by album's
 * `albums`, whichever release they came from.
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
export function discoverFromRelease<P extends DiscoverReleaseProps>(props: P): P & Pick<DiscoverPageData, 'pendingSongs' | 'recentAlbums' | 'albums'> {
  const complete = Array.isArray(props.pendingSongs) && Array.isArray(props.albums) && props.recentAlbums.every((a) => typeof a.playable === 'boolean');
  if (complete) return props as P & Pick<DiscoverPageData, 'pendingSongs' | 'recentAlbums' | 'albums'>;
  const onYouTube = new Set(props.songs.map((s) => s.albumId));
  const pendingSongs = Array.isArray(props.pendingSongs) ? props.pendingSongs : [];
  return {
    ...props,
    pendingSongs,
    recentAlbums: props.recentAlbums.map((a) => (typeof a.playable === 'boolean' ? a as DiscoverAlbum : { ...a, playable: onYouTube.has(a.albumId) })),
    // Browse by album (2026-10-14): a release compiled before it has no list of albums.
    albums: Array.isArray(props.albums) ? props.albums : browseAlbumsFromSongs([...props.songs, ...pendingSongs], props.recentAlbums),
  };
}

/**
 * What the page draws from a release's props, by this code's rules rather than the rules of the
 * code that compiled the release: the artists split, folded and counted (artistFacets), and a
 * portrait for every character the release left without one (characterPortraits.mjs). A release
 * compiled before either rule listed combined credits and drew an empty square for the Doctor;
 * this way the deploy alone fixes both, with no new release.
 */
export function discoverForDisplay<P extends Pick<DiscoverPageData, 'songs' | 'characters' | 'artists'>>(props: P): P {
  return {
    ...props,
    artists: artistFacets(props.songs),
    characters: props.characters.map((c) => (c.artPath ? c : { ...c, artPath: characterPortrait(c.name, servedAssetExists) })),
  };
}
