import cdn from '@/config/asset-delivery.json';

/**
 * The one place a published asset's address is built. `path` is the repository
 * path, already URL-encoded by the caller where it needs to be -- filenames here
 * carry spaces, apostrophes and Greek letters, and Next's redirect `:path*` and
 * encodeURIComponent disagree about which to touch, so this does not re-encode.
 */
export function assetUrl(repository: string, revision: string, path: string): string {
  return cdn.template.replace('{repository}', repository).replace('{revision}', revision).replace('{path}', path);
}
