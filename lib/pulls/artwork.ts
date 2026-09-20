/** Catalogue artwork is stored as raw public-file paths. Encode each filename
 * segment: production Next routing rejects unescaped brackets, and # or ? would
 * otherwise be interpreted as URL syntax rather than part of a filename. */
export function pullArtworkUrl(path: string | null): string | null {
  if (!path || !path.startsWith('/') || path.startsWith('//')) return path;
  return path.split('/').map(segment => encodeURIComponent(segment)).join('/');
}
