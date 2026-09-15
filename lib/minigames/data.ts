import { publicFileExists } from '@/lib/assets/publicAssets';
import { getAllOperators } from '@/lib/operators/operators';
import { parseDate } from '@/lib/operators/operatorReleaseDates';
import { Operator } from '@/lib/operators/operatorTypes';
import { GameOperator, PaletteArtwork, PaletteOperator } from './logic';
import palettes from '@/data/color-palettes.json';

const WORDS = ['', 'one', 'two', 'three', 'four', 'five', 'six'];

function releasedOperators(now = new Date()): Operator[] {
  return getAllOperators().filter((operator) => {
    const release = parseDate(operator.characterInfo?.['Release Date'] || '');
    return !operator.isFuture && Boolean(release && release <= now);
  });
}
function toGameOperator(operator: Operator): GameOperator {
  return {
    name: operator.name,
    aliases: [...new Set(Object.values(operator.otherLanguages || {}).filter((value) => value && value !== 'N/A'))],
  };
}

export function getPaletteOperators(now = new Date()): PaletteOperator[] {
  const artworks = palettes.artworks as Record<string, { colors: string[] }>;
  return releasedOperators(now).map((operator) => {
    function art(label: 'Base' | 'Elite 2'): PaletteArtwork | null {
      if (!operator.rarity || (label === 'Elite 2' && operator.rarity < 4)) return null;
      const safeName = operator.name.replace(/[\\/*?:"<>|]/g, '').trim();
      const image = `/${WORDS[operator.rarity]}-star-skins/${safeName} - ${label}.webp`;
      const palette = artworks[image];
      if (!palette || !publicFileExists(image)) return null;
      return { image, colors: palette.colors };
    }
    return { ...toGameOperator(operator), rarity: operator.rarity, class: operator.class, base: art('Base'), elite2: art('Elite 2') };
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
