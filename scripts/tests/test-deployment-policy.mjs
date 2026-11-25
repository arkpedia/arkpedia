import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { assertBuildPolicy } from '../deploy/check-vercel-build-policy.mjs';

test('Vercel compilation is skipped even for production, manual and preview requests', () => {
  for (const env of [
    { VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_REF: 'main' },
    { VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: '' },
    { VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'feature', VERCEL_GIT_COMMIT_MESSAGE: '[preview]' },
  ]) {
    const result = spawnSync('bash', ['scripts/deploy/vercel-ignore-build.sh'], { env: { ...process.env, ...env } });
    assert.equal(result.status, 0, JSON.stringify(env));
  }
});

test('a reconnected Git repository or permissive ignore command is refused', () => {
  assert.doesNotThrow(() => assertBuildPolicy({ link: null, commandForIgnoringBuildStep: 'exit 0' }));
  assert.throws(() => assertBuildPolicy({ link: { type: 'github' }, commandForIgnoringBuildStep: 'exit 0' }), /Disconnect/);
  for (const commandForIgnoringBuildStep of [null, '', 'exit 1']) {
    assert.throws(() => assertBuildPolicy({ link: null, commandForIgnoringBuildStep }), /Ignored Build Step/);
  }
});

test('the retired provider keeps Git deployment disabled', () => {
  const config = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  assert.equal(config.git.deploymentEnabled, false);
  assert.equal(config.ignoreCommand, 'bash scripts/deploy/vercel-ignore-build.sh');
  assert.equal(fs.existsSync('.github/workflows/deploy.yml'), false);
});
