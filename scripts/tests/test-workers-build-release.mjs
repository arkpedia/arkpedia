import test from 'node:test';
import assert from 'node:assert/strict';
import { checkedWorkersBuild, deployWorkersBuild, githubReader, workersBuildSource } from '../deploy/workers-build-release.mjs';

const source = 'a'.repeat(40);
const prefix = 'repos/arkpedia/arkpedia';
const runs = `${prefix}/actions/workflows/check.yml/runs?event=push&branch=main&head_sha=${source}&per_page=1`;
const environment = { CI: 'true', WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main', WORKERS_CI_COMMIT_SHA: source,
  WORKERS_CI_BUILD_UUID: '11111111-2222-3333-4444-555555555555', ARKPEDIA_DEPLOYMENT_OWNER: 'cloudflare-builds' };
function fixture() {
  const data = {
    [prefix]: { id: 1455377998, full_name: 'arkpedia/arkpedia', default_branch: 'main' },
    [runs]: { workflow_runs: [{ id: 123, head_sha: source }] },
    [`${prefix}/actions/workflows/check.yml`]: { id: 7, path: '.github/workflows/check.yml', name: 'Check', state: 'active' },
    [`${prefix}/actions/runs/123`]: { id: 123, workflow_id: 7, path: '.github/workflows/check.yml',
      repository: { full_name: 'arkpedia/arkpedia' }, head_repository: { full_name: 'arkpedia/arkpedia' },
      event: 'push', head_branch: 'main', head_sha: source, status: 'completed', conclusion: 'success' },
    [`${prefix}/actions/runs/123/jobs?per_page=100`]: { total_count: 1, jobs: [
      { id: 10, name: 'check', status: 'completed', conclusion: 'success', steps: [
        { name: 'Validate browser execution evidence', conclusion: 'success' },
      ] },
    ] },
    [`${prefix}/branches/main`]: { commit: { sha: source } },
  };
  const github = async path => { assert.ok(Object.hasOwn(data, path), path); return data[path]; };
  const calls = [];
  let current = 'previous';
  const provider = {
    observe: () => ({ id: current }),
    health: async () => { calls.push('health'); },
    deploy: () => { calls.push('deploy'); current = 'new'; return { id: current }; },
    recover: async () => { calls.push('recover'); current = 'previous'; return { action: 'rolled-back' }; },
  };
  const build = { version: 1, commit: source, codeFingerprint: 'b'.repeat(64), contentSchema: 2,
    contentChannel: 'live', deploymentRole: 'production', dirty: false };
  return { data, github, calls, provider, build };
}

test('only the exact main Workers Build with explicitly enabled ownership may publish', () => {
  assert.equal(workersBuildSource(environment, source), source);
  for (const patch of [{ WORKERS_CI: '' }, { CI: '' }, { WORKERS_CI_BRANCH: 'feature' },
    { WORKERS_CI_COMMIT_SHA: 'b'.repeat(40) }, { WORKERS_CI_BUILD_UUID: '' },
    { ARKPEDIA_DEPLOYMENT_OWNER: 'github-actions' }, { ARKPEDIA_DEPLOYMENT_OWNER: '' }]) {
    assert.throws(() => workersBuildSource({ ...environment, ...patch }, source), /Workers build release refused/);
  }
});

test('release requires the replacement repository and a fully checked current main commit', async () => {
  const f = fixture();
  assert.equal((await checkedWorkersBuild(source, f.github)).checkRun, 123);
  assert.equal((await deployWorkersBuild({ source, ...f })).action, 'published');
  assert.deepEqual(f.calls, ['health', 'deploy', 'health']);
});

for (const [name, mutate] of [
  ['the old repository', d => { d[prefix].id = 1343972021; }],
  ['the temporary name', d => { d[prefix].full_name = 'arkpedia/arkpedia-clean'; }],
  ['no Check', d => { d[runs].workflow_runs = []; }],
  ['a failed Check', d => { d[`${prefix}/actions/runs/123`].conclusion = 'failure'; }],
  ['a still-running Check', d => { d[`${prefix}/actions/runs/123`].status = 'in_progress'; }],
  ['a newer main commit', d => { d[`${prefix}/branches/main`].commit.sha = 'c'.repeat(40); }],
  ['a draft-only check', d => { d[`${prefix}/actions/runs/123/jobs?per_page=100`].jobs[0].steps = []; }],
]) test(`Workers Builds refuses ${name} before provider access`, async () => {
  const f = fixture(); mutate(f.data);
  await assert.rejects(() => deployWorkersBuild({ source, ...f }), /release refused/);
  assert.deepEqual(f.calls, []);
});

test('main moving during preflight prevents deployment', async () => {
  const f = fixture();
  f.provider.health = async () => { f.data[`${prefix}/branches/main`].commit.sha = 'c'.repeat(40); };
  await assert.rejects(() => deployWorkersBuild({ source, ...f }), /main moved/);
  assert.deepEqual(f.calls, []);
});

test('an unhealthy deployed version uses the existing ownership-aware recovery', async () => {
  const f = fixture(); let checks = 0;
  f.provider.health = async () => { if (++checks === 2) throw new Error('unhealthy'); };
  await assert.rejects(() => deployWorkersBuild({ source, ...f }), e => e.recovery?.action === 'rolled-back');
  assert.deepEqual(f.calls, ['deploy', 'recover']);
});

test('GitHub requests never forward credentials through redirects or arbitrary paths', async () => {
  const request = async (url, options) => {
    assert.equal(url, `https://api.github.com/${prefix}`);
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.authorization, 'Bearer private-test-value');
    return Response.json({ id: 1455377998 });
  };
  const github = githubReader({ request, token: 'private-test-value' });
  assert.equal((await github(prefix)).id, 1455377998);
  await assert.rejects(() => github('https://elsewhere.example'), /unexpected GitHub resource/);
  const denied = githubReader({ request: async () => new Response('private content', { status: 403 }), token: '' });
  await assert.rejects(() => denied(prefix), e => e.message.includes('HTTP 403') && !e.message.includes('private content'));
});
