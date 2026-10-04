/**
 * config/asset-folders.json against what each asset repository actually publishes.
 *
 * lib/content/urls.ts and next.config.js both map a root-relative /<folder>/... path to a
 * repository by that list. A folder a repository gains that the list lacks passes through
 * unmapped -- a 404, or the deploy's own copy -- and a folder listed under the wrong
 * repository asks the wrong one. The lists used to be typed out twice, with nothing tying
 * them to each other or to the repositories.
 */

/** Paths each repository publishes that no /<folder>/ route serves directly. */
const UNROUTED = new Set(['originals', 'variants']);

/** The top-level folders a repository's asset-manifest.json lists, as the site routes them. */
export function manifestFolders(manifest) {
  return [...new Set(Object.keys(manifest?.files ?? {}).filter(file => file.includes('/')).map(file => file.split('/')[0]))]
    .filter(folder => !UNROUTED.has(folder)).sort();
}

/** One line per disagreement between the config and the manifests ({ repository: manifest }). */
export function folderDrift(config, manifests) {
  const { unmapped, missing } = folderDriftByKind(config, manifests);
  return [...unmapped.map(row => row.problem), ...missing];
}

/*
 * The two kinds apart. `missing`, a folder the config maps that the repository does not
 * publish, breaks every page that links into it. `unmapped`, a folder the repository publishes
 * that the config does not map, links nowhere yet: no page of this code asks for it. The image
 * repositories are shared by main and dev, so a folder whose mapping went to dev first is
 * unmapped on main, and on 2026-10-02 that alone (story-map/) failed main's content release
 * two nights running. The release job quarantines an unmapped folder instead
 * (check-published-assets.mjs --quarantine); a missing one still fails it.
 */
export function folderDriftByKind(config, manifests) {
  const unmapped = [], missing = [];
  for (const [repository, manifest] of Object.entries(manifests)) {
    const listed = new Set(config[repository] ?? []);
    const published = manifestFolders(manifest);
    for (const folder of published) if (!listed.has(folder)) unmapped.push({ repository, folder, problem: `${repository} publishes ${folder}/, which config/asset-folders.json does not map` });
    for (const folder of listed) if (!published.includes(folder)) missing.push(`config/asset-folders.json maps ${folder}/ to ${repository}, which publishes no such folder`);
  }
  return { unmapped, missing };
}
