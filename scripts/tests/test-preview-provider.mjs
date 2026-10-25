import test from 'node:test';
import assert from 'node:assert/strict';
import { STAGING, providerEnvironment, latestStagingVersion, assertStagingBindings,
  previewAnnotations, previewIntent, matchesStagingBuild, createStagingProvider } from '../deploy/preview-provider.mjs';

const versionId = '22222222-2222-4222-8222-222222222222';
const build = { version: 1, dirty: false, deploymentRole: 'staging', contentChannel: 'live', contentSchema: 2,
  commit: STAGING.baselineCommit, codeFingerprint: STAGING.baselineFingerprint };
const plan = { format: 1, repository: 'arkpedia/arkpedia', worker: STAGING.worker, pr: 123,
  source: 'a'.repeat(40), sourceTree: 'b'.repeat(40), buildRun: 42, artifact: 43,
  archiveSha256: 'c'.repeat(64), configSha256: 'd'.repeat(64), codeFingerprint: 'e'.repeat(64),
  contentSchema: 2, expectedVersion: STAGING.baselineVersion, baselineVersion: STAGING.baselineVersion };
function version(id = STAGING.baselineVersion) {
  return { id, resources: { script_runtime: { migration_tag: 'v1' }, bindings: [
    { name: 'ASSETS', type: 'assets' },
    { name: 'ARKPEDIA_CONTENT_CHANNEL', type: 'plain_text', text: 'live' },
    { name: 'ARKPEDIA_DEPLOYMENT_ROLE', type: 'plain_text', text: 'staging' },
    { name: 'NEXT_CACHE_DO_QUEUE', type: 'durable_object_namespace', namespace_id: STAGING.queueNamespace, class_name: 'DOQueueHandler' },
    { name: 'NEXT_INC_CACHE_R2_BUCKET', type: 'r2_bucket', bucket_name: 'arkpedia-staging-cache' },
    { name: 'WORKER_SELF_REFERENCE', type: 'service', service: STAGING.worker, environment: 'production' },
  ] } };
}
function owned() {
  const result = version(versionId);
  const annotation = previewAnnotations(plan, 44);
  result.annotations = { 'workers/tag': annotation.tag, 'workers/message': annotation.message };
  return result;
}
const deployment = (id, created_on, versions = [{ version_id: STAGING.baselineVersion, percentage: 100 }]) => ({ id, created_on, versions });

test('metadata roundtrip fits the provider byte limit and retains original baseline and Check provenance', () => {
  const annotation = previewAnnotations(plan, 44);
  assert.ok(Buffer.byteLength(annotation.message) <= 1000);
  const intent = previewIntent(owned());
  assert.equal(intent.pr, 123);
  assert.equal(intent.version, versionId);
  assert.equal(intent.baselineVersion, STAGING.baselineVersion);
  assert.equal(intent.checkRun, 44);
  assert.equal(previewIntent(version()), null);
});

test('truncated, unrecorded, retagged and unreviewed-baseline ownership is refused', () => {
  for (const mutate of [
    v => { v.annotations['workers/message'] = v.annotations['workers/message'].slice(0, -1); },
    v => { v.annotations['workers/message'] = 'manual deployment'; },
    v => { v.annotations['workers/tag'] = 'another-preview'; },
    v => { v.annotations['workers/message'] = 'x'.repeat(1001); },
  ]) { const v = owned(); mutate(v); assert.throws(() => previewIntent(v)); }
  assert.throws(() => previewAnnotations({ ...plan, baselineVersion: versionId }, 44));
  assert.throws(() => previewAnnotations({ ...plan, extra: 'x'.repeat(1000) }, 44));
});

test('binding guard rejects production/self/cache/database/secret/queue drift', () => {
  for (const mutate of [
    v => { v.resources.bindings.push({ name: 'DB', type: 'd1' }); },
    v => { v.resources.bindings[0] = { name: 'SECRET', type: 'secret_text' }; },
    v => { v.resources.bindings[4].bucket_name = 'arkpedia-production'; },
    v => { v.resources.bindings[5].service = 'arkpedia'; },
    v => { v.resources.bindings[3].namespace_id = 'production'; },
    v => { v.resources.bindings[2].text = 'production'; },
    v => { v.resources.script_runtime.migration_tag = 'v2'; },
  ]) { const v = version(); mutate(v); assert.throws(() => assertStagingBindings(v)); }
});

test('history is sorted by provider time; ambiguous/split deployment is refused', () => {
  const earlier = deployment('11111111-1111-4111-8111-111111111111', '2026-10-25T01:00:00Z');
  const later = deployment(versionId, '2026-10-25T02:00:00Z', [{ version_id: versionId, percentage: 100 }]);
  assert.equal(latestStagingVersion([earlier, later]), versionId);
  assert.throws(() => latestStagingVersion([later, { ...earlier, created_on: later.created_on }]));
  assert.throws(() => latestStagingVersion([{ ...later, versions: [{ version_id: versionId, percentage: 50 }] }]));
});

