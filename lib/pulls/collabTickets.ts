/** Banner-locked permits are not freeGacha daily rolls. Match item -> pool,
 * then count issued items from login rewards, never the number of item types.
 * CN login days are used for estimated Global windows, as for other forecasts. */
export interface TicketGrant { day: number; pulls: number }
interface Item { id?: string; count?: number }
interface Activity {
  activity?: {
    LOGIN_ONLY?: Record<string, { itemList?: Item[] }>;
    CHECKIN_ONLY?: Record<string, { checkInList?: Record<string, { order: number; itemList?: Item[] }> }>;
  };
}
interface Gacha {
  linkageGachaItem?: { itemId: string; gachaPoolId: string; isTen: boolean }[];
}
export function collabTicketGrants(gacha: Gacha, activity: Activity): Record<string, TicketGrant[]> {
  const items = new Map((gacha.linkageGachaItem ?? []).map(item => [item.itemId, item]));
  const result: Record<string, TicketGrant[]> = {};
  function add(rewards: Item[], day: number) {
    for (const reward of rewards) {
      const item = items.get(reward.id ?? '');
      if (!item || !reward.count) continue;
      (result[item.gachaPoolId] ??= []).push({ day, pulls: reward.count * (item.isTen ? 10 : 1) });
    }
  }
  for (const login of Object.values(activity.activity?.LOGIN_ONLY ?? {})) add(login.itemList ?? [], 1);
  for (const login of Object.values(activity.activity?.CHECKIN_ONLY ?? {})) {
    for (const day of Object.values(login.checkInList ?? {})) add(day.itemList ?? [], day.order);
  }
  // These mailed singles are absent from activity_table. Official CN announcement,
  // section 4: one pool-only permit on each of the first ten days.
  // https://ak.hypergryph.com/news/9681
  if (items.has('LINKAGE_TKT_GACHA_7701')) {
    for (let day = 1; day <= 10; day++) (result.LINKAGE_77_0_1 ??= []).push({ day, pulls: 1 });
  }
  return Object.fromEntries(Object.entries(result).map(([pool, grants]) => [pool, grants.sort((a, b) => a.day - b.day)]));
}
