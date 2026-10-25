import test from 'node:test';
import assert from 'node:assert/strict';
import { requestPreview, resolveCompletedPreview, buildInputs, previewBuildTitle, assertLatestPreviewCheck } from '../deploy/preview-request.mjs';
import { PRODUCER_FILES, assertBuildRequest, verifyBuildProducer } from '../deploy/preview-build.mjs';

const repo = 'arkpedia/arkpedia', prefix = `repos/${repo}`;
const source = 'a'.repeat(40), controller = 'b'.repeat(40), blob = 'c'.repeat(40), hash = 'd'.repeat(64);
function fixture() {
  const calls = [];
  const pr = { number: 10, state: 'open', draft: false, base: { ref: 'main', repo: { full_name: repo } },
    head: { sha: source, repo: { full_name: repo } } };
  const check = { id: 20, created_at: '2026-10-25T01:00:00Z', status: 'completed', conclusion: 'success', head_sha: source,
    repository: { full_name: repo }, head_repository: { full_name: repo }, pull_requests: [{ number: 10, base: { ref: 'main' } }] };
  const build = { id: 30, created_at: '2026-10-25T02:00:00Z', status: 'completed', conclusion: 'success',
    event: 'workflow_dispatch', path: '.github/workflows/cloudflare-staging.yml', head_sha: controller, head_branch: 'main',
    repository: { full_name: repo }, head_repository: { full_name: repo }, display_title: previewBuildTitle(10, source, 20) };
  const archive = { id: 40, name: `arkpedia-staging-${source}`, expired: false, workflow_run: { id: 30 } };
  const envelope = { id: 41, name: `arkpedia-staging-request-${source}`, expired: false, workflow_run: { id: 30 } };
  const receipt = { format: 1, repository: repo, workflow: 'cloudflare-staging.yml', runId: '30', sha256: hash, configSha256: hash,
    previewRequest: { pr: 10, source, checkRun: 20, controllerCommit: controller },
    build: { version: 1, commit: source, dirty: false, contentSchema: 2, deploymentRole: 'staging', contentChannel: 'live', codeFingerprint: hash } };
  const routes = {
    [`${prefix}/pulls/10`]: pr,
    [`${prefix}/git/ref/heads/main`]: { object: { sha: controller } },
    [`${prefix}/actions/workflows/check.yml/runs?head_sha=${source}&event=pull_request&per_page=100`]: { total_count: 1, workflow_runs: [check] },
    [`${prefix}/actions/workflows/cloudflare-staging.yml/runs?head_sha=${controller}&event=workflow_dispatch&per_page=100`]: { total_count: 0, workflow_runs: [] },
    [`${prefix}/actions/runs/30`]: build,
    [`${prefix}/actions/runs/30/artifacts?per_page=100`]: { total_count: 2, artifacts: [archive, envelope] },
    ...Object.fromEntries(PRODUCER_FILES.map(path => [`${prefix}/contents/${path}?ref=${controller}`, { type: 'file', sha: blob }])),
  };
  const dependencies = {
    query: path => { assert.ok(Object.hasOwn(routes, path), `unexpected path ${path}`); return routes[path]; },
    blobId: () => blob,
    inspect: value => { calls.push(['inspect', value]); return { lane: 'targeted', tree: source }; },
    dispatch: body => { calls.push(['dispatch', body]); return { workflow_run_id: 31 }; },
    readReceipt: () => receipt,
  };
  const existing = () => { routes[`${prefix}/actions/workflows/cloudflare-staging.yml/runs?head_sha=${controller}&event=workflow_dispatch&per_page=100`] = { total_count: 1, workflow_runs: [build] }; };
  return { calls, pr, check, build, archive, envelope, receipt, routes, dependencies, existing };
}

test('one PR request dispatches one immutable secret-free main build and returns its actual handle', () => {
  const f = fixture();
  const result = requestPreview(10, f.dependencies);
  assert.deepEqual(result, { mode: 'waiting', pr: 10, buildRun: 31, reused: false });
  assert.deepEqual(f.calls.find(([name]) => name === 'dispatch')[1], {
    ref: 'main', inputs: { source, pr: '10', check_run: '20' },
  });
});

test('a matching live build is reused without dispatch or runner sleep; completed build resolves publication', () => {
  const f = fixture(); f.existing(); f.build.status = 'in_progress'; f.build.conclusion = null;
  assert.equal(requestPreview(10, f.dependencies).reused, true);
  assert.equal(f.calls.some(([name]) => name === 'dispatch'), false);
  f.build.status = 'completed'; f.build.conclusion = 'success';
  const result = requestPreview(10, f.dependencies);
  assert.equal(result.mode, 'publish');
  assert.deepEqual(result.request, { repository: repo, pr: 10, source, checkRun: 20, controllerCommit: controller, buildRun: 30, artifact: 40 });
});

