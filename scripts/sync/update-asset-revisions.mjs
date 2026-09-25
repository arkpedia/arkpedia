import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

// Resolve and validate the whole set before adopting it. Restore all three files
// on failure, so a failed validation does not leave a mixed manifest and lock.
const root = new URL('../../', import.meta.url);
const paths = ['data/assets/revisions.json', 'data/assets/external-asset-index.json', 'data/assets/public-asset-index.json'];
const previous = await Promise.all(paths.map(path => fs.readFile(new URL(path, root), 'utf8')));
const oldRevisions = JSON.parse(previous[0]);
const index = JSON.parse(previous[1]);
const next = {};
for (const repo of Object.keys(oldRevisions)) {
  const sha = execFileSync('gh', ['api', `repos/arkpedia/${repo}/commits/main`, '--jq', '.sha'], { encoding: 'utf8' }).trim();
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error(`Invalid revision for ${repo}`);
  next[repo] = sha;
}
const published = {};
for (const repo of ['arkpedia-image-assets', 'arkpedia-skin-assets']) {
  const response = await fetch(`https://raw.githubusercontent.com/arkpedia/${repo}/${next[repo]}/asset-manifest.json`, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Cannot load ${repo} manifest: ${response.status}`);
  const manifest = await response.json();
  for (const [path, row] of Object.entries(manifest.files)) {
    if (path.startsWith('originals/') || path.startsWith('variants/')) continue;
    if (!/^[a-f0-9]{64}$/.test(row.sha256) || row.bytes <= 0) throw new Error(`Invalid asset record: ${path}`);
    published[path] = row;
  }
}
const removed = index.files.filter(path => !published[path]);
if (removed.length) throw new Error(`Refusing to remove published paths: ${removed.slice(0, 20).join(', ')}`);
for (const path of Object.keys(index.hashes)) {
  if (index.sha256[path] !== published[path].sha256) index.hashes[path] = published[path].sha256.slice(0, 8);
}
index.files = Object.keys(published).sort();
index.sha256 = Object.fromEntries(index.files.map(path => [path, published[path].sha256]));
try {
  await fs.writeFile(new URL(paths[0], root), JSON.stringify(next, null, 2) + '\n');
  await fs.writeFile(new URL(paths[1], root), JSON.stringify(index) + '\n');
  execFileSync(process.execPath, ['scripts/build/build-public-asset-index.cjs'], { stdio: 'inherit' });
  // The asset files at the new pins. Not the voice lines: the voices stage, which runs after
  // this one, rebuilds them against these pins; the Validate step's check:published-assets
  // checks the result.
  execFileSync(process.execPath, ['scripts/audits/check-published-assets.mjs'], { stdio: 'inherit' });
} catch (error) {
  await Promise.all(paths.map((path, i) => fs.writeFile(new URL(path, root), previous[i])));
  throw error;
}
console.log('Asset revisions and availability indexes updated and checked. Review the diff before merging; revert these files together to roll back.');
