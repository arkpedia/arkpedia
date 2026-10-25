import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';
import { publishPilotRelease } from '../deploy/pilot-release.mjs';

const source = 'a'.repeat(40);
const build = { version: 1, commit: source, codeFingerprint: 'b'.repeat(64), contentSchema: 2,
  contentChannel: 'live', deploymentRole: 'production', dirty: false };
function fixture() {
  const calls = [];
  let current = 'previous';
  const provider = {
    observe: () => { calls.push('observe'); return { id: current }; },
    health: async () => { calls.push('health'); },
    deploy: owner => { calls.push('deploy'); assert.equal(owner.previousVersion, 'previous'); current = 'new'; return { id: current }; },
    recover: async () => { calls.push('recover'); current = 'previous'; return { action: 'rolled-back' }; },
  };
  return { calls, provider, approve: async () => { calls.push('approve'); } };
}
const publish = (f, overrides = {}) => publishPilotRelease({ source, checkRun: 123, build, ...f, ...overrides });
test('release revalidates after preflight and checks the serving owner after deployed health', async () => {
  const f = fixture(); const result = await publish(f);
  assert.equal(result.action, 'published');
  assert.equal(result.source, source);
  assert.deepEqual(f.calls, ['approve', 'observe', 'health', 'approve', 'deploy', 'health', 'observe']);
});
test('failed initial or final approval and failed preflight never deploy or roll back', async () => {
  const initial = fixture(); initial.approve = async () => { throw new Error('not checked'); };
  await assert.rejects(() => publish(initial), /not checked/); assert.deepEqual(initial.calls, []);
  const moved = fixture(); let approvals = 0;
  moved.approve = async () => { if (++approvals === 2) throw new Error('main moved'); };
  await assert.rejects(() => publish(moved), /main moved/);
  assert.ok(!moved.calls.includes('deploy') && !moved.calls.includes('recover'));
  const unhealthy = fixture(); unhealthy.provider.health = async () => { throw new Error('unhealthy baseline'); };
  await assert.rejects(() => publish(unhealthy), /unhealthy baseline/);
  assert.ok(!unhealthy.calls.includes('deploy') && !unhealthy.calls.includes('recover'));
});
test('post-activation failure attempts ownership-aware recovery but still fails the release', async () => {
  const f = fixture(); let health = 0;
  f.provider.health = async () => { if (++health === 2) throw new Error('new version unhealthy'); };
  await assert.rejects(() => publish(f), error => error.message === 'new version unhealthy' && error.recovery.action === 'rolled-back');
  assert.ok(f.calls.includes('recover'));
});
test('upload uncertainty is reconciled through the provider instead of blindly redeploying', async () => {
  const f = fixture(); f.provider.deploy = () => { throw new Error('response lost'); };
  await assert.rejects(() => publish(f), error => error.message === 'response lost' && error.recovery.action === 'rolled-back');
  assert.equal(f.calls.filter(c => c === 'recover').length, 1);
});
test('a foreign post-activation owner requires reconciliation and remains a failed release', async () => {
  const f = fixture(); let observes = 0;
  f.provider.observe = () => ({ id: ++observes === 1 ? 'previous' : 'foreign' });
  f.provider.recover = async () => { throw new Error('foreign owner'); };
  await assert.rejects(() => publish(f), error => error.recovery.action === 'manual-reconciliation-required');
});
test('a mismatched, dirty or wrong-channel build fails before authorization or provider reads', async () => {
  for (const patch of [{ commit: 'c'.repeat(40) }, { dirty: true }, { contentChannel: 'dev-live' }, { deploymentRole: 'staging' }]) {
    const f = fixture(); await assert.rejects(() => publish(f, { build: { ...build, ...patch } }), /build differs/);
    assert.deepEqual(f.calls, []);
  }
});

test('workflow is opt-in, serializes one pilot owner and triggers only from main Check or explicit main retry', () => {
  const workflow = yaml.load(readFileSync('.github/workflows/cloudflare-pilot-release.yml', 'utf8'));
  assert.deepEqual(workflow.concurrency, { group: 'arkpedia-pilot-production', 'cancel-in-progress': false, queue: 'max' });
  assert.deepEqual(workflow.permissions, { contents: 'read', actions: 'read' });
  assert.deepEqual(workflow.on.workflow_run, { workflows: ['Check'], types: ['completed'], branches: ['main'] });
  assert.equal(workflow.on.push, undefined);
  assert.match(workflow.jobs.release.if, /ARKPEDIA_PILOT_RELEASES_ENABLED == 'true'/);
  assert.match(workflow.jobs.release.if, /head_repository.full_name == github.repository/);
  assert.match(workflow.jobs.release.if, /workflow_run.event == 'push'/);
  assert.match(workflow.jobs.release.if, /github.ref == 'refs\/heads\/main'/);
});
test('workflow gives the provider token only to the validated release step, never installation or build', () => {
  const job = yaml.load(readFileSync('.github/workflows/cloudflare-pilot-release.yml', 'utf8')).jobs.release;
  assert.equal(job.env.CLOUDFLARE_API_TOKEN, undefined);
  const steps = job.steps.filter(s => s.env?.CLOUDFLARE_API_TOKEN);
  assert.equal(steps.length, 1);
  assert.equal(steps[0].id, 'release');
  assert.match(steps[0].run, /scripts\/deploy\/pilot-release\.mjs/);
  assert.equal(steps[0].run.includes('${{'), false);
  assert.equal(job.steps.filter(s => s.run === 'npm run cf:build').length, 1);
  assert.equal(job.steps.find(s => s.uses?.startsWith('actions/checkout@')).with['persist-credentials'], false);
  assert.ok(!job.steps.some(s => /migrations apply|secret put|r2 bucket create|wrangler deploy/.test(s.run ?? '')));
});
