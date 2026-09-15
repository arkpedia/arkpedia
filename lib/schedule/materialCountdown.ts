import { getAllEvents, parseDateRange } from './schedule';
import { getEventMaterials } from './eventMaterials';

export interface MaterialCountdown {
  status: 'now' | 'countdown';
  text: string; // "NOW", or a static "X days" / "X hours" -- computed once, not live-updating
  stageCode?: string; // the stage this material actually comes from, e.g. "AD-7"
}

function formatCountdown(target: Date, now: Date): string {
  const diffMs = target.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  if (diffHours < 24) {
    const hours = Math.max(1, Math.ceil(diffHours));
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  }
  const days = Math.ceil(diffHours / 24);
  return `${days} day${days === 1 ? '' : 's'}`;
}

/** Event Store materials (Loxic Kohl, Manganese Ore, Grindstone) aren't
 * tied to one specific named event -- they're purchasable whenever ANY
 * Side Story or Rerun event happens to be running. So this checks by
 * event type (the [Side Story]/[Rerun] tag in the name) rather than by
 * matching a specific event's materials list. No stage code applies
 * here since it's a store purchase, not a stage drop. */
export function getEventStoreCountdown(): MaterialCountdown | null {
  const events = getAllEvents();
  const now = new Date();
  let best: { status: 'now' | 'countdown'; text: string; startTime: number } | null = null;

  for (const event of events) {
    if (!/\[(Side Story|Story Collection|Intermezzo|Rerun)/i.test(event.name)) continue;

    const range = parseDateRange(event.global.dateRange);
    if (!range) continue;

    if (now >= range.start && now <= range.end) {
      return { status: 'now', text: 'NOW' }; // an active one wins immediately
    }
    if (now < range.start) {
      if (!best || range.start.getTime() < best.startTime) {
        best = { status: 'countdown', text: formatCountdown(range.start, now), startTime: range.start.getTime() };
      }
    }
  }

  return best ? { status: best.status, text: best.text } : null;
}

/** For every material that's part of an event's 3-Tier-3-material set,
 * figures out whether that event is active right now, upcoming, or
 * already passed -- and returns the most relevant status per material,
 * INCLUDING the stage code it drops from (needed to show it the same
 * way as a regular stage chip, e.g. "AD-7", not just a floating badge).
 * An active "NOW" always wins over a future countdown; among multiple
 * future occurrences of the same material, the soonest one wins.
 * Computed once (at build time via getStaticProps), not live-ticking. */
export function getMaterialCountdowns(): Record<string, MaterialCountdown> {
  const events = getAllEvents();
  const now = new Date();
  const result: Record<string, MaterialCountdown> = {};
  const bestStartTime: Record<string, number> = {};

  for (const event of events) {
    const materials = getEventMaterials(event.name); // { materialName: stageCode }
    if (!materials) continue;

    const range = parseDateRange(event.global.dateRange);
    if (!range) continue;

    let status: 'now' | 'countdown';
    if (now >= range.start && now <= range.end) {
      status = 'now';
    } else if (now < range.start) {
      status = 'countdown';
    } else {
      continue; // already passed -- not relevant for a countdown
    }

    for (const [material, stageCode] of Object.entries(materials)) {
      const existing = result[material];
      if (status === 'now') {
        // "now" always wins, regardless of what's already recorded
        result[material] = { status: 'now', text: 'NOW', stageCode };
        bestStartTime[material] = 0;
        continue;
      }
      // status === 'countdown' -- only replace if there's no "now"
      // already recorded, and this is sooner than whatever's there
      if (existing?.status === 'now') continue;
      if (!existing || range.start.getTime() < (bestStartTime[material] ?? Infinity)) {
        result[material] = { status: 'countdown', text: formatCountdown(range.start, now), stageCode };
        bestStartTime[material] = range.start.getTime();
      }
    }
  }

  return result;
}