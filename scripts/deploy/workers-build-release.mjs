#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { approvePilotRelease } from './pilot-release-gate.mjs';
import { publishPilotRelease } from './pilot-release.mjs';
import { createPilotProvider, PILOT } from './pilot-release-provider.mjs';
import { readPilotConfig, readPilotBuild } from './cloudflare-pilot.mjs';
import { readContentReaders } from './deploy-targets.mjs';
import { codeFingerprint, uncommittedChanges } from '../content/code-fingerprint.mjs';

const REPOSITORY = 'arkpedia/arkpedia';
// The clean replacement, not the private archive retaining the old PR objects.
const REPOSITORY_ID = 1455377998;
const requireValue = (value, message) => { if (!value) throw new Error(`Workers build release refused: ${message}`); };

export function workersBuildSource(environment, head) {
  requireValue(environment.WORKERS_CI === '1' && environment.CI === 'true'
    && environment.WORKERS_CI_BRANCH === 'main'
    && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(environment.WORKERS_CI_BUILD_UUID ?? ''),
  'only a main Cloudflare Workers Build may publish production');
  requireValue(environment.ARKPEDIA_DEPLOYMENT_OWNER === 'cloudflare-builds', 'Cloudflare deployment ownership is not enabled');
  const source = environment.WORKERS_CI_COMMIT_SHA;
  requireValue(/^[a-f0-9]{40}$/.test(source ?? '') && head === source, 'checkout differs from Cloudflare source');
  return source;
}

export function githubReader({ request = fetch, token = process.env.GH_TOKEN } = {}) {
  return async path => {
    requireValue(path.startsWith(`repos/${REPOSITORY}/`) || path === `repos/${REPOSITORY}`, 'unexpected GitHub resource');
    const response = await request(`https://api.github.com/${path}`, {
      headers: { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28',
        'user-agent': 'arkpedia-workers-build', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      redirect: 'error', signal: AbortSignal.timeout(30_000),
    });
    requireValue(response.ok, `GitHub verification returned HTTP ${response.status}`);
    return response.json();
  };
}

export async function checkedWorkersBuild(source, github) {
  requireValue(/^[a-f0-9]{40}$/.test(source ?? ''), 'invalid source');
  const repository = await github(`repos/${REPOSITORY}`);
  requireValue(repository.id === REPOSITORY_ID && repository.full_name === REPOSITORY
    && repository.default_branch === 'main', 'canonical repository is not the clean replacement');
  const result = await github(`repos/${REPOSITORY}/actions/workflows/check.yml/runs?event=push&branch=main&head_sha=${source}&per_page=1`);
  const run = result.workflow_runs?.[0];
  requireValue(Number.isSafeInteger(run?.id) && run.id > 0 && run.head_sha === source,
    'no main Check for this source; retry the Cloudflare build after Check succeeds');
  // A newer pending/failed rerun must not fall back to an older green run.
  return approvePilotRelease({ repository: REPOSITORY, runId: run.id, source, github });
}

export async function deployWorkersBuild({ source, build, github, provider, sleep }) {
  const checked = await checkedWorkersBuild(source, github);
  return publishPilotRelease({ source, checkRun: checked.checkRun, build, provider, sleep,
    approve: async () => {
      const current = await checkedWorkersBuild(source, github);
      requireValue(current.checkRun === checked.checkRun, 'Check changed during release');
    } });
}

async function main() {
  const source = workersBuildSource(process.env, execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim());
  requireValue(uncommittedChanges().length === 0, 'checkout changed after the build');
  readPilotConfig();
  requireValue(readContentReaders().some(reader => reader.url === PILOT.origin && reader.branch === 'main' && reader.live),
    'production is not registered as a main content reader');
  const build = readPilotBuild(source, codeFingerprint(source));
  execFileSync(process.execPath, ['scripts/deploy/check-public-assets-ready.mjs'], { stdio: 'inherit' });
  const result = await deployWorkersBuild({ source, build, github: githubReader(), provider: createPilotProvider() });
  mkdirSync('.cache', { recursive: true });
  writeFileSync('.cache/workers-build-release.json', JSON.stringify({ ...result, cloudflareBuild: process.env.WORKERS_CI_BUILD_UUID }, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(JSON.stringify({ action: 'failed', reason: error.message, ...(error.recovery ? { recovery: error.recovery } : {}) }));
    process.exitCode = 1;
  });
}
