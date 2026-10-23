#!/usr/bin/env node
/**
 * data/assets/revisions.json, at build time: the asset commits the live content release pins,
 * wherever they are newer than the committed ones.
 *
 * Why: that file is the deployment's own asset pin. next.config.js builds every /<folder>/...
 * redirect from it, and lib/content/urls.ts falls back to it for a page without a release. It
 * only moved when someone bumped it by hand, while the nightly release moves its own pins
 * every day, so a root-relative path to art newer than the last hand bump 307'd to a commit
 * that did not have it: on 2026-09-25 /material-icons/涤墨之旗.webp redirected to
 * arkpedia-image-assets@6058775e and 404'd, while the release's 0936e52a served it.
 *
 * Each repository keeps the newer of its committed pin and the live release's, never an older
 * one: a pin bumped by hand past the release stays. "Newer" is the GitHub compare API's answer
 * for the two commits (both are heads of the same repository's main, so one contains the
 * other). One call per repository whose pins differ, usually one or none; GITHUB_TOKEN or
 * GH_TOKEN is used when set, and without one the unauthenticated limit is far above that.
 *
 * When the pins cannot be ordered -- the live release or GitHub cannot be read, or the two
 * commits have diverged -- the committed pin is kept with a warning, and the build goes on:
 * refusing to deploy code over an asset pin would hold the code back for what is at worst a
 * redirect to an older commit. The guard is after the deploy instead: Deploy's "Check that
 * asset links reach the release's art" step (scripts/deploy/check-asset-redirects.mjs) asks
 * production for a file only the live pin has and goes red when the redirect cannot serve it.
 *
 * A build with ARKPEDIA_CONTENT_DISABLED=1 reads no release and keeps the committed pins:
 * Check builds that way, and its browser and content-runtime suites are written against them.
 *
 * The second step of prebuild, right after scripts/build/write-build-info.mjs. Rewriting a
 * tracked file makes the tree dirty, and a dirty build holds every content release
 * (scripts/content/deploy-gate.mjs), so build-info is written first, from the commit as
 * checked out; the code fingerprint is the commit's (git ls-tree), not the working tree's, so
 * it is the same either way. The availability indexes (data/assets/external-asset-index.json,
 * public-asset-index.json) stay at the committed pin: pages read them only on the bundled
 * fallback path, where a file too new for them is merely not offered.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { contentPointer } from '../content/channel.mjs';
import { readChannelPointer } from '../../lib/content/pointer.mjs';
import { fetchAsset } from '../../lib/assets/githubRetry.mjs';

export const REVISIONS = 'data/assets/revisions.json';
const DEFAULT_ORIGIN = 'https://raw.githubusercontent.com/arkpedia/arkpedia-data';
const HEX64 = /^[a-f0-9]{64}$/;
const GIT_SHA = /^[a-f0-9]{40}$/;
const short = value => String(value).slice(0, 8);

/** Where the release is published: lib/content/release.ts's origin(), with the same rule. */
export function contentOrigin(env = process.env) {
  const value = env.ARKPEDIA_CONTENT_URL || DEFAULT_ORIGIN;
  const parsed = new URL(value);
  const local = env.ARKPEDIA_CONTENT_TEST === '1' && ['127.0.0.1', 'localhost'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !local) throw new Error(`Content origin must use HTTPS: ${value}`);
  return value.replace(/\/+$/, '');
}

/** One URL's bytes. A failed answer throws with its HTTP `status` on the error: a missing channel
 *  pointer (404) falls back to live's (lib/content/pointer.mjs). A 404 is an answer, not a fault,
 *  so it is thrown at once, as the release gate takes one (readBuildInfo, deploy-gate.mjs): retried,
 *  every build of a channel with no pointer yet asked twice more for a branch that is not there
 *  before it fell back. Once fetchAsset has confirmed it, that is: GitHub sometimes answers 404 for
 *  a file it has, so a raw 404 counts only after the other encodings of the address say it too
 *  (lib/assets/githubRetry.mjs), quick requests with no pause. Anything else -- another status, a
 *  timeout, a reset -- is tried again. */
async function get(fetch, url, attempts = 3) {
  let last;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let response;
    try {
      // A 404 only once every encoding of the address has said it (lib/assets/githubRetry.mjs).
      response = await fetchAsset(url, { cache: 'no-store', signal: AbortSignal.timeout(20_000) }, { fetcher: fetch });
      if (response.ok) return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      last = error;
      continue;
    }
    last = Object.assign(new Error(`HTTP ${response.status}: ${url}`), { status: response.status });
    if (response.status === 404) throw last;
  }
  throw last;
}

/** The live release's asset pins, read the way loadRelease reads the release: the channel's
 *  pointer (live's while the channel has none, lib/content/pointer.mjs), then the manifest it
 *  names, checked against the pointer's digest. `pointerBranch` is required: the deployment's
 *  channel, contentPointer(env), which no default here can know. */
