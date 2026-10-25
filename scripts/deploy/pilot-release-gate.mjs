#!/usr/bin/env node
// Read-only authorization for a future, separately enabled pilot release owner.
// No Cloudflare access, builds, deployments, migrations or branch mutations.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const REPOSITORY = 'arkpedia/arkpedia';
const WORKFLOW = '.github/workflows/check.yml';
const requireValue = (value, message) => { if (!value) throw new Error(`Pilot release refused: ${message}`); };

export async function approvePilotRelease({ repository, runId, source, github }) {
  requireValue(repository === REPOSITORY, 'unexpected repository');
  requireValue(/^[1-9][0-9]*$/.test(String(runId ?? '')) && Number.isSafeInteger(Number(runId)), 'invalid Check run');
  requireValue(/^[a-f0-9]{40}$/.test(source ?? ''), 'invalid source');
  const prefix = `repos/${REPOSITORY}`;
  const workflow = await github(`${prefix}/actions/workflows/check.yml`);
  requireValue(workflow.path === WORKFLOW && workflow.name === 'Check' && workflow.state === 'active'
    && Number.isSafeInteger(workflow.id), 'unexpected Check workflow');
  const run = await github(`${prefix}/actions/runs/${runId}`);
  requireValue(run.id === Number(runId) && run.workflow_id === workflow.id && run.path === WORKFLOW,
    'run does not belong to the current Check workflow');
  requireValue(run.repository?.full_name === REPOSITORY && run.head_repository?.full_name === REPOSITORY,
    'foreign repository or fork');
  requireValue(run.event === 'push' && run.head_branch === 'main' && run.head_sha === source,
    'Check must cover this exact main push');
  requireValue(run.status === 'completed' && run.conclusion === 'success', 'Check is not successful and complete');
  const inventory = await github(`${prefix}/actions/runs/${runId}/jobs?per_page=100`);
  requireValue(Array.isArray(inventory.jobs) && Number.isSafeInteger(inventory.total_count)
    && inventory.total_count === inventory.jobs.length, 'incomplete Check job inventory');
  // A green draft/seen-only run must not authorize production. The existing main
  // reuse path is acceptable only when its exact-tree proof step actually ran.
  const executed = (job, name) => job.steps?.some(step => step.name === name && step.conclusion === 'success');
  const full = inventory.jobs.find(job => job.name === 'check' && job.status === 'completed'
    && job.conclusion === 'success' && executed(job, 'Validate browser execution evidence'));
  const reused = inventory.jobs.find(job => job.name === 'seen' && job.status === 'completed'
    && job.conclusion === 'success' && executed(job, "Mark main green again when its pull request's Check vouches"));
  requireValue(full || reused, 'no completed application validation or exact-tree reuse');
  // Read the current branch after the run/jobs. Call this gate again immediately
  // before deployment, inside the production workflow's non-cancelling lock.
  const main = await github(`${prefix}/branches/main`);
  requireValue(main.commit?.sha === source, 'main moved; release the newer checked source instead');
  return { approved: true, repository, source, checkRun: Number(runId), checkJob: (full || reused).id,
    mode: full ? 'validated' : 'exact-tree-reuse' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    requireValue(process.argv.length === 4, 'expected Check run and full source SHA');
    const github = path => JSON.parse(execFileSync('gh', ['api', path], {
      encoding: 'utf8', timeout: 30_000, maxBuffer: 4_000_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    }));
    console.log(JSON.stringify(await approvePilotRelease({ repository: REPOSITORY,
      runId: process.argv[2], source: process.argv[3], github }), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
