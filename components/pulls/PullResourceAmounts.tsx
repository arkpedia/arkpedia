import type { Holdings } from '@/lib/pulls/pulls';
import { RewardAmount } from './RewardAmount';

export default function PullResourceAmounts({ amounts, useOP }: { amounts: Holdings; useOP: boolean }) {
  return <span className="pulls-breakdown-resources">
    <RewardAmount resource="orundum" amount={amounts.orundum} />
    <span className={useOP ? undefined : 'pulls-report-uncounted'} title={useOP ? undefined : 'Not counted: Use OP for pulls is off'}><RewardAmount resource="op" amount={amounts.originitePrime} /></span>
    <RewardAmount resource="permits" amount={amounts.permits} />
  </span>;
}
