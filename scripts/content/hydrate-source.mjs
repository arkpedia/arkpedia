import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(process.argv[2] || '');
if (!process.argv[2] || root === process.cwd()) throw new Error('Specify a separate data repository checkout');
const source = path.join(root, 'source');
const deprecatedSourceFiles = new Set([
  'data/events.json',
  'data/operator-release-overrides.json',
]);
// Game tables this app introduced before arkpedia-data carried them: the browser code
// that used to compile them in now reads them from the release (lib/content/tables.mjs).
// While the data repository lacks one, the app's own copy is kept rather than deleted,
// so the export can still read it; that export then publishes it into source/ like
// every other record, and from the next run on the data repository's copy wins. Edit
// them in arkpedia-data once they are there.
const SEEDED_SOURCE_FILES = new Set([
  'data/base-group-rosters.json',
  'data/base-skill-slots.json',
  'data/farming-tiers.json',
]);
function walk(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  if (entry.isSymbolicLink()) throw new Error(`Source symlink: ${entry.name}`);
  const file = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(file) : [file];
}); }
/** An LRC is timestamped plain text. Parsing it here keeps the source tree to records
 * the site can actually read, the way JSON.parse does for everything else. */
function assertLyric(relative, bytes) {
  const text = bytes.toString('utf8');
  if (Buffer.compare(Buffer.from(text, 'utf8'), bytes) !== 0) throw new Error(`Lyric file is not UTF-8: ${relative}`);
  if (bytes.length > 256_000) throw new Error(`Lyric file too large: ${relative}`);
  const lines = text.split(/\r?\n/).filter(line => line.trim());
  if (!lines.length) throw new Error(`Empty lyric file: ${relative}`);
  // A file with no timestamps parses to zero lines, so its song shows no lyrics at
  // all. That is a content defect rather than a pipeline one -- refusing the whole
  // release over it would block every other record -- so it is counted and named.
  if (!lines.some(line => /^\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]/.test(line))) untimestamped.push(relative);
}

const untimestamped = [];
const incoming = new Map();
for (const file of walk(source)) {
  const relative = path.relative(source, file);
  // Lyrics are authored by hand in LRC, the format a lyric editor writes, so they
  // are the one non-JSON record the pipeline carries. Everything else stays JSON.
  const lyric = /^data\/lyrics\/[^/]+\.lrc$/.test(relative);
  // Segment-wise, not a substring search: "Best_Moments_of..._lyrics.lrc" is a real
  // filename and contains "..", so `includes('..')` rejected a legitimate record.
  // Only a path SEGMENT that is "." or ".." can escape the tree.
  const escapes = relative.split('/').some(part => !part || part === '.' || part === '..');
  if (!(lyric || /^(data\/.*|public\/[^/]+)\.json$/.test(relative)) || escapes || relative.includes('\\')) throw new Error(`Invalid source file: ${relative}`);
  // Old public releases can still contain retired fallback records. Never
  // hydrate them back into the canonical source tree; the next publication
  // consequently removes them from arkpedia-data as well.
  if (deprecatedSourceFiles.has(relative)) continue;
  const bytes = fs.readFileSync(file);
  if (lyric) assertLyric(relative, bytes); else JSON.parse(bytes);
  incoming.set(relative, bytes);
}
for (const required of ['data/headhunting_banners.json', 'data/skins.json', 'data/assets/revisions.json', 'public/stages-index.json']) {
  if (!incoming.has(required)) throw new Error(`Missing required source: ${required}`);
}
if (incoming.size < 1000) throw new Error('Incomplete source snapshot');
// Work only in the disposable CI checkout. Deleted game records must not survive
// silently in the bundled fallback and reappear in the next generated release.
const seeded = [];
for (const file of walk('data').filter(file => (file.endsWith('.json') || file.endsWith('.lrc')) && !file.includes('final-poll-results'))) {
  if (incoming.has(file)) continue;
  if (SEEDED_SOURCE_FILES.has(file)) { seeded.push(file); continue; }
  fs.unlinkSync(file);
}
for (const [file, bytes] of incoming) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes);
}
if (seeded.length) console.warn(`arkpedia-data does not carry ${seeded.join(', ')} yet; this release publishes the app's copy.`);
if (untimestamped.length) console.warn(`${untimestamped.length} lyric file(s) have no timestamps and will render no lyrics: ${untimestamped.join(', ')}`);
console.log(`Loaded ${incoming.size} public source records.`);
