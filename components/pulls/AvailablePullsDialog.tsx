import ImportDialog from '@/components/account/ImportDialog';
import type { BudgetRow } from '@/lib/pulls/plan';
import { formatDayMonthYear, formatNumber } from '@/lib/pulls/format';
import type { Holdings } from '@/lib/pulls/pulls';
import { RewardAmount } from './RewardAmount';
import PullResourceAmounts from './PullResourceAmounts';

export default function AvailablePullsDialog({ row, holdings, income, rewards, reserved, includePast, resources, reservedOP, useOP, stageClearOP, hasPastClears, onClose }: {
  row: BudgetRow; holdings: number; income: number; rewards: number; reserved: number;
  resources: { held: Holdings; income: Holdings; rewards: Holdings }; reservedOP: number; useOP: boolean; stageClearOP: number; hasPastClears: boolean;
  includePast: boolean; onClose: () => void;
}) {
  const sources = [
    { name: 'Current resources', amounts: <PullResourceAmounts amounts={resources.held} useOP={useOP} />, detail: 'What you hold now.', value: holdings },
    { name: 'Income', amounts: <PullResourceAmounts amounts={resources.income} useOP={useOP} />, detail: 'Enabled missions, annihilation, monthly card and certificate shops through this banner’s deadline.', value: income },
    { name: includePast ? 'Event & past rewards' : 'Event rewards', amounts: <PullResourceAmounts amounts={resources.rewards} useOP={useOP} />,
      detail: `Includes ${formatNumber(stageClearOP)} stage-clear OP${includePast ? ' and your included, unclaimed past rewards' : ''}. Assumes completion by the event deadline.`, value: rewards },
    { name: 'Skin wishlist', amounts: <RewardAmount resource="op" amount={reservedOP} />, detail: useOP ? 'OP reserved for your included skin wishlist.' : 'No pull deduction while OP conversion is off.', value: -reserved },
    { name: 'Earlier banners', amounts: <RewardAmount resource="pulls" amount={row.spentBefore} />, detail: 'Planned spending from savings before this banner; banner-only pulls are excluded.', value: -row.spentBefore },
    { name: 'Banner free', amounts: <RewardAmount resource="pulls" amount={row.free} />, detail: 'Exclusive to this banner. Cannot carry over to another banner.', value: row.free },
  ];
  return <ImportDialog title="Available pulls" className="pulls-available-dialog" onClose={onClose}>
    <div className="pulls-income-body">
      <p className="pulls-breakdown-context"><strong>{row.goal.banner}</strong><span>Through {formatDayMonthYear(row.goal.spendOn)}{row.banner?.datesEstimated ? ' · [Predicted]' : ' · Confirmed'} · at banner close</span></p>
      {!useOP && <p className="hint">OP is shown but not converted into pulls. “Use OP for pulls” is off.</p>}
      <table className="pulls-report pulls-available-report">
        <thead><tr><th scope="col">Source</th><th scope="col">Details</th><th scope="col">Pulls</th></tr></thead>
        <tbody>
          {sources.map(source => <tr key={source.name}><th scope="row">{source.name}</th><td><span className="pulls-breakdown-detail">{source.amounts}<span>{source.detail}</span></span></td><td>{source.value < 0 ? '−' : '+'}{formatNumber(Math.abs(source.value))}</td></tr>)}
          <tr className="pulls-report-sum"><th scope="row">Available</th><td>Before spending on this banner</td><td>{formatNumber(row.available)}</td></tr>
        </tbody>
      </table>
      <p className="hint">Whole-pull totals include leftover currency. Banner free pulls are used first when you set this banner’s pull budget.</p>
      {hasPastClears && <p className="hint">Ongoing and past event first clears are managed in Past events. {includePast ? 'Your selected unclaimed rewards are included.' : 'Enable “Include past rewards” to count your unclaimed clears.'}</p>}
    </div>
  </ImportDialog>;
}
