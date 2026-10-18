import { normalizeForSearch } from './searchNormalize';

/*
 * The site-wide search: the nav's search box and /search?s=<query>.
 *
 * One flat list of destinations -- operators, events, stage content, stages, enemies,
 * music and the nav's own pages -- written at content export by
 * scripts/build/build-site-search.ts as /site-search.json and published in the content
 * release beside operator-search.json, so a new operator or event is findable the night
 * its release lands, with no redeploy. The row carries a title, an href and the other
 * names the destination answers to, and nothing that changes with the clock.
 */

export const SITE_SEARCH_KINDS = ['page', 'operator', 'event', 'content', 'stage', 'enemy', 'album', 'song'] as const;
export type SiteSearchKind = typeof SITE_SEARCH_KINDS[number];

/** What a row is called in the results, in the order a tie is broken by. */
export const SITE_SEARCH_KIND_LABEL: Record<SiteSearchKind, string> = {
  page: 'Page',
  operator: 'Operator',
  event: 'Event',
  content: 'Stages',
  stage: 'Stage',
  enemy: 'Enemy',
  album: 'Album',
  song: 'Song',
};

export interface SiteSearchEntry {
  kind: SiteSearchKind;
  /** What the row reads, and the name an exact match is judged on. */
  title: string;
  href: string;
  /** A second line: a stage's name and episode, an enemy's handbook number. */
  sub?: string;
  /** The other names the destination answers to: an operator's alter, a song's
   *  original title, a stage's name beside its code. */
  terms?: string[];
  /** Operators: what getOperatorIconPath draws the portrait from. */
  rarity?: number | null;
  portraitPending?: true;
  /** Enemies: the handbook icon, when it is not the usual file (enemyIconFor). */
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
 *  this answers for enemies only. */
export function siteSearchIcon(entry: SiteSearchEntry): string | null {
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
  return data.entries as SiteSearchEntry[];
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

/** Lower is better. Exact name, start of the name, start of a word in it, anywhere in it,
 *  then every word of the query somewhere in it ("kal esperanta"). */
const EXACT = 0;
const PREFIX = 1;
const WORD = 2;
const INSIDE = 3;
const WORDS = 4;

/* normalizeForSearch drops hyphens, which is right for names ("Ho'olheyak" and "hoolheyak")
   and wrong for stage codes: "1-7" became "17" and found 6-17 and 11-7 beside 1-7. A
   query that is code-like -- a digit and a hyphen -- keeps its hyphens, on both sides. */
const KEEP_HYPHENS = (query: string) => /\d/.test(query) && query.includes('-');
const normalize = (text: string, keepHyphens: boolean) => (keepHyphens
  ? normalizeForSearch(text.replace(/-/g, '~')).replace(/~/g, '-')
  : normalizeForSearch(text));

function termScore(term: string, query: string, words: string[], keepHyphens: boolean): number | null {
  // The builder refuses a nameless row; this is the box staying up if a release has one anyway.
  if (typeof term !== 'string') return null;
  const t = normalize(term, keepHyphens);
  if (t === query) return EXACT;
  if (t.startsWith(query)) return PREFIX;
  if (` ${t}`.includes(` ${query}`)) return WORD;
  if (t.includes(query)) return INSIDE;
  if (words.length > 1 && words.every((w) => t.includes(w))) return WORDS;
  return null;
}

export interface SiteSearchResult {
  entry: SiteSearchEntry;
  /** The tier it ranks in (EXACT..WORDS): the title's tier, or one below another name's. */
  score: number;
  /** Whether that tier was reached on the title rather than on another name. */
  onTitle: boolean;
  /** Whether some name of it, title or other, is exactly the query. */
  exact: boolean;
}

const KIND_RANK = Object.fromEntries(SITE_SEARCH_KINDS.map((kind, i) => [kind, i])) as Record<SiteSearchKind, number>;

/* Another name ranks one tier under the same match on a title: a song whose English title
   is "Amiya" sits under Amiya (Guard), whose title only starts with it. */
function scoreEntry(entry: SiteSearchEntry, query: string, words: string[], keepHyphens: boolean): SiteSearchResult | null {
  const onTitle = termScore(entry.title, query, words, keepHyphens);
  let onTerm: number | null = null;
  for (const term of entry.terms ?? []) {
    const s = termScore(term, query, words, keepHyphens);
    if (s !== null && (onTerm === null || s < onTerm)) onTerm = s;
  }
  if (onTitle === null && onTerm === null) return null;
  const termTier = onTerm === null ? Infinity : onTerm + 1;
  const titleTier = onTitle ?? Infinity;
  return { entry, score: Math.min(titleTier, termTier), onTitle: titleTier <= termTier, exact: onTitle === EXACT || onTerm === EXACT };
}

function compare(a: SiteSearchResult, b: SiteSearchResult): number {
  return a.score - b.score
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
  const results: SiteSearchResult[] = [];
  for (const entry of entries) {
    const result = scoreEntry(entry, q, words, keepHyphens);
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
 * prefix never jumps: "ama" is not a request for Amiya.
 */
export function siteSearchJump(results: readonly SiteSearchResult[]): SiteSearchEntry | null {
  const [first, second] = results;
  if (!first?.exact) return null;
  if (second?.exact && second.score === first.score && second.onTitle === first.onTitle && second.entry.kind === first.entry.kind) return null;
  return first.entry;
}

/** The query URL for a search, the shape the OpenSearch description advertises. */
export function siteSearchHref(query: string): string {
  return `/search?s=${encodeURIComponent(query.trim())}`;
}
