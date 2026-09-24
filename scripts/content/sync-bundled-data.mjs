/**
 * Brings named paths of the bundled data/ and public/*.json in line with the canonical
 * records in arkpedia-data, read from a git ref of a checkout (origin/main by default).
 *
 * The bundle is only the fallback: Check, the browser specs and any build with
 * ARKPEDIA_CONTENT_DISABLED=1 read it. The daily release refreshes arkpedia-data and
 * never this repository, so the bundle falls behind, and a test written against content
 * a release added fails here and nowhere else. tests/browser/enemy-stage-ui.spec.ts
 * looking for 'People, A People' failed on main that way. hydrate-source.mjs replaces the
 * whole tree, as the release job does; this moves only the paths named, so the diff
 * stays small enough to review.
 *
 *   node scripts/content/sync-bundled-data.mjs <arkpedia-data checkout> [--ref <ref>] [--check] <path>...
 *
 * A path is a file or a directory under data/, or a file under public/, as it appears
 * under source/. A directory is mirrored, so a record the ref no longer has is removed
 * here too. --check writes nothing and exits 1 when a named path differs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const git = (checkout, args, encoding = 'utf8') => execFileSync('git', ['-C', checkout, ...args], { encoding, maxBuffer: 1 << 30 });
const walk = dir => !fs.existsSync(dir) ? [] : fs.readdirSync(dir, { withFileTypes: true })
  .flatMap(entry => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);

/** What syncing `paths` from `ref` would change under `root`; applied unless `check`. */
export function syncBundledData({ checkout, ref = 'origin/main', paths, root = process.cwd(), check = false }) {
  if (!paths.length) throw new Error('Name at least one path under data/ or public/');
  const changed = [], removed = [];
  for (const wanted of paths.map(p => p.replace(/\/+$/, ''))) {
    if (!/^(data\/.+|public\/[^/]+\.json)$/.test(wanted) || wanted.split('/').some(part => part === '..' || part === '.')) {
      throw new Error(`Not a bundled data path: ${wanted}`);
    }
    const listed = git(checkout, ['ls-tree', '-r', '-z', '--name-only', ref, '--', `source/${wanted}`]).split('\0').filter(Boolean);
    if (!listed.length) throw new Error(`${ref} has nothing at source/${wanted}`);
    const incoming = new Set(listed.map(file => file.slice('source/'.length)));
    for (const file of incoming) {
      const bytes = git(checkout, ['show', `${ref}:source/${file}`], 'buffer');
      const at = path.join(root, file);
      if (fs.existsSync(at) && Buffer.compare(fs.readFileSync(at), bytes) === 0) continue;
      changed.push(file);
      if (!check) { fs.mkdirSync(path.dirname(at), { recursive: true }); fs.writeFileSync(at, bytes); }
    }
    // A directory is mirrored; a single file has nothing beside it to remove. Only the
    // records hydrate-source.mjs would delete go: data/README.md and the raw poll
    // results were never published, so the ref cannot vouch for their absence.
    const local = path.join(root, wanted);
    if (fs.existsSync(local) && fs.statSync(local).isDirectory()) {
      for (const at of walk(local)) {
        const file = path.relative(root, at).split(path.sep).join('/');
        if (incoming.has(file) || !/\.(json|lrc)$/.test(file) || file.includes('final-poll-results')) continue;
        removed.push(file);
        if (!check) fs.unlinkSync(at);
      }
    }
  }
  return { changed: changed.sort(), removed: removed.sort() };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const take = flag => { const at = args.indexOf(flag); return at < 0 ? undefined : args.splice(at, 2)[1]; };
  const ref = take('--ref');
  const check = args.includes('--check');
  const [checkout, ...paths] = args.filter(arg => arg !== '--check');
  if (!checkout) throw new Error('Usage: sync-bundled-data.mjs <arkpedia-data checkout> [--ref <ref>] [--check] <path>...');
  const { changed, removed } = syncBundledData({ checkout, ref, paths, check });
  for (const file of changed) console.log(`${check ? 'differs' : 'updated'}: ${file}`);
  for (const file of removed) console.log(`${check ? 'not in the ref' : 'removed'}: ${file}`);
  console.log(`${changed.length + removed.length} bundled file(s) ${check ? 'differ from' : 'brought in line with'} ${ref ?? 'origin/main'}.`);
  if (check && changed.length + removed.length) process.exit(1);
}
