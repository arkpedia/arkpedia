import type { AccountRecord, OwnedFilter as Filter } from '@/lib/account/accountStore';

/*
 * Owned / Not owned, from the imported account (lib/account/accountStore): two independent
 * chips, the lit one clearing itself, as the roster's rarity chips do. Drawn on every visit,
 * so a reader with an import and one without get the same toolbar; without one they are
 * disabled, and say where the import is.
 */
export default function OwnedFilter({ value, onChange, account, label }: {
  value: Filter;
  onChange: (value: Filter) => void;
  account: AccountRecord | null;
  /** The group's accessible name: "Operators you own". */
  label: string;
}) {
  const hint = account ? undefined : 'Import your account in the planner (Export / import, From the game) to filter by what you own.';
  return (
    <div className="owned-filter" role="group" aria-label={label} title={hint}>
      {(['owned', 'missing'] as const).map((option) => (
        <button
          type="button"
          key={option}
          className="filter-chip"
          aria-pressed={!!account && value === option}
          disabled={!account}
          onClick={() => onChange(value === option ? 'all' : option)}
        >
          {option === 'owned' ? 'Owned' : 'Not owned'}
        </button>
      ))}
    </div>
  );
}
