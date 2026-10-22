/**
 * Which songs the player offers: one rule for every list that draws from the catalogue -- the
 * queue, shuffle, autoplay, Play all, the Library, Discover and a resumed song -- so a setting
 * hides a song everywhere at once or nowhere (lib/music/musicPlayerContext.tsx).
 *
 * Two settings, each the reader's own (localStorage, per browser):
 * - Stream-safe (musicExcludeCopyrighted) leaves out the few copyrighted songs.
 * - Endfield music (MUSIC_INCLUDE_ENDFIELD_KEY) lets in Arknights: Endfield's songs
 *   (data/endfield-albums.json). Off until the reader turns it on: the player was Arknights'
 *   music alone before Endfield's was added, and stays that for everyone who has not chosen.
 */

/** The game a song is from. A catalogue row with no game is Arknights, as every song was before
 *  Endfield's were added, so a release published before the field reads the same. */
export type MusicGame = 'arknights' | 'endfield';

export const MUSIC_INCLUDE_ENDFIELD_KEY = 'musicIncludeEndfield';

/** The names an Endfield song or album answers to in a search, besides its own: "endfield" and
 *  "arknights endfield" find the game's music in the site search (lib/search/siteSearchIndex.ts)
 *  and in the music pages' own search boxes (gameSearchNames). */
export const ENDFIELD_SEARCH_NAMES: readonly string[] = ['Endfield', 'Arknights: Endfield'];

/** A song's extra search names for its game, for createSongIndex's `extra` (lib/music/songSearch.ts),
 *  which ranks them under its title, album and artist. Arknights' own songs have none. */
export function gameSearchNames(game: string | undefined): readonly string[] {
  return game === 'endfield' ? ENDFIELD_SEARCH_NAMES : [];
}
export const MUSIC_EXCLUDE_COPYRIGHTED_KEY = 'musicExcludeCopyrighted';

export interface SongFilter {
  excludeCopyrighted: boolean;
  includeEndfield: boolean;
}

export const DEFAULT_SONG_FILTER: SongFilter = { excludeCopyrighted: false, includeEndfield: false };

/** What the rule reads of a song: a catalogue row, a Discover song or album. */
export interface FilterableSong {
  copyright?: boolean;
  game?: MusicGame | string;
}

export function songAllowed(filter: SongFilter, song: FilterableSong): boolean {
  if (filter.excludeCopyrighted && song.copyright) return false;
  if (!filter.includeEndfield && song.game === 'endfield') return false;
  return true;
}

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;

/** The reader's settings as stored; a storage that refuses (a private window) reads as the default. */
export function readSongFilter(storage: Storage | null | undefined): SongFilter {
  try {
    return {
      excludeCopyrighted: storage?.getItem(MUSIC_EXCLUDE_COPYRIGHTED_KEY) === 'true',
      includeEndfield: storage?.getItem(MUSIC_INCLUDE_ENDFIELD_KEY) === 'true',
    };
  } catch {
    return DEFAULT_SONG_FILTER;
  }
}

export function writeSongFilter(storage: Storage | null | undefined, filter: SongFilter): void {
  try {
    storage?.setItem(MUSIC_EXCLUDE_COPYRIGHTED_KEY, String(filter.excludeCopyrighted));
    storage?.setItem(MUSIC_INCLUDE_ENDFIELD_KEY, String(filter.includeEndfield));
  } catch { /* refused: the setting lasts this visit */ }
}

export interface FilteredQueue<T extends { id: string }> {
  queue: T[];
  /** Where the song that was current is now; 0 when it left the queue. */
  queueIndex: number;
  /** The shuffle order carried over (null when there was none to carry). */
  shuffleOrder: number[] | null;
}

/**
 * The queue after a setting changed, keeping what the reader arranged: the songs the new rule
 * leaves out are taken out where they stand, and the songs it lets in that the old rule left
 * out go on the end, in the catalogue's order (a saved playlist's own songs only, when one is
 * playing: `playlistIds`). Nothing already in the queue moves, and the shuffle order keeps its
 * order, the songs let in appended to it.
 */
export function refilterQueue<T extends { id: string }, S extends FilterableSong & { id: string }>({
  queue, queueIndex, shuffleOrder, catalogue, before, after, toTrack, playlistIds,
}: {
  queue: readonly T[];
  queueIndex: number;
  shuffleOrder: readonly number[] | null;
  catalogue: readonly S[];
  before: SongFilter;
  after: SongFilter;
  toTrack: (song: S) => T;
  playlistIds: readonly string[] | null;
}): FilteredQueue<T> {
  const byId = new Map(catalogue.map(song => [song.id, song]));
  const currentId = queue[queueIndex]?.id;
  const oldToNew: number[] = [];
  const kept: T[] = [];
  queue.forEach((track, index) => {
    const song = byId.get(track.id);
    if (song && !songAllowed(after, song)) oldToNew[index] = -1;
    else { oldToNew[index] = kept.length; kept.push(track); }
  });
  const present = new Set(kept.map(track => track.id));
  const added = catalogue
    .filter(song => !present.has(song.id) && songAllowed(after, song) && !songAllowed(before, song)
      && (!playlistIds || playlistIds.includes(song.id)))
    .map(toTrack);
  const next = [...kept, ...added];
  const found = currentId ? next.findIndex(track => track.id === currentId) : -1;
  const order = shuffleOrder
    ? [...shuffleOrder.map(index => oldToNew[index]).filter((index): index is number => index !== undefined && index !== -1),
      ...added.map((_, i) => kept.length + i)]
    : null;
  return { queue: next, queueIndex: found === -1 ? 0 : found, shuffleOrder: order };
}
