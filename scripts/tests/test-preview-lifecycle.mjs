import test from 'node:test';
import assert from 'node:assert/strict';
import { planPreviewUpdate, recheckPreviewUpdate, recordPreviewOwner, planPreviewRetirement } from '../deploy/preview-lifecycle.mjs';

const sha = 'a'.repeat(40);
const hash = 'b'.repeat(64);
const baseline = '11111111-1111-4111-8111-111111111111';
const first = '22222222-2222-4222-8222-222222222222';
const second = '33333333-3333-4333-8333-333333333333';
function input(number = 10) {
  return {
    request: { repository: 'arkpedia/arkpedia', pr: number, source: sha, buildRun: 20, artifact: 30 },
    pr: { number, state: 'open', draft: false, base: { ref: 'main', repo: { full_name: 'arkpedia/arkpedia' } }, head: { sha, repo: { full_name: 'arkpedia/arkpedia' } } },
    build: { id: 20, status: 'completed', conclusion: 'success', event: 'workflow_dispatch', path: '.github/workflows/cloudflare-staging.yml', repository: { full_name: 'arkpedia/arkpedia' }, head_repository: { full_name: 'arkpedia/arkpedia' }, head_sha: sha },
    artifact: { id: 30, expired: false, workflow_run: { id: 20 }, name: `arkpedia-staging-${sha}` },
    receipt: { format: 1, repository: 'arkpedia/arkpedia', workflow: 'cloudflare-staging.yml', runId: '20', sha256: hash, configSha256: hash, build: { version: 1, commit: sha, dirty: false, deploymentRole: 'staging', contentChannel: 'live', contentSchema: 2, codeFingerprint: hash } },
    sourceTree: 'c'.repeat(40), liveVersion: baseline, owner: null,
  };
}
const publish = (value, version = first) => recordPreviewOwner(planPreviewUpdate(value), {
  version, publicBuild: value.receipt.build, healthy: true,
});

test('A -> B -> B update retains the original rollback baseline; closing A cannot retire B', () => {
  const a = input(10);
  const ownerA = publish(a);
  const b = { ...input(11), liveVersion: first, owner: ownerA };
  const ownerB = publish(b, second);
  assert.equal(ownerB.baselineVersion, baseline);
  assert.deepEqual(planPreviewRetirement({ number: 10, pr: { ...a.pr, state: 'closed' }, owner: ownerB, liveVersion: second }),
    { action: 'none', reason: 'another pull request owns staging' });
  const updated = planPreviewUpdate({ ...b, liveVersion: second, owner: ownerB });
  assert.equal(updated.baselineVersion, baseline);
  const retirement = planPreviewRetirement({ number: 11, pr: { ...b.pr, state: 'closed' }, owner: ownerB, liveVersion: second });
  assert.equal(retirement.targetVersion, baseline, 'never resurrect the previous PR');
  assert.equal(retirement.expectedVersion, second);
  assert.equal(retirement.worker, 'arkpedia-staging');
});

test('queued update refuses a source push, draft conversion, close or external deployment', () => {
  const value = input();
  const plan = planPreviewUpdate(value);
  assert.equal(recheckPreviewUpdate(plan, value), plan);
  for (const pr of [{ ...value.pr, head: { ...value.pr.head, sha: 'd'.repeat(40) } }, { ...value.pr, draft: true }, { ...value.pr, state: 'closed' }]) {
    assert.throws(() => recheckPreviewUpdate(plan, { pr, liveVersion: baseline }));
  }
  assert.throws(() => recheckPreviewUpdate(plan, { pr: value.pr, liveVersion: first }));
});

test('foreign, unfinished, stale and expired build inputs never produce a publication plan', () => {
  const changes = [
    v => { v.pr.head.repo.full_name = 'fork/arkpedia'; },
    v => { v.pr.base.ref = 'dev'; },
    v => { v.pr.head.sha = 'd'.repeat(40); },
    v => { v.pr.draft = true; },
    v => { v.build.conclusion = 'failure'; },
    v => { v.build.status = 'in_progress'; },
    v => { v.build.event = 'pull_request_target'; },
    v => { v.build.head_repository.full_name = 'fork/arkpedia'; },
    v => { v.build.path = '.github/workflows/check.yml'; },
    v => { v.build.head_sha = 'd'.repeat(40); },
    v => { v.artifact.expired = true; },
    v => { v.artifact.workflow_run.id = 21; },
    v => { v.request.artifact = 31; },
    v => { v.receipt.runId = '21'; },
    v => { v.receipt.build.dirty = true; },
    v => { v.receipt.build.deploymentRole = 'production'; },
    v => { v.receipt.build.contentChannel = 'dev-live'; },
    v => { v.receipt.build.codeFingerprint = 'bad'; },
    v => { delete v.owner; },
    v => { v.liveVersion = 'unknown'; },
  ];
  for (const change of changes) {
    const value = input();
    change(value);
    assert.throws(() => planPreviewUpdate(value), undefined, change.toString());
  }
});

test('owner commit requires a healthy exact public identity and a distinct valid provider version', () => {
  const value = input();
  const plan = planPreviewUpdate(value);
  for (const change of [{ healthy: false }, { version: baseline }, { version: 'missing' },
    ...[{ commit: 'd'.repeat(40) }, { codeFingerprint: 'e'.repeat(64) }, { contentSchema: 3 }, { dirty: true }].map(change => ({ publicBuild: { ...value.receipt.build, ...change } }))]) {
    assert.throws(() => recordPreviewOwner(plan, { version: first, publicBuild: value.receipt.build, healthy: true, ...change }));
  }
});

test('retirement refuses reopened PRs, malformed owners and manual provider replacement', () => {
  const value = input();
  const owner = publish(value);
  assert.throws(() => planPreviewRetirement({ number: 10, pr: value.pr, owner, liveVersion: first }));
  assert.throws(() => planPreviewRetirement({ number: 10, pr: { ...value.pr, state: 'closed' }, owner, liveVersion: second }));
  assert.throws(() => planPreviewUpdate({ ...value, owner, liveVersion: second }));
  assert.throws(() => planPreviewRetirement({ number: 10, pr: value.pr, owner: { ...owner, worker: 'arkpedia' }, liveVersion: first }));
  assert.deepEqual(planPreviewRetirement({ number: 10, owner: null }), { action: 'none', reason: 'no recorded preview' });
});
