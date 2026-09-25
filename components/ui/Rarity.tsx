export type RarityLevel = 1 | 2 | 3 | 4 | 5 | 6;

interface RarityProps {
  /** Star count, 1-6. */
  n: RarityLevel;
  /** 'short' is "6★" (lists, tiles, meta lines); 'stars' is "★★★★★★" (a detail
   *  page's headline). */
  format?: 'short' | 'stars';
  className?: string;
}

/**
 * A rarity, in the rarity's colour: --rarity-N through the .rarity-N class, in both
 * themes. The site's only way to print one -- five palettes were live, and most
 * surfaces printed rarity in grey. For a portrait tile use the .tier-N bottom edge,
 * and for a full colour block .tier-fill-N (styles/core/arkpedia-theme.css).
 *
 * The visible glyphs are hidden from screen readers, which hear "6-star" instead of
 * "black star, black star, ...".
 */
export default function Rarity({ n, format = 'short', className }: RarityProps) {
  const glyphs = format === 'stars' ? '★'.repeat(n) : `${n}★`;
  return (
    <span className={`rarity rarity-${n}${className ? ` ${className}` : ''}`}>
      <span aria-hidden="true">{glyphs}</span>
      <span className="visually-hidden">{n}-star</span>
    </span>
  );
}

/** Narrows a record's rarity (a plain number in the data) to a RarityLevel, or throws:
 *  a rarity outside 1-6 is a data error, and printing it would hide that. */
export function rarityLevel(value: number): RarityLevel {
  if (Number.isInteger(value) && value >= 1 && value <= 6) return value as RarityLevel;
  throw new Error(`Rarity ${value} is not 1-6`);
}
