import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import bundledRevisions from '../../data/assets/revisions.json';
import assetFolders from '../../config/asset-folders.json';
import { contentUrl } from '../../lib/content/urls';
// @ts-expect-error Plain Node helper.
import { folderDrift, manifestFolders } from '../lib/asset-folders.mjs';

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

test('the folders are exactly the pinned repositories\' published tree', () => {
  // data/assets/external-asset-index.json is both repositories' manifests at the pins in
  // data/assets/revisions.json (update-asset-revisions.mjs), so this needs no network.
  const index = JSON.parse(fs.readFileSync('data/assets/external-asset-index.json', 'utf8')) as { files: string[] };
  const published = manifestFolders({ files: Object.fromEntries(index.files.map(file => [file, {}])) });
  assert.deepEqual(published, [...assetFolders['arkpedia-skin-assets'], ...assetFolders['arkpedia-image-assets']].sort());
});

test('a folder a repository gains, or one the config assigns to the wrong repository, is named', () => {
  const manifest = (...files: string[]) => ({ files: Object.fromEntries(files.map(file => [file, {}])) });
  const cfg = { 'arkpedia-skin-assets': ['six-star-skins'], 'arkpedia-image-assets': ['material-icons'] };
  assert.deepEqual(folderDrift(cfg, { 'arkpedia-skin-assets': manifest('six-star-skins/a.webp', 'originals/a.png'), 'arkpedia-image-assets': manifest('material-icons/b.webp', 'asset-manifest.json') }), []);
  assert.deepEqual(folderDrift(cfg, { 'arkpedia-skin-assets': manifest('six-star-skins/a.webp'), 'arkpedia-image-assets': manifest('material-icons/b.webp', 'new-folder/c.webp') }),
    ['arkpedia-image-assets publishes new-folder/, which config/asset-folders.json does not map']);
  assert.deepEqual(folderDrift({ ...cfg, 'arkpedia-image-assets': ['material-icons', 'six-star-skins'] }, { 'arkpedia-image-assets': manifest('material-icons/b.webp') }),
    ['config/asset-folders.json maps six-star-skins/ to arkpedia-image-assets, which publishes no such folder']);
  // The published-assets check, which runs in Check and in the release job, applies it at the pins.
  assert.match(fs.readFileSync('scripts/audits/check-published-assets.mjs', 'utf8'), /folderDrift\(await read\('config\/asset-folders\.json'\)/);
});

test('no image host is allowed that nothing renders', () => {
  // arknights.wiki.gg was listed as "temporary" long after every image stopped coming from it.
  const hosts = config.images.remotePatterns.map(pattern => pattern.hostname);
  assert.ok(!hosts.some(host => /wiki/.test(host)), hosts.join(', '));
});
