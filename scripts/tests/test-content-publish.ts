import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// The shell of a prepare-content step, exactly as the runner gets it.
function stepScript(name: string) {
  const lines = fs.readFileSync('.github/workflows/prepare-content.yml', 'utf8').split('\n');
  const start = lines.findIndex(line => line.trim() === `- name: ${name}`);
  const run = lines.findIndex((line, i) => i > start && /^\s+run: \|$/.test(line));
  assert.ok(start >= 0 && run > start, `prepare-content.yml has a '${name}' step with a run block`);
  const indent = lines[run].search(/\S/) + 2;
  const body: string[] = [];
  for (const line of lines.slice(run + 1)) {
    if (line.trim() && line.search(/\S/) < indent) break;
    body.push(line.slice(indent));
  }
  return body.join('\n');
}
const loadStep = stepScript('Load public source records');
const publishStep = stepScript('Publish the validated public release');

// A local bare repository stands in for arkpedia-data. Both steps run unchanged: its
// URLs are rewritten to the local one, and the deploy-key setup gets a dummy key and a
// stub for the curl that fills known_hosts. Main starts as 'main 0'..'main 2' (release r2).
function withDataRepository(run: (repo: ReturnType<typeof dataRepository>) => void) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arkpedia-publish-'));
  try { run(dataRepository(root)); } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
function dataRepository(root: string) {
  const origin = path.join(root, 'origin.git'), seed = path.join(root, 'seed'), app = path.join(root, 'app');
  const bin = path.join(root, 'bin'), runner = path.join(root, 'runner');
  for (const dir of [path.join(app, 'scripts/content'), bin, runner, path.join(root, 'home')]) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(app, 'scripts/content/hydrate-source.mjs'), '');
  fs.writeFileSync(path.join(bin, 'curl'), '#!/bin/sh\necho \'{"ssh_keys":[]}\'\n', { mode: 0o755 });
  fs.writeFileSync(path.join(root, 'gitconfig'), [`[url "file://${origin}"]`, '\tinsteadOf = https://github.com/arkpedia/arkpedia-data.git',
    '\tinsteadOf = git@github.com:arkpedia/arkpedia-data.git', '[user]', '\tname = test', '\temail = test@example.invalid',
    '[init]', '\tdefaultBranch = main', '[advice]', '\tdetachedHead = false', ''].join('\n'));
  const env = { ...process.env, GIT_CONFIG_GLOBAL: path.join(root, 'gitconfig'), GIT_CONFIG_NOSYSTEM: '1', HOME: path.join(root, 'home'),
    RUNNER_TEMP: runner, PATH: `${bin}${path.delimiter}${process.env.PATH}` };
  const git = (...args: string[]) => {
    const result = spawnSync('git', args, { cwd: root, env, encoding: 'utf8' });
    assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
    return result.stdout.trim();
  };
  const step = (script: string, extra: Record<string, string>) => {
    const result = spawnSync('bash', ['-c', script], { cwd: app, env: { ...env, ...extra }, encoding: 'utf8' });
    return { status: result.status, output: result.stdout + result.stderr };
  };
  const repo = {
    commit(message: string, release: string, value = release, readme?: string) {
      fs.mkdirSync(path.join(seed, 'source'), { recursive: true });
      fs.mkdirSync(path.join(seed, 'release'), { recursive: true });
      fs.writeFileSync(path.join(seed, 'source/a.json'), JSON.stringify({ value }));
      fs.writeFileSync(path.join(seed, 'release/manifest.json'), JSON.stringify({ release }));
      if (readme) fs.writeFileSync(path.join(seed, 'README.md'), readme);
      git('-C', seed, 'add', '-A');
      git('-C', seed, 'commit', '-q', '-m', message);
    },
    push: (ref: string) => git('-C', seed, 'push', '-q', 'origin', `HEAD:${ref}`),
    checkout: (...args: string[]) => git('-C', seed, 'checkout', '-q', ...args),
    load(ref: string) {
      const result = step(loadStep, { DATA_REF: ref });
      assert.equal(result.status, 0, result.output);
    },
    // What export.mjs leaves for the publish step.
    prepare(release: string, value = release) {
      const out = path.join(runner, 'prepared-content');
      fs.rmSync(out, { recursive: true, force: true });
      fs.mkdirSync(path.join(out, 'source'), { recursive: true });
      fs.mkdirSync(path.join(out, 'release'), { recursive: true });
      fs.writeFileSync(path.join(out, 'source/a.json'), JSON.stringify({ value }));
      fs.writeFileSync(path.join(out, 'release/manifest.json'), JSON.stringify({ release }));
    },
    publish: () => step(publishStep, { CONTENT_DATA_DEPLOY_KEY: 'test-key' }),
    main: () => git('-C', origin, 'log', '--format=%s', 'main').split('\n'),
    mainFile: (file: string) => JSON.parse(git('-C', origin, 'show', `main:${file}`)),
  };
  git('init', '-q', '--bare', origin);
  git('clone', '-q', `file://${origin}`, seed);
  for (const n of [0, 1, 2]) repo.commit(`main ${n}`, `r${n}`);
  repo.push('main');
  return repo;
}
const regenerated = 'Refresh game content and prepared page data';

