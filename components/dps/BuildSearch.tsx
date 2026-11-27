import { useMemo, useState } from 'react';
import SearchInput from '@/components/ui/SearchInput';
import { ContentImg } from '@/components/content/ContentImage';
import Rarity, { rarityLevel } from '@/components/ui/Rarity';
import OperatorGameIcon from '@/components/operators/OperatorGameIcon';
import { getOperatorIconPath, OPERATOR_PORTRAIT_PLACEHOLDER } from '@/lib/operators/operatorIcon';
import { getBranchIconPath } from '@/lib/operators/classBranchIcons';
import type { Profile } from '@/lib/dps/calculator';
import { normalizeForSearch } from '@/lib/search/searchNormalize';
import css from './Dps.module.css';

export interface SearchChoice {
  id: string;
  name: string;
  detail?: string;
  code?: string | null;
  icon?: string | null;
  rarity?: number;
  subclass?: string;
  aliases?: string[];
}

export function operatorChoice(p: Profile): SearchChoice {
  return { id: p.id, name: p.name, detail: p.region === 'CN' ? 'CN' : undefined,
    icon: p.icon ?? getOperatorIconPath(p), rarity: p.rarity, subclass: p.subclass, aliases: p.aliases };
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
        aliases: (choice.aliases ?? []).map(normalizeForSearch),
      })),
    [choices],
  );
  const matches = useMemo(() => {
    const term = normalizeForSearch(query.trim());
    if (!term) return choices.slice(0, 50);
    return index
      .map(({ choice, name, code, aliases }) => ({
        choice,
        score:
          name === term || code === term || choice.id === term || aliases.includes(term)
            ? 0
            : name.startsWith(term) || code.startsWith(term) || aliases.some(alias => alias.startsWith(term))
              ? 1
              : name.includes(term) || choice.id.includes(term) || code.includes(term) || aliases.some(alias => alias.includes(term))
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
      describeSuggestion={item => item.rarity ? [item.rarity + '-star', item.subclass].filter(Boolean).join(', ') : undefined}
      renderSuggestion={(item) => {
        const branchIcon = getBranchIconPath(item.subclass);
        return <>
          <ContentImg className={css.searchIcon} src={item.icon ?? OPERATOR_PORTRAIT_PLACEHOLDER} width={30} height={30} alt="" />
          <span className={css.searchIdentity}>
            <span>{item.name}{item.detail && <> <small>{item.detail}</small></>}</span>
            {item.rarity && <small className={css.searchMeta} aria-hidden="true">
              <Rarity n={rarityLevel(item.rarity)} />
              {branchIcon && <OperatorGameIcon label={item.subclass!} src={branchIcon} size={14} />}
              {item.subclass}
            </small>}
          </span>
        </>;
      }}
      onPick={(item) => {
        pick(item.id);
        setQuery('');
      }}
    />
  );
}
