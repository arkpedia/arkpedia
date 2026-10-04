#!/usr/bin/env node
/**
 * Where Deploy uploads a build: the Vercel projects config/production.json lists, each
 * following one branch.
 *
 *   node scripts/deploy/deploy-targets.mjs --branch main            the live ones of main
 *   node scripts/deploy/deploy-targets.mjs --branch main --preview  the ones of main not live yet
 *
 * Prints `targets=<JSON>` for $GITHUB_OUTPUT: one matrix entry per deployment, in the file's
 * order, the last one marked so only it starts a held content release again. A branch no
 * deployment follows prints an empty list, and Deploy has nothing to do.
 *
 * Why a list: on 2026-09-30 kukki's Vercel project, which serves www.arkpedia.net, was linked
 * to this repository with Git deployments on and its domains assigned automatically, so the
 * first push to main that built would have replaced the public site, with no Check in front
 * of it. Its build failed (write-build-info.mjs needs .git, which .vercelignore strips), and
 * that failure was the only thing between a merge and the cutover. So vercel.json turns
 * Vercel's own Git deployments off: Deploy builds in CI after a green Check and uploads the
 * prebuilt output to each live project of that branch. The same day main became
 * www.arkpedia.net's branch, and arkpedia-dev.vercel.app moved to dev.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CHANNELS } from '../content/channel.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const NAME = /^[a-z0-9][a-z0-9-]*$/;
const BRANCH = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const SECRET = /^[A-Z][A-Z0-9_]*$/;
/** The branch whose release production serves (prepare-content.yml's scheduled run): the gate's
 *  default, and the one whose deploy re-runs a held release. The dev channel's run sets
 *  ARKPEDIA_RELEASE_BRANCH=dev instead (scripts/content/channel.mjs). */
export const RELEASE_BRANCH = 'main';

/** The deployments config/production.json lists, each checked, or an error naming what is wrong. */
export function readDeployments(config = JSON.parse(fs.readFileSync(path.join(root, 'config/production.json'), 'utf8'))) {
  const list = config?.deployments;
  if (!Array.isArray(list) || !list.length) throw new Error('config/production.json lists no deployments');
  const seen = new Set();
  return list.map((entry, index) => {
    const where = `config/production.json deployments[${index}]`;
    if (!NAME.test(entry?.name ?? '')) throw new Error(`${where}: name must be lower-case letters, digits and dashes`);
    if (seen.has(entry.name)) throw new Error(`${where}: ${entry.name} is listed twice`);
    seen.add(entry.name);
    const url = new URL(entry.url);
    if (url.protocol !== 'https:' || url.pathname !== '/' || url.search) throw new Error(`${where}: url must be a bare https origin, not ${entry.url}`);
    if (!BRANCH.test(entry.branch ?? '')) throw new Error(`${where}: branch must name the branch it deploys`);
    const { scope, orgId, projectId } = entry.vercel ?? {};
    if (!NAME.test(scope ?? '') || !/^team_[A-Za-z0-9]+$/.test(orgId ?? '') || !/^prj_[A-Za-z0-9]+$/.test(projectId ?? '')) {
      throw new Error(`${where}: vercel needs scope, orgId (team_...) and projectId (prj_...)`);
    }
    if (!SECRET.test(entry.tokenSecret ?? '')) throw new Error(`${where}: tokenSecret must name a GitHub secret`);
    if (typeof entry.live !== 'boolean') throw new Error(`${where}: live must be true or false`);
    return { name: entry.name, url: url.origin, branch: entry.branch, scope, orgId, projectId, tokenSecret: entry.tokenSecret, live: entry.live };
  });
}

/** The matrix Deploy runs for a push to `branch`: its live deployments, or with preview its
 *  ones not live yet. */
export function deployTargets({ branch, preview = false, deployments = readDeployments() } = {}) {
  if (!BRANCH.test(branch ?? '')) throw new Error(`Not a branch: ${branch}`);
  const chosen = deployments.filter(deployment => deployment.branch === branch && deployment.live !== preview);
  return chosen.map((deployment, index) => ({
    ...deployment,
    production: !preview,
    environment: preview ? 'preview' : 'production',
    alert: `deploy-failing-${deployment.name}`,
    releaseGate: !preview && branch === RELEASE_BRANCH,
    // The content pointer the build reads (scripts/content/channel.mjs): its branch's channel.
    contentChannel: Object.hasOwn(CHANNELS, branch) ? CHANNELS[branch].pointer : 'live',
    last: index === chosen.length - 1,
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const at = process.argv.indexOf('--branch');
  const branch = at > 0 ? process.argv[at + 1] : undefined;
  const preview = process.argv.includes('--preview');
  const targets = deployTargets({ branch, preview });
  if (!targets.length) console.error(`No ${preview ? 'deployment waiting to go live' : 'live deployment'} follows ${branch}: nothing to deploy.`);
  for (const target of targets) console.error(`${target.environment}: ${target.name} (${target.url}, ${target.scope}/${target.projectId}) from ${branch}`);
  console.log(`targets=${JSON.stringify(targets)}`);
}
