#!/usr/bin/env node
// Trusted main controller. Feature code is downloaded only as a checked archive;
// it is never checked out, installed or used to supply deployment helpers.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, lstatSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { githubQuery, inspectPreviewCheck } from './preview-github.mjs';
import { planPreviewUpdate, recheckPreviewUpdate, recordPreviewOwner, planPreviewRetirement } from './preview-lifecycle.mjs';
import { createStagingProvider, previewAnnotations } from './preview-provider.mjs';
import { readStagingConfig } from './cloudflare-staging.mjs';
import { assertStagingRun, assertBuildRequest, verifyBuildProducer } from './preview-build.mjs';
import { assertLatestPreviewCheck } from './preview-request.mjs';

const REPOSITORY = 'arkpedia/arkpedia';
const root = fileURLToPath(new URL('../../', import.meta.url));
const positive = value => Number.isSafeInteger(value) && value > 0;
const requireValue = (value, message) => { if (!value) throw new Error(`Preview controller refused: ${message}`); };

export function fetchVerifiedPreviewArtifact(request, { query = githubQuery, run = execFileSync } = {}) {
  requireValue(/^[a-f0-9]{40}$/.test(request.source ?? '') && positive(request.buildRun) && positive(request.artifact),
    'missing explicit source/build/artifact');
  const build = query(`repos/${REPOSITORY}/actions/runs/${request.buildRun}`);
  const artifact = query(`repos/${REPOSITORY}/actions/artifacts/${request.artifact}`);
  assertStagingRun(build, request);
  if (request.controllerCommit) verifyBuildProducer(build, { query });
  requireValue(artifact.id === request.artifact && artifact.expired === false
    && artifact.workflow_run?.id === build.id && artifact.name === `arkpedia-staging-${request.source}`
    && Number.isSafeInteger(artifact.size_in_bytes) && artifact.size_in_bytes > 0
    && artifact.size_in_bytes <= 1024 ** 3, 'artifact provenance/size differs');
  const parent = resolve(tmpdir());
  const temporary = mkdtempSync(join(parent, 'arkpedia-preview-'));
  const cleanup = () => {
    const target = resolve(temporary);
    requireValue(dirname(target) === parent && basename(target).startsWith('arkpedia-preview-'), 'unsafe scratch cleanup');
    rmSync(target, { recursive: true, force: true });
  };
  try {
    const download = join(temporary, 'download');
    run('gh', ['run', 'download', String(build.id), '--repo', REPOSITORY,
      '--name', artifact.name, '--dir', download], { timeout: 180_000, stdio: ['ignore', 'pipe', 'pipe'] });
    const names = readdirSync(download).sort();
    requireValue(JSON.stringify(names) === JSON.stringify(['arkpedia-staging-receipt.json', 'arkpedia-staging.tgz']), 'unexpected downloaded artifact files');
    const receiptFile = join(download, names[0]);
    const archive = join(download, names[1]);
    requireValue(lstatSync(receiptFile).isFile() && lstatSync(receiptFile).size <= 65536
      && lstatSync(archive).isFile() && lstatSync(archive).size <= 1024 ** 3, 'invalid downloaded archive/receipt');
    const receipt = JSON.parse(readFileSync(receiptFile, 'utf8'));
    assertBuildRequest(build, receipt, request);
    const directory = join(temporary, 'extracted');
    run('python', [join(root, 'scripts/deploy/staging-artifact.py'), 'extract', '--archive', archive,
      '--receipt', receiptFile, '--commit', request.source, '--run', String(build.id),
      '--trusted-config', join(root, 'wrangler.staging.jsonc'), '--destination', directory, '--without-prerender-cache'],
    { timeout: 180_000, stdio: ['ignore', 'pipe', 'pipe'] });
    return { build, artifact, receipt, directory, cleanup };
  } catch (error) { cleanup(); throw error; }
}

