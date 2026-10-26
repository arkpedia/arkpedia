import { foldForSearch, lookalikeForSearch, normalizeForSearch, withinEdits } from './searchNormalize';

/*
 * The site-wide search: the nav's search box and /search?s=<query>.
 *
 * One flat list of destinations -- operators, events, stage content, stages, enemies,
 * music and the nav's own pages -- written at content export by
 * scripts/build/build-site-search.ts as /site-search.json and published in the content
 * release beside operator-search.json, so a new operator or event is findable the night
 * its release lands, with no redeploy. The row carries a title, an href and the other
 * names the destination answers to, and nothing that changes with the clock.
 *
 * The community's YouTube and Twitch are the same search, in two halves. The curated
 * channels (lib/music/youtubeConfig.ts) are stable, so they ride in the index. Their latest
 * videos and who is live on Twitch are not: they are the feeds the community pages already
 * fetch, served by /api/search-feeds under the pages' own 25-minute cache and loaded once
 * when the search opens (useSiteSearch), never per keystroke. Baked into the index, a video
 * list would change every export and publish a new release for a code change that alters
 * no page, and a live stream would still read as live days after it ended.
 */

export const SITE_SEARCH_KINDS = [
  'page', 'operator', 'event', 'content', 'stage', 'enemy', 'album', 'song',
  // People after the game's own rows: a thousand voice actors must not push an enemy or a
  // stage at the same tier out of the pop-up's ten rows.
  'artist', 'voice-actor',
  'creator', 'video', 'streamer', 'stream',
] as const;
export type SiteSearchKind = typeof SITE_SEARCH_KINDS[number];

/** What a row is called in the results, in the order a tie is broken by. */
export const SITE_SEARCH_KIND_LABEL: Record<SiteSearchKind, string> = {
  page: 'Page',
  operator: 'Operator',
  artist: 'Artist',
  'voice-actor': 'Voice actor',
  event: 'Event',
  content: 'Stages',
  stage: 'Stage',
  enemy: 'Enemy',
  album: 'Album',
  song: 'Song',
  creator: 'YouTube',
  video: 'YouTube',
  streamer: 'Twitch',
  stream: 'Twitch',
};

/** The rows that leave the site: YouTube and Twitch. They open in a new tab, rank under
 *  every row of the site's own (compare), and /search never jumps to one. */
const OFF_SITE = new Set<SiteSearchKind>(['creator', 'video', 'streamer', 'stream']);
export const siteSearchOffSite = (entry: SiteSearchEntry): boolean => OFF_SITE.has(entry.kind);

export interface SiteSearchEntry {
  kind: SiteSearchKind;
  /** What the row reads, and the name an exact match is judged on. */
  title: string;
  href: string;
  /** A second line: a stage's name and episode, an enemy's handbook number, how many
   *  operators a person is credited on. */
  sub?: string;
  /** The other names the destination answers to: an operator's alter, a song's
   *  original title, a stage's name beside its code, a person's name in Latin letters. */
  terms?: string[];
  /** Operators: what getOperatorIconPath draws the portrait from. */
  rarity?: number | null;
  portraitPending?: true;
  /** Enemies: the handbook icon, when it is not the usual file (enemyIconFor). Videos and
   *  streams: the thumbnail the community page's card draws. */
  icon?: string;
  /** Enemies: the handbook has no icon for this one. */
  iconless?: true;
}

export interface SiteSearchIndex {
  entries: SiteSearchEntry[];
}

/** The handbook's usual icon file for an enemy, the one build-enemies-index writes for
 *  nearly every record; a row carries `icon` only when its record names another. */
export function enemyIconFor(name: string): string {
  return `/enemies-icons/${name}.webp`;
}

/** The row's art: an operator portrait is drawn by the caller (getOperatorIconPath), so
 *  this answers for enemies, and for the videos and streams whose feed names a thumbnail. */
