import test from 'node:test';
import assert from 'node:assert/strict';
import { approvePilotRelease } from '../deploy/pilot-release-gate.mjs';

const source = '616f4cbf4938512ac1528e1d8d7070d8bf0a19fc';
const prefix = 'repos/arkpedia/arkpedia';
function fixture() {
  return {
    [`${prefix}/actions/workflows/check.yml`]: { id: 7, path: '.github/workflows/check.yml', name: 'Check', state: 'active' },
    [`${prefix}/actions/runs/123`]: { id: 123, workflow_id: 7, path: '.github/workflows/check.yml',
      repository: { full_name: 'arkpedia/arkpedia' }, head_repository: { full_name: 'arkpedia/arkpedia' },
      event: 'push', head_branch: 'main', head_sha: source, status: 'completed', conclusion: 'success' },
    [`${prefix}/actions/runs/123/jobs?per_page=100`]: { total_count: 2, jobs: [
      { id: 10, name: 'seen', status: 'completed', conclusion: 'success', steps: [
        { name: "Mark main green again when its pull request's Check vouches", conclusion: 'success' },
      ] },
      { id: 11, name: 'check', status: 'completed', conclusion: 'skipped', steps: [] },
    ] },
    [`${prefix}/branches/main`]: { commit: { sha: source } },
  };
}
const runPath = `${prefix}/actions/runs/123`;
const jobsPath = `${runPath}/jobs?per_page=100`;
async function approve(data, options = {}) {
  return approvePilotRelease({ repository: 'arkpedia/arkpedia', runId: '123', source,
    github: async path => { assert.ok(Object.hasOwn(data, path), path); return data[path]; }, ...options });
}

test('exact-tree main reuse authorizes its exact current source without a deployment', async () => {
  assert.deepEqual(await approve(fixture()), { approved: true, repository: 'arkpedia/arkpedia', source,
    checkRun: 123, checkJob: 10, mode: 'exact-tree-reuse' });
});
test('full main validation also authorizes release when execution evidence passed', async () => {
  const data = fixture();
  data[jobsPath].jobs[0].steps = [];
  Object.assign(data[jobsPath].jobs[1], { conclusion: 'success', steps: [
    { name: 'Validate browser execution evidence', conclusion: 'success' },
  ] });
  assert.equal((await approve(data)).mode, 'validated');
});

for (const [name, mutate] of [
  ['a different workflow', d => { d[runPath].workflow_id = 8; }],
  ['a renamed workflow path', d => { d[runPath].path = '.github/workflows/other.yml'; }],
  ['a pull request Check', d => { d[runPath].event = 'pull_request'; }],
  ['another branch', d => { d[runPath].head_branch = 'dev'; }],
  ['a foreign run', d => { d[runPath].repository.full_name = 'other/repo'; }],
  ['a fork', d => { d[runPath].head_repository.full_name = 'other/arkpedia'; }],
  ['another source', d => { d[runPath].head_sha = 'a'.repeat(40); }],
  ['a failed Check', d => { d[runPath].conclusion = 'failure'; }],
  ['a running Check', d => { d[runPath].status = 'in_progress'; }],
  ['an incomplete jobs inventory', d => { d[jobsPath].total_count = 3; }],
  ['green setup with skipped proof', d => { d[jobsPath].jobs[0].steps[0].conclusion = 'skipped'; }],
  ['a changed main tip', d => { d[`${prefix}/branches/main`].commit.sha = 'b'.repeat(40); }],
  ['a disabled Check workflow', d => { d[`${prefix}/actions/workflows/check.yml`].state = 'disabled_manually'; }],
]) test(`release gate refuses ${name}`, async () => {
  const data = fixture(); mutate(data);
  await assert.rejects(() => approve(data), /Pilot release refused:/);
});

for (const runId of ['0', '-1', '1e2', '123x', '9007199254740992']) {
  test(`release gate refuses invalid run ID ${runId}`, async () => {
    await assert.rejects(() => approve(fixture(), { runId }), /invalid Check run/);
  });
}
test('release gate refuses alternate repository and malformed source before any API access', async () => {
  const github = () => assert.fail('must reject before API access');
  await assert.rejects(() => approve(fixture(), { github, repository: 'other/repo' }), /unexpected repository/);
  await assert.rejects(() => approve(fixture(), { github, source: 'main' }), /invalid source/);
});
