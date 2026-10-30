import { assertCompleteness } from './check-completeness.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { contentInput, releaseInput, SCHEMA } from './release-input.mjs';
import { codeFingerprint } from './code-fingerprint.mjs';
import { recordFiles } from './records.mjs';

const args = process.argv.slice(2);
// CI validates the checked-in snapshot; publication still records the latest holds by default.
const checkOnly = args.includes('--check');
const { quarantineSnapshot } = assertCompleteness(process.cwd(), { persistQuarantine: !checkOnly });
const privateQuarantine = checkOnly ? quarantineSnapshot : null;

const destination = path.resolve(args.find(arg => !arg.startsWith('--')) || '.cache/content-export');
const release = path.join(destination, 'release');
const source = path.join(destination, 'source');
const routes = JSON.parse(fs.readFileSync('scripts/content/pages.json', 'utf8'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
// The records on disk (scripts/content/records.mjs): pulled from arkpedia-data, then refreshed.
const tracked = recordFiles();
const quarantineFile = 'data/quarantine.json';
if (privateQuarantine !== null && !tracked.includes(quarantineFile)) tracked.push(quarantineFile);
// Publish game records only. No application source, environment files, or raw user responses.
// Lyrics are authored by hand in LRC and are the one non-JSON record published.
const isLyric = file => /^data\/lyrics\/[^/]+\.lrc$/.test(file);
const sourceFiles = tracked.filter(file => (fs.existsSync(file) || file === quarantineFile && privateQuarantine !== null)
  && file !== 'public/operator-search.json'
  && file !== 'data/selector-catalogue.json' // derived deploy fallback; page export builds from hydrated source records
  && (isLyric(file) || (file.endsWith('.json') && (file.startsWith('data/') || /^public\/[^/]+\.json$/.test(file)))));
const sourceHashes = {};
fs.rmSync(source, { recursive: true, force: true });
for (const file of sourceFiles.sort()) {
  // Capture the same current holds publication would record, only inside the private export in Check mode.
  const bytes = file === quarantineFile && privateQuarantine !== null ? Buffer.from(privateQuarantine) : fs.readFileSync(file);
  if (!isLyric(file)) JSON.parse(bytes);
  if (/-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}/.test(bytes.toString())) throw new Error(`Credential-like content in ${file}`);
  const out = path.join(source, file);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, bytes);
  sourceHashes[file] = sha(bytes);
}
const generator = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
// The generator's code, less docs (code-fingerprint.mjs): the publish step holds the release
// until production serves a build with the same one (deploy-gate.mjs). Not part of the
// release id, which the generator commit already fixes.
const generatorCode = codeFingerprint(generator);
const schema = SCHEMA;
const input = releaseInput({ generator, sourceHashes });
const previous = fs.existsSync(path.join(release, 'manifest.json')) ? JSON.parse(fs.readFileSync(path.join(release, 'manifest.json'), 'utf8')) : null;
if (previous?.release === input && !process.argv.includes('--force')) {
  console.log('Content inputs unchanged; existing release retained.');
  process.exit(0);
}
fs.rmSync(release, { recursive: true, force: true });
fs.mkdirSync(release, { recursive: true });
const env = { ...process.env, NODE_ENV: 'production', ARKPEDIA_EXPORT_CONTENT: '1' };
// A removed operator must not leave an obsolete planner payload behind.
fs.rmSync('public/planner-data', { recursive: true, force: true });
// The public JSON these write is published with the pages, so they run under the same clock
// guard as the page builders (export-build.mjs, KNOWN_BUILD_CLOCK_READS in export-clock.mjs).
for (const script of [
  ['scripts/build/serve-profile-avatars.mjs'],
  ['scripts/build/build-enemy-details.mjs'],
  ['scripts/build/build-stage-details.ts', '--force'],
  ['scripts/build/build-stage-guesser.ts'],
  ['scripts/build/build-operator-search.ts'],
  ['scripts/build/build-music-catalogue.ts'],
  // After the stage and enemy builders: it indexes the files they write.
  ['scripts/build/build-site-search.ts'],
]) execFileSync('node', ['node_modules/tsx/dist/cli.mjs', 'scripts/content/export-build.mjs', ...script], { env, stdio: 'inherit' });

let cursor = 0;
async function worker() {
  while (cursor < routes.length) {
    const route = routes[cursor++];
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['scripts/content/export-worker.mjs', route, release], { env, stdio: 'inherit' });
      child.on('error', reject);
      child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${route} export exited ${code}`)));
    });
  }
}
await Promise.all([worker(), worker()]);
const pages = {};
for (const name of fs.readdirSync(release).filter(name => name.startsWith('entries-'))) {
  Object.assign(pages, JSON.parse(fs.readFileSync(path.join(release, name), 'utf8')));
  fs.unlinkSync(path.join(release, name));
}
function walk(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]); }
const files = {};
const publicFiles = walk('public').filter(file => /^public\/(?:stage-detail|enemy-detail|planner-data|stage-guesser|lyrics)\/.+\.json$/.test(file)
  || /^public\/(?:stages-index|enemies-index|operator-deploy|operator-search|music-catalogue|medal-catalogue|profile-avatars|site-search)\.json$/.test(file));
for (const file of publicFiles.sort()) {
  const bytes = fs.readFileSync(file);
  JSON.parse(bytes);
  fs.mkdirSync(path.dirname(path.join(release, file)), { recursive: true });
  fs.writeFileSync(path.join(release, file), bytes);
  files[file.slice('public/'.length)] = { path: file, bytes: bytes.length, sha256: sha(bytes) };
}
// What the release says, which the publish step compares (release-input.mjs): the sources less
// the run's own records, and the pages and public files just written. Not the generator, so a
// code change that alters no page publishes nothing.
const content = contentInput({ sourceHashes, pages, files });
const manifest = { schema, release: input, content, generator, codeFingerprint: generatorCode, generatedAt: new Date().toISOString(),
  assets: JSON.parse(fs.readFileSync('data/assets/revisions.json', 'utf8')), sourceHashes,
  pages: Object.fromEntries(Object.entries(pages).sort(([a], [b]) => a.localeCompare(b))), files };
fs.writeFileSync(path.join(release, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Content release ${input}: ${Object.keys(pages).length} pages and ${Object.keys(files).length} public data files`);
