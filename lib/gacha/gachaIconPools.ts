import { GachaItem } from './gachaTypes';
import { publicFiles } from '@/lib/assets/publicAssets';

const FOLDERS: Record<'six' | 'five' | 'four' | 'three', string> = {
  six: 'six-star-icons',
  five: 'five-star-icons',
  four: 'four-star-icons',
  three: 'three-star-icons',
};

function readFolder(folderName: string): GachaItem[] {
  return publicFiles(folderName)
    .filter((f) => f.toLowerCase().endsWith('.webp') && / - Base\.webp$/i.test(f))
    .map((f) => {
      const name = f.replace(/ - Base\.webp$/i, '');
      return { name, icon: `/${folderName}/${f}` };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface GachaIconPools {
  six: GachaItem[];
  five: GachaItem[];
  four: GachaItem[];
  three: GachaItem[];
}

/**
 * Reads all four rarity icon inventories from the generated public asset
 * index. The real files live in the shared GitHub repository and therefore
 * must never be discovered by reading this checkout's public directory.
 */
export function getGachaIconPools(): GachaIconPools {
  return {
    six: readFolder(FOLDERS.six),
    five: readFolder(FOLDERS.five),
    four: readFolder(FOLDERS.four),
    three: readFolder(FOLDERS.three),
  };
}
