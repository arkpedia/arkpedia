export interface FreeReward {
  id: string;
  group: string;
  name: string;
  /** `rarity` (1-6) marks an operator, whose preview the Reward Tracker opens. */
  rewards: { id: string; name: string; count: number; op?: number; orundum?: number; permits?: number; restricted?: boolean; rarity?: number }[];
  startAt?: number;
  endAt?: number;
  href?: string;
  /** A welfare operator's event: the one whose missions or Record Restoration give it ('Welfare operators'). */
  event?: string;
  /** A welfare operator row's source (scripts/build/build-free-rewards.mjs): 'trail' Record
   *  Restoration, 'event' an event's missions, 'extra' other event data, 'retro' a main-story
   *  event's permanent missions. Absent on a release built before it. */
  source?: 'trail' | 'event' | 'extra' | 'retro';
  /** A 'retro' row's event window end (ms): the row itself has none, its missions being permanent. */
  eventEndAt?: number;
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

/** An operator among a row's items: its rarity, or for a release built before rarity was kept,
 *  a character id (an outfit's id carries its skin after an @). */
export const isOperatorReward = (item: FreeReward['rewards'][number]) => !!item.rarity || /^char_[^@#]+$/.test(item.id);

/**
 * A welfare operator a reader can actually still get, today: the Reward Tracker's overview
 * lists only these (the Free rewards tab keeps every row, for ticking).
 *   - Record Restoration ('trail'): the Archives keep an archived story's trail for good.
 *   - A main-story event's permanent missions ('retro', Viy's "Clear 17-13"): for good, as the
 *     game keeps them after the event closes (owner, 2026-10-21).
 *   - An event's own operator ('event', 'extra'): only while that event is open to
 *     play, to its endAt. After it, the operator is gone until
 *     the story reaches the Archives (then as a trail row). A collab event never reaches
 *     the Archives, so its operator (Senshi, Delicious On Terra) goes when the event does:
 *     the event window is what decides, as no game table marks an event a collab.
 * Sign-ins, pinboard and beginner rows that give an operator are not welfare operators.
 * A release built before `source`: a trail row by its id, a row with an end by that end,
 * and a row with neither (a 'retro' row) as before, while open to claim.
 */
export function obtainableWelfare(reward: FreeReward, now: number): boolean {
  if (reward.group !== 'Welfare operators' || !freeRewardAvailable(reward, now)) return false;
  if (reward.source === 'trail' || reward.source === 'retro' || (!reward.source && reward.id.startsWith('free:trail:'))) return true;
  const end = reward.endAt;
  return end === undefined ? !reward.source : now < end;
}

/** When a welfare row stops being obtainable (obtainableWelfare), Infinity for never. */
const closesAt = (reward: FreeReward) => (reward.source === 'retro' ? undefined : reward.endAt) ?? Infinity;

/** The welfare operators still to claim right now: every obtainable (obtainableWelfare),
 *  unclaimed row's operator, soonest to close first; of the permanent ones (Record
 *  Restoration), the newest first. */
export function freeOperatorsToClaim(rewards: FreeReward[], done: ReadonlySet<string>, now: number) {
  return rewards.filter(reward => !done.has(reward.id) && obtainableWelfare(reward, now))
    .flatMap(reward => reward.rewards.filter(isOperatorReward).map(item => ({ reward, operator: item })))
    .sort((a, b) => closesAt(a.reward) - closesAt(b.reward) || (b.reward.startAt ?? 0) - (a.reward.startAt ?? 0)
      || a.operator.name.localeCompare(b.operator.name));
}

/** An imported roster, by the game's character ids: the record's own (operatorIds), or for a
 *  record imported before it was kept, the owners of its default outfits (char_x#1, char_x#2:
 *  never a bought one, char_x@y#1, which can be bought without the operator). An inference
 *  about the save's characterSkins; a re-import's operatorIds settle it. None without an import. */
export function rosterOperatorIds(account: { operatorIds?: string[]; skins: string[] } | null): ReadonlySet<string> {
  if (!account) return new Set();
  return new Set(account.operatorIds ?? account.skins.map(skin => /^(char_\w+)#\d+\+?$/.exec(skin)?.[1]).filter((id): id is string => !!id));
}

/** The welfare operator rows an imported roster counts as claimed: an operator already in the
 *  roster has nothing left to get from any row that gives it -- the event's missions, its
 *  permanent missions or its Record Restoration (a second copy is only a potential token).
 *  Ticked while the operator is in the import, not stored, so the next import decides again. */
export function rosterClaimedWelfare(rewards: readonly FreeReward[], roster: ReadonlySet<string>): ReadonlySet<string> {
  if (!roster.size) return new Set();
  return new Set(rewards.filter(reward => reward.group === 'Welfare operators' && reward.rewards.some(isOperatorReward)
    && reward.rewards.filter(isOperatorReward).every(item => roster.has(item.id))).map(reward => reward.id));
}

/** Why a row the import settles is shown claimed and locked (components/pulls/FreeRewards). */
export type LockedReason = 'roster' | 'game';
export const LOCKED_LABEL: Record<LockedReason, string> = { roster: 'In your roster', game: 'Claimed in game' };

/** The beginner rows an import settles while it lasts (not stored: the next import decides
 *  again): the ones the save records as received (lib/account/rewardClaims.ts: a collected
 *  programme mission or its completed mission group, a received sign-in day). Never the roster:
 *  an operator a sign-in gives (the older programme's 7-day sign-in, Cliffheart) is also in the
 *  headhunting pool, so owning her proves nothing, and a wrong tick hides a reward. A row the
 *  save knows unclaimed, or cannot speak to (the welcome mail, a sign-in day the save has no
 *  history for), stays the reader's to tick. */
export function importClaimedBeginner(rewards: readonly FreeReward[], claims: { claimed: readonly string[] } | undefined): ReadonlyMap<string, LockedReason> {
  const claimed = new Set(claims?.claimed);
  return new Map(rewards.filter(reward => reward.group === 'Beginner rewards' && claimed.has(reward.id)).map(reward => [reward.id, 'game' as const]));
}
