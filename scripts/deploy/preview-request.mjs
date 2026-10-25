#!/usr/bin/env node
// PR-number entry point. A request dispatches one secret-free build and returns;
// its completed workflow_run resumes publication without occupying a waiting runner.
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { githubQuery, inspectPreviewCheck, readStagingReceiptArtifact } from './preview-github.mjs';
import { validatePreviewRequest, verifyBuildProducer } from './preview-build.mjs';

const REPOSITORY = 'arkpedia/arkpedia';
const PREFIX = `repos/${REPOSITORY}`;
const SHA = /^[a-f0-9]{40}$/;
const HASH = /^[a-f0-9]{64}$/;
const positive = value => Number.isSafeInteger(value) && value > 0;
const requireValue = (value, message) => { if (!value) throw new Error(`Preview request refused: ${message}`); };

function githubDispatch(body) {
  return JSON.parse(execFileSync('gh', ['api', `${PREFIX}/actions/workflows/cloudflare-staging.yml/dispatches`,
    '--method', 'POST', '--header', 'X-GitHub-Api-Version: 2026-03-10', '--input', '-'],
  { input: JSON.stringify(body), encoding: 'utf8', maxBuffer: 65536 }));
}

function readyPr(number, query) {
  requireValue(positive(number), 'expected a PR number');
  const pr = query(`${PREFIX}/pulls/${number}`);
  requireValue(pr?.number === number && pr.state === 'open' && pr.draft === false
    && pr.base?.ref === 'main' && pr.base.repo?.full_name === REPOSITORY
    && pr.head?.repo?.full_name === REPOSITORY && SHA.test(pr.head.sha ?? ''),
  'PR must be ready, open, same-repository and targeting main');
  return pr;
}

function inventory(response, field) {
  const items = response?.[field];
  requireValue(Array.isArray(items) && response.total_count === items.length, 'incomplete API inventory');
  return items;
}

