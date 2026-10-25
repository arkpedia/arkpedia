import test from 'node:test';
import assert from 'node:assert/strict';
import { publishPreview, retirePreview } from '../deploy/preview-controller.mjs';
import { previewAnnotations, STAGING } from '../deploy/preview-provider.mjs';

const source = 'a'.repeat(40), tree = 'b'.repeat(40), hash = 'c'.repeat(64);
const nextVersion = '22222222-2222-4222-8222-222222222222';
function fixture() {
  const request = { repository: 'arkpedia/arkpedia', pr: 10, source, checkRun: 20, buildRun: 30, artifact: 40 };
  const pr = { number: 10, state: 'open', draft: false, base: { ref: 'main', repo: { full_name: request.repository } },
    head: { sha: source, repo: { full_name: request.repository } } };
  const info = { version: 1, commit: source, dirty: false, deploymentRole: 'staging', contentChannel: 'live', contentSchema: 2, codeFingerprint: hash };
  const calls = [];
  let current = { version: { id: STAGING.baselineVersion }, intent: null };
  const verified = {
    build: { id: 30, status: 'completed', conclusion: 'success', event: 'workflow_dispatch', path: '.github/workflows/cloudflare-staging.yml',
      repository: { full_name: request.repository }, head_repository: { full_name: request.repository }, head_sha: source },
    artifact: { id: 40, expired: false, name: `arkpedia-staging-${source}`, workflow_run: { id: 30 } },
    receipt: { format: 1, repository: request.repository, workflow: 'cloudflare-staging.yml', runId: '30', sha256: hash, configSha256: hash, build: info },
    directory: '/verified-private-extraction', cleanup: () => calls.push('cleanup'),
  };
  const provider = {
    observe: () => current,
    health: async owner => { calls.push(owner ? 'preview-health' : 'baseline-health'); return { healthy: true, publicBuild: owner ? info : {} }; },
    deploy: (plan, checkRun) => {
      calls.push('deploy');
      const annotation = previewAnnotations(plan, checkRun);
      current = { version: { id: nextVersion, annotations: { 'workers/message': annotation.message, 'workers/tag': annotation.tag } },
        intent: { ...plan, checkRun, version: nextVersion } };
      return current;
    },
    rollback: expected => { assert.equal(expected, current.version.id); calls.push('rollback'); current = { version: { id: STAGING.baselineVersion }, intent: null }; },
  };
  const dependencies = { provider, query: () => structuredClone(pr), inspect: () => { calls.push('verify-check'); return { tree, lane: 'targeted' }; },
    obtain: () => { calls.push('obtain'); return verified; } };
  return { request, pr, verified, calls, provider, dependencies, get current() { return current; }, set current(value) { current = value; } };
}

test('checked publication verifies before download, commits exact owner after health and always cleans extraction', async () => {
  const f = fixture();
  const result = await publishPreview(f.request, f.dependencies);
  assert.equal(result.action, 'published');
  assert.equal(result.owner.version, nextVersion);
  assert.equal(result.owner.baselineVersion, STAGING.baselineVersion);
  assert.deepEqual(f.calls, ['verify-check', 'obtain', 'baseline-health', 'deploy', 'preview-health', 'cleanup']);
});

test('failed Check never downloads or touches provider; invalid archive never deploys', async () => {
  const f = fixture();
  await assert.rejects(publishPreview(f.request, { ...f.dependencies, inspect: () => { throw new Error('Check failed'); } }), /Check failed/);
  assert.deepEqual(f.calls, []);
  await assert.rejects(publishPreview(f.request, { ...f.dependencies, obtain: () => { throw new Error('archive mismatch'); } }), /archive mismatch/);
  assert.equal(f.calls.includes('deploy'), false);
});

test('source push during upload rolls back only its matching version and verifies baseline health', async () => {
  const f = fixture();
  const deploy = f.provider.deploy;
  f.provider.deploy = (...args) => { const result = deploy(...args); f.pr.head.sha = 'd'.repeat(40); return result; };
  await assert.rejects(publishPreview(f.request, f.dependencies), /verified original baseline restored/);
  assert.equal(f.current.version.id, STAGING.baselineVersion);
  assert.deepEqual(f.calls.slice(-3), ['rollback', 'baseline-health', 'cleanup']);
});

test('an upload error after provider acceptance is recovered by exact ownership metadata', async () => {
  const f = fixture();
  const deploy = f.provider.deploy;
  f.provider.deploy = (...args) => { deploy(...args); throw new Error('connection dropped after upload'); };
  await assert.rejects(publishPreview(f.request, f.dependencies), /verified original baseline restored/);
  assert.equal(f.current.version.id, STAGING.baselineVersion);
});

test('unhealthy candidate restores baseline, but an unrelated replacement is never rolled back', async () => {
  const f = fixture();
  f.provider.health = async owner => { if (owner) throw new Error('bad route'); return {}; };
  await assert.rejects(publishPreview(f.request, f.dependencies), /verified original baseline restored/);
  assert.equal(f.current.version.id, STAGING.baselineVersion);
  const other = fixture();
  other.provider.deploy = () => {
    other.current = { version: { id: '33333333-3333-4333-8333-333333333333', annotations: {} }, intent: null };
    throw new Error('unrelated deployment');
  };
  await assert.rejects(publishPreview(other.request, other.dependencies), /reconcile manually/);
  assert.equal(other.calls.includes('rollback'), false);
  assert.equal(other.calls.at(-1), 'cleanup');
});

test('closed-PR retirement and explicit open-PR retirement share ownership checks', async () => {
  const f = fixture();
  await publishPreview(f.request, f.dependencies);
  await assert.rejects(retirePreview({ number: 10 }, f.dependencies), /still open/);
  const unrelated = await retirePreview({ number: 11 }, f.dependencies);
  assert.equal(unrelated.action, 'none');
  const retired = await retirePreview({ number: 10, explicitlyRequested: true }, f.dependencies);
  assert.equal(retired.action, 'retired');
  assert.equal(f.current.intent, null);
  assert.equal((await retirePreview({ number: 10 }, f.dependencies)).action, 'none');
  const closed = fixture();
  await publishPreview(closed.request, closed.dependencies);
  closed.pr.state = 'closed';
  assert.equal((await retirePreview({ number: 10 }, closed.dependencies)).action, 'retired');
});