test('latest failed/running Check cannot hide behind an older green run', () => {
  for (const state of [{ status: 'completed', conclusion: 'failure' }, { status: 'in_progress', conclusion: null }]) {
    const f = fixture();
    const response = f.routes[`${prefix}/actions/workflows/check.yml/runs?head_sha=${source}&event=pull_request&per_page=100`];
    response.total_count = 2;
    response.workflow_runs.push({ ...f.check, ...state, id: 21, created_at: '2026-10-25T03:00:00Z' });
    assert.throws(() => requestPreview(10, f.dependencies), /latest current-source Check/);
    assert.equal(f.calls.length, 0);
    assert.throws(() => assertLatestPreviewCheck(10, source, 20, f.dependencies), /latest current-source Check/);
  }
});

test('unreviewed producer, draft PR and incomplete run inventory refuse before dispatch', () => {
  for (const mutate of [
    f => { f.pr.draft = true; },
    f => { f.routes[`${prefix}/contents/${PRODUCER_FILES[0]}?ref=${controller}`].sha = source; },
    f => { f.routes[`${prefix}/actions/workflows/check.yml/runs?head_sha=${source}&event=pull_request&per_page=100`].total_count = 2; },
  ]) {
    const f = fixture(); mutate(f);
    assert.throws(() => requestPreview(10, f.dependencies));
    assert.equal(f.calls.some(([name]) => name === 'dispatch'), false);
  }
});

test('completed receipt is bound to producer, current PR/source, current Check and same-run archive', () => {
  for (const mutate of [
    f => { f.receipt.previewRequest.source = controller; },
    f => { f.receipt.previewRequest.controllerCommit = source; },
    f => { f.receipt.previewRequest.checkRun = 21; },
    f => { f.pr.head.sha = controller; },
    f => { f.pr.state = 'closed'; },
    f => { f.archive.expired = true; },
    f => { f.archive.workflow_run.id = 31; },
    f => { f.envelope.expired = true; },
    f => { f.receipt.build.dirty = true; },
    f => { f.build.head_branch = 'feature'; },
    f => { f.build.display_title = 'different request'; },
    f => { f.build.conclusion = 'failure'; },
  ]) { const f = fixture(); mutate(f); assert.throws(() => resolveCompletedPreview(30, f.dependencies), undefined, mutate.toString()); }
});

test('a new explicit request can replace terminal/expired builds; unknown dispatch outcome never retries', () => {
  const f = fixture(); f.existing(); f.build.conclusion = 'failure';
  assert.equal(requestPreview(10, f.dependencies).buildRun, 31);
  const expired = fixture(); expired.existing(); expired.archive.expired = true; expired.envelope.expired = true;
  assert.equal(requestPreview(10, expired.dependencies).buildRun, 31);
  const unknown = fixture();
  let posts = 0;
  assert.throws(() => requestPreview(10, { ...unknown.dependencies, dispatch: () => { posts++; return {}; } }), /outcome unknown/);
  assert.equal(posts, 1);
});

test('build-only completion does not publish; legacy and new source/producer contracts stay distinct', () => {
  const f = fixture();
  f.routes[`${prefix}/actions/runs/30/artifacts?per_page=100`] = { total_count: 1, artifacts: [f.archive] };
  assert.equal(resolveCompletedPreview(30, f.dependencies).mode, 'none');
  const request = { repository: repo, pr: 10, source, checkRun: 20, controllerCommit: controller, buildRun: 30 };
  assert.doesNotThrow(() => assertBuildRequest(f.build, f.receipt, request));
  assert.throws(() => assertBuildRequest(f.build, f.receipt, { ...request, controllerCommit: undefined }));
  assert.throws(() => verifyBuildProducer(f.build, { query: f.dependencies.query, blobId: () => source }));
});

test('build inputs reject partial IDs, branch producers, short SHAs and shell syntax', () => {
  const env = { GITHUB_SHA: controller, GITHUB_REF: 'refs/heads/main', STAGING_SOURCE: source, STAGING_PR: '10', STAGING_CHECK: '20' };
  assert.equal(buildInputs(env).controllerCommit, controller);
  assert.equal(buildInputs({ GITHUB_SHA: controller }).source, controller);
  for (const change of [{ GITHUB_REF: 'refs/heads/feature' }, { STAGING_CHECK: '' },
    { STAGING_PR: '10;echo bad' }, { STAGING_SOURCE: 'main' }, { STAGING_SOURCE: '' }, { GITHUB_SHA: 'short' }]) {
    assert.throws(() => buildInputs({ ...env, ...change }));
  }
});