function newest(runs) {
  requireValue(runs.every(run => positive(run.id) && Number.isFinite(Date.parse(run.created_at))), 'invalid run inventory');
  return [...runs].sort((a,b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id)[0];
}

export const previewBuildTitle = (number, source, checkRun) => `Preview PR ${number} ${source} Check ${checkRun}`;

function currentCheck(pr, query) {
  const runs = inventory(query(`${PREFIX}/actions/workflows/check.yml/runs?head_sha=${pr.head.sha}&event=pull_request&per_page=100`), 'workflow_runs');
  const run = newest(runs.filter(run => run.head_sha === pr.head.sha && run.repository?.full_name === REPOSITORY
    && run.head_repository?.full_name === REPOSITORY && run.pull_requests?.length === 1
    && run.pull_requests[0].number === pr.number && run.pull_requests[0].base?.ref === 'main'));
  requireValue(run?.status === 'completed' && run.conclusion === 'success', 'latest current-source Check is not successful; no build started');
  return run;
}

export function assertLatestPreviewCheck(number, source, runId, { query = githubQuery } = {}) {
  const pr = readyPr(number, query);
  requireValue(pr.head.sha === source && currentCheck(pr, query).id === runId,
    'current PR source or latest Check changed');
  return pr;
}

export function resolveCompletedPreview(buildRun, {
  query = githubQuery, readReceipt = readStagingReceiptArtifact, inspect = inspectPreviewCheck, blobId,
} = {}) {
  requireValue(positive(buildRun), 'invalid build run ID');
  const build = query(`${PREFIX}/actions/runs/${buildRun}`);
  requireValue(build.id === buildRun && build.status === 'completed' && build.conclusion === 'success', 'build is not successfully complete');
  verifyBuildProducer(build, { query, ...(blobId ? { blobId } : {}) });
  const artifacts = inventory(query(`${PREFIX}/actions/runs/${buildRun}/artifacts?per_page=100`), 'artifacts');
  const envelopes = artifacts.filter(item => /^arkpedia-staging-request-[a-f0-9]{40}$/.test(item.name ?? ''));
  if (envelopes.length === 0) return { mode: 'none', reason: 'build-only run without a preview request' };
  requireValue(envelopes.length === 1 && envelopes[0].expired === false
    && envelopes[0].workflow_run?.id === buildRun, 'request receipt is missing, expired or ambiguous');
  const receipt = readReceipt(build, envelopes[0]);
  const request = validatePreviewRequest(receipt.previewRequest);
  requireValue(request.controllerCommit === build.head_sha && receipt.format === 1
    && receipt.repository === REPOSITORY && receipt.workflow === 'cloudflare-staging.yml'
    && receipt.runId === String(buildRun) && receipt.build?.version === 1
    && receipt.build.commit === request.source && receipt.build.dirty === false
    && receipt.build.deploymentRole === 'staging' && receipt.build.contentChannel === 'live'
    && HASH.test(receipt.sha256 ?? '') && HASH.test(receipt.configSha256 ?? '')
    && HASH.test(receipt.build.codeFingerprint ?? ''), 'receipt/source producer binding differs');
  requireValue(envelopes[0].name === `arkpedia-staging-request-${request.source}`
    && build.display_title === previewBuildTitle(request.pr, request.source, request.checkRun), 'request title/artifact differs');
  const archives = artifacts.filter(item => item.name === `arkpedia-staging-${request.source}`);
  requireValue(archives.length === 1 && positive(archives[0].id) && archives[0].expired === false
    && archives[0].workflow_run?.id === buildRun, 'missing exact build archive');
  const pr = readyPr(request.pr, query);
  requireValue(pr.head.sha === request.source, 'PR moved during the build; nothing published');
  requireValue(currentCheck(pr, query).id === request.checkRun, 'latest Check changed during the build');
  inspect({ number: request.pr, source: request.source, runId: request.checkRun }, { query });
  return { mode: 'publish', pr: request.pr, request: { repository: REPOSITORY, ...request, buildRun, artifact: archives[0].id } };
}

export function requestPreview(number, {
  query = githubQuery, dispatch = githubDispatch, inspect = inspectPreviewCheck,
  readReceipt = readStagingReceiptArtifact, blobId,
} = {}) {
  const pr = readyPr(number, query);
  const check = currentCheck(pr, query);
  inspect({ number, source: pr.head.sha, runId: check.id }, { query });
  const main = query(`${PREFIX}/git/ref/heads/main`).object?.sha;
  requireValue(SHA.test(main ?? ''), 'missing main producer identity');
  verifyBuildProducer({ head_branch: 'main', head_sha: main, event: 'workflow_dispatch',
    path: '.github/workflows/cloudflare-staging.yml', repository: { full_name: REPOSITORY },
    head_repository: { full_name: REPOSITORY } }, { query, ...(blobId ? { blobId } : {}) });
  // Bound lookup to this actual producer commit; no ambiguous search by branch/time.
  const runs = inventory(query(`${PREFIX}/actions/workflows/cloudflare-staging.yml/runs?head_sha=${main}&event=workflow_dispatch&per_page=100`), 'workflow_runs');
  const existing = newest(runs.filter(run => run.display_title === previewBuildTitle(number, pr.head.sha, check.id)));
  if (existing) {
    verifyBuildProducer(existing, { query, ...(blobId ? { blobId } : {}) });
    if (['queued', 'pending', 'waiting', 'requested', 'in_progress'].includes(existing.status)) {
      return { mode: 'waiting', pr: number, buildRun: existing.id, reused: true };
    }
    requireValue(existing.status === 'completed', 'unknown existing build state');
    if (existing.conclusion === 'success') {
      const artifacts = inventory(query(`${PREFIX}/actions/runs/${existing.id}/artifacts?per_page=100`), 'artifacts');
      if (artifacts.some(item => item.name === `arkpedia-staging-${pr.head.sha}` && item.expired === false)) {
        return resolveCompletedPreview(existing.id, { query, inspect, readReceipt, blobId });
      }
    }
    // A new explicit request may replace a terminal failed/expired build. No
    // automatic retry or restart occurs on a wait timeout or transport failure.
  }
  requireValue(readyPr(number, query).head.sha === pr.head.sha, 'PR moved before dispatch');
  const result = dispatch({ ref: 'main', inputs: { source: pr.head.sha, pr: String(number), check_run: String(check.id) } });
  requireValue(positive(result?.workflow_run_id), 'dispatch outcome unknown; inspect GitHub before requesting again');
  return { mode: 'waiting', pr: number, buildRun: result.workflow_run_id, reused: false };
}

export function buildInputs(environment) {
  const source = environment.STAGING_SOURCE || environment.GITHUB_SHA;
  requireValue(SHA.test(source ?? ''), 'source must be a full SHA');
  const preview = Boolean(environment.STAGING_PR || environment.STAGING_CHECK);
  const result = { source, pr: '', checkRun: '', controllerCommit: '' };
  if (preview) {
    requireValue(SHA.test(environment.STAGING_SOURCE ?? '') && environment.GITHUB_REF === 'refs/heads/main' && /^[1-9][0-9]*$/.test(environment.STAGING_PR ?? '')
      && /^[1-9][0-9]*$/.test(environment.STAGING_CHECK ?? ''), 'preview producer requires main and complete numeric inputs');
    const request = validatePreviewRequest({ pr: Number(environment.STAGING_PR), source,
      checkRun: Number(environment.STAGING_CHECK), controllerCommit: environment.GITHUB_SHA });
    Object.assign(result, { pr: String(request.pr), checkRun: String(request.checkRun), controllerCommit: request.controllerCommit });
  }
  return result;
}

function output(values) {
  if (process.env.GITHUB_OUTPUT) for (const [key, value] of Object.entries(values)) {
    const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
    requireValue(!/[\r\n]/.test(text), 'multiline output refused');
    appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${text}\n`);
  }
  console.log(JSON.stringify(values));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv[2] === 'build-inputs') output(buildInputs(process.env));
    else if (process.argv[2] === 'prepare') {
      requireValue(statSync(process.env.GITHUB_EVENT_PATH).size <= 2_000_000, 'oversized workflow event');
      const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
      let result;
      if (process.env.GITHUB_EVENT_NAME === 'workflow_run') result = resolveCompletedPreview(event.workflow_run?.id);
      else if (process.env.GITHUB_EVENT_NAME === 'pull_request_target') {
        requireValue(event.action === 'closed' && positive(event.pull_request?.number), 'unexpected PR event');
        result = { mode: 'closed', pr: event.pull_request.number };
      } else {
        requireValue(process.env.GITHUB_EVENT_NAME === 'workflow_dispatch'
          && process.env.GITHUB_REF === 'refs/heads/main', 'manual requests must use main');
        const number = Number(event.inputs?.pr);
        requireValue(/^[1-9][0-9]*$/.test(event.inputs?.pr ?? '') && positive(number), 'invalid PR input');
        if (event.inputs.action === 'retire') result = { mode: 'retire', pr: number };
        else { requireValue(event.inputs.action === 'publish', 'unexpected requested action'); result = requestPreview(number); }
      }
      output(result);
      if (result.buildRun && process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,
        `Preview build: https://github.com/${REPOSITORY}/actions/runs/${result.buildRun}\n`);
    } else throw new Error('Use prepare or build-inputs');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
