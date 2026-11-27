// Shared GitHub proof for build owners and the protected release queue.
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

const requirePreview = (value, message) => { if (!value) throw new Error(`Preview refused: ${message}`); };
export async function approvePreviewSource(source, github) {
  requirePreview(/^[a-f0-9]{40}$/.test(source ?? ''), 'expected full source SHA');
  const prefix = `repos/${REPOSITORY}`;
  const workflow = await github(`${prefix}/actions/workflows/check.yml`);
  const main = await github(`${prefix}/branches/main`);
  const currentMain = main.commit?.sha === source;
  // Main's Check can reuse a verified, identical PR tree. Use the same authorization
  // as production; unrelated manual runs must not replace that exact-push proof.
  const query = currentMain ? `event=push&branch=main&head_sha=${source}` : `head_sha=${source}`;
  const result = await github(`${prefix}/actions/workflows/check.yml/runs?${query}&per_page=1`);
  const run = result.workflow_runs?.[0];
  requirePreview(workflow.path === '.github/workflows/check.yml' && workflow.state === 'active'
    && Number.isSafeInteger(workflow.id) && run?.workflow_id === workflow.id && run.path === workflow.path,
  'missing current Check workflow');
  requirePreview(run.head_sha === source && run.repository?.full_name === REPOSITORY && run.head_repository?.full_name === REPOSITORY,
    'source or repository differs');
  requirePreview(run.status === 'completed' && run.conclusion === 'success', 'latest source Check has not passed');
  requirePreview(Number.isSafeInteger(run.id) && run.id > 0, 'invalid Check ID');
  if (currentMain) {
    const approved = await approvePilotRelease({ repository: REPOSITORY, runId: run.id, source, github });
    if (approved.mode === 'exact-tree-reuse') return { source, checkRun: run.id };
  }
  if (run.event === 'pull_request') {
    requirePreview(run.pull_requests?.length === 1, 'ambiguous pull request');
    const number = run.pull_requests[0].number;
    requirePreview(Number.isSafeInteger(number) && number > 0, 'invalid pull request');
    const pr = await github(`${prefix}/pulls/${number}`);
    requirePreview(pr.state === 'open' && !pr.draft && pr.base?.ref === 'main'
      && pr.base.repo?.full_name === REPOSITORY && pr.head?.repo?.full_name === REPOSITORY && pr.head.sha === source,
    'source must be the current ready PR head targeting main');
  } else requirePreview(['push', 'workflow_dispatch'].includes(run.event) && run.head_branch === 'main', 'unsupported Check context');
  const inventory = await github(`${prefix}/actions/runs/${run.id}/jobs?filter=latest&per_page=100`);
  requirePreview(Array.isArray(inventory.jobs) && inventory.total_count === inventory.jobs.length, 'incomplete job inventory');
  for (const [name, stepName] of [['check', 'Validate browser execution evidence'], ['production-build', 'Compile and check the production Worker']]) {
    const jobs = inventory.jobs.filter(job => job.name === name);
    requirePreview(jobs.length === 1 && jobs[0].run_id === run.id && jobs[0].status === 'completed' && jobs[0].conclusion === 'success', `missing completed ${name}`);
    const steps = jobs[0].steps?.filter(step => step.name === stepName) ?? [];
    requirePreview(steps.length === 1 && steps[0].status === 'completed' && steps[0].conclusion === 'success', `missing ${stepName}`);
  }
  return { source, checkRun: run.id };
}