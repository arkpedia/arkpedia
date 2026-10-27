// Client-safe: the Farming page renders its countdowns with these, so this module must
// not import game data (the builder that reads it is in materialCountdown.ts).

export interface MaterialCountdown {
  status: 'now' | 'countdown';
  text: string; // "In X days" before opening, or "X days left" while active
  event?: string; // owning schedule event, retained for links
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

/** The most recently opened active event wins, even while an older shop remains
 * open. Otherwise count down to the nearest upcoming event. */
function resolve<W extends CountdownWindow>(windows: readonly W[], now: number): { window: W; status: 'now' | 'countdown' } | null {
  let active: W | null = null;
  let best: W | null = null;
  for (const window of windows) {
    if (window.start <= now && now < window.end) {
      if (!active || window.start > active.start) active = window;
    } else if (now < window.start && (!best || window.start < best.start)) best = window;
  }
  return active ? { window: active, status: 'now' } : best ? { window: best, status: 'countdown' } : null;
}

export function resolveEventStoreCountdown(windows: FarmingWindows, now: number): MaterialCountdown | null {
  const found = resolve(windows.eventStore, now);
  if (!found) return null;
  const event = found.window.event ? { event: found.window.event } : {};
  return found.status === 'now' ? { status: 'now', text: `${formatCountdown(found.window.end, now)} left`, ...event } : { status: 'countdown', text: `In ${formatCountdown(found.window.start, now)}`, ...event };
}

/** Only the current farming event, or the nearest upcoming farming event.
 * Later events must not advertise a separate countdown for every material. */
export function resolveMaterialCountdowns(windows: FarmingWindows, now: number): Record<string, MaterialCountdown> {
  const result: Record<string, MaterialCountdown> = {};
  const selected = resolve(Object.values(windows.materials).flat(), now);
  if (!selected) return result;
  for (const [material, list] of Object.entries(windows.materials)) {
    const found = resolve(list.filter(window => window.event === selected.window.event
      && window.start === selected.window.start && window.end === selected.window.end), now);
    if (!found) continue;
    const { stageCode, start } = found.window;
    const event = found.window.event ? { event: found.window.event } : {};
    result[material] = found.status === 'now' ? { status: 'now', text: `${formatCountdown(found.window.end, now)} left`, stageCode, ...event } : { status: 'countdown', text: `In ${formatCountdown(start, now)}`, stageCode, ...event };
  }
  return result;
}
