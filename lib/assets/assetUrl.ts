import cdn from '@/config/asset-delivery.json';

/**
 * The one place a published asset's address is built. `path` is the repository
 * path, already URL-encoded by the caller -- filenames here carry spaces,
 * apostrophes and Greek letters, and Next's redirect `:path*` and
 * encodeURIComponent disagree about which to touch, so this does not re-encode.
 * contentUrl() hands it encodeAssetPath()'s output; a voice template keeps its
 * `{voiceId}` placeholders because nothing encodes it here.
 */
export function assetUrl(repository: string, revision: string, path: string): string {
  return cdn.template.replace('{repository}', repository).replace('{revision}', revision).replace('{path}', path);
}

/** An image or skin asset addressed in full, at a commit or at `main`. */
export const PINNED_ART = /^https:\/\/raw\.githubusercontent\.com\/arkpedia\/(arkpedia-(?:image|skin)-assets)\/(?:main|[a-f0-9]{40})\/(.+)$/;

/** A trailing cache-buster, as publishedArt() appends it: `?v=` after a plain path,
 * `&v=` after one that already held a `?`. */
const CACHE_BUSTER = /[?&]v=[A-Za-z0-9]+$/;

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment; // a literal '%' that is not an escape
  }
}

/**
 * A repository path as the path of a URL, encoded exactly once.
 *
 * Records name art by its filename, and filenames here carry every character a URL
 * treats as syntax: 'Kernel Locating #10 (Global).webp' was requested as
 * '.../Kernel%20Locating%20' because the browser read the rest as a fragment, and
 * 'Franka - Rainforest, Me, Rainbow' split a srcset at its commas. Some callers pass
 * the raw name and some an encodeURIComponent'd one ('Amiya%20-%20Base'), so each
 * segment is decoded first and encoded again: the same URL either way, never
 * double-encoded. No published filename holds a literal '%' escape
 * (test-asset-url-encoding), so decoding cannot misread one. The cache-buster stays
 * a query.
 */
export function encodeAssetPath(path: string): string {
  const version = path.match(CACHE_BUSTER)?.[0] ?? '';
  const file = version ? path.slice(0, -version.length) : path;
  const encoded = file.split('/').map((segment) => encodeURIComponent(decodeSegment(segment))).join('/');
  return version ? `${encoded}?${version.slice(1)}` : encoded;
}
