import ImportDialog from '@/components/account/ImportDialog';
import type { BudgetRow } from '@/lib/pulls/plan';
import { formatDayMonthYear, formatNumber } from '@/lib/pulls/format';

export default function AvailablePullsDialog({ row, holdings, income, rewards, reserved, includePast, onClose }: {
  row: BudgetRow; holdings: number; income: number; rewards: number; reserved: number;
  includePast: boolean; onClose: () => void;
}) {
  const sources = [
    { name: 'Current resources', detail: 'Your Orundum, permits and eligible OP, in whole pulls.', value: holdings },
    { name: 'Income', detail: 'Enabled missions, annihilation, monthly card and certificate shops through this banner’s deadline.', value: income },
    { name: includePast ? 'Event & past rewards' : 'Event rewards', detail: includePast ? 'Upcoming rewards and included, unclaimed past rewards.' : 'Rewards available by this banner’s deadline.', value: rewards },
    { name: 'Skin wishlist', detail: 'Pulls reserved for your included skin wishlist.', value: -reserved },
    { name: 'Earlier banners', detail: 'Planned spending from savings before this banner; their banner-only pulls are excluded.', value: -row.spentBefore },
    { name: 'Banner free', detail: 'Exclusive to this banner. These pulls cannot carry over to another banner.', value: row.free },
  ];
  return <ImportDialog title="Available pulls" className="pulls-available-dialog" onClose={onClose}>
    <div className="pulls-income-body">
      <p className="pulls-breakdown-context"><strong>{row.goal.banner}</strong><span>Through {formatDayMonthYear(row.goal.spendOn)}{row.banner?.datesEstimated ? ' · Estimated' : ''}</span></p>
      <table className="pulls-report pulls-available-report">
        <thead><tr><th scope="col">Source</th><th scope="col">Details</th><th scope="col">Pulls</th></tr></thead>
        <tbody>
          {sources.map(source => <tr key={source.name}><th scope="row">{source.name}</th><td>{source.detail}</td><td>{source.value < 0 ? '−' : '+'}{formatNumber(Math.abs(source.value))}</td></tr>)}
          <tr className="pulls-report-sum"><th scope="row">Available</th><td>Before spending on this banner</td><td>{formatNumber(row.available)}</td></tr>
        </tbody>
      </table>
      <p className="hint">Whole-pull totals include leftover currency. Banner free pulls are used first when you set this banner’s pull budget.</p>
    </div>
  </ImportDialog>;
}
