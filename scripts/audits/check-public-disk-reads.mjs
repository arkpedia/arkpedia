/**
 * Fails when app code (lib/, pages/, components/) reads art from the local disk's public/.
 *
 * No machine that exports a content release has the art there (images under public/ are
 * git-ignored; the asset repositories publish them), so such a read finds nothing and the page
 * quietly ships without it: every event page's CG set did (lib/events/eventCg.ts, until it used
 * the asset index). Look art up with lib/assets/publicAssets.ts (publicFiles, publicFileExists)
 * or data/assets/external-asset-index.json instead. What counts is scripts/lib/public-disk-reads.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { artFoldersFrom, publicDiskReads } from '../lib/public-disk-reads.mjs';

const root = process.cwd();
/* Each a file whose public/ path is computed and is not art, with why. A file listed here is
   still flagged for a path that names an asset folder or an image. */
const COMPUTED_PATHS_ALLOWED = {
  'lib/music/albumsDataServer.ts': 'writes the generated lyrics JSON files (public/lyrics/, lyricsPath)',
  'lib/content/shippedTable.ts': 'reads the typed IS manifest and CC catalogue JSON at build time, with an ASSETS binding fallback on Workers; never reads artwork',
};

const artFolders = artFoldersFrom(JSON.parse(fs.readFileSync(path.join(root, 'config/asset-folders.json'), 'utf8')));
const problems = [];
function walk(dir) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const relative = `${dir}/${entry.name}`;
    if (entry.isDirectory()) { if (entry.name !== 'node_modules') walk(relative); continue; }
    if (!/\.(tsx?|jsx?|mjs|cjs)$/.test(entry.name) || /\.d\.m?ts$/.test(entry.name)) continue;
    for (const finding of publicDiskReads(fs.readFileSync(path.join(root, relative), 'utf8'), relative, artFolders)) {
      if (finding.kind === 'unknown' && COMPUTED_PATHS_ALLOWED[relative]) continue;
      problems.push(`${relative}:${finding.line} ${finding.kind === 'art' ? `reads art (${finding.folder ?? 'an image'}) from the local public/` : 'builds a computed path under the local public/'}: ${finding.code}`);
    }
  }
}
for (const dir of ['lib', 'pages', 'components']) walk(dir);
for (const relative of Object.keys(COMPUTED_PATHS_ALLOWED)) {
  if (!fs.existsSync(path.join(root, relative))) problems.push(`${relative} is allowed a computed public/ path but no longer exists: drop it from COMPUTED_PATHS_ALLOWED`);
}

if (problems.length) {
  console.error(`${problems.length} local public/ read(s) that no content export can satisfy:\n${problems.map((p) => `  ${p}`).join('\n')}`);
  console.error('Art is not on disk where a release is exported. Use lib/assets/publicAssets.ts (publicFiles, publicFileExists) or data/assets/external-asset-index.json.');
  process.exit(1);
}
console.log('App code reads no art from the local public/ folder.');
