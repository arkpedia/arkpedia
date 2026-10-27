import revisions from '@/data/assets/revisions.json';
import { assetUrl } from './assetUrl';

/** Keep every deployment on a coherent, reviewable set of public assets.
 * Resolves raw `main` records through the bundled pins and preserves explicit
 * animation commits when converting their source addresses to public R2 delivery. */
export function pinAssetUrl(url: string): string {
  const match = url.match(/^https:\/\/raw\.githubusercontent\.com\/arkpedia\/([^/]+)\/(main|[a-f0-9]{40})\/(.+)$/);
  if (!match) return url;
  const [, repository, ref, path] = match;
  if (ref !== 'main' && !Object.hasOwn(revisions, repository) && !['arkpedia-sd-assets', 'arkpedia-l2d-assets'].includes(repository)) return url;
  const revision = ref === 'main' ? revisions[repository as keyof typeof revisions] : ref;
  if (!revision) throw new Error(`Missing asset revision: ${repository}`);
  return assetUrl(repository, revision, path);
}
