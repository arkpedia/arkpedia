import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import yaml from 'js-yaml';
import { pythonTests, runPythonTests } from './run-python-tests.mjs';

const workflow = name => yaml.load(fs.readFileSync(`.github/workflows/${name}.yml`, 'utf8'));
const steps = workflow('check').jobs.check.steps;

test('Python discovery includes every current suite and nested new suites, without helpers', t => {
  const files = pythonTests('scripts');
  for (const file of [
    'scripts/imports/test-degrading-importers.py',
    'scripts/imports/test-namecard-styles.py',
    'scripts/imports/test-story-map.py',
    'scripts/palettes/test-color-palettes.py',
    'scripts/sync/test-publish-catalogue-assets.py',
    'scripts/tests/test-medal-layouts.py',
  ]) assert.ok(files.includes(file), file);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'python-inventory-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'nested'));
  for (const file of ['test-a.py', 'helper.py', 'test-b.ts', 'nested/test-c.py']) fs.writeFileSync(path.join(root, file), '');
  assert.deepEqual(pythonTests(root).map(file => path.relative(root, file)), ['nested/test-c.py', 'test-a.py']);
});

test('Python runner reports failures/signals/spawn errors and still runs later suites', () => {
  for (const result of [{ status: 7 }, { status: null, signal: 'SIGTERM' }, { error: new Error('missing Python') }]) {
    const ran = [];
    assert.equal(runPythonTests(['a.py', 'b.py'], (command, args) => {
      assert.equal(command, 'python3');
      ran.push(args[0]);
      return ran.length === 1 ? result : { status: 0 };
    }), 1);
    assert.deepEqual(ran, ['a.py', 'b.py']);
  }
  assert.equal(runPythonTests(['a.py'], () => ({ status: 0 })), 0);
  assert.throws(() => runPythonTests([], () => assert.fail('must not spawn')), /No Python/);
});

test('combined regression step waits for both suites and fails when either fails', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-regressions-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'npm'), `#!/bin/sh
if [ "$1" = run ]; then
  echo "Python suite output"
  touch "$RUNNER_TEMP/python-finished"
  exit "$PYTHON_EXIT"
fi
touch "$RUNNER_TEMP/app-finished"
exit "$APP_EXIT"
`, { mode: 0o755 });
  const step = steps.find(step => step.name === 'Application and Python regression tests');
  for (const [app, python] of [[0, 0], [7, 0], [0, 9], [7, 9]]) {
    const temp = path.join(root, `${app}-${python}`);
    fs.mkdirSync(temp);
    const result = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', step.run], {
      encoding: 'utf8', timeout: 5000,
      env: { ...process.env, PATH: `${root}:${process.env.PATH}`, RUNNER_TEMP: temp, APP_EXIT: String(app), PYTHON_EXIT: String(python) },
    });
    assert.equal(result.status === 0, app === 0 && python === 0, `${app}, ${python}: ${result.stderr}`);
    assert.ok(fs.existsSync(path.join(temp, 'app-finished')));
    assert.ok(fs.existsSync(path.join(temp, 'python-finished')));
    assert.match(result.stdout, /Python suite output/, 'failure output is still visible');
  }
});

test('Next type validation stays enabled outside Check; lint remains an explicit CI gate', () => {
  const config = env => JSON.parse(execFileSync(process.execPath, ['-e', `
    const c = require('./next.config.js')('phase-production-server');
    console.log(JSON.stringify({ types: c.typescript?.ignoreBuildErrors === true, lintOption: Object.hasOwn(c, 'eslint') }));
  `], { encoding: 'utf8', env: { ...process.env, CI: '', ARKPEDIA_BUILD_CHECKS_PASSED: '', ...env } }));
  for (const env of [{}, { CI: 'true' }, { ARKPEDIA_BUILD_CHECKS_PASSED: '1' }, { CI: 'true', ARKPEDIA_BUILD_CHECKS_PASSED: 'false' }]) {
    assert.deepEqual(config(env), { types: false, lintOption: false });
  }
  assert.deepEqual(config({ CI: 'true', ARKPEDIA_BUILD_CHECKS_PASSED: '1' }), { types: true, lintOption: false });
  assert.equal(steps.find(step => step.name === 'Lint').run, 'npm run lint -- --max-warnings 15');
  for (const job of Object.values(workflow('deploy').jobs)) {
    for (const step of job.steps ?? []) assert.equal(step.env?.ARKPEDIA_BUILD_CHECKS_PASSED, undefined);
    assert.equal(job.env?.ARKPEDIA_BUILD_CHECKS_PASSED, undefined);
  }
});

