#!/usr/bin/env node
/**
 * After a deploy: production's root-relative asset links reach art the live content release
 * has. GET and HEAD only.
 *
 *   node scripts/deploy/check-asset-redirects.mjs
 *
 * Every /<folder>/... path on the site is a redirect to one commit of an asset repository, the
 * commit the deployment was built with (next.config.js, from data/assets/revisions.json). The
 * release pins its own commits and moves them every night, so a deployment built with an older
 * pin sends newer art to a commit that lacks it: /material-icons/涤墨之旗.webp 307'd to
 * arkpedia-image-assets@6058775e and 404'd on 2026-09-25 while the release served it. prebuild
 * now builds with the release's pins where they are newer (scripts/build/adopt-release-asset-
 * pins.mjs), and falls back to the committed ones with only a warning; this is what turns a
 * deployment that still lags into a red Deploy.
 *
 * For the image and the skin repository alike: a file the live release's commit has and the
 * committed pin (git show HEAD:data/assets/revisions.json -- the working tree's copy is the
 * adopted one) lacks or holds other bytes of, in a folder the site redirects
 * (config/asset-folders.json). When the two commits list the same files, any file of the live
 * commit stands in. Each deployment in config/production.json (or ARKPEDIA_DEPLOYMENTS) is
 * asked for it with a HEAD that follows the redirect, and must answer 200; a fresh path cannot
 * be answered from a redirect some cache kept. Retried a few times for the alias to move.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deploymentUrls } from '../content/deploy-gate.mjs';
import { contentOrigin, readLiveAssetPins } from '../build/adopt-release-asset-pins.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FOLDERS = JSON.parse(fs.readFileSync(path.join(root, 'config/asset-folders.json'), 'utf8'));
const TEMPLATE = JSON.parse(fs.readFileSync(path.join(root, 'config/asset-delivery.json'), 'utf8')).template;
export const REPOSITORIES = ['arkpedia-image-assets', 'arkpedia-skin-assets'];
const short = value => String(value).slice(0, 8);

export const assetAddress = (repository, revision, file) => TEMPLATE.replace('{repository}', repository).replace('{revision}', revision).replace('{path}', file);
/** A manifest path as a URL path: every segment percent-encoded, the slashes kept. */
export const encodePath = file => file.split('/').map(encodeURIComponent).join('/');

/**
 * The file to ask production for: the first (in code-point order) that the live commit lists
 * and the committed one does not, or lists with other bytes, in a served folder; else the
 * first file of the live commit in a served folder. `fresh` says which it is.
 */
export function probeFile({ folders, committedFiles, liveFiles }) {
  const served = Object.keys(liveFiles).filter(file => folders.includes(file.split('/')[0])).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (!served.length) throw new Error('The live asset manifest lists no file in a folder the site redirects');
  const fresh = served.find(file => committedFiles[file]?.sha256 !== liveFiles[file]?.sha256);
  return fresh ? { file: fresh, fresh: true } : { file: served[0], fresh: false };
}

async function manifestFiles(fetch, repository, revision) {
  const response = await fetch(assetAddress(repository, revision, 'asset-manifest.json'), { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${repository}@${short(revision)} asset-manifest.json answered HTTP ${response.status}`);
  const files = (await response.json())?.files;
  if (!files || typeof files !== 'object') throw new Error(`${repository}@${short(revision)} asset-manifest.json lists no files`);
  return files;
}

/** One HEAD of production's path, following its redirect by hand so a failure can say where
 *  it led. { ok, status, location }. */
export async function probe(fetch, url) {
  const first = await fetch(url, { method: 'HEAD', redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(20_000) });
  if (first.status === 200) return { ok: true, status: 200, location: null };
  const location = first.headers.get('location');
  if (first.status < 300 || first.status >= 400 || !location) return { ok: false, status: first.status, location };
  const target = new URL(location, url).href;
  const final = await fetch(target, { method: 'HEAD', redirect: 'follow', cache: 'no-store', signal: AbortSignal.timeout(20_000) });
  return { ok: final.status === 200, status: final.status, location: target };
}

export async function checkAssetRedirects({
  fetch = globalThis.fetch, env = process.env, committed = JSON.parse(execFileSync('git', ['show', 'HEAD:data/assets/revisions.json'], { cwd: root, encoding: 'utf8' })),
  deployments = deploymentUrls(env), attempts = 4, retryMs = Number(env.ARKPEDIA_ASSET_CHECK_RETRY_MS ?? 15_000), log = console.log,
} = {}) {
  const live = await readLiveAssetPins({ origin: contentOrigin(env), fetch });
  const problems = [];
  for (const repository of REPOSITORIES) {
    const revision = live.assets[repository];
    if (!revision) { problems.push(`The live release pins no ${repository}.`); continue; }
    const liveFiles = await manifestFiles(fetch, repository, revision);
    const committedFiles = committed[repository] === revision ? liveFiles : await manifestFiles(fetch, repository, committed[repository]);
    const { file, fresh } = probeFile({ folders: FOLDERS[repository], committedFiles, liveFiles });
    for (const site of deployments) {
      const url = `${site}/${encodePath(file)}`;
      let result;
      for (let attempt = 1; attempt <= attempts; attempt++) {
        try { result = await probe(fetch, url); } catch (error) { result = { ok: false, status: error instanceof Error ? error.message : String(error), location: null }; }
        if (result.ok || attempt === attempts) break;
        await new Promise(resolve => setTimeout(resolve, retryMs));
      }
      const what = fresh ? `a file ${repository}@${short(revision)} has and the committed ${short(committed[repository])} does not` : `a file of ${repository}@${short(revision)}`;
      if (result.ok) log(`${url} reaches ${what}.`);
      else problems.push(`${url} (${what}) ${result.location ? `redirects to ${result.location}, which answers ${result.status}` : `answers ${result.status}`}. The live release pins ${repository}@${short(revision)}; the deployment's redirects point at the commit it was built with.`);
    }
  }
  return { problems, release: live.revision };
}

const command = text => String(text).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');

export async function main() {
  let problems;
  try {
    ({ problems } = await checkAssetRedirects());
  } catch (error) {
    problems = [`The asset links could not be checked: ${error instanceof Error ? error.message : error}`];
  }
  if (!problems.length) { console.log('Production\'s asset links reach the live release\'s art.'); return 0; }
  for (const problem of problems) console.log(`::error title=Asset links behind the release::${command(problem)}`);
  console.log(`\n${problems.map(problem => `- ${problem}`).join('\n')}`);
  console.log('\nArt the release names is missing on pages that link it root-relatively. scripts/build/adopt-release-asset-pins.mjs, in prebuild, builds with the release\'s newer pins unless it cannot order them; its warning in the Build step says why. Bump data/assets/revisions.json (npm run assets:update) or redeploy.');
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(code => { process.exitCode = code; }, error => { console.error(error); process.exitCode = 2; });
}
