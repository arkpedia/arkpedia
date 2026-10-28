/** A skill's value that climbs by the hour to a cap: what it is at a given hour, and its
 *  average over a window, counting a part hour at the value it reached. Shared by the
 *  factory, reception room and power plant special skills (three copies until 2026-10-27). */
export function stepValueAtHour(base: number, ratePerHour: number, cap: number, hourIndex: number): number {
  if (hourIndex === 0) return base;
  return Math.min(cap, base + ratePerHour * hourIndex);
}

export function averageRampValue(base: number, ratePerHour: number, cap: number, windowHours: number): number {
  if (windowHours <= 0) return base;
  let total = 0;
  const fullHours = Math.floor(windowHours);
  for (let h = 0; h < fullHours; h++) {
    total += stepValueAtHour(base, ratePerHour, cap, h);
  }
  const remainder = windowHours - fullHours;
  if (remainder > 0) {
    total += stepValueAtHour(base, ratePerHour, cap, fullHours) * remainder;
  }
  return total / windowHours;
}
