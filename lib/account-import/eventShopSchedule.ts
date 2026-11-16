import { eventShopId, type EventShopRequest } from './eventShopClaims';
import { eventShopPermits, type PullEventReward } from '@/lib/pulls/pulls';
import { planningWindowEnd } from '@/lib/pulls/planningWindows';
import type { RegionalSchedule } from '@/lib/time/regional';

export function activeEventShopRequests(events: readonly PullEventReward[], regional: RegionalSchedule | undefined, now: number): EventShopRequest[] {
  const shops = new Map<string, EventShopRequest>();
  for (const event of events) {
    const time = regional?.events?.[event.event ?? event.name];
    const shopId = `shop_${time?.activityId ?? event.cnAct}`;
    if (!event.cnAct || !eventShopId(shopId) || !eventShopId(`shop_${event.cnAct}`) || !eventShopPermits(event)) continue;
    const start = Date.parse(time?.startAt ?? event.startAt ?? event.start);
    const close = time ? Date.parse(time.shopEndAt ?? time.endAt) : event.shopEndAt ? Date.parse(event.shopEndAt) : planningWindowEnd(event);
    if (start <= now && now < close) shops.set(shopId, { shopId, eventId: event.cnAct });
  }
  return [...shops.values()].slice(0, 8);
}
