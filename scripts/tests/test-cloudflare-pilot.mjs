import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { readPilotBuild, readPilotConfig, pilotBuildEnvironment } from '../deploy/cloudflare-pilot.mjs';

function fixture(t, value) {
  const directory = mkdtempSync(join(tmpdir(), 'arkpedia-pilot-test-'));
  const file = join(directory, 'config.json');
  writeFileSync(file, JSON.stringify(value));
  t.after(() => { unlinkSync(file); rmdirSync(directory); });
  return file;
}

test('pilot configuration retains the existing account, cache and queue resources', () => {
  const config = readPilotConfig();
  assert.equal(config.name, 'arkpedia');
  assert.equal(config.vars.ARKPEDIA_DEPLOYMENT_ROLE, 'production');
  assert.equal(config.vars.ARKPEDIA_CONTENT_CHANNEL, 'live');
});

for (const [name, change] of Object.entries({
  'new route': config => { config.routes = [{ pattern: 'arkpedia.net/*' }]; },
  'environment override': config => { config.env = { production: {} }; },
  'different Worker': config => { config.name = 'arkpedia-staging'; },
  'different account': config => { config.account_id = 'another-account'; },
  'different database': config => { config.d1_databases[0].database_id = 'another-database'; },
  'different cache': config => { config.r2_buckets[0].bucket_name = 'arkpedia-staging-cache'; },
  'wrong self reference': config => { config.services[0].service = 'arkpedia-staging'; },
  'changed queue migration': config => { config.migrations[0].tag = 'v2'; },
  'account-free staging role': config => { config.vars.ARKPEDIA_DEPLOYMENT_ROLE = 'staging'; },
  'different account origin': config => { config.vars.ARKPEDIA_AUTH_URL = 'https://www.arkpedia.net'; },
  'development content': config => { config.vars.ARKPEDIA_CONTENT_CHANNEL = 'dev-live'; },
})) {
  test(`pilot check refuses ${name}`, t => {
    const config = readPilotConfig();
    change(config);
    assert.throws(() => readPilotConfig(fixture(t, config)));
  });
}

test('build environment removes credentials and content/test overrides without changing the parent', () => {
  const parent = { PATH: '/bin', CLOUDFLARE_API_TOKEN: 'dummy-only', BETTER_AUTH_SECRET: 'dummy-only', VERCEL_PROJECT_ID: 'dummy', ARKPEDIA_CONTENT_PILOT_ORIGIN: 'http://localhost:9999', ARKPEDIA_CONTENT_TEST: '1', ARKPEDIA_CONTENT_CHANNEL: 'dev-live', ARKPEDIA_DEPLOYMENT_ROLE: 'staging' };
  const before = { ...parent };
  const child = pilotBuildEnvironment(parent);
  assert.deepEqual(parent, before);
  assert.deepEqual(child, { PATH: '/bin', ARKPEDIA_WORKER: '1', ARKPEDIA_CONTENT_CHANNEL: 'live', ARKPEDIA_DEPLOYMENT_ROLE: 'production' });
});

test('pilot build proof requires exact clean source and the live production contract', t => {
  const commit = 'a'.repeat(40);
  const valid = { commit, dirty: false, deploymentRole: 'production', contentChannel: 'live', contentSchema: 2, codeFingerprint: 'b'.repeat(64) };
  assert.deepEqual(readPilotBuild(commit, valid.codeFingerprint, fixture(t, valid)), valid);
  for (const override of [{ commit: 'c'.repeat(40) }, { dirty: true }, { deploymentRole: 'staging' }, { contentChannel: 'dev-live' }, { contentSchema: 1 }, { codeFingerprint: '' }, { codeFingerprint: 'c'.repeat(64) }]) {
    assert.throws(() => readPilotBuild(commit, valid.codeFingerprint, fixture(t, { ...valid, ...override })));
  }
});

test('pilot aliases preserve existing bookmarks without shadowing main canonical pages', () => {
  const { routes } = JSON.parse(readFileSync('config/pilot-route-aliases.json', 'utf8'));
  assert.equal(Object.keys(routes).length, 13);
  for (const [source, destination] of Object.entries(routes)) {
    assert.notEqual(source, destination);
    assert.equal(routes[destination], undefined, `redirect cycle or chain at ${source}`);
    const candidates = [`pages${destination}.tsx`, `pages${destination}/index.tsx`];
    assert.ok(candidates.some(file => { try { readFileSync(file); return true; } catch { return false; } }), `missing canonical page ${destination}`);
  }
});
