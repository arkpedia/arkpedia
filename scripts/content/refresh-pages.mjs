#!/usr/bin/env node
/**
 * After a release goes live: asks each live deployment of the channel's branch
 * (releaseDeployments, scripts/deploy/deploy-targets.mjs) to regenerate the pages that wait
 * longest for one (pages/api/release-refresh.ts), once it can read the release. Never fails the
 * run -- the pages still regenerate on their own interval -- but says, as a warning, where it
 * could not.
 *
 *   ARKPEDIA_RELEASE_REFRESH_SECRET=... node scripts/content/refresh-pages.mjs --revision <data commit the pointer names> --pointer <live | dev-live>
 *
 * Why it waits: a deployment finds the release through its channel's pointer,
 * <origin>/<pointer>/current.json on raw.githubusercontent (lib/content/server.ts), which that CDN
 * keeps for five minutes, and each server instance asks again at most once a minute (REFRESH_MS
 * there). Asked the moment the pointer moved, the pages regenerated with the previous release and
 * kept it for their whole interval, the 25 minutes this is meant to cut. So it waits until the
 * pointer, read exactly as a server reads it (no cache-busting query: that would see past the
 * CDN a server goes through), names --revision, and until the CDN's five minutes have passed
 * since the pointer moved, since another of its edges may keep the old copy that long; then a
 * server's minute. The pointer moved before this runs: main's step above confirmed it live, and
 * the dev channel's step wrote its own. --revision is what the pointer names by then, not always
 * what the run pushed: on main, the commit the live check found live serving (await-live.mjs),
 * which is a later data main commit when another push superseded this one. Waiting for the
 * pushed commit there held the runner the whole nine minutes and ended on a warning that the
 * pointer had not moved, when it had moved past it.
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { releaseDeployments } from '../deploy/deploy-targets.mjs';
import { contentOrigin } from '../build/adopt-release-asset-pins.mjs';

/** How long raw.githubusercontent keeps a pointer (Cache-Control: max-age=300). */
export const POINTER_CACHE_MS = 300_000;
/** How often a server instance reads the pointer again: lib/content/server.ts's REFRESH_MS. */
export const SERVER_REFRESH_MS = 60_000;
const GIT_SHA = /^[a-f0-9]{40}$/;
const POINTER = /^[a-z0-9][a-z0-9-]*$/;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

/** The revision a pointer names, as a server would read it, or why it cannot be read. */
async function namedRevision(fetch, url) {
  try {
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
    if (!response.ok) return { error: `HTTP ${response.status}` };
    const revision = (await response.json())?.revision;
    return GIT_SHA.test(revision ?? '') ? { revision } : { error: 'it names no revision' };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Waits until a server reading `url` gets the pointer naming `revision` (the commit the pointer
 * names once the release is live, main()'s --revision): the pointer names it there, at least
 * POINTER_CACHE_MS after this started, then SERVER_REFRESH_MS more. After timeoutMs without it,
 * warns and returns anyway: the refresh is still worth asking for.
 */
export async function awaitPointer({ url, revision, fetch = globalThis.fetch, now = Date.now, sleep = pause, log = console.log,
  intervalMs = 15_000, timeoutMs = 9 * 60_000 }) {
  if (!GIT_SHA.test(revision ?? '') || !url) throw new Error('awaitPointer needs the pointer url and the 40-hex revision it is to name');
  const started = now();
  for (;;) {
    const named = await namedRevision(fetch, url);
    const waited = now() - started;
    if (named.revision === revision) {
      if (waited < POINTER_CACHE_MS) await sleep(POINTER_CACHE_MS - waited);
      log(`${url} names ${revision}; the servers read it within a minute.`);
      await sleep(SERVER_REFRESH_MS);
      return { served: true };
    }
    if (waited >= timeoutMs) {
      log(`::warning::${url} still does not name ${revision} after ${Math.round(waited / 1000)} s (${named.error ?? `it names ${named.revision}`}); asking for the refresh anyway.`);
      return { served: false };
    }
    await sleep(intervalMs);
  }
}

export async function refreshPages({ secret, env = process.env, deployments = releaseDeployments(env), fetch = globalThis.fetch, log = console.log } = {}) {
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

/** The command: --revision and --pointer are required, so no caller can skip the wait. */
export async function main(argv, { env = process.env, fetch = globalThis.fetch, now, sleep, log = console.log } = {}) {
  const opts = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!['--revision', '--pointer'].includes(argv[i]) || argv[i + 1] === undefined) throw new Error(`usage: refresh-pages.mjs --revision <data commit the pointer names> --pointer <pointer branch> (at ${argv[i]})`);
    opts[argv[i].slice(2)] = argv[i + 1];
  }
  if (!GIT_SHA.test(opts.revision ?? '') || !POINTER.test(opts.pointer ?? '')) {
    throw new Error('usage: refresh-pages.mjs --revision <data commit the pointer names> --pointer <pointer branch> (both required: the 40-hex commit and the channel\'s pointer)');
  }
  const secret = env.ARKPEDIA_RELEASE_REFRESH_SECRET;
  if (secret) await awaitPointer({ url: `${contentOrigin(env)}/${opts.pointer}/current.json`, revision: opts.revision, fetch, now, sleep, log });
  return refreshPages({ secret, env, fetch, log });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => console.log(`::warning::${error instanceof Error ? error.message : error}`));
}