export function siteSearchIcon(entry: SiteSearchEntry): string | null {
  if (entry.kind === 'video' || entry.kind === 'stream') return entry.icon ?? null;
  if (entry.kind !== 'enemy' || entry.iconless) return null;
  return entry.icon ?? enemyIconFor(entry.title);
}

/** The row's first line: a stage reads its code and then its name ("1-7 The Dawn Will Come"). */
export function siteSearchLabel(entry: SiteSearchEntry): string {
  return entry.kind === 'stage' && entry.terms?.[0] ? `${entry.title} ${entry.terms[0]}` : entry.title;
}

export const SITE_SEARCH_PATH = '/site-search.json';

type FetchSiteSearch = (input: string, init?: RequestInit) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;

async function fetchSiteSearch(url: string, signal: AbortSignal | undefined, fetcher: FetchSiteSearch): Promise<SiteSearchEntry[]> {
  const response = await fetcher(url, { signal });
  if (!response.ok) throw new Error(`Site search data returned ${response.status}`);
  const data = await response.json() as { entries?: unknown };
  if (!Array.isArray(data.entries)) throw new Error('Site search data is invalid');
  return (data.entries as SiteSearchEntry[]).map(entry => ({ ...entry, href: entry.href.replace(/^\/free-op(?=$|[?#])/, '/reward-tracker') }));
}

/**
 * The active content release's index, or the deployment's own copy when the release
 * does not have one yet (a release from before this file existed) or fails to load.
 * Same fail-safe as loadOperatorSearch: a half-published release must not take the
 * search box down with it.
 */
export async function loadSiteSearch(
  releaseUrl: string,
  signal?: AbortSignal,
  fetcher: FetchSiteSearch = fetch,
): Promise<SiteSearchEntry[]> {
  try {
    return await fetchSiteSearch(releaseUrl, signal, fetcher);
  } catch (error) {
    if (signal?.aborted || releaseUrl === SITE_SEARCH_PATH) throw error;
    return fetchSiteSearch(SITE_SEARCH_PATH, signal, fetcher);
  }
}

/** The deployment's own route, not the release's: the feeds are fetched live, never exported. */
export const SITE_SEARCH_FEEDS_PATH = '/api/search-feeds';

/** The YouTube videos and live Twitch streams (pages/api/search-feeds.ts). */
export async function loadSiteSearchFeeds(signal?: AbortSignal, fetcher: FetchSiteSearch = fetch): Promise<SiteSearchEntry[]> {
  return fetchSiteSearch(SITE_SEARCH_FEEDS_PATH, signal, fetcher);
}

/** Lower is better. Exact name, start of the name, start of a word in it, anywhere in it,
 *  then every word of the query somewhere in it ("kal esperanta"). */
const EXACT = 0;
const PREFIX = 1;
const WORD = 2;
const INSIDE = 3;
const WORDS = 4;
/* Then the loose tiers, for a name the reader cannot spell from the page: odd punctuation,
   width or spacing ("m9 nokuro", "Ｍ９ＮＯＫＵＲＯ", "mao" for M・A・O), a digit read as the
   letter it looks like ("mgnokuro"), or one typo ("minokuro"). They are tried only on a row
   no tier above matched, and rank under every one of them, so a query that found something
   before finds the same rows in the same order, with these after; none is exact, so none
   is a /search jump. */
const FOLDED = 5;
const LOOKALIKE = 6;
const TYPO = 7;

/* normalizeForSearch drops hyphens, which is right for names ("Ho'olheyak" and "hoolheyak")
   and wrong for stage codes: "1-7" became "17" and found 6-17 and 11-7 beside 1-7. A
   query that is code-like -- a digit and a hyphen -- keeps its hyphens, on both sides. */
const KEEP_HYPHENS = (query: string) => /\d/.test(query) && query.includes('-');
const normalize = (text: string, keepHyphens: boolean) => (keepHyphens
  ? normalizeForSearch(text.replace(/-/g, '~')).replace(/~/g, '-')
  : normalizeForSearch(text));

/* Each row's names, normalized once rather than on every keystroke: the index is the same
   array for the whole visit (useSiteSearch). One cache per hyphen rule. */
const normalizedNames = [new WeakMap<SiteSearchEntry, (string | null)[]>(), new WeakMap<SiteSearchEntry, (string | null)[]>()];
function normalizedNamesOf(entry: SiteSearchEntry, keepHyphens: boolean): (string | null)[] {
  const cache = normalizedNames[Number(keepHyphens)];
  let names = cache.get(entry);
  if (!names) {
    // The builder refuses a nameless row; this is the box staying up if a release has one anyway.
    names = [entry.title, ...(entry.terms ?? [])].map((name) => (typeof name === 'string' ? normalize(name, keepHyphens) : null));
    cache.set(entry, names);
  }
  return names;
}

function termScore(t: string | null, query: string, words: string[]): number | null {
  if (t === null) return null;
  if (t === query) return EXACT;
  if (t.startsWith(query)) return PREFIX;
  if (` ${t}`.includes(` ${query}`)) return WORD;
  if (t.includes(query)) return INSIDE;
  if (words.length > 1 && words.every((w) => t.includes(w))) return WORDS;
  return null;
}

export interface SiteSearchResult {
  entry: SiteSearchEntry;
  /** The tier it ranks in (EXACT..TYPO): the title's tier, or one below another name's. */
  score: number;
  /** Whether that tier was reached on the title rather than on another name. */
  onTitle: boolean;
  /** Whether some name of it, title or other, is exactly the query. */
  exact: boolean;
}

const KIND_RANK = Object.fromEntries(SITE_SEARCH_KINDS.map((kind, i) => [kind, i])) as Record<SiteSearchKind, number>;

/** The folded forms the loose tiers compare: the whole name and each of its words. */
interface Folded { whole: string; look: string; words: string[] }
const foldedNames = new WeakMap<SiteSearchEntry, (Folded | null)[]>();

function foldName(name: string): Folded {
  const whole = foldForSearch(name);
  // Only words long enough to take a typo (looseScore).
  const words = normalizeForSearch(name.normalize('NFKC')).split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 5 && word !== whole).map(lookalikeForSearch);
  return { whole, look: lookalikeForSearch(whole), words };
}

function folded(entry: SiteSearchEntry): (Folded | null)[] {
  let names = foldedNames.get(entry);
  if (!names) {
    names = [entry.title, ...(entry.terms ?? [])].map((name) => (typeof name === 'string' ? foldName(name) : null));
    foldedNames.set(entry, names);
  }
  return names;
}

/** What the loose tiers compare a query as, worked out once per search. */
interface LooseQuery { folded: string; lookalike: string; typos: number }

function looseQuery(query: string): LooseQuery | null {
  const f = foldForSearch(query);
  if (!f) return null;
  // One typo from five characters, two from nine: shorter, and a typo is another word.
  return { folded: f, lookalike: lookalikeForSearch(f), typos: f.length >= 9 ? 2 : f.length >= 5 ? 1 : 0 };
}

function looseScore(name: Folded, q: LooseQuery): number | null {
  const { whole, look } = name;
  if (!whole) return null;
  if (whole === q.folded || (q.folded.length >= 3 && whole.startsWith(q.folded))) return FOLDED;
  if (look === q.lookalike || (q.lookalike.length >= 3 && look.startsWith(q.lookalike))) return LOOKALIKE;
  if (!q.typos) return null;
  if (withinEdits(look, q.lookalike, q.typos)) return TYPO;
  // A word of the name: "hanazwa" for Kana Hanazawa. Only words of five letters or more,
  // as for the query, so a short word is never a typo's match.
  for (const word of name.words) if (withinEdits(word, q.lookalike, q.typos)) return TYPO;
  return null;
}

/* A video's or a stream's title is a sentence, not a name: a typo of one of its words is
   noise, so the loose tiers leave them out. */
const LOOSE_KINDS = (kind: SiteSearchKind) => kind !== 'video' && kind !== 'stream';

/* Another name ranks one tier under the same match on a title: a song whose English title
   is "Amiya" sits under Amiya (Guard), whose title only starts with it. */
function scoreEntry(entry: SiteSearchEntry, query: string, words: string[], keepHyphens: boolean, loose: LooseQuery | null): SiteSearchResult | null {
  const [title, ...terms] = normalizedNamesOf(entry, keepHyphens);
  let onTitle = termScore(title, query, words);
  let onTerm: number | null = null;
  for (const term of terms) {
    const s = termScore(term, query, words);
    if (s !== null && (onTerm === null || s < onTerm)) onTerm = s;
  }
  if (onTitle === null && onTerm === null && loose && LOOSE_KINDS(entry.kind)) {
    const [foldedTitle, ...foldedTerms] = folded(entry);
    onTitle = foldedTitle ? looseScore(foldedTitle, loose) : null;
    for (const term of foldedTerms) {
      const s = term ? looseScore(term, loose) : null;
      if (s !== null && (onTerm === null || s < onTerm)) onTerm = s;
    }
  }
  if (onTitle === null && onTerm === null) return null;
  const termTier = onTerm === null ? Infinity : onTerm + 1;
  const titleTier = onTitle ?? Infinity;
  return { entry, score: Math.min(titleTier, termTier), onTitle: titleTier <= termTier, exact: onTitle === EXACT || onTerm === EXACT };
}

/* The site's own rows first, at any tier: a video titled "Amiya guide" starts with "amiya"
   as much as Amiya (Guard) does, and a long feed of titles must not push the game out of
   the pop-up's ten rows. YouTube and Twitch follow, ranked the same way among themselves. */
function compare(a: SiteSearchResult, b: SiteSearchResult): number {
  return Number(siteSearchOffSite(a.entry)) - Number(siteSearchOffSite(b.entry))
    || a.score - b.score
    || Number(b.onTitle) - Number(a.onTitle)
    || KIND_RANK[a.entry.kind] - KIND_RANK[b.entry.kind]
    || a.entry.title.length - b.entry.title.length
    || a.entry.title.localeCompare(b.entry.title);
}

/** Every matching row, best first. */
export function searchSite(entries: readonly SiteSearchEntry[], query: string): SiteSearchResult[] {
  const keepHyphens = KEEP_HYPHENS(query);
  const q = normalize(query.trim(), keepHyphens).replace(/\s+/g, ' ');
  if (!q) return [];
  const words = q.split(' ').filter(Boolean);
  // A stage code is matched as written: "1-7" folded is "17", the code of no stage asked for.
  const loose = keepHyphens ? null : looseQuery(query);
  const results: SiteSearchResult[] = [];
  for (const entry of entries) {
    const result = scoreEntry(entry, q, words, keepHyphens, loose);
    if (result) results.push(result);
  }
  return results.sort(compare);
}

/**
 * Where /search?s=<query> should go without showing a list, or null to show one.
 *
 * Only an exact name, and only when it is the one best answer: "Amiya" opens Amiya
 * (her alters answer to "Amiya" too, but on another name, so they rank under her), "W"
 * opens W. Two rows tied on everything that ranks them -- two stages coded "1-7" in
 * different modes -- are a question the reader has to answer, so they get the list. A
 * prefix never jumps: "ama" is not a request for Amiya. Nor does a YouTube or Twitch row:
 * Enter is not a request to leave the site, so a channel's name gets the list.
 */
export function siteSearchJump(results: readonly SiteSearchResult[]): SiteSearchEntry | null {
  const [first, second] = results;
  if (!first?.exact || siteSearchOffSite(first.entry)) return null;
  if (second?.exact && second.score === first.score && second.onTitle === first.onTitle && second.entry.kind === first.entry.kind) return null;
  return first.entry;
}

/** The query URL for a search, the shape the OpenSearch description advertises. */
export function siteSearchHref(query: string): string {
  return `/search?s=${encodeURIComponent(query.trim())}`;
}
