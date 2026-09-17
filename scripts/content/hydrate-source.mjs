import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(process.argv[2] || '');
if (!process.argv[2] || root === process.cwd()) throw new Error('Specify a separate data repository checkout');
const source = path.join(root, 'source');
const deprecatedSourceFiles = new Set([
  'data/events.json',
  'data/operator-release-overrides.json',
]);
function walk(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  if (entry.isSymbolicLink()) throw new Error(`Source symlink: ${entry.name}`);
  const file = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(file) : [file];
}); }
const incoming = new Map();
for (const file of walk(source)) {
  const relative = path.relative(source, file);
  if (!/^(data\/.*|public\/[^/]+)\.json$/.test(relative) || relative.includes('..') || relative.includes('\\')) throw new Error(`Invalid source file: ${relative}`);
  // Old public releases can still contain retired fallback records. Never
  // hydrate them back into the canonical source tree; the next publication
  // consequently removes them from arkpedia-data as well.
  if (deprecatedSourceFiles.has(relative)) continue;
  const bytes = fs.readFileSync(file);
  JSON.parse(bytes);
  incoming.set(relative, bytes);
}
for (const required of ['data/headhunting_banners.json', 'data/skins.json', 'data/assets/revisions.json', 'public/stages-index.json']) {
  if (!incoming.has(required)) throw new Error(`Missing required source: ${required}`);
}
if (incoming.size < 1000) throw new Error('Incomplete source snapshot');
// Work only in the disposable CI checkout. Deleted game records must not survive
// silently in the bundled fallback and reappear in the next generated release.
for (const file of walk('data').filter(file => file.endsWith('.json') && !file.includes('final-poll-results'))) {
  if (!incoming.has(file)) fs.unlinkSync(file);
}
for (const [file, bytes] of incoming) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes);
}
console.log(`Loaded ${incoming.size} public source records.`);
