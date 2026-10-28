import { publicFileExists } from '@/lib/assets/publicAssets';
import { assetFileName } from '@/lib/assets/assetUrl';
import { getAllOperators } from '@/lib/operators/operators';
import { operatorRelease, releaseMarker } from '@/lib/operators/operatorAvailability';
import { Operator } from '@/lib/operators/operatorTypes';
import { GameOperator, PaletteArtwork, PaletteOperator } from './logic';
import palettes from '@/data/color-palettes.json';

const WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six'];

/** Operators with a known Global release, released or not yet: which of them can be
 * played is a question for the moment of reading (playablePalettes). */
function datedOperators(): Operator[] {
  return getAllOperators().filter((operator) => operatorRelease(operator) !== null);
}
function toGameOperator(operator: Operator): GameOperator {
  return {
    name: operator.name,
    aliases: [...new Set(Object.values(operator.otherLanguages || {}).filter((value) => value && value !== 'N/A'))],
  };
}

/** Every dated operator with palette artwork, each carrying its release marker. This is
 * what the page exports; the export used to keep only the operators released at that
 * moment, so one released afterwards stayed out of the game until the next release. */
export function getPaletteCatalogue(): PaletteOperator[] {
  const artworks = palettes.artworks as Record<string, { colors: string[] }>;
  return datedOperators().map((operator) => {
    function art(label: 'Base' | 'Elite 2'): PaletteArtwork | null {
      if (!operator.rarity || (label === 'Elite 2' && operator.rarity < 4)) return null;
      const safeName = assetFileName(operator.name);
      const image = `/${WORDS[operator.rarity]}-star-skins/${safeName} - ${label}.webp`;
      const palette = artworks[image];
      if (!palette || !publicFileExists(image)) return null;
      return { image, colors: palette.colors };
    }
    return { ...toGameOperator(operator), rarity: operator.rarity, class: operator.class, base: art('Base'), elite2: art('Elite 2'), release: releaseMarker(operator) };
  }).filter((operator) => operator.base || operator.elite2);
}

export type CommunityPaletteOverrides = Record<string, { colors: string[] }>;

export function applyCommunityPaletteOverrides(
  operators: PaletteOperator[],
  overrides: CommunityPaletteOverrides,
): PaletteOperator[] {
  const valid = (colors: unknown): colors is string[] => Array.isArray(colors)
    && colors.length === 5
    && colors.every((color) => typeof color === 'string' && /^#[0-9a-f]{6}$/.test(color));
  return operators.map((operator) => {
    const apply = (artwork: PaletteArtwork | null): PaletteArtwork | null => {
      if (!artwork) return null;
      const colors = overrides[artwork.image]?.colors;
      return valid(colors) ? { ...artwork, colors } : artwork;
    };
    return { ...operator, base: apply(operator.base), elite2: apply(operator.elite2) };
  });
}
