import Link from 'next/link';
import SegmentedControl from '@/components/ui/SegmentedControl';
import type { AccountRecord, OwnedFilter as Filter } from '@/lib/account/accountStore';

/** How many of the listed items the account owns and does not, under every other filter. */
export interface OwnedCounts { owned: number; missing: number }

export function countOwned<T>(items: readonly T[], isOwned: (item: T) => boolean): OwnedCounts {
  const owned = items.reduce((n, item) => n + (isOwned(item) ? 1 : 0), 0);
  return { owned, missing: items.length - owned };
}

/*
 * All / Owned / Not owned, from the imported account (lib/account/accountStore): one
 * pick-one control, drawn in the same place on the roster, the skins gallery and the Skin
 * Planner. Without an import there is nothing to filter by, so it is a link to the Account
 * page that makes one, not a row of disabled buttons. Each option counts what it would show,
 * under the list's other filters: what is left of a 6★ Guard search, not of the whole roster.
 */
export default function OwnedFilter({ value, onChange, account, label, counts }: {
  value: Filter;
  /** Required, so every list that draws the filter counts for it (countOwned over the list
   *  with every filter but this one applied). */
  counts: OwnedCounts;
  onChange: (value: Filter) => void;
  account: AccountRecord | null;
  /** The group's accessible name: "Operators you own". */
  label: string;
}) {
  if (!account) {
    return (
      <Link prefetch={false} href="/account" className="btn btn-sm ghost owned-filter-import" title="Import your Arknights account to filter by what you own.">
        Owned? Import account
      </Link>
    );
  }
  const options = [
    { value: 'all', label: 'All', count: counts.owned + counts.missing },
    { value: 'owned', label: 'Owned', count: counts.owned },
    { value: 'missing', label: 'Not owned', count: counts.missing },
  ] as const;
  return <SegmentedControl className="owned-filter" label={label} value={value} options={options} onChange={onChange} />;
}
