#!/usr/bin/env node
/*
 * Whether a push or same-repository PR is code a pull request's Check already passed, so Check need not
 * run it again (.github/workflows/check.yml, the `seen` job).
 *
 * A pull request's Check runs on its merge result (refs/pull/N/merge) and, when green,
 * uploads an empty artifact named checked-tree-<tree>, the git tree of that result. When
 * main has not moved since, merging the pull request makes a commit with that same tree,
 * so the code is the code already checked, and Deploy can follow at once. When anything
 * else landed in between, the tree differs and the full Check runs. A history-only PR
 * rebase can use the same proof: checkout is the prospective merge tree in either case.
 *
 * Only a completed, successful Check of a pull_request event from this repository counts:
 * not a fork's run, not a run that uploaded and then failed, not another workflow. Any
 * doubt (the API unreachable, no match) prints checked=false, and the full Check runs.
 *
 * Prints `checked=true|false` for $GITHUB_OUTPUT; the reason goes to stderr.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ARTIFACT_PREFIX, POLICY_ARTIFACT_PREFIX, POLICY_FILES, policyFingerprint, validateBrowserEvidence } from './browser-evidence.mjs';
import { hydrateProofPullRequest, revalidateFullBaseline } from './browser-baseline.mjs';

export { ARTIFACT_PREFIX } from './browser-evidence.mjs';

/** The run among `runs` that vouches for `tree`, or null. `artifacts` are those named for
 *  it; `runs` maps a run id to that run's API record. */
export function vouching(tree, artifacts, runs, repository, baseRef) {
  for (const artifact of artifacts) {
    if (artifact.name !== `${ARTIFACT_PREFIX}${tree}` || artifact.expired !== false) continue;
    const run = runs[artifact.workflow_run?.id];
    if (!run) continue;
    if (run.status !== 'completed' || run.conclusion !== 'success') continue;
    if (run.event !== 'pull_request') continue;
    if (run.path !== '.github/workflows/check.yml') continue;
    if (run.repository?.full_name !== repository || run.head_repository?.full_name !== repository) continue;
    if (baseRef !== undefined && (!baseRef || !Array.isArray(run.pull_requests)
      || run.pull_requests.length !== 1 || run.pull_requests[0]?.base?.ref !== baseRef)) continue;
    return run;
  }
  return null;
}

export function legacyProof(tree, artifacts, runs, repository, baseRef, { query = api } = {}) {
  const recovered = { ...runs };
  if (baseRef) for (const artifact of artifacts) {
    const run = runs[artifact.workflow_run?.id];
    if (artifact.name !== `${ARTIFACT_PREFIX}${tree}` || artifact.expired !== false || !run
      || run.status !== 'completed' || run.conclusion !== 'success' || run.event !== 'pull_request'
      || run.path !== '.github/workflows/check.yml' || run.repository?.full_name !== repository || run.head_repository?.full_name !== repository) continue;
    recovered[run.id] = hydrateProofPullRequest(run, { repository, baseRef, tree, query });
  }
  return vouching(tree, artifacts, recovered, repository, baseRef);
}

function api(path) {
  return JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8', maxBuffer: 16_000_000 }));
}

/** A policy artifact is partial coverage, never a legacy full-tree marker. */
export function policyVouching({ tree, policySha256, artifact, run, jobs, record, repository, baseRef }) {
  if (!artifact || artifact.expired !== false || artifact.name !== `${POLICY_ARTIFACT_PREFIX}${tree}-${policySha256}`
    || !Number.isSafeInteger(artifact.id) || artifact.id < 1 || artifact.workflow_run?.id !== run?.id) return null;
  if (!run || run.status !== 'completed' || run.conclusion !== 'success' || run.event !== 'pull_request'
    || run.path !== '.github/workflows/check.yml' || run.repository?.full_name !== repository || run.head_repository?.full_name !== repository
    || !Array.isArray(run.pull_requests) || run.pull_requests.length !== 1 || run.pull_requests[0]?.base?.ref !== baseRef) return null;
  try { validateBrowserEvidence(record, { tree, policySha256, repository, baseRef, runId: run.id }); }
  catch { return null; }
  if (!['targeted', 'none'].includes(record.coverage.lane) || !Array.isArray(jobs)) return null;
  const checks = jobs.filter(job => job.name === 'check');
  if (checks.length !== 1) return null;
  const job = checks[0];
  if (job.status !== 'completed' || job.conclusion !== 'success' || job.run_id !== run.id
    || !Number.isSafeInteger(job.id) || job.id < 1 || !Array.isArray(job.steps)) return null;
  const step = name => { const matches = job.steps.filter(item => item.name === name); return matches.length === 1 ? matches[0] : null; };
  const success = item => item?.status === 'completed' && item.conclusion === 'success';
  const skipped = item => item?.status === 'completed' && item.conclusion === 'skipped';
  if (!success(step('Validate browser execution evidence')) || !success(step('Record selected browser coverage'))) return null;
  if (!skipped(step('Desktop and mobile browser regressions'))) return null;
  const selected = step('Selected browser regressions');
  if (record.coverage.lane === 'targeted' ? !success(selected) : !skipped(selected)) return null;
  return record;
}

