export const WISH_MIN_ORUNDUM = 200;
export const WISH_MAX_ORUNDUM = 800;
export type WishingWallMode = 'minimum' | 'average' | 'lucky';
export const WISHING_WALL_LABELS: Record<WishingWallMode, string> = {
  minimum: 'Minimum', average: 'Average', lucky: 'I AM LUCKY',
};
const VALUES = [200, 300, 400, 500, 600, 800];

/** Exact expectation of the supplied equal-probability, independent-strip model.
 * Day one has two draws. A maximum below 400 unlocks three draws the next day.
 * Track that probability rather than simulating or rounding a daily average. */
export function wishingWallOrundum(days: number, mode: WishingWallMode): number {
  const count = Number.isFinite(days) ? Math.max(0, Math.floor(days)) : 0;
  if (mode === 'minimum') return count * WISH_MIN_ORUNDUM;
  if (mode === 'lucky') return count * WISH_MAX_ORUNDUM;
  const expectedMaximum = (draws: number) => VALUES.reduce((sum, value, index) =>
    sum + value * (((index + 1) / VALUES.length) ** draws - (index / VALUES.length) ** draws), 0);
  const two = expectedMaximum(2);
  const three = expectedMaximum(3);
  let extraStrip = 0;
  let total = 0;
  for (let day = 0; day < count; day++) {
    total += (1 - extraStrip) * two + extraStrip * three;
    extraStrip = (1 - extraStrip) * (2 / 6) ** 2 + extraStrip * (2 / 6) ** 3;
  }
  return Math.round(total);
}
