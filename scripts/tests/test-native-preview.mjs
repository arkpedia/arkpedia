import test from 'node:test';
import { verifyPreviewRecovery } from '../deploy/preview-account-recovery.mjs';
import { protectPreviewRequest } from '../deploy/preview-security.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync('wrangler.preview.jsonc', 'utf8').replace(/^\/\/.*$/gm, ''));
test('native Preview binds its own account database, cache and queue without production services', () => {
  assert.equal(config.name, 'arkpedia');
  assert.equal(config.previews.vars.ARKPEDIA_DEPLOYMENT_ROLE, 'staging');
  assert.equal(config.previews.vars.ARKPEDIA_AUTH_URL, 'https://preview.arkpedia.net');
  assert.equal(config.ratelimits, undefined);
  assert.deepEqual(config.previews.ratelimits, [
    { name: 'ACCOUNT_TRAFFIC_LIMIT', namespace_id: '2026110101', simple: { limit: 6000, period: 60 } },
    { name: 'ACCOUNT_IP_LIMIT', namespace_id: '2026110102', simple: { limit: 300, period: 60 } },
  ]);
  assert.deepEqual(config.previews.d1_databases, [{binding:'ARKPEDIA_ACCOUNTS_DB',database_name:'arkpedia-preview-accounts',database_id:'7d9cdfb2-2203-4708-bad5-f357d2c105b2',migrations_dir:'migrations/accounts'}]);
  assert.deepEqual(config.previews.r2_buckets, [{ binding: 'NEXT_INC_CACHE_R2_BUCKET', bucket_name: 'arkpedia-preview-cache' }]);
  assert.deepEqual(config.previews.durable_objects.bindings, [{ name: 'NEXT_CACHE_DO_QUEUE', class_name: 'DOQueueHandler' }]);
  for (const key of ['services', 'd1_databases', 'routes', 'queues', 'env']) {
    assert.equal(config[key], undefined);
    if (key !== 'd1_databases') assert.equal(config.previews[key], undefined);
  }
});
test('requests, explicit revalidation and queued revalidation self-call the same Preview', async () => {
  const source = readFileSync('scripts/deploy/preview-worker.mjs', 'utf8').replace(/^import .*;$/gm, '');
  const calls = [];
  const self = { fetch() {} };
  const ctx = { exports: { PreviewSelf: self } };
  const env = { NEXT_INC_CACHE_R2_BUCKET: {}, WORKER_SELF_REFERENCE: { fetch() { throw Error('production called'); } } };
  const prelude = `const protectPreviewRequest=globalThis.__previewProtect;const calls=globalThis.__previewCalls;const app={fetch(...args){calls.push(args);return new Response('ok')}};class WorkerEntrypoint{constructor(ctx,env){this.ctx=ctx;this.env=env}}class OpenNextQueue{constructor(ctx,env){this.ctx=ctx;this.env=env}};`;
  globalThis.__previewCalls = calls;
  globalThis.__previewProtect = protectPreviewRequest;
  try {
    const module = await import('data:text/javascript;base64,' + Buffer.from(prelude + source).toString('base64'));
    await module.default.fetch(new Request('https://preview.example/'), env, ctx);
    await new module.PreviewSelf(ctx, env).fetch(new Request('https://preview.example/revalidate'));
    for (const [, actual] of calls) {
      assert.equal(actual.WORKER_SELF_REFERENCE, self);
      assert.equal(actual.NEXT_INC_CACHE_R2_BUCKET, env.NEXT_INC_CACHE_R2_BUCKET);
    }
    assert.equal(calls.length, 2);
    const queue = new module.DOQueueHandler(ctx, env);
    assert.equal(queue.env.WORKER_SELF_REFERENCE, self);
    assert.notEqual(env.WORKER_SELF_REFERENCE, self, 'original environment is not mutated');
  } finally { delete globalThis.__previewCalls; delete globalThis.__previewProtect; }
});
test('publication only uses the native Preview command with fixed targets', () => {
  const workflow = readFileSync('.github/workflows/cloudflare-preview.yml', 'utf8');
  assert.match(workflow, /wrangler\.js preview --config wrangler\.preview\.jsonc --worker-name arkpedia --name arkpedia/);
  assert.doesNotMatch(workflow, /wrangler\.js deploy|wrangler deploy/);
  assert.equal(config.main, 'scripts/deploy/preview-worker.mjs');
  assert.match(workflow, /node scripts\/deploy\/preview-account-recovery\.mjs/);
  assert.match(workflow, /migrations apply arkpedia-preview-accounts/);
  assert.ok(workflow.indexOf('node scripts/deploy/preview-account-recovery.mjs') < workflow.indexOf('migrations apply'));
  assert.ok(workflow.indexOf('migrations apply') < workflow.indexOf('wrangler.js preview'));
  const [beforeDatabase, databaseAndPublish] = workflow.split('- name: Verify recovery and apply isolated Preview account migrations');
  const [databaseStep, publishStep] = databaseAndPublish.split('- name: Publish the native Preview only');
  assert.match(databaseStep, /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.ARKPEDIA_PREVIEW_D1_API_TOKEN \}\}/);
  assert.doesNotMatch(databaseStep, /ARKPEDIA_PRODUCTION_API_TOKEN|ARKPEDIA_PILOT_API_TOKEN|\|\|/);
  assert.doesNotMatch(beforeDatabase + publishStep, /ARKPEDIA_PREVIEW_D1_API_TOKEN/);
});

