import { matchesSearch, normalizeForSearch, searchRelevance } from '../search/searchNormalize';

/** Use the roster's matching and ranking rules in the operator-page quick search. */
export function getOperatorSearchResults<T extends { name: string }>(operators: T[], query: string): T[] {
  const search = query.trim();
  if (!normalizeForSearch(search)) return [];
  return operators
    .filter(operator => matchesSearch(operator.name, search))
    .sort((a, b) => searchRelevance(a.name, search) - searchRelevance(b.name, search) || a.name.localeCompare(b.name))
    .slice(0, 8);
}
