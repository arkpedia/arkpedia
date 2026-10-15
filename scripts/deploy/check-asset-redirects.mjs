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
 *
 * A release can go live while the Build step runs: the gate (scripts/content/deploy-gate.mjs)
 * lets through one the code production still runs compiled, and nothing stops the image sync
 * moving the pins meanwhile. Its newest art is then on no commit this build redirects to, and
 * cannot be, whatever the build did. So the live release is read again here, after the deploy,
 * and set against the pins the build baked in (the working tree's data/assets/revisions.json,
 * which prebuild rewrote with the ones it adopted). Where the build adopted a pin (it differs
 * from the committed one) and the live one is newer still (GitHub's compare), that is the
 * race: a warning that the next deploy adopts it, and the probe asks for a file of the pin the
 * build used instead, which must answer 200. Where the build kept the committed pin and the
 * live one is newer, prebuild could not adopt it (its warning in the Build step says why), or
 * the release moved from exactly the committed pin while it built; that stays a failure, the
 * lag this check is for.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deploymentUrls } from '../content/deploy-gate.mjs';
import { REVISIONS, contentOrigin, githubCompare, readLiveAssetPins } from '../build/adopt-release-asset-pins.mjs';
import { contentPointer } from '../content/channel.mjs';
import { fetchAsset } from '../../lib/assets/githubRetry.mjs';

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
  // A 404 counts only once every encoding of the address has said it (lib/assets/githubRetry.mjs).
  const response = await fetchAsset(assetAddress(repository, revision, 'asset-manifest.json'), { signal: AbortSignal.timeout(30_000) }, { fetcher: fetch });
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
  const final = await fetchAsset(target, { method: 'HEAD', redirect: 'follow', cache: 'no-store', signal: AbortSignal.timeout(20_000) }, { fetcher: fetch });
  return { ok: final.status === 200, status: final.status, location: target };
}

/** The file to ask for and what it stands for, per repository: { file, what, pin } or a
 *  { warning } too when the live release moved on after the build adopted its pin. */
async function probeTarget({ fetch, compare, repository, live, baked, committed }) {
  let pin = live, moved = false;
  if (baked && baked !== live && baked !== committed) {
    try {
      moved = (await compare(repository, baked, live)) === 'ahead';
    } catch {
      // Unordered, so read as the lag it may be: the live pin is probed as without a build pin.
    }
    if (moved) pin = baked;
  }
  const pinFiles = await manifestFiles(fetch, repository, pin);
  const committedFiles = committed === pin ? pinFiles : await manifestFiles(fetch, repository, committed);
  const { file, fresh } = probeFile({ folders: FOLDERS[repository], committedFiles, liveFiles: pinFiles });
  if (!moved) {
    return { file, pin, what: fresh ? `a file ${repository}@${short(live)} has and the committed ${short(committed)} does not` : `a file of ${repository}@${short(live)}` };
  }
  return {
    file, pin,
    what: `${fresh ? `a file ${repository}@${short(baked)}, the pin this build used, has and the committed ${short(committed)} does not` : `a file of ${repository}@${short(baked)}, the pin this build used`}`,
    warning: `The live release moved ${repository} to ${short(live)} after this build adopted ${short(baked)}: a release went live while it built. `
      + `Art newer than ${short(baked)} is not on the commit this deployment's root-relative links redirect to; the next deploy adopts ${short(live)}.`,
  };
}

export async function checkAssetRedirects({
  fetch = globalThis.fetch, env = process.env, committed = JSON.parse(execFileSync('git', ['show', `HEAD:${REVISIONS}`], { cwd: root, encoding: 'utf8' })),
  baked = JSON.parse(fs.readFileSync(path.join(root, REVISIONS), 'utf8')), compare = githubCompare({ fetch, token: env.GITHUB_TOKEN || env.GH_TOKEN }),
  deployments = deploymentUrls(env), attempts = 4, retryMs = Number(env.ARKPEDIA_ASSET_CHECK_RETRY_MS ?? 15_000), log = console.log,
} = {}) {
  // Read now, after the deploy, not when the build read it, from the deployment's own channel
  // (Deploy's job env names its project, which contentPointer looks up).
  const live = await readLiveAssetPins({ origin: contentOrigin(env), pointerBranch: contentPointer(env), fetch });
  const problems = [], warnings = [];
  for (const repository of REPOSITORIES) {
    const revision = live.assets[repository];
    if (!revision) { problems.push(`The live release pins no ${repository}.`); continue; }
    const { file, pin, what, warning } = await probeTarget({ fetch, compare, repository, live: revision, baked: baked[repository], committed: committed[repository] });
    if (warning) warnings.push(warning);
    for (const site of deployments) {
      const url = `${site}/${encodePath(file)}`;
      let result;
      for (let attempt = 1; attempt <= attempts; attempt++) {
        try { result = await probe(fetch, url); } catch (error) { result = { ok: false, status: error instanceof Error ? error.message : String(error), location: null }; }
        if (result.ok || attempt === attempts) break;
        await new Promise(resolve => setTimeout(resolve, retryMs));
      }
      if (result.ok) log(`${url} reaches ${what}.`);
      else if (warning) problems.push(`${url} (${what}) ${result.location ? `redirects to ${result.location}, which answers ${result.status}` : `answers ${result.status}`}. This deployment redirects to ${repository}@${short(pin)}, the pin it was built with, which has that file.`);
      else problems.push(`${url} (${what}) ${result.location ? `redirects to ${result.location}, which answers ${result.status}` : `answers ${result.status}`}. The live release pins ${repository}@${short(revision)}; the deployment's redirects point at the commit it was built with.`);
    }
  }
  return { problems, warnings, release: live.revision };
}

const command = text => String(text).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');

export async function main() {
  let problems, warnings = [];
  try {
    ({ problems, warnings } = await checkAssetRedirects());
  } catch (error) {
    problems = [`The asset links could not be checked: ${error instanceof Error ? error.message : error}`];
  }
  for (const warning of warnings) console.log(`::warning title=Release moved during the deploy::${command(warning)}`);
  if (!problems.length) {
    console.log(warnings.length ? 'Production\'s asset links reach the art of the pins this build used; the next deploy adopts the newer ones.' : 'Production\'s asset links reach the live release\'s art.');
    return 0;
  }
  for (const problem of problems) console.log(`::error title=Asset links behind the release::${command(problem)}`);
  console.log(`\n${problems.map(problem => `- ${problem}`).join('\n')}`);
  console.log(`\n${FIX}`);
  return 1;
}

export const FIX = 'Art the release names is missing on pages that link it root-relatively. Redeploy (Deploy, Run workflow): scripts/build/adopt-release-asset-pins.mjs, in prebuild, '
  + 'builds with the live release\'s newer pins unless it cannot order them, and its warning in the Build step says why. If it still cannot, bring the committed pins up to the '
  + 'release\'s with `node scripts/content/sync-bundled-data.mjs <arkpedia-data checkout> data/assets` and merge that.';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(code => { process.exitCode = code; }, error => { console.error(error); process.exitCode = 2; });
}
