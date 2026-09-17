import { matchesSearch, normalizeForSearch, searchRelevance } from '../search/searchNormalize';

export interface SearchableOperatorRecord {
  name: string;
  rarity: number | null;
  isFuture: boolean | null;
}

type FetchOperatorSearch = (input: string, init?: RequestInit) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;

async function fetchOperatorSearch(url: string, signal: AbortSignal | undefined, fetcher: FetchOperatorSearch): Promise<SearchableOperatorRecord[]> {
  const response = await fetcher(url, { signal });
  if (!response.ok) throw new Error(`Operator search data returned ${response.status}`);
  const data = await response.json() as { operators?: unknown };
  if (!Array.isArray(data.operators)) throw new Error('Operator search data is invalid');
  return data.operators as SearchableOperatorRecord[];
}

/**
 * Prefer the active content release, but keep the bundled catalogue as a
 * fail-safe. A partially published release must never disable page navigation.
 */
export async function loadOperatorSearch(
  releaseUrl: string,
  signal?: AbortSignal,
  fetcher: FetchOperatorSearch = fetch,
): Promise<SearchableOperatorRecord[]> {
  const bundledUrl = '/operator-search.json';
  try {
    return await fetchOperatorSearch(releaseUrl, signal, fetcher);
  } catch (error) {
    if (signal?.aborted || releaseUrl === bundledUrl) throw error;
    return fetchOperatorSearch(bundledUrl, signal, fetcher);
  }
}

/** Use the roster's matching and ranking rules in the operator-page quick search. */
export function getOperatorSearchResults<T extends { name: string }>(operators: T[], query: string): T[] {
  const search = query.trim();
  if (!normalizeForSearch(search)) return [];
  return operators
    .filter(operator => matchesSearch(operator.name, search))
    .sort((a, b) => searchRelevance(a.name, search) - searchRelevance(b.name, search) || a.name.localeCompare(b.name))
    .slice(0, 8);
}
