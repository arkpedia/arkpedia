import { getAllEvents } from './schedule';
import { getEventMaterials } from './eventMaterials';
import { parseGameWindow } from './gameWindow';
import type { CountdownWindow, FarmingWindows } from './countdownWindows';

export type { CountdownWindow, FarmingWindows, MaterialCountdown } from './countdownWindows';

/** Event Store materials (Loxic Kohl, Manganese Ore, Grindstone) aren't
 * tied to one specific named event -- they're purchasable whenever ANY
 * Side Story or Rerun event happens to be running. So this checks by
 * event type (the [Side Story]/[Rerun] tag in the name) rather than by
 * matching a specific event's materials list. No stage code applies
 * here since it's a store purchase, not a stage drop. Windows use the
 * shared game-window rules, so they open and close at the server's hour. */
export function getFarmingWindows(): FarmingWindows {
  const materials: FarmingWindows['materials'] = {};
  const eventStore: CountdownWindow[] = [];
  for (const event of getAllEvents()) {
    const window = parseGameWindow(event.global.dateRange, event.global);
    if (!window) continue;
    const span = { start: window.start.getTime(), end: window.end.getTime() };
    if (/\[(Side Story|Story Collection|Intermezzo|Rerun)/i.test(event.name)) eventStore.push(span);
    for (const [material, stageCode] of Object.entries(getEventMaterials(event.name) ?? {})) {
      (materials[material] ??= []).push({ ...span, stageCode });
    }
  }
  return { materials, eventStore };
}
