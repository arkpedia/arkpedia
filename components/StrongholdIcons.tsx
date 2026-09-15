import Image from 'next/image';
import { FUNDS_ICON } from '@/lib/gamemodes/strongholdPrice';

/**
 * The two pieces of furniture both Stronghold Protocol pages draw: an icon in a box the
 * caller reserves, and a figure in the mode's currency. They live here rather than in
 * either page so the wiki and the planner cannot drift apart.
 */

/**
 * Anything with no art draws its initial in the SAME box rather than leaving a hole, so
 * no row's metrics depend on whether the art was found.
 *
 * Unoptimized on purpose. These are 45-180px webp files of a few kB, already the right
 * size, and several are named with an apostrophe or a diacritic -- Ch'en, Młynar --
 * which /_next/image answers 400 for.
 */
export function Badge({ name, icon }: { name: string; icon?: string | null }) {
  return (
    <span className="gm-badge" aria-hidden="true">
      {icon
        ? <Image src={icon} alt="" width={48} height={48} unoptimized />
        : <span className="gm-badge-mono">{name.slice(0, 1)}</span>}
    </span>
  );
}

/** The mode's currency, inline. Renders nothing at all if the price is unknown, rather
 *  than a bare glyph with no number beside it. */
export function Funds({ n, title }: { n: number | null; title?: string }) {
  if (n == null) return null;
  return (
    <span className="gm-funds" title={title}>
      {n}
      <Image src={FUNDS_ICON} alt="Funds" width={18} height={10} unoptimized />
    </span>
  );
}
