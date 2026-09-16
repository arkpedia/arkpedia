import revisions from '@/data/assets/revisions.json';

/** Keep every deployment on a coherent, reviewable set of public assets. */
export function pinAssetUrl(url: string): string {
  return url.replace(/^(https:\/\/raw\.githubusercontent\.com\/arkpedia\/)([^/]+)\/main\//, (match, root: string, repository: string) => {
    const revision = revisions[repository as keyof typeof revisions];
    if (!revision) throw new Error(`Missing asset revision: ${repository}`);
    return `${root}${repository}/${revision}/`;
  });
}
