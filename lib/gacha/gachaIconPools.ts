import fs from 'fs';
import path from 'path';
import { GachaItem } from './gachaTypes';

const FOLDERS: Record<'six' | 'five' | 'four' | 'three', string> = {
  six: 'six-star-icons',
  five: 'five-star-icons',
  four: 'four-star-icons',
  three: 'three-star-icons',
};

function readFolder(folderName: string): GachaItem[] {
  const dir = path.join(process.cwd(), 'public', folderName);
  let files: string[] = [];
  try {
    files = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return files
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
 * Reads all four rarity icon folders. Server-only (uses fs) -- call this
 * from getStaticProps only, never import it into client-rendered
 * component code directly, or the build will fail trying to bundle `fs`
 * for the browser.
 */
export function getGachaIconPools(): GachaIconPools {
  return {
    six: readFolder(FOLDERS.six),
    five: readFolder(FOLDERS.five),
    four: readFolder(FOLDERS.four),
    three: readFolder(FOLDERS.three),
  };
}