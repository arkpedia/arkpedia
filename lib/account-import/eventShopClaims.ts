/** Read-only template-shop catalogue + syncData purchase counts. Product IDs are
 * not item IDs: only an explicit 7003/7004 item in the catalogue identifies pulls. */
const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
export interface EventShopRequest { shopId: string; eventId: string }
export const eventShopId = (value: unknown): value is string => typeof value === 'string' && /^shop_act[a-z0-9]{1,60}$/.test(value);
const count = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 1000;

export function eventShopPermitClaims(shopId: string, snapshot: unknown, response: unknown): number | null {
  const info = object(snapshot)?.info;
  const reply = object(response);
  const data = object(reply?.data);
  const groups = object(data?.shopGroup);
  if (!eventShopId(shopId) || !Array.isArray(info) || info.length > 2000 || !data || data.shopId !== shopId || !groups || Object.keys(groups).length > 100 || reply?.result !== undefined && reply.result !== 0) return null;
  const purchased = new Map<string, number>();
  for (const row of info) {
    const entry = object(row);
    if (!entry || typeof entry.id !== 'string' || !count(entry.count) || purchased.has(entry.id)) return null;
    purchased.set(entry.id, entry.count);
  }
  let total = 0, found = false;
  const seen = new Set<string>();
  for (const group of Object.values(groups)) {
    const goods = object(object(group)?.shopGood);
    if (!goods || Object.keys(goods).length > 1000) return null;
    for (const [id, value] of Object.entries(goods)) {
      const good = object(value), item = object(good?.item);
      if (!item || item.id !== '7003' && item.id !== '7004') continue;
      if (!good || good.goodId !== id || seen.has(id) || good.goodType !== 'NORMAL' || !count(item.count) || item.count === 0 || !count(good.availCount)) return null;
      seen.add(id); found = true;
      const bought = purchased.get(id) ?? 0;
      if (bought > good.availCount) return null;
      total += bought * item.count * (item.id === '7004' ? 10 : 1);
    }
  }
  return found && count(total) ? total : null;
}

export function parseEventPermitClaims(value: unknown): Record<string, number> | undefined {
  const claims = object(value);
  if (!claims || Object.keys(claims).length > 500) return undefined;
  const entries = Object.entries(claims);
  if (entries.some(([id, amount]) => !/^act[a-z0-9]{1,60}$/.test(id) || !count(amount))) return undefined;
  return Object.fromEntries(entries.map(([id, amount]) => [id, Number(amount)]));
}
