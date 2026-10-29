/** A skill's value that climbs by the hour to a cap: what it is at a given hour, and its
 *  average over a window, counting a part hour at the value it reached. Shared by the
 *  factory, reception room and power plant special skills (three copies until 2026-10-27). */
export function stepValueAtHour(base: number, ratePerHour: number, cap: number, hourIndex: number): number {
  if (hourIndex === 0) return base;
  return Math.min(cap, base + ratePerHour * hourIndex);
}

/** Average over `windowHours` that starts `startHours` into an operator's continuous stint, so an operator who has
 *  already worked a while is on the upper part of the ramp. `startHours` 0 is a fresh arrival. */
export function averageRampValue(base: number, ratePerHour: number, cap: number, windowHours: number, startHours = 0): number {
  if (windowHours <= 0) return stepValueAtHour(base, ratePerHour, cap, Math.floor(startHours));
  let total = 0;
  const fullHours = Math.floor(windowHours);
  const first = Math.floor(startHours);
  for (let h = 0; h < fullHours; h++) {
    total += stepValueAtHour(base, ratePerHour, cap, first + h);
  }
  const remainder = windowHours - fullHours;
  if (remainder > 0) {
    total += stepValueAtHour(base, ratePerHour, cap, first + fullHours) * remainder;
  }
  return total / windowHours;
}

/** Share of the window [startHours, startHours + windowHours] that lies beyond `afterHours` (a step that switches on). */
export function shareAfterHours(afterHours: number, windowHours: number, startHours = 0): number {
  if (windowHours <= 0) return startHours > afterHours ? 1 : 0;
  return Math.max(0, startHours + windowHours - Math.max(afterHours, startHours)) / windowHours;
}