test('Next prerenders with at most 4 workers, whatever the host\'s core count', () => {
  // Next's default is os.cpus() less one: the host's cores, not the runner container's, so 7
  // workers in a 6 GB NAS container, and the Deploy build was killed (2026-10-22).
  const cpus = JSON.parse(execFileSync(process.execPath, ['-e', `
    console.log(JSON.stringify(require('./next.config.js')('phase-production-build').experimental?.cpus ?? null));
  `], { encoding: 'utf8' }));
  assert.ok(Number.isInteger(cpus) && cpus >= 1 && cpus <= 4, `experimental.cpus is ${cpus}`);
});

test('next.config.js passes Next\'s own option schema: no ignored, moved or unknown option', () => {
  // Next only warns about an option it does not know, and then ignores it: from #658 (Next 16)
  // the function trace excludes sat under `experimental`, where Next 16 no longer reads them.
  const issues = JSON.parse(execFileSync(process.execPath, ['-e', `
    const { configSchema } = require('next/dist/server/config-schema');
    const result = configSchema.safeParse(require('./next.config.js')('phase-production-build'));
    console.log(JSON.stringify(result.success ? [] : result.error.issues.map(issue => issue.path.join('.') + ': ' + issue.message)));
  `], { encoding: 'utf8' }));
  assert.deepEqual(issues, []);
});

test('both Check builds follow generated inputs and explicit validation, with output guards retained', () => {
  const index = name => steps.findIndex(step => step.name === name);
  for (const name of ['Prepare build inputs', 'Typecheck', 'Lint', 'Build', 'Pages render the live content release']) assert.ok(index(name) >= 0, name);
  assert.ok(index('Compile and validate runtime content') < index('Prepare build inputs'));
  assert.equal(steps[index('Prepare build inputs')].run, 'npm run prebuild');
  assert.ok(index('Prepare build inputs') < index('Typecheck'));
  assert.equal(steps[index('Typecheck')].run, 'npm run typecheck');
  assert.equal(steps[index('Lint')].run, 'npm run lint -- --max-warnings 15');
  for (const name of ['Build', 'Pages render the live content release']) {
    const i = index(name);
    assert.ok(i > index('Typecheck') && i > index('Lint'));
    assert.equal(steps[i].if, undefined, 'a failed explicit gate must stop the build');
    assert.equal(steps[i].env.ARKPEDIA_BUILD_CHECKS_PASSED, '1');
  }
  assert.equal(steps[index('Build')].run, 'npm run --ignore-scripts build && npm run postbuild');
  const scripts = JSON.parse(fs.readFileSync('package.json', 'utf8')).scripts;
  // Next 16 builds with Turbopack, which refuses the `webpack` config ClientDataGuard lives in
  // (it is what keeps a game record out of a browser chunk). The flag keeps webpack explicit.
  assert.equal(scripts.build, 'next build --webpack');
  assert.equal(scripts.postbuild, 'npm run check:deployment-traces && npm run check:client-chunks');
  assert.match(steps[index('Pages render the live content release')].run, /grep -q '"__contentRelease"'/);
  assert.equal(steps.filter(step => String(step.run).includes('npm run check:deployment-traces')).length, 0, 'postbuild owns the trace audit');
});

test('publication checks fail before browser regressions and use their separate build', () => {
  const index = name => steps.findIndex(step => step.name === name);
  const runtime = index('Content updates and rollback without rebuilding');
  assert.ok(runtime > index('Pages render the live content release'));
  assert.ok(runtime < index('Desktop and mobile browser regressions'));
  assert.equal(steps[runtime].env.NEXT_DIST_DIR, '.next-live');
  assert.equal(steps[runtime].if, undefined, 'publication must pass even when browser coverage is not needed');
});

test('only fresh hosted runners restore npm archives; all three workflows retain clean installs', () => {
  for (const name of ['check', 'deploy', 'prepare-content']) {
    const jobs = Object.values(workflow(name).jobs);
    const installers = jobs.filter(job => job.steps?.some(step => step.run === 'npm ci'));
    const cached = jobs.flatMap(job => job.steps ?? []).filter(step => step.uses === 'actions/setup-node@v7' && step.with?.cache);
    assert.equal(installers.length, name === 'check' ? 2 : 1, name);
    assert.equal(cached.length, installers.length, 'only clean-install jobs configure the npm cache');
    for (const job of installers) {
      const setups = job.steps.filter(step => step.uses === 'actions/setup-node@v7' && step.with?.cache);
      assert.equal(setups.length, 1, 'each selected profile installs once with its own cache policy');
      assert.equal(setups[0].with.cache, "${{ runner.environment == 'github-hosted' && 'npm' || '' }}");
      assert.equal(setups[0].with['package-manager-cache'], "${{ runner.environment == 'github-hosted' }}");
    }
  }
});
