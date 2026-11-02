import { gameSearchNames } from './songFilter';
/**
 * One search for every music list (Library, Queue, Autoplay, Discover): a song matches when every
 * word of the query is found in its title, album, artist or extra fields (characters, story), in
 * any order. Case, accents, full-width letters and punctuation are ignored, so "ost1" finds
 * "OST 1" and "ＯＳＴ" finds "OST". A word of four letters or more also matches a word one edit
 * away (two from eight letters), so "synthtech" still finds Synthetech.
 *
 * Results rank exact title > title prefix > title words > album > artist > extras > typo: the
 * Library and Discover sort by it, the Queue only filters (its order is what plays).
 * The fields are normalized once per song (createSongIndex), not on every keystroke.
 */

export interface SearchableSong {
  title: string;
  altTitle?: string | null;
  artist?: string | null;
  album?: string | null;
  albumOriginal?: string | null;
  /** Characters, story events: matched last. */
  extra?: readonly string[];
}

/** Lower case, no accents, full-width folded (NFKC), punctuation and separators as spaces. */
export function normalizeSearch(text: string): string {
  return text.normalize('NFKC').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
    .replace(/[\p{P}\p{S}\s・·]+/gu, ' ').trim();
}

/** Whether a and b are within `max` edits (insert, delete, substitute, swap of neighbours). */
export function withinEdits(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let previous: number[] = [];
  let before: number[] = [];
  let row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    before = previous; previous = row; row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) value = Math.min(value, before[j - 2] + 1);
      row.push(value);
      if (value < best) best = value;
    }
    if (best > max) return false;
  }
  return row[b.length] <= max;
}

const allowedEdits = (word: string) => (word.length >= 8 ? 2 : word.length >= 4 ? 1 : 0);

interface IndexedField { text: string; words: string[] }
interface IndexedSong<T> { song: T; position: number; titles: IndexedField[]; album: IndexedField[]; artist: IndexedField[]; extra: IndexedField[] }

const field = (text: string | null | undefined): IndexedField[] => {
  const normalized = normalizeSearch(text ?? '');
  return normalized ? [{ text: normalized, words: normalized.split(' ') }] : [];
};

/** Weights per field for a query word found inside it; a typo match scores a fifth of that. */
const WEIGHT = { title: 30, album: 12, artist: 8, extra: 4 } as const;

function wordScore(word: string, fields: readonly IndexedField[], weight: number): number {
  if (fields.some(f => f.text.includes(word))) return weight;
  const edits = allowedEdits(word);
  if (edits && fields.some(f => f.words.some(w => withinEdits(word, w, edits) || (w.length > word.length && withinEdits(word, w.slice(0, word.length), edits))))) return weight / 5;
  return 0;
}

export interface SongIndex<T> {
  /** Matching songs, best first (ties keep the list's own order); every song when the query is empty. */
  search(query: string): T[];
  /** Whether one song matches, for lists that keep their own order (the Queue). */
  matches(query: string): (song: T) => boolean;
}

export function createSongIndex<T>(songs: readonly T[], fields: (song: T) => SearchableSong): SongIndex<T> {
  const indexed: IndexedSong<T>[] = songs.map((song, position) => {
    const f = fields(song);
    return {
      song, position,
      titles: [...field(f.altTitle), ...field(f.title)],
      album: [...field(f.album), ...field(f.albumOriginal)],
      artist: field(f.artist),
      extra: (f.extra ?? []).flatMap(field),
    };
  });
  const scoreOf = (entry: IndexedSong<T>, query: string, words: string[]): number => {
    let total = 0;
    for (const word of words) {
      const best = Math.max(wordScore(word, entry.titles, WEIGHT.title), wordScore(word, entry.album, WEIGHT.album),
        wordScore(word, entry.artist, WEIGHT.artist), wordScore(word, entry.extra, WEIGHT.extra));
      if (!best) return 0;
      total += best;
    }
    if (entry.titles.some(t => t.text === query)) total += 1000;
    else if (entry.titles.some(t => t.text.startsWith(query))) total += 500;
    return total;
  };
  const prepare = (raw: string) => { const query = normalizeSearch(raw); return { query, words: query ? query.split(' ') : [] }; };
  return {
    search(raw) {
      const { query, words } = prepare(raw);
      if (!words.length) return indexed.map(entry => entry.song);
      return indexed.map(entry => ({ entry, score: scoreOf(entry, query, words) }))
        .filter(hit => hit.score > 0)
        .sort((a, b) => b.score - a.score || a.entry.position - b.entry.position)
        .map(hit => hit.entry.song);
    },
    matches(raw) {
      const { query, words } = prepare(raw);
      if (!words.length) return () => true;
      const hits = new Set(indexed.filter(entry => scoreOf(entry, query, words) > 0).map(entry => entry.song));
      return song => hits.has(song);
    },
  };
}

/** Album/artist filters retain game aliases, including mixed queries such as “Endfield OST”. */
export function musicFacetMatches(query: string, names: readonly string[], games: readonly (string | undefined)[]): boolean {
  const fields = [...names, ...games.flatMap(gameSearchNames)].map(normalizeSearch);
  return normalizeSearch(query).split(' ').filter(Boolean).every(word => fields.some(value => value.includes(word)));
}
