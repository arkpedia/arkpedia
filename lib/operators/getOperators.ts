import fs from 'fs';
import path from 'path';
import { Operator } from '../survey/types';

const ICONS_DIR = path.join(process.cwd(), 'public', 'operator_icons');

/**
 * Reads public/operator_icons/ and builds the operator list from whatever
 * PNG files are present. Drop a new "OperatorName.png" in that folder and
 * it will automatically show up in the form on the next build/dev reload --
 * no code changes needed.
 */
export function getOperators(): Operator[] {
  let files: string[] = [];
  try {
    files = fs.readdirSync(ICONS_DIR);
  } catch {
    return [];
  }

  return files
    .filter((f) => f.toLowerCase().endsWith('.png'))
    .map((f) => ({
      name: f.replace(/\.png$/i, ''),
      icon: `/operator_icons/${f}`,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
