// A successful workflow can contain only draft feedback or targeted browsers.
// Accept a baseline only when the actual full browser job and step succeeded.
const SHA = /^[a-f0-9]{40}$/;
const id = value => Number.isSafeInteger(value) && value > 0;
const successful = value => value?.status === 'completed' && value.conclusion === 'success';

const completedJob = (jobs,runId,name,steps) => {
  const found=jobs.filter(job => job?.name===name);
  return found.length===1 && id(found[0].id) && found[0].run_id===runId && successful(found[0])
    && steps.every(name => {const matches=found[0].steps?.filter(step => step.name===name);return matches?.length===1 && successful(matches[0]);});
};
export function parallelValidationPassed(jobs,runId,{audit=false}={}) {
  if (!Array.isArray(jobs) || !id(runId)) return false;
  if (!completedJob(jobs,runId,'browser-build',['Build','Which browser regressions this change needs','Package checked browser site'])) return false;
  return audit || [
    ['validation',['Application and Python regression tests','Typecheck','Lint','Compile and validate runtime content']],
    ['content-check',['Pages render the live content release','Content updates and rollback without rebuilding']],
    ['production-build',['Compile and check the production Worker']],
  ].every(([name,steps]) => completedJob(jobs,runId,name,steps));
}
export function browserShardsPassed(jobs,runId,total,lane) {
  if (!Array.isArray(jobs) || !id(runId) || ![0,1,4].includes(total)) return false;
  const shards=jobs.filter(job => /^browser \(/.test(job?.name??''));
  if(shards.length!==total)return false;
  return Array.from({length:total},(_,i)=>i+1).every(index => completedJob(jobs,runId,'browser ('+index+'/'+total+')',
    [lane==='full'?'Desktop and mobile browser regressions':'Selected browser regressions','Record browser shard','Share browser shard evidence']));
}

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
  if (steps.length !== 1 || !successful(steps[0])) {
    const executed = name => {const found=job.steps.filter(step=>step.name===name);return found.length===1&&successful(found[0]);};
    if (!executed('Validate full browser shard execution') || !executed('Full-census completion contract')
      || !executed('Validate browser execution evidence') || !executed(audit?'Require complete audit execution':'Require parallel checks')
      || !parallelValidationPassed(jobs,run.id,{audit}) || !browserShardsPassed(jobs,run.id,4,'full')) return null;
  }

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
