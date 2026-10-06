import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import bundledRevisions from '../../data/assets/revisions.json';
import assetFolders from '../../config/asset-folders.json';
import { contentUrl } from '../../lib/content/urls';
// @ts-expect-error Plain Node helper.
import { FOLDER_MODES, folderDriftByKind, folderMode, folderVerdict, manifestFolders } from '../lib/asset-folders.mjs';

/*
 * Which asset repository serves each top-level art folder is written once, in
 * config/asset-folders.json. lib/content/urls.ts (the page's release pin) and next.config.js
 * (the deploy's redirects) used to type the lists out separately, with nothing tying them to
 * each other or to the repositories: a folder added to one list only passed through unmapped.
 * check-published-assets (Check and the release job) compares the list with each pinned
 * repository's asset-manifest.json; these cases hold the rest.
 */
const require = createRequire(import.meta.url);
const config = require('../../next.config.js')('test') as { redirects: () => Promise<{ source: string; destination: string }[]>; images: { remotePatterns: { hostname: string }[] } };
const REPOSITORIES = ['arkpedia-skin-assets', 'arkpedia-image-assets'] as const;

test('the site and the deploy redirects map every folder to the repository the config names', async () => {
  const release = { release: 'r', baseUrl: 'https://example.org/r', assets: { 'arkpedia-skin-assets': 'a'.repeat(40), 'arkpedia-image-assets': 'b'.repeat(40) } };
  const redirects = await config.redirects();
  for (const repository of REPOSITORIES) {
    for (const folder of assetFolders[repository]) {
      assert.match(contentUrl(`/${folder}/x.webp`, release), new RegExp(`/${repository}/${release.assets[repository]}/${folder}/x\\.webp$`), folder);
      const rule = redirects.find(r => r.source === `/${folder}/:path*`);
      assert.ok(rule?.destination.includes(`/${repository}/${bundledRevisions[repository]}/${folder}/`), `${folder}: ${rule?.destination}`);
    }
  }
  // Neither file keeps a list of its own.
  for (const file of ['lib/content/urls.ts', 'next.config.js']) {
    const text = fs.readFileSync(file, 'utf8');
    assert.match(text, /config\/asset-folders\.json/, file);
    assert.doesNotMatch(text, /'stronghold-stratagems'/, `${file} still types out a folder list`);
  }
});

test('the folders are exactly the pinned repositories\' published tree, or an unmapped one is held', () => {
  // data/assets/external-asset-index.json is both repositories' manifests at the pins in
  // data/assets/revisions.json (update-asset-revisions.mjs), so this needs no network.
  const index = JSON.parse(fs.readFileSync('data/assets/external-asset-index.json', 'utf8')) as { files: string[] };
  const published = manifestFolders({ files: Object.fromEntries(index.files.map(file => [file, {}])) }) as string[];
  const mapped = [...assetFolders['arkpedia-skin-assets'], ...assetFolders['arkpedia-image-assets']].sort();
  // Every mapped folder is published: a missing one breaks the pages that link into it.
  assert.deepEqual(mapped.filter(folder => !published.includes(folder)), []);
  // A published folder the config does not map links nowhere, and the release job holds it in
  // data/quarantine.json (check-published-assets.mjs --quarantine, before npm test) rather
  // than fail the day's release; anywhere else it fails here, so a PR that adds one says so.
  const quarantine = fs.existsSync('data/quarantine.json') ? JSON.parse(fs.readFileSync('data/quarantine.json', 'utf8')) as { entries: { key: string }[] } : { entries: [] };
  const held = new Set(quarantine.entries.filter(entry => entry.key.startsWith('asset-folder:')).map(entry => entry.key.split('/').at(-1)));
  assert.deepEqual(published.filter(folder => !mapped.includes(folder) && !held.has(folder)), []);
});

type Row = { repository: string; folder: string; problem: string };
const manifest = (...files: string[]) => ({ files: Object.fromEntries(files.map(file => [file, {}])) });
const cfg = { 'arkpedia-skin-assets': ['six-star-skins'], 'arkpedia-image-assets': ['material-icons'] };
const problems = (rows: Row[]) => rows.map(row => row.problem);

