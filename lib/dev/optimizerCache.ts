import fs from 'node:fs';
import path from 'node:path';

type Kind = 'operator' | 'whole-base';
const LEGACY_FILES: Record<Kind, string> = {
  operator: 'optimizer-results.json',
  'whole-base': 'whole-base-optimizer-results.json',
};

function cacheFile(kind: Kind): string {
  if (!Object.hasOwn(LEGACY_FILES, kind)) throw new Error('Unknown optimizer cache');
  return path.join(process.cwd(), '.cache', 'optimizers', `${kind}.json`);
}

export function writeOptimizerCache(kind: Kind, value: unknown): void {
  const file = cacheFile(kind);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak`);
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function readOptimizerCache(kind: Kind): unknown {
  const file = cacheFile(kind);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  // Preserve a developer's old local calculation. New files are written only to
  // .cache; the ignored legacy copy is left intact for review rather than deleted.
  const legacy = path.join(process.cwd(), 'data', LEGACY_FILES[kind]);
  const value: unknown = JSON.parse(fs.readFileSync(legacy, 'utf8'));
  writeOptimizerCache(kind, value);
  return value;
}
