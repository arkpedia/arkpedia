import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync('wrangler.preview.jsonc', 'utf8').replace(/^\/\/.*$/gm, ''));
test('native Preview binds its own account database, cache and queue without production services', () => {
  assert.equal(config.name, 'arkpedia');
  assert.equal(config.previews.vars.ARKPEDIA_DEPLOYMENT_ROLE, 'staging');
  assert.equal(config.previews.vars.ARKPEDIA_AUTH_URL, 'https://preview.arkpedia.net');
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
  const prelude = `const calls=globalThis.__previewCalls;const app={fetch(...args){calls.push(args);return new Response('ok')}};class WorkerEntrypoint{constructor(ctx,env){this.ctx=ctx;this.env=env}}class OpenNextQueue{constructor(ctx,env){this.ctx=ctx;this.env=env}};`;
  globalThis.__previewCalls = calls;
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
  } finally { delete globalThis.__previewCalls; }
});
test('publication only uses the native Preview command with fixed targets', () => {
  const workflow = readFileSync('.github/workflows/cloudflare-preview.yml', 'utf8');
  assert.match(workflow, /wrangler\.js preview --config wrangler\.preview\.jsonc --worker-name arkpedia --name arkpedia/);
  assert.doesNotMatch(workflow, /wrangler\.js deploy|wrangler deploy/);
  assert.equal(config.main, 'scripts/deploy/preview-worker.mjs');
});
