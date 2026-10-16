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
  /** Registration window of a replacement Global beginner sign-in programme. */
  beginner?: { id: string; startTs: number; endTs?: number; current: boolean };
}

/** Add historical programmes without changing the default catalogue older builds read. */
export function allFreeRewards(catalogue: { rewards: FreeReward[]; beginnerRewards?: FreeReward[] }): FreeReward[] {
  return [...catalogue.rewards, ...(catalogue.beginnerRewards ?? [])];
}

/** Replacement rewards belong to the programme the account registered under. */
export function freeRewardsForAccount(rewards: FreeReward[], account: { server: string; profile?: { registeredAt: string | null } } | null): FreeReward[] {
  const registered = account?.server === 'en' && account.profile?.registeredAt ? Date.parse(account.profile.registeredAt) / 1000 : NaN;
  const programme = rewards.flatMap(reward => reward.beginner ? [reward.beginner] : [])
    .filter(programme => programme.startTs <= registered && (programme.endTs === undefined || registered <= programme.endTs))
    .sort((a, b) => b.startTs - a.startTs)[0];
  return rewards.filter(reward => !reward.beginner || (programme ? reward.beginner.id === programme.id : reward.beginner.current));
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