test('Preview limits account ingress before application work and fails closed without its bindings', async () => {
  let applicationCalls = 0;
  const run = () => { applicationCalls++; return new Response('ok'); };
  const request = new Request('https://preview.arkpedia.net/api/cloud-account', { headers: { 'cf-connecting-ip': '192.0.2.1' } });
  const env = { ACCOUNT_TRAFFIC_LIMIT: { limit: async () => ({success:true}) }, ACCOUNT_IP_LIMIT: { limit: async () => ({success:false}) } };
  const denied = await protectPreviewRequest(request,env,run);
  assert.equal(denied.status,429); assert.equal(denied.headers.get('retry-after'),'60'); assert.equal(applicationCalls,0);
  assert.equal((await protectPreviewRequest(request,{},run)).status,503);
  assert.equal((await protectPreviewRequest(new Request('https://preview.arkpedia.net/api/account-import/replay-permit'),{},run)).status,503);
  const publicPage = await protectPreviewRequest(new Request('https://preview.arkpedia.net/music'),{},run);
  assert.equal(publicPage.status,200); assert.equal(applicationCalls,1);
  assert.match(publicPage.headers.get('content-security-policy'),/object-src 'none'/);
  assert.match(publicPage.headers.get('content-security-policy-report-only'),/script-src/);
  assert.equal(publicPage.headers.get('strict-transport-security'),'max-age=604800');
  // A forwarded Worker IP is shared, but can never skip the aggregate cap.
  const forwarded = new Request(request,{headers:{'cf-connecting-ip':'2a06:98c0:3600::103'}});
  env.ACCOUNT_TRAFFIC_LIMIT.limit=async()=>({success:false});
  assert.equal((await protectPreviewRequest(forwarded,env,run)).status,429);
  assert.equal(applicationCalls,1);
});


test('Preview recovery requires an actual bookmark and rejects other database targets before authorization', async () => {
  let calls = 0;
  const args = { config, accountId: '1ff51c10571eaa9934bc451e1bfdb361', token: 'test-only', fetcher: async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.cloudflare.com/client/v4/accounts/1ff51c10571eaa9934bc451e1bfdb361/d1/database/7d9cdfb2-2203-4708-bad5-f357d2c105b2/time_travel/bookmark');
    assert.equal(options.redirect, 'error');
    return Response.json({ success: true, result: { bookmark: 'test-recovery-point' } });
  } };
  assert.equal((await verifyPreviewRecovery(args)).bookmark, 'test-recovery-point');
  const wrong = structuredClone(config);
  wrong.previews.d1_databases[0].database_id = 'another-database';
  await assert.rejects(verifyPreviewRecovery({ ...args, config: wrong }));
  await assert.rejects(verifyPreviewRecovery({ ...args, accountId: 'another-account' }));
  await assert.rejects(verifyPreviewRecovery({ ...args, token: '' }), /Missing ARKPEDIA_PREVIEW_D1_API_TOKEN/);
  await assert.rejects(verifyPreviewRecovery({ ...args, token: '  ' }), /Missing ARKPEDIA_PREVIEW_D1_API_TOKEN/);
  assert.equal(calls, 1);
  await assert.rejects(verifyPreviewRecovery({ ...args, fetcher: async () => Response.json({ success: true, result: {} }) }), /Missing Preview recovery/);
  await assert.rejects(verifyPreviewRecovery({ ...args, fetcher: async () => new Response('private diagnostic', { status: 403 }) }), /HTTP 403/);
});

test('Preview recovery authorization errors are actionable without leaking provider contents or credentials', async () => {
  for (const status of [401, 403, 500]) {
    await assert.rejects(verifyPreviewRecovery({ config, accountId: '1ff51c10571eaa9934bc451e1bfdb361', token: 'private-token',
      fetcher: async () => new Response('private-provider-body', { status }),
    }), error => {
      assert.match(error.message, new RegExp(`HTTP ${status}`));
      assert.doesNotMatch(error.message, /private-token|private-provider-body/);
      if (status !== 500) assert.match(error.message, /ARKPEDIA_PREVIEW_D1_API_TOKEN.*D1 permissions/);
      return true;
    });
  }
});