test('the daily run publishes a new release on data main and skips an unchanged one', () => {
  withDataRepository(repo => {
    repo.load('main');
    repo.prepare('r3');
    assert.equal(repo.publish().status, 0);
    assert.deepEqual(repo.main(), [regenerated, 'main 2', 'main 1', 'main 0']);
    assert.deepEqual(repo.mainFile('release/manifest.json'), { release: 'r3' });
  });
  withDataRepository(repo => {
    repo.load('main');
    repo.prepare('r2');
    const result = repo.publish();
    assert.equal(result.status, 0);
    assert.match(result.output, /Release inputs are unchanged/);
    assert.deepEqual(repo.main(), ['main 2', 'main 1', 'main 0']);
  });
});

test('a correction branch that contains main publishes as a fast-forward with its regenerated release', () => {
  withDataRepository(repo => {
    repo.checkout('-b', 'fix');
    for (const n of [1, 2]) repo.commit(`fix ${n}`, 'r2', `fixed ${n}`);
    repo.push('fix');
    repo.load('fix');
    repo.prepare('r4', 'fixed 2');
    const result = repo.publish();
    assert.equal(result.status, 0, result.output);
    assert.deepEqual(repo.main(), [regenerated, 'fix 2', 'fix 1', 'main 2', 'main 1', 'main 0']);
    assert.deepEqual(repo.mainFile('release/manifest.json'), { release: 'r4' });
    assert.deepEqual(repo.mainFile('source/a.json'), { value: 'fixed 2' });
  });
  // A branch that already carries exactly the compiled release goes out as it is.
  withDataRepository(repo => {
    repo.checkout('-b', 'fix');
    repo.commit('fix with release', 'r5', 'fixed');
    repo.push('fix');
    repo.load('fix');
    repo.prepare('r5', 'fixed');
    assert.equal(repo.publish().status, 0);
    assert.deepEqual(repo.main(), ['fix with release', 'main 2', 'main 1', 'main 0']);
  });
});

test('publication fails rather than overwrite a main that the compiled data does not contain', () => {
  // A correction reached main while the daily run compiled.
  withDataRepository(repo => {
    repo.load('main');
    repo.prepare('r3');
    repo.commit('concurrent', 'r9');
    repo.push('main');
    assert.equal(repo.publish().status, 1);
    assert.deepEqual(repo.main(), ['concurrent', 'main 2', 'main 1', 'main 0']);
  });
  // A correction branch cut before main last moved.
  withDataRepository(repo => {
    repo.checkout('-b', 'fix', 'HEAD~1');
    repo.commit('fix', 'r1', 'fixed');
    repo.push('fix');
    repo.load('fix');
    repo.prepare('r4', 'fixed');
    const result = repo.publish();
    assert.equal(result.status, 1);
    assert.match(result.output, /is not contained in the compiled data/);
    assert.deepEqual(repo.main(), ['main 2', 'main 1', 'main 0']);
  });
});

test('a correction branch that changes no release input publishes nothing', () => {
  withDataRepository(repo => {
    repo.checkout('-b', 'fix');
    repo.commit('readme only', 'r2', 'r2', 'How to correct a record.\n');
    repo.push('fix');
    repo.load('fix');
    repo.prepare('r2');
    const result = repo.publish();
    assert.equal(result.status, 0);
    assert.match(result.output, /Data main already serves this release/);
    assert.deepEqual(repo.main(), ['main 2', 'main 1', 'main 0']);
  });
});
