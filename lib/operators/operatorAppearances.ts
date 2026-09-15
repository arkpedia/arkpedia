import { Operator } from './operatorTypes';
import { publicFiles } from '@/lib/assets/publicAssets';

const RARITY_WORDS: Record<number, string> = {
  6: 'six', 5: 'five', 4: 'four', 3: 'three', 2: 'two', 1: 'one',
};

export interface Appearance {
  label: string;
  iconPath: string | null;
  fullPath: string | null;
}

function readFolder(dir: string): string[] {
  return publicFiles(dir);
}

function sortKey(label: string): [number, number, string] {
  // Base always first, then Elite N in numeric order, then everything
  // else (skins) alphabetically after those.
  if (label.toLowerCase() === 'base') return [0, 0, label];
  const eliteMatch = label.match(/^elite\s*(\d+)$/i);
  if (eliteMatch) return [1, parseInt(eliteMatch[1], 10), label];
  return [2, 0, label];
}

/**
 * Returns this operator's appearances (Base, Elite N, skins) in
 * display order, with paths to both the small icon and the full
 * illustration wherever each exists. Reads directly off the icon/skin
 * folders rather than the operator's own JSON, since the actual image
 * files are the source of truth for what appearances are available.
 */
export function getOperatorAppearances(operator: Pick<Operator, 'name' | 'rarity'>): Appearance[] {
  if (!operator.rarity) return [];
  const word = RARITY_WORDS[operator.rarity];
  if (!word) return [];

  const iconDir = `${word}-star-icons`;
  const skinDir = `${word}-star-skins`;
  const iconFiles = readFolder(iconDir);
  const skinFiles = readFolder(skinDir);

  const prefix = `${operator.name} - `;
  const labels = new Set<string>();

  for (const f of iconFiles) {
    if (f.startsWith(prefix) && f.toLowerCase().endsWith('.webp')) {
      labels.add(f.slice(prefix.length, -'.webp'.length));
    }
  }
  for (const f of skinFiles) {
    if (f.startsWith(prefix) && f.toLowerCase().endsWith('.webp')) {
      labels.add(f.slice(prefix.length, -'.webp'.length));
    }
  }

  const iconFileSet = new Set(iconFiles);
  const skinFileSet = new Set(skinFiles);

  return Array.from(labels)
    .sort((a, b) => {
      const ka = sortKey(a);
      const kb = sortKey(b);
      if (ka[0] !== kb[0]) return ka[0] - kb[0];
      if (ka[1] !== kb[1]) return ka[1] - kb[1];
      return ka[2].localeCompare(kb[2]);
    })
    .map((label) => {
      const filename = `${operator.name} - ${label}.webp`;
      const iconPath = iconFileSet.has(filename) ? `/${iconDir}/${encodeURIComponent(filename)}` : null;
      const fullPath = skinFileSet.has(filename) ? `/${skinDir}/${encodeURIComponent(filename)}` : null;
      /* A label is collected if EITHER folder has it, so a filename misspelt in one of
         them produces an appearance with half its images: a card the reader can click
         with nothing to show. It happened eight times, and the spellings were near
         enough to read past -- "Species Planatarum" against "Species Plantarum",
         "Boundless Soil" against "Boundless Sail", "Default" and "Basic" where every
         other operator says "Base".
         Warned rather than thrown: a genuinely icon-only or art-only appearance is
         possible, and failing the build over one would be worse than a gap. Reported
         once per case, with both folders named, so the fix is a rename. */
      if (!iconPath || !fullPath) {
        const missing = !iconPath ? iconDir : skinDir;
        const has = !iconPath ? skinDir : iconDir;
        console.warn(
          `[appearances] "${filename}" is in ${has}/ but not ${missing}/ -- `
          + `${operator.name}'s "${label}" will render with a gap. Check the spelling in both folders.`,
        );
      }
      return { label, iconPath, fullPath };
    });
}
