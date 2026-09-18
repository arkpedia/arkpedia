import revisions from '@/data/assets/revisions.json';
import { assetUrl } from './assetUrl';

/** Keep every deployment on a coherent, reviewable set of public assets.
 * Accepts the repository's raw `main` address as stored in records and code, and
 * returns the pinned delivery address readers should load. */
export function pinAssetUrl(url: string): string {
  const match = url.match(/^https:\/\/raw\.githubusercontent\.com\/arkpedia\/([^/]+)\/main\/(.+)$/);
  if (!match) return url;
  const [, repository, path] = match;
  const revision = revisions[repository as keyof typeof revisions];
  if (!revision) throw new Error(`Missing asset revision: ${repository}`);
  return assetUrl(repository, revision, path);
}
