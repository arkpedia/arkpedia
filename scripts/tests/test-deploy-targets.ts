import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
// @ts-expect-error Node import scripts are plain JavaScript.
import { deployTargets, readDeployments } from '../deploy/deploy-targets.mjs';

/*
 * Where Deploy uploads a build (scripts/deploy/deploy-targets.mjs, from config/production.json).
 * On 2026-09-30 kukki's Vercel project, which serves www.arkpedia.net, was Git-linked to this
 * repository with its domains assigned automatically: the first push to main that built would
 * have replaced the public site without a Check. It is listed here as not live, so it gets
 * nothing but a preview a manual run asks for, until the change that flips it.
 */
const entry = (name: string, live: boolean, extra: object = {}) => ({
  name,
  url: `https://${name}.example`,
  vercel: { scope: 'some-team', orgId: 'team_abc123', projectId: `prj_${name.replace(/-/g, '')}` },
  tokenSecret: 'VERCEL_TOKEN',
  live,
  ...extra,
});

test('the checked-in list: arkpedia-dev live, www.arkpedia.net listed and not live yet', () => {
  const deployments = readDeployments();
  assert.deepEqual(deployments.map(({ name, url, scope, tokenSecret, live }: Record<string, unknown>) => ({ name, url, scope, tokenSecret, live })), [
    { name: 'arkpedia-dev', url: 'https://arkpedia-dev.vercel.app', scope: 'mocchibirds', tokenSecret: 'VERCEL_TOKEN', live: true },
    { name: 'arkpedia-net', url: 'https://www.arkpedia.net', scope: 'kukkikazes-projects', tokenSecret: 'VERCEL_TOKEN_ARKPEDIA_NET', live: false },
  ]);
  // kukki's project, as `vercel project inspect arkpedia --scope kukkikazes-projects` names it.
  assert.equal(deployments[1].orgId, 'team_HnaZMOxh1kZqA9fCWV9FNjTd');
  assert.equal(deployments[1].projectId, 'prj_onqP9wnDB7c8qzYPIJAGNMcTyjLC');
});

test('a production deploy goes to the live deployments, a preview to the ones not live yet', () => {
  const deployments = readDeployments({ deployments: [entry('one', true), entry('two', false), entry('three', true)] });
  const live = deployTargets({ deployments });
  assert.deepEqual(live.map((target: { name: string; environment: string; production: boolean; last: boolean; alert: string }) => [target.name, target.environment, target.production, target.last, target.alert]), [
    ['one', 'production', true, false, 'deploy-failing-one'],
    ['three', 'production', true, true, 'deploy-failing-three'],
  ]);
  const preview = deployTargets({ deployments, preview: true });
  assert.deepEqual(preview.map((target: { name: string; environment: string; production: boolean; last: boolean }) => [target.name, target.environment, target.production, target.last]), [['two', 'preview', false, true]]);
  assert.throws(() => deployTargets({ deployments: readDeployments({ deployments: [entry('one', true)] }), preview: true }), /nothing to preview/);
  assert.throws(() => deployTargets({ deployments: readDeployments({ deployments: [entry('one', false)] }) }), /No deployment is live/);
});

test('a malformed entry is refused, naming what is wrong', () => {
  const refuse = (deployments: unknown, pattern: RegExp) => assert.throws(() => readDeployments({ deployments }), pattern);
  refuse([], /lists no deployments/);
  refuse([entry('one', true), entry('one', false)], /listed twice/);
  refuse([entry('One', true)], /name must be/);
  refuse([entry('one', true, { url: 'http://one.example' })], /bare https origin/);
  refuse([entry('one', true, { url: 'https://one.example/path' })], /bare https origin/);
  refuse([entry('one', true, { vercel: { scope: 'x', orgId: 'org', projectId: 'prj_1' } })], /orgId \(team_/);
  refuse([entry('one', true, { tokenSecret: 'vercel token' })], /tokenSecret/);
  refuse([entry('one', true, { live: 'yes' })], /live must be/);
});

test('the script prints the matrix for $GITHUB_OUTPUT', () => {
  const run = (...args: string[]) => spawnSync(process.execPath, ['scripts/deploy/deploy-targets.mjs', ...args], { encoding: 'utf8' });
  const live = run();
  assert.equal(live.status, 0, live.stderr);
  assert.match(live.stdout, /^targets=\[.*\]\n$/);
  assert.deepEqual(JSON.parse(live.stdout.slice('targets='.length)).map((target: { name: string }) => target.name), ['arkpedia-dev']);
  const preview = run('--preview');
  assert.deepEqual(JSON.parse(preview.stdout.slice('targets='.length)).map((target: { name: string; environment: string }) => [target.name, target.environment]), [['arkpedia-net', 'preview']]);
});
