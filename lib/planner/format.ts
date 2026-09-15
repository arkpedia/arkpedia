/**
 * Counts, short enough for a tile or a cost chip.
 *
 * Only six figures and up get shortened, which in practice is LMD and nothing
 * else: "1.24M" is easier to read at a glance than 1,240,000, and "146" is
 * easier to read than "0.1k". Anywhere the exact number has to be typed or
 * checked -- the depot's own fields, a chip's title -- carries it in full.
 *
 * One function rather than one per surface: the depot strip and the build
 * dialog show the same LMD, and two spellings of one number is how a screen
 * ends up disagreeing with itself.
 */
export function compactCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
  if (n >= 100_000) return `${Math.round(n / 1000)}k`;
  return n.toLocaleString();
}

/**
 * The same count, for a 34px cost chip.
 *
 * `compactCount` keeps everything under six figures in full, which is right in
 * an 88px depot tile and wrong on a chip: "20,000" rendered 40px wide under a
 * 34px icon and collided with the material beside it. So this shortens from a
 * thousand up, one decimal while that is worth having -- which is what the
 * game's own item counts and Krooster's goal list both do. The exact figure is
 * always in the chip's title, because a rounded number is a glance and not an
 * answer.
 */
export function compactBadge(n: number): string {
  const v = Math.ceil(n);
  if (v < 1000) return String(v);
  const unit = v >= 1_000_000 ? 1_000_000 : 1000;
  const scaled = v / unit;
  const text = scaled >= 100 ? String(Math.round(scaled)) : scaled.toFixed(1).replace(/\.0$/, '');
  return `${text}${unit === 1_000_000 ? 'M' : 'K'}`;
}
