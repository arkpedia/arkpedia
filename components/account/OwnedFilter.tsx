import Link from 'next/link';
import SegmentedControl from '@/components/ui/SegmentedControl';
import type { AccountRecord, OwnedFilter as Filter } from '@/lib/account/accountStore';

const OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'owned', label: 'Owned' },
  { value: 'missing', label: 'Not owned' },
] as const;

/*
 * All / Owned / Not owned, from the imported account (lib/account/accountStore): one
 * pick-one control, drawn in the same place on the roster, the skins gallery and the Skin
 * Planner. Without an import there is nothing to filter by, so it is a link to the Account
 * page that makes one, not a row of disabled buttons.
 */
export default function OwnedFilter({ value, onChange, account, label }: {
  value: Filter;
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
  return <SegmentedControl className="owned-filter" label={label} value={value} options={OPTIONS} onChange={onChange} />;
}
