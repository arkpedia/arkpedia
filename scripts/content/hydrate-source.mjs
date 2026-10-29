import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(process.argv[2] || '');
if (!process.argv[2] || root === process.cwd()) throw new Error('Specify a separate data repository checkout');
const source = path.join(root, 'source');
const deprecatedSourceFiles = new Set([
  'data/events.json',
  // Local optimizer calculations belong only in .cache/optimizers.
  'data/optimizer-results.json',
  'data/whole-base-optimizer-results.json',
  'data/operator-release-overrides.json',
  // Always '{}' and read by nothing: lyrics are published one file per song
  // (writeLyricsFilesToPublic in lib/music/albumsDataServer.ts).
  'public/lyrics-index.json',
  // A scrape of arknights.wiki.gg (1,784 stages, 8,947 wiki URLs) nothing rewrote after it
  // was committed. Its last reader, build-supply-stages.mjs, reads the stage records.
  'data/stages.json',
  // The stage list of the pages before the stage pipeline, with '/covers-webp\\main/...'
  // paths nothing serves. Read by nothing.
  'data/stage_index.json',
  // The wiki-file sha1s of scripts/sync/sync-banner-art.py, retired: arkpedia-image-assets
  // swaps in the English banner art, and pinned asset URLs version it.
  'data/assets/banner_art_sources.json',
  // The ledger of the hand-kept list of tables the app held before arkpedia-data did. The app
  // keeps no records any more (scripts/content/pull-data.mjs), so the list and its ledger went.
  'data/seeded-source-files.json',
]);
// Whole retired folders, as a path prefix ending in '/'. data/events-data/ is 71 per-event
// files of wiki.gg icon URLs and map paths under /events-stage-maps/, which nothing serves
// and nothing reads.
const deprecatedSourceFolders = ['data/events-data/'];
const deprecated = relative => deprecatedSourceFiles.has(relative) || deprecatedSourceFolders.some(prefix => relative.startsWith(prefix));
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
  if (deprecated(relative)) continue;
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
// The app keeps no records of its own (scripts/content/pull-data.mjs), so everything under
// data/ that source/ lacks goes, and a fresh checkout with no data/ yet is fine.
for (const file of (fs.existsSync('data') ? walk('data') : []).filter(file => file.endsWith('.json') || file.endsWith('.lrc'))) {
  if (incoming.has(file)) continue;
  fs.unlinkSync(file);
}
for (const [file, bytes] of incoming) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes);
}
if (untimestamped.length) console.warn(`${untimestamped.length} lyric file(s) have no timestamps and will render no lyrics: ${untimestamped.join(', ')}`);
console.log(`Loaded ${incoming.size} public source records.`);
