import { getAllEvents } from './schedule';
import { getEventMaterials } from './eventMaterials';
import { parseGameWindow } from './gameWindow';
import type { ScheduleEvent } from './scheduleTypes';
import type { CountdownWindow, FarmingWindows } from './countdownWindows';

export type { FarmingWindows } from './countdownWindows';

/** Event Store materials (Loxic Kohl, Manganese Ore, Grindstone) aren't
 * tied to one specific named event -- they're purchasable whenever ANY
 * event shop, including a chapter-release celebration, is running. So this checks by
 * event type (the [Side Story]/[Rerun] tag in the name) rather than by
 * matching a specific event's materials list. No stage code applies
 * here since it's a store purchase, not a stage drop. Windows use the
 * shared game-window rules, so they open and close at the server's hour. */
export function getFarmingWindows(eventMaterials: Record<string, Record<string, string>>): FarmingWindows {
  const materials: FarmingWindows['materials'] = {};
  const eventStore = getEventStoreWindows();
  for (const event of getAllEvents()) {
    const window = parseGameWindow(event.global.dateRange, event.global);
    if (!window) continue;
    const span = { event: event.name, start: window.start.getTime(), end: window.end.getTime() };
    for (const [material, stageCode] of Object.entries(getEventMaterials(event.name, eventMaterials) ?? {})) {
      (materials[material] ??= []).push({ ...span, stageCode });
    }
  }
  return { materials, eventStore };
}

/** Explicit shops also cover chapter-release celebrations such as Critical Phase Transition. */
export function getEventStoreWindows(events: ScheduleEvent[] = getAllEvents()): CountdownWindow[] {
  return events.flatMap(event => {
    if (!event.global.shopEndAt && !/\[(Side Story|Story Collection|Intermezzo|Rerun)/i.test(event.name)) return [];
    const window = parseGameWindow(event.global.dateRange, event.global);
    if (!window) return [];
    return [{ event: event.name, start: window.start.getTime(), end: event.global.shopEndAt ? Date.parse(event.global.shopEndAt) : window.end.getTime() }];
  });
}

/** Older published pages omitted chapter shops. Add missing records without retiming their existing windows. */
export function withCurrentEventStores(windows: FarmingWindows): FarmingWindows {
  const known = new Set(windows.eventStore.map(window => window.event));
  return { ...windows, eventStore: [...windows.eventStore, ...getEventStoreWindows().filter(window => !known.has(window.event))] };
}
