#!/usr/bin/env node
/**
 * Where Deploy uploads a build: the Vercel projects config/production.json lists.
 *
 *   node scripts/deploy/deploy-targets.mjs            the live ones, for a production deploy
 *   node scripts/deploy/deploy-targets.mjs --preview  the ones not live yet, for a preview
 *
 * Prints `targets=<JSON>` for $GITHUB_OUTPUT: one matrix entry per deployment, in the file's
 * order, the last one marked so only it starts a held content release again.
 *
 * Why a list: on 2026-09-30 kukki's Vercel project, which serves www.arkpedia.net, was linked
 * to this repository with Git deployments on and its domains assigned automatically, so the
 * first push to main that built would have replaced the public site, with no Check in front
 * of it. Its build failed (write-build-info.mjs needs .git, which .vercelignore strips), and
 * that failure was the only thing between a merge and the cutover. So Vercel's own Git
 * deployments stay off for every project listed here: Deploy builds in CI after a green Check
 * and uploads the prebuilt output to each live project here, and a project that is not live
 * yet can take a preview upload from a manual run, which moves none of its domains, until the
 * change that flips it to live.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const NAME = /^[a-z0-9][a-z0-9-]*$/;
const SECRET = /^[A-Z][A-Z0-9_]*$/;

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
    const { scope, orgId, projectId } = entry.vercel ?? {};
    if (!NAME.test(scope ?? '') || !/^team_[A-Za-z0-9]+$/.test(orgId ?? '') || !/^prj_[A-Za-z0-9]+$/.test(projectId ?? '')) {
      throw new Error(`${where}: vercel needs scope, orgId (team_...) and projectId (prj_...)`);
    }
    if (!SECRET.test(entry.tokenSecret ?? '')) throw new Error(`${where}: tokenSecret must name a GitHub secret`);
    if (typeof entry.live !== 'boolean') throw new Error(`${where}: live must be true or false`);
    return { name: entry.name, url: url.origin, scope, orgId, projectId, tokenSecret: entry.tokenSecret, live: entry.live };
  });
}

/** The matrix Deploy runs: the live deployments, or with preview the ones not live yet. */
export function deployTargets({ preview = false, deployments = readDeployments() } = {}) {
  const chosen = deployments.filter(deployment => deployment.live !== preview);
  if (!chosen.length) throw new Error(preview ? 'Every deployment is live already: nothing to preview.' : 'No deployment is live.');
  return chosen.map((deployment, index) => ({
    ...deployment,
    production: !preview,
    environment: preview ? 'preview' : 'production',
    alert: `deploy-failing-${deployment.name}`,
    last: index === chosen.length - 1,
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const targets = deployTargets({ preview: process.argv.includes('--preview') });
  for (const target of targets) console.error(`${target.environment}: ${target.name} (${target.url}, ${target.scope}/${target.projectId})`);
  console.log(`targets=${JSON.stringify(targets)}`);
}
