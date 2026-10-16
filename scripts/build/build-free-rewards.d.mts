import type { FreeReward } from '../../lib/pulls/freeRewards';

/** Raw Global table boundaries are validated by the producer, not trusted as account data. */
export function buildFreeRewards(tables: {
  handbook: unknown;
  missions: unknown;
  openServer: unknown;
  checkin: unknown;
  activity: unknown;
  items: unknown;
  characters: unknown;
  shops: unknown;
  eventRewards?: unknown;
  announcements?: unknown;
}): { paradox: { id: string; name: string; amount: number }[]; rewards: FreeReward[]; beginnerRewards: FreeReward[] };