export async function readLiveAssetPins({ origin, pointerBranch, fetch = globalThis.fetch }) {
  if (typeof pointerBranch !== 'string' || !pointerBranch) throw new Error('readLiveAssetPins needs the pointer branch the deployment reads (contentPointer(env))');
  const read = url => get(fetch, url);
  const pointer = JSON.parse((await readChannelPointer({ root: origin, channel: pointerBranch, read, warn: message => console.warn(`[asset-pins] ${message}`) })).toString());
  if (!HEX64.test(pointer?.release ?? '') || !GIT_SHA.test(pointer?.revision ?? '') || !HEX64.test(pointer?.manifestSha256 ?? '')) {
    throw new Error('The live pointer names no release, revision and manifest digest');
  }
  const bytes = await read(`${origin}/${pointer.revision}/release/manifest.json`);
  if (createHash('sha256').update(bytes).digest('hex') !== pointer.manifestSha256) throw new Error('The live manifest does not match its pointer');
  const assets = JSON.parse(bytes.toString()).assets;
  if (!assets || typeof assets !== 'object' || !Object.values(assets).every(pin => GIT_SHA.test(String(pin)))) {
    throw new Error('The live manifest names no commit-pinned assets');
  }
  return { release: pointer.release, revision: pointer.revision, assets };
}

/** Which of two commits of an arkpedia repository is newer: GitHub's compare status of
 *  base...head, 'ahead' when head contains base and more. */
export function githubCompare({ fetch = globalThis.fetch, token } = {}) {
  return async (repository, base, head) => {
    const response = await fetch(`https://api.github.com/repos/arkpedia/${repository}/compare/${base}...${head}?per_page=1`, {
      headers: { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`GitHub compare answered HTTP ${response.status}`);
    const { status } = await response.json();
    if (!['ahead', 'behind', 'identical', 'diverged'].includes(status)) throw new Error(`GitHub compare answered ${JSON.stringify(status)}`);
    return status;
  };
}

/**
 * The pins to build with: per committed repository, the live pin where it is newer, else the
 * committed one. Repositories only the release names are left out (no code here reads them).
 * Returns { pins, adopted: [{ repository, from, to }], notes, warnings }.
 */
export async function choosePins({ committed, live, compare }) {
  const pins = {}, adopted = [], notes = [], warnings = [];
  for (const [repository, pin] of Object.entries(committed)) {
    pins[repository] = pin;
    const candidate = live[repository];
    if (!candidate || candidate === pin) continue;
    let order;
    try {
      order = await compare(repository, pin, candidate);
    } catch (error) {
      warnings.push(`${repository}: cannot tell whether the release's ${short(candidate)} is newer than the committed ${short(pin)} (${error instanceof Error ? error.message : error}); keeping ${short(pin)}`);
      continue;
    }
    if (order === 'ahead') {
      pins[repository] = candidate;
      adopted.push({ repository, from: pin, to: candidate });
    } else if (order === 'diverged') {
      warnings.push(`${repository}: the release's ${short(candidate)} and the committed ${short(pin)} have diverged, so neither is newer; keeping ${short(pin)}`);
    } else {
      notes.push(`${repository}: the committed ${short(pin)} is ${order === 'behind' ? 'newer than' : 'the same commit as'} the release's ${short(candidate)}; keeping it`);
    }
  }
  return { pins, adopted, notes, warnings };
}

export async function adoptReleaseAssetPins({ root = process.cwd(), env = process.env, fetch = globalThis.fetch, compare, log = console.log, warn = console.warn } = {}) {
  if (env.ARKPEDIA_CONTENT_DISABLED === '1') {
    log('[asset-pins] ARKPEDIA_CONTENT_DISABLED=1: this build reads no content release, so it keeps the committed asset pins.');
    return { skipped: true, adopted: [], warnings: [] };
  }
  const file = path.join(root, REVISIONS);
  const text = fs.readFileSync(file, 'utf8');
  const committed = JSON.parse(text);
  const flag = message => warn(env.GITHUB_ACTIONS === 'true' ? `::warning title=Asset pins not adopted::${message}` : `[asset-pins] warning: ${message}`);
  let live;
  try {
    live = await readLiveAssetPins({ origin: contentOrigin(env), pointerBranch: contentPointer(env), fetch });
  } catch (error) {
    const message = `Cannot read the live content release (${error instanceof Error ? error.message : error}); building with the committed asset pins. Deploy's asset-link check goes red if they lag the release.`;
    flag(message);
    return { skipped: false, adopted: [], warnings: [message] };
  }
  const { pins, adopted, notes, warnings } = await choosePins({
    committed, live: live.assets, compare: compare ?? githubCompare({ fetch, token: env.GITHUB_TOKEN || env.GH_TOKEN }),
  });
  for (const note of notes) log(`[asset-pins] ${note}`);
  for (const message of warnings) flag(message);
  const next = `${JSON.stringify(pins, null, 2)}\n`;
  if (next !== text) fs.writeFileSync(file, next);
  log(adopted.length
    ? `[asset-pins] Building with the live release's newer asset pins (${short(live.revision)}): ${adopted.map(({ repository, from, to }) => `${repository} ${short(from)} -> ${short(to)}`).join(', ')}.`
    : `[asset-pins] The committed asset pins are as new as the live release's (${short(live.revision)}).`);
  return { skipped: false, adopted, warnings };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  adoptReleaseAssetPins().catch(error => { console.error(error); process.exitCode = 1; });
}
