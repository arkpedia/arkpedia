import { useMemo, useState } from 'react';
import SearchInput from '@/components/ui/SearchInput';
import { normalizeForSearch } from '@/lib/search/searchNormalize';

export interface SearchChoice {
  id: string;
  name: string;
  detail?: string;
  code?: string | null;
}
export default function BuildSearch({
  label,
  placeholder,
  choices,
  pick,
}: {
  label: string;
  placeholder: string;
  choices: SearchChoice[];
  pick: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const index = useMemo(
    () =>
      choices.map((choice) => ({
        choice,
        name: normalizeForSearch(choice.name),
        code: normalizeForSearch(choice.code || ''),
      })),
    [choices],
  );
  const matches = useMemo(() => {
    const term = normalizeForSearch(query.trim());
    if (!term) return choices.slice(0, 50);
    return index
      .map(({ choice, name, code }) => ({
        choice,
        score:
          name === term || code === term || choice.id === term
            ? 0
            : name.startsWith(term) || code.startsWith(term)
              ? 1
              : name.includes(term) || choice.id.includes(term) || code.includes(term)
                ? 2
                : 3,
      }))
      .filter((row) => row.score < 3)
      .sort((a, b) => a.score - b.score)
      .slice(0, 50)
      .map((row) => row.choice);
  }, [choices, index, query]);
  return (
    <SearchInput
      label={label}
      placeholder={placeholder}
      value={query}
      onChange={setQuery}
      suggestions={matches}
      suggestOnEmpty
      getKey={(item) => item.id}
      suggestLabel={label + ' results'}
      emptyText="No matches"
      renderSuggestion={(item) => (
        <>
          {item.name}
          {item.detail && <small>{item.detail}</small>}
        </>
      )}
      onPick={(item) => {
        pick(item.id);
        setQuery('');
      }}
    />
  );
}
