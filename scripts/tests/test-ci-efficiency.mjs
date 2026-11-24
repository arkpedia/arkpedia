import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import yaml from 'js-yaml';
import { pythonTests, runPythonTests } from './run-python-tests.mjs';

const workflow = name => yaml.load(fs.readFileSync(`.github/workflows/${name}.yml`, 'utf8'));
const jobs = workflow('check').jobs;
const steps = jobs.validation.steps, buildSteps = jobs['browser-build'].steps, contentSteps = jobs['content-check'].steps;

test('browser pages and generated tables use pinned inputs in isolated build jobs', () => {
  for (const [name, buildName] of [['browser-build','Build'],['content-check','Pages render the live content release']]) {
    const own=jobs[name].steps,pin=own.findIndex(s=>s.name==='Pull the pinned game records for the browser specs'),prepare=own.findIndex(s=>s.name==='Prepare pinned browser build inputs'),build=own.findIndex(s=>s.name===buildName);
    assert.ok(pin>=0&&prepare>pin&&build>prepare);
    assert.ok(own.slice(prepare+1,build).every(s=>!/pull-data\.mjs/.test(s.run??'')));
    assert.equal(own[prepare].run,'npm run prebuild');
    assert.equal(own[prepare].env.ARKPEDIA_CONTENT_DISABLED,'1');
    assert.equal(jobs[name].needs,'seen','builds start independently of validation');
  }
  assert.ok(steps.some(s=>s.name==='Pull the live game records'));
  assert.ok(!steps.some(s=>s.name==='Pull the pinned game records for the browser specs'),'validation keeps live-data type checks');
});

test('Python discovery includes every current suite and nested new suites, without helpers', t => {
  const files = pythonTests('scripts').map(file => file.replaceAll('\\', '/'));
  for (const file of [
    'scripts/palettes/test-color-palettes.py',
    'scripts/sync/test-publish-catalogue-assets.py',
  ]) assert.ok(files.includes(file), file);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'python-inventory-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'nested'));
  for (const file of ['test-a.py', 'helper.py', 'test-b.ts', 'nested/test-c.py']) fs.writeFileSync(path.join(root, file), '');
  assert.deepEqual(pythonTests(root).map(file => path.relative(root, file).replaceAll('\\', '/')), ['nested/test-c.py', 'test-a.py']);
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
  for (const job of Object.values(workflow('production-release').jobs)) {
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

test('parallel builds retain output budgets and require independent validation before proof', () => {
  const index=name=>steps.findIndex(s=>s.name===name);
  for(const name of ['Compile and validate runtime content','Prepare build inputs','Typecheck','Lint'])assert.ok(index(name)>=0,name);
  assert.ok(index('Compile and validate runtime content')<index('Prepare build inputs'));
  assert.ok(index('Prepare build inputs')<index('Typecheck'));
  assert.equal(steps[index('Typecheck')].run,'npm run typecheck');
  for(const [own,name] of [[buildSteps,'Build'],[contentSteps,'Pages render the live content release']]){
    const build=own.find(s=>s.name===name);assert.equal(build.env.ARKPEDIA_BUILD_CHECKS_PASSED,'1');
    assert.equal(build.if,undefined,'build failures remain blocking');
  }
  assert.equal(buildSteps.find(s=>s.name==='Build').run,'npm run --ignore-scripts build && npm run postbuild');
  const scripts=JSON.parse(fs.readFileSync('package.json','utf8')).scripts;
  assert.equal(scripts.build,'next build --webpack');
  assert.equal(scripts.postbuild,'npm run check:deployment-traces && npm run check:client-chunks');
  assert.match(contentSteps.find(s=>s.name==='Pages render the live content release').run,/grep -q/);
  assert.ok(jobs.check.needs.includes('validation')&&jobs.check.needs.includes('production-build'));
  const guard=jobs.check.steps.find(s=>s.name==='Require parallel checks');
  assert.equal(guard.env.VALIDATION,'${{ needs.validation.result }}');
  assert.equal(jobs.check.steps[4],guard,'independent gates are checked before artifacts or proof');
});

test('publication compatibility and rollback checks remain required before approval', () => {
  const index=name=>contentSteps.findIndex(s=>s.name===name),runtime=contentSteps[index('Content updates and rollback without rebuilding')];
  assert.ok(index('Pages render the live content release')<index('Content updates and rollback without rebuilding'));
  assert.equal(runtime.env.NEXT_DIST_DIR,'.next-live');assert.equal(runtime.if,undefined);
  assert.ok(jobs.check.needs.includes('content-check'));
  assert.equal(jobs.check.steps.find(s=>s.name==='Require parallel checks').env.CONTENT,'${{ needs.content-check.result }}');
});

test('only fresh hosted runners restore npm archives; every profile has one locked install owner', () => {
  for (const name of ['check', 'production-release', 'prepare-content']) {
    const jobs = Object.values(workflow(name).jobs);
    const ownsInstall = step => step.run === 'npm ci';
    const installers = jobs.filter(job => job.steps?.some(ownsInstall));
    const cachesNpm = step => step.uses?.startsWith('actions/setup-node@') && step.with?.cache;
    const cached = jobs.flatMap(job => job.steps ?? []).filter(cachesNpm);
    assert.equal(installers.length, name === 'check' ? 7 : 1, name);
    assert.equal(cached.length, name === 'production-release' ? 0 : installers.length, 'production builds do not restore an npm cache');
    for (const job of installers) {
      assert.equal(job.steps.filter(ownsInstall).length, 1, 'one dependency install owner per selected job');
      if (name === 'production-release') {
        assert.ok(job.steps.some(step => step.uses?.startsWith('actions/setup-node@') && step.with?.['package-manager-cache'] === false));
        continue;
      }
      const setups = job.steps.filter(cachesNpm);
      assert.equal(setups.length, 1, 'each selected profile installs once with its own cache policy');
      assert.equal(setups[0].with.cache, 'npm');
      assert.equal(setups[0].with['package-manager-cache'], true);
    }
  }
});
