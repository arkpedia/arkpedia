import { useEffect, useMemo, useState } from 'react';
import { useContentUrl } from '@/lib/content/context';
import { loadOperatorSearch, OPERATOR_SEARCH_PATH, type SearchableOperatorRecord } from './operatorSearch';

const loads = new Map<string, Promise<SearchableOperatorRecord[]>>();
const EMPTY: SearchableOperatorRecord[] = [];

/** Share one catalogue request per release across operator search fields. */
export function useOperatorSearchCatalogue(enabled: boolean) {
  const url = useContentUrl()(OPERATOR_SEARCH_PATH);
  const [state, setState] = useState<{ url: string; operators: SearchableOperatorRecord[] } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let pending = loads.get(url);
    if (!pending) {
      pending = loadOperatorSearch(url);
      loads.set(url, pending);
      pending.catch(() => loads.delete(url));
    }
    pending.then(operators => {
      if (active) setState({ url, operators });
    }).catch(() => {
      if (active) setState({ url, operators: EMPTY });
    });
    return () => { active = false; };
  }, [enabled, url]);

  const operators = state?.url === url ? state.operators : EMPTY;
  const aliases = useMemo(() => new Map(operators.flatMap(operator =>
    operator.aliases?.length ? [[operator.name, operator.aliases] as const] : [])), [operators]);
  return { operators, aliases, loading: enabled && state?.url !== url };
}
