import index from '@/data/public-asset-index.json';

// Generated from this checkout by next.config.js before build/dev compilation.
// Keep URL resolution independent of artwork being present in a server function.
const files = new Set<string>(index.files);
const hashes = index.hashes as Record<string, string>;
const folders = new Map<string, string[]>();
for (const file of files) {
  const split = file.lastIndexOf('/');
  const folder = split < 0 ? '' : file.slice(0, split);
  const names = folders.get(folder) ?? [];
  names.push(file.slice(split + 1));
  folders.set(folder, names);
}
const relative = (value: string) => value.replace(/^\/+|\/+$/g, '');
export function publicFiles(folder: string): string[] { return [...(folders.get(relative(folder)) ?? [])]; }
export function publicFileExists(file: string): boolean { return files.has(relative(file)); }
export function publicFileVersion(file: string): string | undefined { return hashes[relative(file)]; }
