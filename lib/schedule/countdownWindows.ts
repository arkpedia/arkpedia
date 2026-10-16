// Client-safe: the Farming page renders its countdowns with these, so this module must
// not import game data (the builder that reads it is in materialCountdown.ts).

export interface MaterialCountdown {
  status: 'now' | 'countdown';
  text: string; // "NOW", or "X days" / "X hours" at the moment it was resolved
  stageCode?: string; // the stage this material actually comes from, e.g. "AD-7"
}

/** A Global event window as epoch ms, end exclusive (parseGameWindow). */
export interface CountdownWindow { start: number; end: number; event?: string }

/**
 * What the Farming page needs to work out its countdowns, and nothing decided yet.
 * The content export writes this once; "NOW" or "34 days" depends on the moment of
 * reading, so resolveMaterialCountdowns/resolveEventStoreCountdown run at render.
 * The export used to write the text itself, which then read "34 days" for as long
 * as no new release landed.
 */
export interface FarmingWindows {
  /** Per material, every event window whose 3-tier-3-material set includes it. */
  materials: Record<string, (CountdownWindow & { stageCode: string })[]>;
  /** Every Side Story, Story Collection, Intermezzo or Rerun window. */
  eventStore: CountdownWindow[];
}

function formatCountdown(target: number, now: number): string {
  const diffHours = (target - now) / (1000 * 60 * 60);
  if (diffHours < 24) {
    const hours = Math.max(1, Math.ceil(diffHours));
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  }
  const days = Math.ceil(diffHours / 24);
  return `${days} day${days === 1 ? '' : 's'}`;
}

/** An active window wins immediately; otherwise the soonest upcoming one counts
 * down; windows already over are not relevant. */
function resolve<W extends CountdownWindow>(windows: readonly W[], now: number): { window: W; status: 'now' | 'countdown' } | null {
  let best: W | null = null;
  for (const window of windows) {
    if (window.start <= now && now < window.end) return { window, status: 'now' };
    if (now < window.start && (!best || window.start < best.start)) best = window;
  }
  return best ? { window: best, status: 'countdown' } : null;
}

export function resolveEventStoreCountdown(windows: FarmingWindows, now: number): MaterialCountdown | null {
  const found = resolve(windows.eventStore, now);
  if (!found) return null;
  return found.status === 'now' ? { status: 'now', text: 'NOW' } : { status: 'countdown', text: formatCountdown(found.window.start, now) };
}

/** For every material in some event's 3-tier-3-material set: NOW while such an
 * event runs, else a countdown to the soonest one, with the stage it drops from
 * (shown as a regular stage chip, e.g. "AD-7"). */
export function resolveMaterialCountdowns(windows: FarmingWindows, now: number): Record<string, MaterialCountdown> {
  const result: Record<string, MaterialCountdown> = {};
  for (const [material, list] of Object.entries(windows.materials)) {
    const found = resolve(list, now);
    if (!found) continue;
    const { stageCode, start } = found.window;
    result[material] = found.status === 'now' ? { status: 'now', text: 'NOW', stageCode } : { status: 'countdown', text: formatCountdown(start, now), stageCode };
  }
  return result;
}
