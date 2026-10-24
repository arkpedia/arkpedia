import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readStagingConfig, stagingEnvironment } from '../deploy/cloudflare-staging.mjs';

test('staging cache and self-reference are separate from production', () => {
  const config = readStagingConfig();
  assert.equal(config.services[0].service, 'arkpedia-staging');
  assert.equal(config.r2_buckets[0].bucket_name, 'arkpedia-staging-cache');
  assert.equal(config.routes, undefined);
});

test('refuse production routes, cache, service and extra writable resources', () => {
  const dir = mkdtempSync(join(tmpdir(), 'arkpedia-staging-'));
  const file = join(dir, 'config.json');
  try {
    for (const change of [
      { name: 'arkpedia' },
      { routes: [{ pattern: 'arkpedia.net/*' }] },
      { r2_buckets: [{ binding: 'NEXT_INC_CACHE_R2_BUCKET', bucket_name: 'arkpedia-opennext-cache' }] },
      { services: [{ binding: 'WORKER_SELF_REFERENCE', service: 'arkpedia' }] },
      { d1_databases: [{ binding: 'DB', database_id: 'production' }] },
      { vars: { ARKPEDIA_CONTENT_CHANNEL: 'live' } },
      { vars: { ARKPEDIA_CONTENT_CHANNEL: 'dev-live', ARKPEDIA_AUTH_URL: 'https://arkpedia-cf.mocchibird.com' } },
      { vars: { ARKPEDIA_CONTENT_CHANNEL: 'dev-live', BETTER_AUTH_SECRET: 'test-only-account-secret' } },
      { durable_objects: { bindings: [{ name: 'NEXT_CACHE_DO_QUEUE', class_name: 'DOQueueHandler', script_name: 'arkpedia' }] } },
      { unsafe: { bindings: [{ name: 'PRODUCTION' }] } },
    ]) {
      writeFileSync(file, JSON.stringify({ ...readStagingConfig(), ...change }));
      assert.throws(() => readStagingConfig(file));
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('build explicitly overrides inherited production channel and Worker flags', () => {
  assert.deepEqual(stagingEnvironment({ ARKPEDIA_CONTENT_CHANNEL: 'live', ARKPEDIA_WORKER: '0', OTHER: 'kept' }), {
    ARKPEDIA_CONTENT_CHANNEL: 'dev-live', ARKPEDIA_WORKER: '1', OTHER: 'kept',
  });
});

test('staging build omits inherited pilot account and OAuth environment variables', () => {
  const accountKeys = ['ARKPEDIA_AUTH_URL', 'BETTER_AUTH_SECRET', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET'];
  const source = Object.fromEntries(accountKeys.map(key => [key, 'test-only-value']));
  const isolated = stagingEnvironment({ ...source, OTHER: 'kept' });
  for (const key of accountKeys) assert.equal(Object.hasOwn(isolated, key), false, key);
  assert.equal(isolated.OTHER, 'kept');
  assert.equal(source.BETTER_AUTH_SECRET, 'test-only-value', 'the caller environment is not mutated');
});
