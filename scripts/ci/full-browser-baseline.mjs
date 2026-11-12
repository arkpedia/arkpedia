// A successful workflow can contain only draft feedback or targeted browsers.
// Accept a baseline only when the actual full browser job and step succeeded.
const SHA = /^[a-f0-9]{40}$/;
const id = value => Number.isSafeInteger(value) && value > 0;
const successful = value => value?.status === 'completed' && value.conclusion === 'success';

/** Validate GitHub API records; callers separately establish ancestry and cumulative impact. */
export function fullBrowserBaseline({ run, jobs, repository, baseRef, commit, tree, artifact, allowAudit = false } = {}) {
  if (typeof repository !== 'string' || !/^[^/\s]+\/[^/\s]+$/.test(repository)
    || typeof baseRef !== 'string' || !baseRef.trim() || !SHA.test(commit ?? '') || !SHA.test(tree ?? '')) return null;
  const audit = allowAudit && run?.path === '.github/workflows/browser-audit.yml';
  if (!successful(run) || !id(run.id) || !audit && run.path !== '.github/workflows/check.yml'
    || run.repository?.full_name !== repository || run.head_repository?.full_name !== repository
    || !SHA.test(run.head_sha ?? '') || !Array.isArray(jobs)) return null;
  const checks = jobs.filter(job => job?.name === (audit ? 'audit' : 'check'));
  if (checks.length !== 1) return null;
  const job = checks[0];
  if (!successful(job) || !id(job.id) || job.run_id !== run.id || !Array.isArray(job.steps)) return null;
  const steps = job.steps.filter(step => step?.name === (audit ? 'Exhaustive desktop and mobile audit' : 'Desktop and mobile browser regressions'));
  if (steps.length !== 1 || !successful(steps[0])) return null;

  let artifactId = null;
  if (audit && !['schedule', 'workflow_dispatch'].includes(run.event)) return null;
  if (run.event === 'pull_request') {
    if (!Array.isArray(run.pull_requests) || run.pull_requests.length !== 1
      || run.pull_requests[0]?.base?.ref !== baseRef
      || !artifact || !id(artifact.id) || artifact.expired !== false
      || artifact.name !== `checked-tree-${tree}` || artifact.workflow_run?.id !== run.id) return null;
    artifactId = artifact.id;
  } else if (run.event === 'push' || run.event === 'workflow_dispatch' || audit && run.event === 'schedule') {
    if (run.head_sha !== commit || run.head_branch !== baseRef) return null;
  } else return null;

  return { coverage: 'full', commit, tree, runId: run.id, jobId: job.id,
    artifactId, event: run.event, repository, baseRef, sourceCommit: run.head_sha };
}