test('provider subprocess gets only staging identity and required runtime credentials', () => {
  const env = providerEnvironment({ PATH: '/runtime', HOME: '/home', CLOUDFLARE_API_TOKEN: 'fixture-only',
    GITHUB_TOKEN: 'must-not-inherit', BETTER_AUTH_SECRET: 'must-not-inherit', CLOUDFLARE_ACCOUNT_ID: 'foreign' });
  assert.equal(env.CLOUDFLARE_API_TOKEN, 'fixture-only');
  assert.equal(env.CLOUDFLARE_ACCOUNT_ID, STAGING.account);
  assert.equal(env.OPEN_NEXT_DEPLOY, 'true');
  assert.equal(env.GITHUB_TOKEN, undefined);
  assert.equal(env.BETTER_AUTH_SECRET, undefined);
});

test('health requires exact public build and noindex on every core route', async () => {
  const request = async url => url.endsWith('build-info.json')
    ? new Response(JSON.stringify(build)) : new Response('page', { headers: { 'x-robots-tag': 'noindex' } });
  const provider = createStagingProvider({ request });
  assert.equal((await provider.health()).healthy, true);
  assert.equal(matchesStagingBuild(build), true);
  assert.equal(matchesStagingBuild({ ...build, dirty: true }), false);
  const indexable = createStagingProvider({ request: async url => url.endsWith('build-info.json')
    ? new Response(JSON.stringify(build)) : new Response('page') });
  await assert.rejects(indexable.health(), /indexable/);
  const oversized = createStagingProvider({ request: async () => new Response('x'.repeat(65537)) });
  await assert.rejects(oversized.health(), /oversized/);
});

test('operator runtime failure or missing noindex prevents a healthy staging claim', async () => {
  for (const failure of ['render', 'indexing']) {
    const visited = [];
    const provider = createStagingProvider({ request: async url => {
      const path = new URL(url).pathname;
      visited.push(path);
      if (path === '/build-info.json') return new Response(JSON.stringify(build));
      if (path === '/operators/Amiya') return failure === 'render'
        ? new Response('operator render failed', { status: 500, headers: { 'x-robots-tag': 'noindex' } })
        : new Response('operator page');
      return new Response('page', { headers: { 'x-robots-tag': 'noindex' } });
    } });
    await assert.rejects(provider.health(), /unhealthy or indexable staging route \/operators\/Amiya/);
    assert.equal(visited.filter(path => path === '/operators/Amiya').length, 1);
  }
});

test('provider rollback rechecks ownership and never invokes production or storage deletion', () => {
  const calls = [];
  let current = owned();
  const run = (_binary, args) => {
    calls.push(args);
    assert.equal(args[args.indexOf('--name') + 1], STAGING.worker);
    if (args.includes('list')) return JSON.stringify([deployment(versionId, '2026-10-25T02:00:00Z', [{ version_id: current.id, percentage: 100 }])]);
    if (args.includes('view')) return JSON.stringify(current);
    assert.ok(args.includes('rollback'));
    assert.ok(args.includes(STAGING.baselineVersion));
    current = version();
    return '';
  };
  const provider = createStagingProvider({ run });
  provider.rollback(versionId);
  assert.equal(current.id, STAGING.baselineVersion);
  assert.equal(calls.filter(args => args.includes('rollback')).length, 1);
  assert.throws(() => provider.rollback(versionId), /changed/);
  assert.equal(calls.filter(args => args.includes('rollback')).length, 1);
});

test('raw deployment uses trusted Wrangler, explicit annotations and isolated environment', () => {
  let current = version();
  const calls = [];
  const run = (_binary, args, options) => {
    calls.push(args);
    assert.equal(options.env.OPEN_NEXT_DEPLOY, 'true');
    assert.equal(options.env.GITHUB_TOKEN, undefined);
    if (args.includes('list')) return JSON.stringify([deployment(versionId, '2026-10-25T02:00:00Z', [{ version_id: current.id, percentage: 100 }])]);
    if (args.includes('view')) return JSON.stringify(current);
    assert.equal(args[1], 'deploy');
    assert.equal(options.cwd, '/verified/extraction');
    assert.equal(args[args.indexOf('--config') + 1], '/verified/extraction/wrangler.staging.jsonc');
    current = owned();
    assert.equal(args[args.indexOf('--message') + 1], current.annotations['workers/message']);
    return `Uploaded arkpedia-staging\nCurrent Version ID: ${versionId}\n`;
  };
  const provider = createStagingProvider({ run });
  assert.equal(provider.deploy(plan, 44, '/verified/extraction').version.id, versionId);
  assert.equal(calls.filter(args => args[1] === 'deploy').length, 1);
  assert.throws(() => provider.deploy(plan, 44, '/verified/extraction'), /changed before upload/);
  assert.equal(calls.filter(args => args[1] === 'deploy').length, 1);
});
