import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Image from '@/components/content/ContentImage';
import SearchInput from '@/components/ui/SearchInput';
import { useContentUrl } from '@/lib/content/context';
import { operatorHref } from '@/lib/operators/operatorHref';
import { getOperatorIconPath } from '@/lib/operators/operatorIcon';
import { getOperatorSearchResults, loadOperatorSearch, SearchableOperatorRecord } from '@/lib/operators/operatorSearch';
import type { Operator } from '@/lib/operators/operatorTypes';

/**
 * The operator page's jump-to-operator field, in the page header: the site's
 * SearchInput with suggestions (it was a hand-built listbox, and a second, dialog
 * version for a narrow artwork column the header no longer has). Enter opens the
 * highlighted match, or the first one when nothing is highlighted -- the field's
 * old behaviour, kept because it is how a reader who knows the name moves on.
 * The next operator opens at `section`, the one the reader is on (operatorHref).
 */
export default function OperatorSearch({ section }: { section: string | null }) {
  const contentUrl = useContentUrl();
  const router = useRouter();
  const [operators, setOperators] = useState<SearchableOperatorRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const results = useMemo(() => getOperatorSearchResults(operators, query), [operators, query]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    loadOperatorSearch(contentUrl('/operator-search.json'), controller.signal)
      .then(setOperators)
      .catch(error => { if (!controller.signal.aborted) console.error(error); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [contentUrl]);
  useEffect(() => { setQuery(''); }, [router.asPath]);

  function select(name: string) {
    setQuery('');
    void router.push(operatorHref(name, section));
  }

  return (
    <SearchInput
      label="Search operators"
      name="operator-jump"
      placeholder="Search operators…"
      value={query}
      onChange={setQuery}
      suggestions={results}
      getKey={(operator) => operator.name}
      renderSuggestion={(operator) => <>
        <Image src={getOperatorIconPath(operator as Operator)} alt="" width={32} height={32} />
        <span>{operator.name}</span>
      </>}
      onPick={(operator) => select(operator.name)}
      suggestLabel="Matching operators"
      emptyText={loading ? 'Loading operators…' : 'No operators found.'}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.defaultPrevented && results.length) {
          event.preventDefault();
          select(results[0].name);
        }
      }}
    />
  );
}
