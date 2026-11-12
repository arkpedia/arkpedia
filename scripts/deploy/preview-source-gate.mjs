import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const repository = 'arkpedia/arkpedia';
const requireValue = (value, message) => { if (!value) throw new Error(`Preview refused: ${message}`); };
export async function approvePreviewSource(source, github) {
  requireValue(/^[a-f0-9]{40}$/.test(source ?? ''), 'expected full source SHA');
  const prefix = `repos/${repository}`;
  const workflow = await github(`${prefix}/actions/workflows/check.yml`);
  const result = await github(`${prefix}/actions/workflows/check.yml/runs?head_sha=${source}&per_page=1`);
  const run = result.workflow_runs?.[0];
  requireValue(workflow.path === '.github/workflows/check.yml' && workflow.state === 'active'
    && Number.isSafeInteger(workflow.id) && run?.workflow_id === workflow.id && run.path === workflow.path,
  'missing current Check workflow');
  requireValue(run.head_sha === source && run.repository?.full_name === repository && run.head_repository?.full_name === repository,
    'source or repository differs');
  requireValue(run.status === 'completed' && run.conclusion === 'success', 'latest source Check has not passed');
  requireValue(Number.isSafeInteger(run.id) && run.id > 0, 'invalid Check ID');
  if (run.event === 'pull_request') {
    requireValue(run.pull_requests?.length === 1, 'ambiguous pull request');
    const number = run.pull_requests[0].number;
    requireValue(Number.isSafeInteger(number) && number > 0, 'invalid pull request');
    const pr = await github(`${prefix}/pulls/${number}`);
    requireValue(pr.state === 'open' && !pr.draft && pr.base?.ref === 'main'
      && pr.base.repo?.full_name === repository && pr.head?.repo?.full_name === repository && pr.head.sha === source,
    'source must be the current ready PR head targeting main');
  } else requireValue(['push', 'workflow_dispatch'].includes(run.event) && run.head_branch === 'main', 'unsupported Check context');
  const inventory = await github(`${prefix}/actions/runs/${run.id}/jobs?filter=latest&per_page=100`);
  requireValue(Array.isArray(inventory.jobs) && inventory.total_count === inventory.jobs.length, 'incomplete job inventory');
  for (const [name, stepName] of [['check', 'Validate browser execution evidence'], ['production-build', 'Compile and check the production Worker']]) {
    const jobs = inventory.jobs.filter(job => job.name === name);
    requireValue(jobs.length === 1 && jobs[0].run_id === run.id && jobs[0].status === 'completed' && jobs[0].conclusion === 'success', `missing completed ${name}`);
    const steps = jobs[0].steps?.filter(step => step.name === stepName) ?? [];
    requireValue(steps.length === 1 && steps[0].status === 'completed' && steps[0].conclusion === 'success', `missing ${stepName}`);
  }
  return { source, checkRun: run.id };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const github = path => JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8', timeout: 30_000, maxBuffer: 4_000_000 }));
  approvePreviewSource(process.env.SOURCE, github).then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
