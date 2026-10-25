import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';

const workflow = yaml.load(readFileSync('.github/workflows/cloudflare-preview.yml', 'utf8'));
const job = workflow.jobs.preview;
const allowed = (event, ref = 'refs/heads/main', enabled = 'true', repository = 'arkpedia/arkpedia') => {
  const github = { event_name: event, ref, repository: 'arkpedia/arkpedia', event: { pull_request: { head: { repo: { full_name: repository } } } } };
  return new Function('github', 'vars', `return (${job.if})`)(github, { ARKPEDIA_PREVIEWS_ENABLED: enabled });
};

test('all preview mutations share a non-cancelling lock and restricted token permissions', () => {
  assert.deepEqual(workflow.concurrency, { group: 'arkpedia-staging-slot', 'cancel-in-progress': false });
  assert.deepEqual(workflow.permissions, { contents: 'read', actions: 'read', 'pull-requests': 'read' });
  assert.deepEqual(workflow.on.pull_request_target.types, ['closed']);
  assert.deepEqual(workflow.on.pull_request_target.branches, ['main']);
  assert.equal(workflow.on.push, undefined);
});

test('only main dispatch and explicitly enabled same-repository close events can mutate staging', () => {
  assert.equal(allowed('workflow_dispatch'), true);
  assert.equal(allowed('workflow_dispatch', 'refs/heads/feature'), false);
  assert.equal(allowed('pull_request_target'), true);
  assert.equal(allowed('pull_request_target', 'refs/heads/main', ''), false);
  assert.equal(allowed('pull_request_target', 'refs/heads/main', 'true', 'fork/arkpedia'), false);
  assert.equal(allowed('push'), false);
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
});