export async function publishPreview(request, {
  query = githubQuery, inspect = inspectPreviewCheck, obtain = fetchVerifiedPreviewArtifact,
  provider = createStagingProvider(),
} = {}) {
  requireValue(request.repository === REPOSITORY, 'wrong repository');
  if (request.controllerCommit) assertLatestPreviewCheck(request.pr, request.source, request.checkRun, { query });
  const proof = inspect({ number: request.pr, source: request.source, runId: request.checkRun });
  const verified = obtain(request);
  try {
    const before = provider.observe();
    await provider.health(before.intent);
    const pr = query(`repos/${REPOSITORY}/pulls/${request.pr}`);
    const plan = planPreviewUpdate({ request, pr, build: verified.build, artifact: verified.artifact,
      receipt: verified.receipt, sourceTree: proof.tree, liveVersion: before.version.id, owner: before.intent });
    const annotations = previewAnnotations(plan, request.checkRun);
    if (request.controllerCommit) assertLatestPreviewCheck(request.pr, request.source, request.checkRun, { query });
    recheckPreviewUpdate(plan, { pr: query(`repos/${REPOSITORY}/pulls/${request.pr}`), liveVersion: provider.observe().version.id });
    try {
      const after = provider.deploy(plan, request.checkRun, verified.directory);
      if (request.controllerCommit) assertLatestPreviewCheck(request.pr, request.source, request.checkRun, { query });
      // A source push during upload invalidates this publication, even if healthy.
      recheckPreviewUpdate({ ...plan, expectedVersion: after.version.id }, {
        pr: query(`repos/${REPOSITORY}/pulls/${request.pr}`), liveVersion: provider.observe().version.id });
      const health = await provider.health(plan);
      requireValue(provider.observe().version.id === after.version.id, 'provider changed during health verification');
      return { action: 'published', owner: recordPreviewOwner(plan, { version: after.version.id, ...health }), check: proof };
    } catch (error) {
      // A deploy may fail after the provider accepted it. Recover by its exact
      // metadata, never by guessing that the newest version must belong to us.
      const actual = provider.observe();
      if (actual.version.id === plan.expectedVersion) throw error;
      requireValue(actual.version.annotations?.['workers/message'] === annotations.message
        && actual.version.annotations?.['workers/tag'] === annotations.tag, 'publication failed after an unrelated provider change; reconcile manually');
      provider.rollback(actual.version.id);
      await provider.health(null);
      throw new Error(`Preview publication failed; verified original baseline restored: ${error.message}`, { cause: error });
    }
  } finally { verified.cleanup(); }
}

export async function retirePreview({ number, explicitlyRequested = false }, {
  query = githubQuery, provider = createStagingProvider(),
} = {}) {
  const current = provider.observe();
  const plan = planPreviewRetirement({ number, pr: current.intent?.pr === number
    ? query(`repos/${REPOSITORY}/pulls/${number}`) : null, owner: current.intent,
  liveVersion: current.version.id, explicitlyRequested });
  if (plan.action === 'none') return plan;
  provider.rollback(plan.expectedVersion);
  await provider.health(null);
  return { action: 'retired', pr: number, restoredVersion: plan.targetVersion };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    const localOAuth = args.at(-1) === '--local-oauth';
    if (localOAuth) args.pop();
    const [action, pr, source, checkRun, buildRun, artifact] = args;
    requireValue(['publish', 'publish-request', 'retire', 'closed'].includes(action), 'invalid action');
    requireValue(args.length === (action === 'publish' ? 6 : action === 'publish-request' ? 1 : 2), 'unexpected controller arguments');
    if (action !== 'publish-request') requireValue(/^[1-9][0-9]*$/.test(pr ?? ''), 'invalid PR');
    requireValue(process.env.CLOUDFLARE_API_TOKEN || localOAuth, 'configure the Worker-scoped staging token; local proof requires --local-oauth');
    readStagingConfig(join(root, 'wrangler.staging.jsonc'));
    let result;
    if (action === 'publish-request') {
      requireValue(typeof process.env.PREVIEW_REQUEST_JSON === 'string'
        && Buffer.byteLength(process.env.PREVIEW_REQUEST_JSON) <= 65536, 'missing bounded resolved request');
      result = await publishPreview(JSON.parse(process.env.PREVIEW_REQUEST_JSON));
    } else if (action === 'publish') {
      requireValue([checkRun, buildRun, artifact].every(value => /^[1-9][0-9]*$/.test(value ?? '')), 'expected explicit Check/build/artifact IDs');
      result = await publishPreview({ repository: REPOSITORY, pr: Number(pr), source,
        checkRun: Number(checkRun), buildRun: Number(buildRun), artifact: Number(artifact) });
    } else {
      result = await retirePreview({ number: Number(pr), explicitlyRequested: action === 'retire' });
    }
    console.log(JSON.stringify(result, null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