test('a folder a repository gains, or one the config assigns to the wrong repository, is named', () => {
  const none = folderDriftByKind(cfg, { 'arkpedia-skin-assets': manifest('six-star-skins/a.webp', 'originals/a.png'), 'arkpedia-image-assets': manifest('material-icons/b.webp', 'asset-manifest.json') });
  assert.deepEqual(none, { unmapped: [], missing: [] });
  const gained = folderDriftByKind(cfg, { 'arkpedia-skin-assets': manifest('six-star-skins/a.webp'), 'arkpedia-image-assets': manifest('material-icons/b.webp', 'new-folder/c.webp') });
  assert.deepEqual(gained, { missing: [], unmapped: [{ repository: 'arkpedia-image-assets', folder: 'new-folder', problem: 'arkpedia-image-assets publishes new-folder/, which config/asset-folders.json does not map' }] });
  // Both kinds in one shape, so the check handles them alike.
  const wrong = folderDriftByKind({ ...cfg, 'arkpedia-image-assets': ['material-icons', 'six-star-skins'] }, { 'arkpedia-image-assets': manifest('material-icons/b.webp') });
  assert.deepEqual(wrong, { unmapped: [], missing: [{ repository: 'arkpedia-image-assets', folder: 'six-star-skins', problem: 'config/asset-folders.json maps six-star-skins/ to arkpedia-image-assets, which publishes no such folder' }] });
  // The published-assets check, which runs in Check and in the release job, applies it at the pins.
  const check = fs.readFileSync('scripts/audits/check-published-assets.mjs', 'utf8');
  assert.match(check, /const mode = folderMode\(process\.argv\.slice\(2\)\);/);
  assert.match(check, /const drift = folderDriftByKind\(await read\('config\/asset-folders\.json'\)/);
  assert.match(check, /= folderVerdict\(drift, mode\);/);
});

/* Who runs the check decides what an unmapped folder does (folderVerdict); a missing one fails
   every caller. update-asset-revisions.mjs, which each stage that moves the pins runs
   (asset-revisions, catalogue-assets, staged-art), adopts past it: the strict check there threw
   the day's pins away over a folder dev had mapped first, freezing every asset repository's pin
   until main caught up -- the freeze #180 meant to lift, which it lifted only in Validate. */
test('pin adoption lets an unmapped folder through, Check fails on it, the release job holds it', () => {
  const unmapped = folderDriftByKind(cfg, { 'arkpedia-skin-assets': manifest('six-star-skins/a.webp'), 'arkpedia-image-assets': manifest('material-icons/b.webp', 'story-map/c.webp') });
  // The arguments update-asset-revisions.mjs runs the check with: one mode for every call site.
  const updater = fs.readFileSync('scripts/sync/update-asset-revisions.mjs', 'utf8');
  const calls = [...updater.matchAll(/\['scripts\/audits\/check-published-assets\.mjs'((?:, '[^']*')*)\]/g)];
  assert.equal(calls.length, 1, 'update-asset-revisions.mjs runs the published-assets check once');
  const adoptingArgs = [...calls[0][1].matchAll(/'([^']*)'/g)].map(match => match[1]);
  assert.equal(folderMode(adoptingArgs), 'adopting');
  const adopting = folderVerdict(unmapped, folderMode(adoptingArgs));
  assert.deepEqual([adopting.fail, adopting.hold, problems(adopting.allow)], [[], [], ['arkpedia-image-assets publishes story-map/, which config/asset-folders.json does not map']]);
  // Check (no flag) fails on it, so a PR that bumps the pins past it says so.
  const scripts = JSON.parse(fs.readFileSync('package.json', 'utf8')).scripts as Record<string, string>;
  const argsOf = (script: string) => scripts[script].match(/^node scripts\/audits\/check-published-assets\.mjs((?: --[\w-]+)*) &&/)![1].split(' ').filter(Boolean);
  assert.equal(folderMode(argsOf('check:published-assets')), 'check');
  assert.deepEqual(problems(folderVerdict(unmapped, 'check').fail), ['arkpedia-image-assets publishes story-map/, which config/asset-folders.json does not map']);
  // The release job's Validate step holds it as a quarantine entry instead.
  assert.equal(folderMode(argsOf('check:published-assets:release')), 'quarantine');
  const quarantine = folderVerdict(unmapped, 'quarantine');
  assert.deepEqual([quarantine.fail, quarantine.hold.map((row: Row) => row.folder), quarantine.allow], [[], ['story-map'], []]);
  // A folder the config maps that the repository does not publish breaks pages: every mode fails.
  const missing = folderDriftByKind({ ...cfg, 'arkpedia-image-assets': ['material-icons', 'gone'] }, { 'arkpedia-image-assets': manifest('material-icons/b.webp', 'story-map/c.webp') });
  for (const mode of Object.values(FOLDER_MODES) as string[]) {
    assert.deepEqual(problems(folderVerdict(missing, mode).fail).filter(problem => problem.includes('gone/')), ['config/asset-folders.json maps gone/ to arkpedia-image-assets, which publishes no such folder'], mode);
  }
  assert.throws(() => folderMode(['--lenient']), /usage: check-published-assets\.mjs/);
  assert.throws(() => folderVerdict(unmapped, 'lenient'), /Unknown folder check mode/);
});

test('no image host is allowed that nothing renders', () => {
  // arknights.wiki.gg was listed as "temporary" long after every image stopped coming from it.
  const hosts = config.images.remotePatterns.map(pattern => pattern.hostname);
  assert.ok(!hosts.some(host => /wiki/.test(host)), hosts.join(', '));
});
