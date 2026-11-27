export interface Cast { start: number; end: number }
export interface Cycle { cost: number; initial: number; limit?: number }

export const framesPerSecond = 30;
export const frame = (time: number) => Math.round(time * framesPerSecond);

// The clock uses 1 SP/s outside the active window. The caller chooses whether
// the first cast can be delayed and whether a later cast becomes permanent.
export function planCasts(start: number, duration: number | null, end: number, cycle?: Cycle, permanentAfterFirst = false) {
  const casts: Cast[] = [];
  let ready = frame(cycle ? Math.max(start, cycle.cost - cycle.initial, 0) : start);
  while (ready <= end && casts.length < (cycle?.limit ?? Infinity)) {
    const stop = duration === null || permanentAfterFirst && casts.length > 0 ? Infinity : ready + frame(duration);
    casts.push({ start: ready, end: stop });
    if (!cycle || stop === Infinity) break;
    ready = stop + Math.max(1, frame(cycle.cost));
  }
  return casts;
}
