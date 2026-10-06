#!/usr/bin/env node
/**
 * The release gate: a content release goes live only while every deployment that reads it --
 * the live deployments of the branch whose channel compiled it -- runs the code that compiled it.
 *
 *   node scripts/content/deploy-gate.mjs --manifest <release/manifest.json> --held-file <file>
 *   node scripts/content/deploy-gate.mjs --ref HEAD --held-file <file>
 *
 * Why: a channel's release job compiles with its branch's code (main's, or dev's for the dev
 * channel, scripts/content/channel.mjs), and a merge can change what a page's props look like
 * before that branch's deployments run it. On 2026-09-25 main dropped `countdowns`,
 * `pullBannerLinks` and `isOngoing` from the release while the deployed pages still
 * dereferenced them, and both said CONTENT_SCHEMA 2, so the first release after the merge
 * would have crashed /farming and the /schedule calendar until Deploy caught up. A schema
 * number only helps when someone remembers to bump it; this asks the deployments what they run.
 *
 * Each live deployment of the channel's branch in config/production.json (ARKPEDIA_RELEASE_BRANCH,
 * main when unset; or ARKPEDIA_DEPLOYMENTS, space-separated) is read with one GET of
 * /build-info.json (scripts/build/write-build-info.mjs). The release may go out only if every one
 * of them is a clean build whose code fingerprint (scripts/content/code-fingerprint.mjs) is the
 * release's, whose content schema is the release's, and which reads the channel's pointer
 * (ARKPEDIA_CONTENT_POINTER, live when unset) where it says which. Anything else holds it -- a
 * different commit, uncommitted changes, another channel's pointer, no build-info (a deploy from
 * before this gate), an unreachable site, a manifest whose fingerprint is not its generator's.
 * Holding fails closed: exit 1, a `::error::` line, and the reason as Markdown in --held-file,
 * which the workflow's report step posts as the 'Content release held' issue (with the
 * channel's suffix, "(dev)", on dev).
 *
 * --manifest checks a compiled release (the publish step). --ref checks the commit a run is
 * about to compile (the first step), so a held run stops before the compile.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { codeFingerprint } from './code-fingerprint.mjs';
import { SCHEMA } from './release-input.mjs';
import { RELEASE_BRANCH, releaseDeployments } from '../deploy/deploy-targets.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HEX64 = /^[a-f0-9]{64}$/;
const GIT_SHA = /^[a-f0-9]{40}$/;
const short = value => String(value).slice(0, 12);

/** Where production is: https only, but for a local test server. The live deployments of the
 *  branch this job compiles with (releaseDeployments, scripts/deploy/deploy-targets.mjs): one
 *  following another branch serves other code by design, and would hold every release. */
export function deploymentUrls(env = process.env) {
  const listed = env.ARKPEDIA_DEPLOYMENTS?.trim()
    ? env.ARKPEDIA_DEPLOYMENTS.trim().split(/[\s,]+/)
    : releaseDeployments(env).map(deployment => deployment.url);
  return listed.map(url => {
    const parsed = new URL(url);
    const local = parsed.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(parsed.hostname);
    if (parsed.protocol !== 'https:' && !local) throw new Error(`A production deployment must be https: ${url}`);
    return url.replace(/\/+$/, '');
  });
}

export const isBuildInfo = info => Boolean(info) && typeof info === 'object' && info.version === 1 && GIT_SHA.test(info.commit ?? '')
  && HEX64.test(info.codeFingerprint ?? '') && Number.isInteger(info.contentSchema) && typeof info.dirty === 'boolean';

/**
 * Whether every deployment can read the release.
 *   release      { generator, codeFingerprint, schema }
 *   deployments  [{ url, info }] or [{ url, error }], as readBuildInfo returns them
 *   pointer      the pointer branch the release is published to (live, dev-live): a deployment
 *                whose build-info says it reads another one never sees this release
 */
export function judge({ release, deployments, pointer }) {
  if (typeof pointer !== 'string' || !pointer) throw new Error('judge needs the pointer the release is published to');
  const problems = [];
  if (!deployments.length) problems.push('No production deployment is configured (config/production.json), so none can be shown to read the release.');
  for (const { url, info, error } of deployments) {
    if (error) { problems.push(`${url} does not say which code it runs: ${error}.`); continue; }
    if (!isBuildInfo(info)) { problems.push(`${url}/build-info.json is not a build record.`); continue; }
    const runs = `${url} runs ${short(info.commit)}`;
    if (info.dirty) problems.push(`${runs} built with uncommitted changes, so no commit's release can be shown to match it.`);
    else if (info.contentSchema !== release.schema) problems.push(`${runs}, which reads content schema ${info.contentSchema}; the release is schema ${release.schema}.`);
    else if (info.codeFingerprint !== release.codeFingerprint) {
      problems.push(`${runs}, not the code of ${short(release.generator)} that compiles the release (code ${short(info.codeFingerprint)} there, ${short(release.codeFingerprint)} here).`);
    }
    // A build from before build-info named its channel says nothing, and is taken at its branch.
    if (info.contentChannel !== undefined && info.contentChannel !== pointer) {
      problems.push(`${runs} built to read the ${info.contentChannel} pointer, so it never reads this release, which is published to ${pointer}.`);
    }
  }
  return { publish: problems.length === 0, problems };
}

/** One deployment's /build-info.json, never from a cache. A 404 is an answer (a build from
 *  before the gate); anything else that is not a record is retried, then reported. */
