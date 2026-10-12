export interface FreeReward {
  id: string;
  group: string;
  name: string;
  rewards: { id: string; name: string; count: number; op?: number; orundum?: number; permits?: number; restricted?: boolean }[];
  startAt?: number;
  endAt?: number;
  href?: string;
  /** Permanent currencies that are not already forecast as scheduled event rewards. */
  forecast: boolean;
}
export function freeRewardAvailable(reward: FreeReward, now: number): boolean {
  return (!reward.startAt || reward.startAt <= now) && (!reward.endAt || now < reward.endAt);
}
export function freeRewardTotals(rewards: FreeReward[], done: ReadonlySet<string>, now: number) {
  return rewards.filter(reward => !done.has(reward.id) && freeRewardAvailable(reward, now)).reduce((total, reward) => {
    for (const item of reward.rewards) { total.op += item.op ?? 0; total.orundum += item.orundum ?? 0; total.permits += item.permits ?? 0; }
    return total;
  }, { op: 0, orundum: 0, permits: 0 });
}
