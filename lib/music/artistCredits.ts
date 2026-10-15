/**
 * One artist per entry, from Monster Siren's artist credits. Client-safe: Discover's artist list
 * (lib/music/albumsDataServer.ts) and its artist filter (pages/music/discover.tsx) both read
 * credits through here, so a song lists under every artist it credits and a click on an artist
 * finds the same songs the count promised.
 *
 * A song's `artist` is its credit's names joined with ", " (albumsData.ts getCreditRole), and
 * a single name can itself be several people: "Lawrence Ku and Damien Banzigou", "BLACK 0 /
 * SKa2or", "星冪Elroy, 一罐鹽, and +Bliss+". Listing those strings as they stood made the
 * Featured artists list a wall of combinations, two spellings of one person side by side and
 * the record label listed as an artist (maintainer, 2026-10-14).
 */

/** Names that contain a separator but are one act. Matched whole, ignoring case. */
const ONE_ACT = ['MYTH & ROID'];

/**
 * Two credits that are one artist, by fold key (artistKey) -> how the list names them. Spellings
 * that differ only in case, spaces or punctuation ("BaoUner" / "Bao.Uner", "BLACK 0" / "Black 0")
 * need no row: artistKey already folds them. The romanised and Japanese names here are the same
 * person by the standard reading of the name; no other CJK name is merged.
 */
export const ARTIST_ALIASES: Readonly<Record<string, string>> = {
  // Monster Siren credits both spellings, twice each.
  hendricbuenck: 'Hendrick Buenck',
  // The middle name is in one credit only.
  jonathangabrielzuniga: 'Jonathan Zuniga',
  // AJURIKA is Akitaka Toyama's alias, and that credit says so.
  'ajurika(akitakatoyama)': 'Akitaka Toyama',
  原田萌喜: 'Moeki Harada',
  柳川和樹: 'Kazuki Yanagawa',
  // The most frequent spelling, so the list does not name the busiest artist by the minor one.
  baouner: 'BaoUner',
};

/** Credits that name no artist: the placeholder, and the label itself in both languages. */
const NOT_ARTISTS = new Set(['uncredited', 'monstersirenrecords', '塞壬唱片msr']);

/** A version note after a name, "(Acoustic Ver.)": about the recording, not the artist. */
const VERSION_NOTE = /\s*\([^()]*\b(?:ver|version|remix|mix|edit|instrumental|acoustic|live|cover)\b\.?[^()]*\)/gi;
/** Between two artists: a comma (with an optional Oxford "and"), " and ", "&", "、", " / ". */
const SEPARATOR = /\s*,\s*(?:and\s+)?|\s+and\s+|\s*&\s*|\s*、\s*|\s*\/\s*/i;

/** The same artist, however the credit spells it: width, case, spaces and punctuation folded. */
export function artistKey(name: string): string {
  return name.normalize('NFKC').toLocaleLowerCase('en').replace(/[\s.\-_·•'’]/g, '');
}

function canonical(name: string): string {
  return ARTIST_ALIASES[artistKey(name)] ?? name;
}

/**
 * The artists one credit names, each once, as the list names them: separators split it,
 * version notes and the label drop out, aliases fold together. `null` and "Uncredited" are no
 * artist at all. "x"/"×" are not separators: no credit uses one, and a bare x is a letter of
 * too many names.
 */
export function creditedArtists(credit: string | null | undefined): string[] {
  if (!credit) return [];
  let text = credit.normalize('NFKC').replace(/\s+/g, ' ').trim().replace(VERSION_NOTE, '');
  const kept: string[] = [];
  for (const act of ONE_ACT) {
    const at = text.toLocaleLowerCase('en').indexOf(act.toLocaleLowerCase('en'));
    if (at < 0) continue;
    kept.push(act);
    text = `${text.slice(0, at)}, ${text.slice(at + act.length)}`;
  }
  const names = [...kept, ...text.split(SEPARATOR)]
    .map((part) => part.replace(/^and\s+/i, '').trim())
    .filter((part) => part && !NOT_ARTISTS.has(artistKey(part)))
    .map(canonical);
  const seen = new Set<string>();
  return names.filter((name) => {
    const key = artistKey(name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Does this credit name this artist (a name from artistFacets, or a whole old credit)? */
export function creditsArtist(credit: string | null | undefined, artist: string): boolean {
  if (!credit) return false;
  if (credit === artist) return true;
  const key = artistKey(canonical(artist));
  return creditedArtists(credit).some((name) => artistKey(name) === key);
}

export interface ArtistFacet {
  name: string;
  count: number;
}

/**
 * Every artist the songs credit with how many songs credit them, most first, then by name. A song
 * counts once for each of its artists. Spellings folded together go by the alias table's name,
 * else the one most songs use.
 */
export function artistFacets(songs: readonly { artist: string | null }[]): ArtistFacet[] {
  const groups = new Map<string, { count: number; spellings: Map<string, number> }>();
  for (const song of songs) {
    for (const name of creditedArtists(song.artist)) {
      const key = artistKey(name);
      const group = groups.get(key) ?? { count: 0, spellings: new Map<string, number>() };
      group.count += 1;
      group.spellings.set(name, (group.spellings.get(name) ?? 0) + 1);
      groups.set(key, group);
    }
  }
  const byName = (a: string, b: string) => a.localeCompare(b, 'en', { sensitivity: 'base' }) || (a < b ? -1 : a > b ? 1 : 0);
  return [...groups.entries()]
    .map(([key, group]) => ({
      name: ARTIST_ALIASES[key] ?? [...group.spellings.entries()].sort((a, b) => b[1] - a[1] || byName(a[0], b[0]))[0][0],
      count: group.count,
    }))
    .sort((a, b) => b.count - a.count || byName(a.name, b.name));
}
