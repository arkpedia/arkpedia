import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
// @ts-expect-error Node import scripts are plain JavaScript.
import { RELEASE_BRANCH, deployTargets, readDeployments } from '../deploy/deploy-targets.mjs';

/*
 * Where Deploy uploads a build (scripts/deploy/deploy-targets.mjs, from config/production.json).
 * On 2026-09-30 kukki's Vercel project, which serves www.arkpedia.net, was Git-linked to this
 * repository with its domains assigned automatically: the first push to main that built would
 * have replaced the public site without a Check. Now Deploy uploads it from CI after a green
 * Check of main. The former dev project is retired.
 */
const entry = (name: string, branch: string, live: boolean, extra: object = {}) => ({
  name,
  url: `https://${name}.example`,
  branch,
  vercel: { scope: 'some-team', orgId: 'team_abc123', projectId: `prj_${name.replace(/-/g, '')}` },
  tokenSecret: 'VERCEL_TOKEN',
  live,
  ...extra,
});
type Target = { name: string; environment: string; production: boolean; releaseGate: boolean; last: boolean; alert: string };

test('Vercel retirement leaves no upload targets while main remains the publishing branch', () => {
  assert.deepEqual(readDeployments(), []);
  assert.deepEqual(deployTargets({ branch: 'main' }), []);
  assert.equal(RELEASE_BRANCH, 'main');
});

test("a push deploys its branch's live deployments; a preview, its ones not live yet", () => {
  const deployments = readDeployments({ deployments: [entry('one', 'main', true), entry('two', 'main', false), entry('three', 'main', true), entry('four', 'dev', true)] });
  const main = deployTargets({ branch: 'main', deployments });
  assert.deepEqual(main.map((target: Target) => [target.name, target.environment, target.releaseGate, target.last, target.alert]), [
    ['one', 'production', true, false, 'deploy-failing-one'],
    ['three', 'production', true, true, 'deploy-failing-three'],
  ]);
  // dev's deployments run other code than the release job compiles with: the gate never asks them.
  assert.deepEqual(deployTargets({ branch: 'dev', deployments }).map((target: Target) => [target.name, target.releaseGate, target.last]), [['four', false, true]]);
  assert.deepEqual(deployTargets({ branch: 'main', deployments, preview: true }).map((target: Target) => [target.name, target.environment, target.production, target.releaseGate]), [['two', 'preview', false, false]]);
  // A branch nothing follows deploys nothing.
  assert.deepEqual(deployTargets({ branch: 'feat/x', deployments }), []);
  assert.throws(() => deployTargets({ deployments }), /Not a branch/);
});

test('a malformed entry is refused, naming what is wrong', () => {
  const refuse = (deployments: unknown, pattern: RegExp) => assert.throws(() => readDeployments({ deployments }), pattern);
  refuse(undefined, /deployments must be a list/);
  assert.deepEqual(readDeployments({ deployments: [] }), []);
  refuse([entry('one', 'main', true), entry('one', 'dev', false)], /listed twice/);
  refuse([entry('One', 'main', true)], /name must be/);
  refuse([entry('one', 'main', true, { url: 'http://one.example' })], /bare https origin/);
  refuse([entry('one', 'main', true, { url: 'https://one.example/path' })], /bare https origin/);
  refuse([entry('one', '', true)], /branch must/);
  refuse([entry('one', 'main', true, { vercel: { scope: 'x', orgId: 'org', projectId: 'prj_1' } })], /orgId \(team_/);
  refuse([entry('one', 'main', true, { tokenSecret: 'vercel token' })], /tokenSecret/);
  refuse([entry('one', 'main', true, { live: 'yes' })], /live must be/);
});

test('the script prints the matrix for $GITHUB_OUTPUT', () => {
  const run = (...args: string[]) => spawnSync(process.execPath, ['scripts/deploy/deploy-targets.mjs', ...args], { encoding: 'utf8' });
  const names = (args: string[]) => {
    const result = run(...args);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^targets=\[.*\]\n$/);
    return JSON.parse(result.stdout.slice('targets='.length)).map((target: Target) => target.name);
  };
  assert.deepEqual(names(['--branch', 'main']), []);
  assert.deepEqual(names(['--branch', 'dev']), []);
  assert.deepEqual(names(['--branch', 'feat/x']), []);
  assert.deepEqual(names(['--branch', 'main', '--preview']), []);
});

test('Vercel never builds this repository itself: Git deployments are off', () => {
  // With them on, a push to main that built on kukki's project went straight to
  // www.arkpedia.net, before any Check, and a branch push built a preview there.
  const config = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  assert.equal(config.git?.deploymentEnabled, false);
});