function downloadEvidence(run, artifact) {
  const root = path.resolve(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(root, 'arkpedia-policy-proof-'));
  try {
    execFileSync('gh', ['run', 'download', String(run.id), '--repo', process.env.GITHUB_REPOSITORY,
      '--name', artifact.name, '--dir', directory], { stdio: ['ignore', 'pipe', 'pipe'] });
    const names = fs.readdirSync(directory);
    if (names.length !== 1 || names[0] !== 'browser-evidence.json') throw new Error('Unexpected policy artifact contents');
    const file = path.join(directory, names[0]);
    const info = fs.lstatSync(file);
    if (!info.isFile() || info.size > 5_000_000) throw new Error('Invalid policy evidence file');
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } finally {
    const target = path.resolve(directory);
    if (path.dirname(target) !== root || !path.basename(target).startsWith('arkpedia-policy-proof-')) throw new Error('Unsafe temporary proof path');
    fs.rmSync(target, { recursive: true, force: true });
  }
}

export function policyProofStillValid(record, head, { query = api } = {}) {
  const baseline = revalidateFullBaseline(record.baseline, { query });
  if (!baseline) return false;
  const comparison = query(`repos/${record.repository}/compare/${baseline.commit}...${head}`);
  return ['ahead', 'identical'].includes(comparison.status) && comparison.merge_base_commit?.sha === baseline.commit;
}

async function main() {
  const repository = process.env.GITHUB_REPOSITORY;
  const tree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim();
  try {
    const { artifacts = [] } = api(`repos/${repository}/actions/artifacts?name=${ARTIFACT_PREFIX}${tree}&per_page=20`);
    const runs = {};
    for (const artifact of artifacts) {
      const id = artifact.workflow_run?.id;
      if (id && !runs[id]) runs[id] = api(`repos/${repository}/actions/runs/${id}`);
    }
    // A PR proof belongs to its target branch as well as its exact merge tree.
    // Unknown PR metadata fails closed; push reuse keeps its established policy.
    const baseRef = process.env.GITHUB_EVENT_NAME === 'pull_request' ? process.env.GITHUB_BASE_REF ?? '' : undefined;
    const run = legacyProof(tree, artifacts, runs, repository, baseRef);
    if (run) {
      console.error(`Tree ${tree.slice(0, 12)} passed Check in pull request run ${run.html_url}; not checking it again.`);
      console.log('checked=true');
      return;
    }
    // Only current-policy, exact-tree, successful completed coverage may substitute.
    const policySha256 = policyFingerprint(Object.fromEntries(POLICY_FILES.map(file => [file,
      execFileSync('git', ['rev-parse', `HEAD:${file}`], { encoding: 'utf8' }).trim()])));
    const target = process.env.GITHUB_BASE_REF || (process.env.GITHUB_EVENT_NAME === 'workflow_dispatch'
      && process.env.GITHUB_REF_NAME?.startsWith('sync/main-to-dev-') ? 'dev' : process.env.GITHUB_REF_NAME);
    const partial = api(`repos/${repository}/actions/artifacts?name=${POLICY_ARTIFACT_PREFIX}${tree}-${policySha256}&per_page=20`).artifacts ?? [];
    for (const artifact of partial) {
      if (artifact.expired !== false || !artifact.workflow_run?.id) continue;
      const source = api(`repos/${repository}/actions/runs/${artifact.workflow_run.id}`);
      if (source.status !== 'completed' || source.conclusion !== 'success' || source.event !== 'pull_request'
        || source.repository?.full_name !== repository || source.head_repository?.full_name !== repository) continue;
      const hydrated = hydrateProofPullRequest(source, { repository, baseRef: target, tree, query: api });
      if (!hydrated) continue;
      const response = api(`repos/${repository}/actions/runs/${source.id}/jobs?filter=latest&per_page=100`);
      if (!Array.isArray(response.jobs) || response.total_count !== response.jobs.length) continue;
      const record = downloadEvidence(source, artifact);
      if (!policyVouching({ tree, policySha256, artifact, run: hydrated, jobs: response.jobs, record, repository, baseRef: target })) continue;
      const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
      if (!policyProofStillValid(record, head)) continue;
      console.error(`Tree ${tree.slice(0, 12)} passed ${record.coverage.lane} browser policy in run ${source.id}; full baseline ${record.baseline.runId}.`);
      console.log('checked=true');
      return;
    }
    console.error(`No green pull request Check of tree ${tree.slice(0, 12)}; running the full Check.`);
  } catch (error) {
    console.error(`Could not look for an earlier Check (${String(error.message).split('\n')[0]}); running the full Check.`);
  }
  console.log('checked=false');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
