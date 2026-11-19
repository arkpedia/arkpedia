import { foldForSearch, lookalikeForSearch, normalizeForSearch, withinEdits } from '../search/searchNormalize';

export const OPERATOR_SEARCH_PATH = '/operator-search.json';
export const OPERATOR_NAME_ALIASES_VERSION = 1;

interface OperatorNames {
  name: string;
  aliases?: readonly string[];
}

export interface SearchableOperatorRecord extends OperatorNames {
  sourceRegion?: 'CN' | 'Global';
  rarity: number | null;
  portraitPending?: boolean;
}

type FetchOperatorSearch = (input: string, init?: RequestInit) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;

interface OperatorSearchIndex {
  operators: SearchableOperatorRecord[];
  operatorNameAliasesVersion?: number;
}

async function fetchOperatorSearch(url: string, signal: AbortSignal | undefined, fetcher: FetchOperatorSearch): Promise<OperatorSearchIndex> {
  const response = await fetcher(url, { signal });
  if (!response.ok) throw new Error(`Operator search data returned ${response.status}`);
  const data = await response.json() as OperatorSearchIndex | null;
  if (!data || !Array.isArray(data.operators)) throw new Error('Operator search data is invalid');
  return data;
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
  let index: OperatorSearchIndex;
  try {
    index = await fetchOperatorSearch(releaseUrl, signal, fetcher);
  } catch (error) {
    if (signal?.aborted || releaseUrl === OPERATOR_SEARCH_PATH) throw error;
    return (await fetchOperatorSearch(OPERATOR_SEARCH_PATH, signal, fetcher)).operators;
  }
  if (releaseUrl === OPERATOR_SEARCH_PATH || index.operatorNameAliasesVersion === OPERATOR_NAME_ALIASES_VERSION) return index.operators;

  // During rollout, a published catalogue can predate the alias index. Keep
  // its roster and add the deployment's aliases for the records it knows.
  const bundled = await fetchOperatorSearch(OPERATOR_SEARCH_PATH, signal, fetcher).catch(() => null);
  const aliases = new Map(bundled?.operators.map(op => [op.name, op.aliases]));
  return index.operators.map(op => {
    const current = aliases.get(op.name);
    return current?.length ? { ...op, aliases: [...new Set([...(op.aliases ?? []), ...current])] } : op;
  });
}

export type OperatorAliasLookup = ReadonlyMap<string, readonly string[]>;
const compactName = (normalized: string) => normalized.replace(/[^\p{L}\p{N}]+/gu, '');

/** Work out each operator's rank once per query for both filtering and sorting. */
export function operatorSearchMatcher(query: string, catalogueAliases?: OperatorAliasLookup) {
  const normal = normalizeForSearch(query.trim().normalize('NFKC')).replace(/\s+/g, ' ');
  const folded = compactName(normal);
  const look = lookalikeForSearch(folded);
  const typos = /^[a-z0-9]{5,}$/.test(folded) ? (folded.length >= 9 ? 2 : 1) : 0;
  const scores = new WeakMap<OperatorNames, number>();

  function score(operator: OperatorNames): number {
    if (!folded) return query.trim() ? Infinity : 0;
    const title = normalizeForSearch(operator.name.normalize('NFKC'));
    if (title === normal) return 0;
    if (title.startsWith(normal)) return 1;
    const compactTitle = compactName(title);
    if (compactTitle === folded) return 2;
    const names = [...(operator.aliases ?? []), ...(catalogueAliases?.get(operator.name) ?? [])]
      .map(name => normalizeForSearch(name.normalize('NFKC')));
    if (names.includes(normal)) return 3;
    if (title.includes(normal)) return 4;
    if (names.some(name => name.startsWith(normal))) return 5;
    if (names.some(name => name.includes(normal))) return 6;
    const compactMatches = (compact: string) => {
      const similar = lookalikeForSearch(compact);
      return compact === folded || (folded.length >= 3 && similar.startsWith(look));
    };
    if (compactMatches(compactTitle) || names.some(name => compactMatches(compactName(name)))) return 7;
    const typoMatches = (name: string) => {
      const candidates = [compactName(name), ...name.split(/\s+/g).map(compactName)];
      return candidates.some(candidate => /^[a-z0-9]{5,}$/.test(candidate) && withinEdits(lookalikeForSearch(candidate), look, typos));
    };
    if (typos && typoMatches(title)) return 8;
    if (typos && names.some(typoMatches)) return 9;
    return Infinity;
  }

  return (operator: OperatorNames): number => {
    const existing = scores.get(operator);
    if (existing !== undefined) return existing;
    const rank = score(operator);
    scores.set(operator, rank);
    return rank;
  };
}

/** The same name matching used by the roster and planner. */
export function getOperatorSearchResults<T extends OperatorNames>(operators: T[], query: string): T[] {
  if (!foldForSearch(query)) return [];
  const rank = operatorSearchMatcher(query);
  return operators
    .filter(operator => Number.isFinite(rank(operator)))
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
    .slice(0, 8);
}
