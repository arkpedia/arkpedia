#!/usr/bin/env node
/**
 * After a release goes live: asks each live deployment (config/production.json) to regenerate
 * the pages that wait longest for one (pages/api/release-refresh.ts). Never fails the run --
 * the pages still regenerate on their own interval -- but says, as a warning, where it could
 * not.
 *
 *   ARKPEDIA_RELEASE_REFRESH_SECRET=... node scripts/content/refresh-pages.mjs
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { RELEASE_BRANCH, readDeployments } from '../deploy/deploy-targets.mjs';

/* Only the deployments of the branch whose release went live: since the dev channel
   (scripts/content/channel.mjs), arkpedia-dev reads its own release, not main's. */
export async function refreshPages({ secret, branch = process.env.ARKPEDIA_RELEASE_BRANCH || RELEASE_BRANCH, deployments = readDeployments().filter(d => d.branch === branch), fetch = globalThis.fetch, log = console.log } = {}) {
  if (!secret) {
    log('::warning::ARKPEDIA_RELEASE_REFRESH_SECRET is not set: the slow pages refresh on their own interval.');
    return [];
  }
  const results = [];
  for (const { name, url, live } of deployments) {
    if (!live) continue;
    try {
      const response = await fetch(`${url}/api/release-refresh`, { method: 'POST', headers: { authorization: `Bearer ${secret}` } });
      const body = await response.text();
      results.push({ name, ok: response.ok, status: response.status });
      log(`${response.ok ? '' : '::warning::'}${name} (${url}): ${response.status} ${body.slice(0, 300)}`);
    } catch (error) {
      results.push({ name, ok: false, status: 0 });
      log(`::warning::${name} (${url}): ${error instanceof Error ? error.message : error}`);
    }
  }
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  refreshPages({ secret: process.env.ARKPEDIA_RELEASE_REFRESH_SECRET }).catch((error) => console.log(`::warning::${error}`));
}
