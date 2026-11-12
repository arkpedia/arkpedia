import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import yaml from 'js-yaml';
import { approvePreviewSource } from '../deploy/preview-source-gate.mjs';

const source = 'a'.repeat(40), repository = 'arkpedia/arkpedia';
function fixture() {
  const workflow = { id: 1, path: '.github/workflows/check.yml', state: 'active' };
  const run = { id: 2, workflow_id: 1, path: workflow.path, head_sha: source,
    repository: { full_name: repository }, head_repository: { full_name: repository },
    status: 'completed', conclusion: 'success', event: 'pull_request', pull_requests: [{ number: 5 }] };
  const pr = { state: 'open', draft: false, head: { sha: source, repo: { full_name: repository } }, base: { ref: 'main', repo: { full_name: repository } } };
  const jobs = [['check', 'Validate browser execution evidence'], ['production-build', 'Compile and check the production Worker']].map(([name, step]) => ({
    name, run_id: 2, status: 'completed', conclusion: 'success', steps: [{ name: step, status: 'completed', conclusion: 'success' }],
  }));
  const inventory = { jobs, total_count: jobs.length };
  const github = async path => {
    if (path.endsWith('/check.yml')) return workflow;
    if (path.includes('/check.yml/runs?')) return { workflow_runs: [run] };
    if (path.endsWith('/pulls/5')) return pr;
    if (path.includes('/jobs?')) return inventory;
    assert.fail(path);
  };
  return { workflow, run, pr, jobs, inventory, github };
}
test('Preview requires the exact current ready PR source and both completed validation jobs', async () => {
  assert.deepEqual(await approvePreviewSource(source, fixture().github), { source, checkRun: 2 });
});
test('failed, stale, fork, draft, ambiguous and incomplete evidence cannot publish', async () => {
  const mutations = [
    f => { f.run.conclusion = 'failure'; }, f => { f.run.status = 'in_progress'; },
    f => { f.run.head_sha = 'b'.repeat(40); }, f => { f.run.head_repository.full_name = 'fork/repo'; },
    f => { f.run.workflow_id = 999; }, f => { f.workflow.state = 'disabled_manually'; },
    f => { f.pr.draft = true; }, f => { f.pr.state = 'closed'; },
    f => { f.pr.head.sha = 'b'.repeat(40); }, f => { f.pr.base.ref = 'other'; },
    f => { f.pr.head.repo.full_name = 'fork/repo'; }, f => { f.run.pull_requests = []; },
    f => { f.run.pull_requests.push({ number: 6 }); }, f => { f.jobs[0].conclusion = 'skipped'; },
    f => { f.jobs[1].conclusion = 'failure'; }, f => { f.jobs[0].steps[0].conclusion = 'skipped'; },
    f => { f.jobs[0].name = 'seen'; }, f => { f.inventory.total_count = 3; },
    f => { f.jobs[0].run_id = 100; }, f => { f.run.event = 'pull_request_target'; },
  ];
  for (const mutate of mutations) { const f = fixture(); mutate(f); await assert.rejects(approvePreviewSource(source, f.github), /Preview refused/); }
  await assert.rejects(approvePreviewSource('main', () => assert.fail('must not query')), /source SHA/);
});
test('credentialed publisher uses main tooling, immutable artifact identity, safe extraction and no production token', () => {
  const workflow = yaml.load(fs.readFileSync('.github/workflows/cloudflare-preview.yml', 'utf8'));
  const { authorize, build, publish } = workflow.jobs;
  assert.equal(authorize.if, "github.ref == 'refs/heads/main'");
  assert.equal(build.needs, 'authorize');
  assert.equal(publish.if, "github.ref == 'refs/heads/main'");
  assert.equal(publish.steps.find(s => s.uses?.startsWith('actions/checkout@')).with.ref, '${{ github.sha }}');
  const download = publish.steps.find(s => s.uses?.startsWith('actions/download-artifact@'));
  assert.equal(download.with['artifact-ids'], '${{ needs.build.outputs.artifact }}');
  const text = JSON.stringify(publish);
  assert.doesNotMatch(text, /ARKPEDIA_PRODUCTION_API_TOKEN|ARKPEDIA_PILOT_API_TOKEN|tar -x/);
  assert.match(text, /extract-preview\.py/);
  assert.match(text, /preview-source-gate\.mjs/);
  assert.match(text, /ARKPEDIA_PREVIEW_API_TOKEN/);
  assert.doesNotMatch(JSON.stringify(build), /secrets\./);
});
test('Check jobs running PR code have no issue-write permission', () => {
  const workflow = yaml.load(fs.readFileSync('.github/workflows/check.yml', 'utf8'));
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  for (const [name, job] of Object.entries(workflow.jobs)) {
    if (name === 'main-report') continue;
    assert.ok(Object.values(job.permissions ?? {}).every(value => value === 'read'));
  }
  const report = workflow.jobs['main-report'];
  assert.equal(report.if, "always() && github.event_name == 'push' && github.ref == 'refs/heads/main'");
  assert.equal(report.permissions.issues, 'write');
  assert.equal(report.steps.find(s => s.uses?.startsWith('actions/checkout@')).with.ref, '${{ github.sha }}');
});