export async function readBuildInfo(url, { fetch = globalThis.fetch, attempts = 3, retryMs = Number(process.env.ARKPEDIA_GATE_RETRY_MS ?? 3000) } = {}) {
  let last = 'no answer';
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(`${url}/build-info.json?release-gate=${Date.now()}`, {
        cache: 'no-store', headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15_000),
      });
      if (response.status === 404) return { url, error: 'it serves no /build-info.json (a build from before the release gate)' };
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return { url, info: await response.json() };
    } catch (error) {
      last = error instanceof Error ? (error.cause instanceof Error ? `${error.message}: ${error.cause.message}` : error.message) : String(error);
    }
    if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, retryMs * attempt));
  }
  return { url, error: `${last} after ${attempts} tries` };
}

/** The release a manifest describes, once its fingerprint is shown to be its generator's. */
export function releaseFromManifest(file, { cwd = process.cwd() } = {}) {
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!GIT_SHA.test(manifest.generator ?? '') || !HEX64.test(manifest.codeFingerprint ?? '') || !Number.isInteger(manifest.schema)) {
    throw new Error(`${file} names no generator commit, code fingerprint and schema`);
  }
  let actual;
  try { actual = codeFingerprint(manifest.generator, { cwd }); } catch {
    throw new Error(`The generator ${manifest.generator} is not in this checkout, so the manifest's code fingerprint cannot be checked`);
  }
  if (actual !== manifest.codeFingerprint) throw new Error(`The manifest's code fingerprint ${short(manifest.codeFingerprint)} is not its generator's (${short(actual)})`);
  return { generator: manifest.generator, codeFingerprint: manifest.codeFingerprint, schema: manifest.schema };
}

/** The release a commit would compile. */
export function releaseFromRef(ref, { cwd = process.cwd() } = {}) {
  const generator = execFileSync('git', ['rev-parse', '--verify', `${ref}^{commit}`], { cwd, encoding: 'utf8' }).trim();
  return { generator, codeFingerprint: codeFingerprint(generator, { cwd }), schema: SCHEMA };
}

/** Who has to run a channel's code, as the gate names it in its log and its report: production
 *  for main's channel, `<branch>'s deployment` for another (dev's, arkpedia-dev). Main was once
 *  the only channel, and the dev channel's log still said "Production runs the code". */
export function siteFor(branch) {
  if (typeof branch !== 'string' || !branch) throw new Error('siteFor needs the branch whose channel compiles the release');
  return branch === RELEASE_BRANCH ? 'production' : `${branch}'s deployment`;
}

/** The 'Content release held' issue's body. `branch` is the channel's (ARKPEDIA_RELEASE_BRANCH):
 *  what lets the release out again differs, since a held dev release starts again by itself. */
export function heldReport({ release, problems, compiled, branch }) {
  if (typeof branch !== 'string' || !branch) throw new Error('heldReport needs the branch whose channel compiled the release');
  const from = release
    ? `${compiled ? 'was compiled' : 'would be compiled'} by arkpedia/arkpedia \`${release.generator}\` (code fingerprint \`${short(release.codeFingerprint)}\`)`
    : 'could not be identified';
  const site = siteFor(branch);
  const again = branch === RELEASE_BRANCH
    ? 'then dispatch **Prepare content release**, or wait for the next scheduled run.'
    : `and the next successful Deploy of ${branch} starts ${branch}'s run again.`;
  return [
    `**The content release was not published: ${site} cannot be shown to read it.**`,
    '',
    `A release goes live only while the deployments of its branch run the code that compiled it (\`scripts/content/deploy-gate.mjs\`). This one ${from}:`,
    '',
    ...problems.map(problem => `- ${problem}`),
    '',
    `Published anyway, it could break every page whose deployed code still expects the previous release's props. It goes out once ${site} runs this code: let Check and Deploy finish on ${branch} (a red Check or a failed Deploy keeps it held; each has its own issue), ${again}`,
    '',
  ].join('\n');
}

const command = text => String(text).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');

export async function main(argv, { env = process.env, fetch = globalThis.fetch } = {}) {
  const opts = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!['--manifest', '--ref', '--held-file'].includes(argv[i]) || argv[i + 1] === undefined) throw new Error(`usage: deploy-gate.mjs --manifest <file> | --ref <ref> [--held-file <file>] (at ${argv[i]})`);
    opts[argv[i].slice(2)] = argv[i + 1];
  }
  if (Boolean(opts.manifest) === Boolean(opts.ref)) throw new Error('Give exactly one of --manifest and --ref');
  let release = null;
  let problems;
  try {
    release = opts.manifest ? releaseFromManifest(opts.manifest) : releaseFromRef(opts.ref);
    const deployments = await Promise.all(deploymentUrls(env).map(url => readBuildInfo(url, { fetch })));
    // The channel step sets the pointer for every later step; a run without one publishes to live.
    ({ problems } = judge({ release, deployments, pointer: env.ARKPEDIA_CONTENT_POINTER || 'live' }));
  } catch (error) {
    problems = [`${error instanceof Error ? error.message : error}.`];
  }
  const branch = env.ARKPEDIA_RELEASE_BRANCH || RELEASE_BRANCH;
  if (!problems.length) {
    const site = siteFor(branch);
    console.log(`${site[0].toUpperCase()}${site.slice(1)} runs the code that ${opts.manifest ? 'compiled this release' : 'compiles this release'} (${short(release.generator)}, code ${short(release.codeFingerprint)}).`);
    return 0;
  }
  const report = heldReport({ release, problems, compiled: Boolean(opts.manifest), branch });
  if (opts['held-file']) fs.writeFileSync(opts['held-file'], report);
  console.log(`::error title=Content release held::${command(problems[0])}`);
  console.log(report);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(code => { process.exitCode = code; }, error => { console.error(error); process.exitCode = 2; });
}
