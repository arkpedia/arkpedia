import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';

const workflow = yaml.load(readFileSync('.github/workflows/cloudflare-preview.yml', 'utf8'));
const job = workflow.jobs.preview;
const prepare = workflow.jobs.prepare;
const allowed = (event, ref = 'refs/heads/main', enabled = 'true', repository = 'arkpedia/arkpedia') => {
  const github = { event_name: event, ref, repository: 'arkpedia/arkpedia', event: {
    pull_request: { head: { repo: { full_name: repository } } },
    workflow_run: { conclusion: 'success', head_branch: ref.replace('refs/heads/', ''), head_repository: { full_name: repository } },
  } };
  return new Function('github', 'vars', `return (${prepare.if})`)(github, { ARKPEDIA_PREVIEWS_ENABLED: enabled });
};

test('all preview mutations share a non-cancelling lock and restricted token permissions', () => {
  assert.deepEqual(workflow.concurrency, { group: 'arkpedia-staging-slot', 'cancel-in-progress': false, queue: 'max' });
  assert.deepEqual(workflow.permissions, { contents: 'read', actions: 'read', 'pull-requests': 'read' });
  assert.deepEqual(workflow.on.pull_request_target.types, ['closed']);
  assert.deepEqual(workflow.on.pull_request_target.branches, ['main']);
  assert.equal(workflow.on.push, undefined);
  assert.deepEqual(Object.keys(workflow.on.workflow_dispatch.inputs), ['action', 'pr', 'completed_build']);
  assert.equal(workflow.on.workflow_run, undefined, 'one explicit completion owner avoids duplicate callback publication');
  assert.equal(prepare.permissions.actions, 'write', 'only the secret-free resolver dispatches a build');
  assert.equal(job.permissions, undefined, 'provider job inherits read-only GitHub permissions');
});

test('only main dispatch and explicitly enabled same-repository close events can mutate staging', () => {
  assert.equal(allowed('workflow_dispatch'), true);
  assert.equal(allowed('workflow_dispatch', 'refs/heads/feature'), false);
  assert.equal(allowed('pull_request_target'), true);
  assert.equal(allowed('pull_request_target', 'refs/heads/main', ''), false);
  assert.equal(allowed('pull_request_target', 'refs/heads/main', 'true', 'fork/arkpedia'), false);
  assert.equal(allowed('push'), false);
  assert.equal(allowed('workflow_run'), false);
  assert.equal(allowed('workflow_run', 'refs/heads/main', ''), false);
  assert.equal(allowed('workflow_run', 'refs/heads/feature'), false);
});

test('credentials reach only the trusted controller; no PR checkout, install or shell interpolation', () => {
  const checkout = job.steps.filter(step => step.uses?.startsWith('actions/checkout@'));
  assert.equal(checkout.length, 1);
  assert.deepEqual(checkout[0].with, { ref: '${{ github.workflow_sha }}', 'persist-credentials': false });
  const mutation = job.steps.find(step => step.env?.CLOUDFLARE_API_TOKEN);
  assert.ok(mutation.run.includes('scripts/deploy/preview-controller.mjs'));
  assert.equal(mutation.run.includes('${{'), false);
  assert.equal(mutation.run.includes('npm'), false);
  assert.equal(job.steps.filter(step => step.env?.CLOUDFLARE_API_TOKEN).length, 1);
  assert.equal(job.steps.filter(step => step.run?.includes('npm ci')).length, 1);
  assert.equal(job.environment, undefined, 'does not create an extra provider/environment resource');
  assert.ok(prepare.steps.every(step => !step.env?.CLOUDFLARE_API_TOKEN));
  assert.ok(prepare.steps.every(step => !step.run?.includes('npm ci')), 'does not install the app to resolve/wait for a build');
});

test('staging builder uses separate immutable source/controller checkouts and one secret-free app build', () => {
  const build = yaml.load(readFileSync('.github/workflows/cloudflare-staging.yml', 'utf8'));
  assert.equal(build.on.push, undefined);
  assert.equal(build.concurrency.queue, 'max');
  assert.equal(build.concurrency['cancel-in-progress'], false);
  const steps = build.jobs.build.steps;
  const checkouts = steps.filter(step => step.uses?.startsWith('actions/checkout@'));
  assert.deepEqual(checkouts.map(step => step.with.path), ['controller', 'site']);
  assert.equal(checkouts[0].with.ref, '${{ github.sha }}');
  assert.equal(checkouts[1].with.ref, '${{ steps.request.outputs.source }}');
  assert.ok(checkouts.every(step => step.with['persist-credentials'] === false));
  assert.equal(steps.filter(step => step.run === 'npm ci').length, 1);
  assert.equal(steps.filter(step => step.run?.includes('cloudflare-staging.mjs build')).length, 1);
  assert.ok(steps.every(step => !step.env?.CLOUDFLARE_API_TOKEN));
  assert.ok(steps.find(step => step.name === 'Package staging artifact with trusted producer').run.includes('../controller/scripts/deploy/staging-artifact.py'));
});

test('only a successful enabled main preview build dispatches its ID from a separate API-only job', () => {
  const build = yaml.load(readFileSync('.github/workflows/cloudflare-staging.yml', 'utf8'));
  const notify = build.jobs['notify-preview'];
  assert.deepEqual(build.permissions,{contents:'read'});
  assert.equal(build.jobs.build.permissions,undefined,'feature build inherits read-only permissions');
  assert.equal(notify.needs,'build');
  assert.deepEqual(notify.permissions,{contents:'read',actions:'write'});
  assert.equal(notify.steps.length,1);
  const step=notify.steps[0];
  assert.equal(step.env.COMPLETED_BUILD,'${{ github.run_id }}');
  assert.equal(step.env.PREVIEW_PR,'${{ inputs.pr }}');
  assert.match(step.run,/--ref main/);
  assert.match(step.run,/-f completed_build="\$COMPLETED_BUILD"/);
  assert.equal(step.run.includes('${{'),false,'IDs enter shell only through environment');
  assert.equal(step.uses,undefined,'no feature checkout or install in notifier');
  assert.equal(step.env.CLOUDFLARE_API_TOKEN,undefined);
  const permits=(success=true,ref='refs/heads/main',pr='10',flag='true') =>
    new Function('success','github','inputs','vars',`return (${notify.if})`)(()=>success,{ref},{pr},{ARKPEDIA_PREVIEWS_ENABLED:flag});
  assert.equal(permits(),true);
  assert.equal(permits(false),false);
  assert.equal(permits(true,'refs/heads/feature'),false);
  assert.equal(permits(true,'refs/heads/main',''),false);
  assert.equal(permits(true,'refs/heads/main','10',''),false);
});
