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
 * illustration wherever each exists. Full artwork defines the selectable
 * appearances; icon-only aliases must not create a gallery choice that opens
 * onto an empty panel (Amiya's alternate-form promotion icons are one such
 * upstream alias).
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
      /* Every selected label has full artwork. Warn when its matching thumbnail
         is missing because that still leaves a blank selector and usually means
         a near-miss in one of the filenames. */
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
