import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
// @ts-expect-error Node publication scripts are plain JavaScript.
import { contentInput, releaseInput } from '../content/release-input.mjs';
import { CONTENT_SCHEMA } from '../../lib/content/types';

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
const devPublishStep = stepScript("Publish the dev channel's release");
const heartbeatStep = stepScript('Record the heartbeat');

// A local bare repository stands in for arkpedia-data. The steps run unchanged: its
// URLs are rewritten to the local one, and the deploy-key setup (scripts/content/data-remote.sh,
// the real one) gets a dummy key and a stub for the curl that fills known_hosts. A pass-through git notes every fetch that
// deepens the history, and the Load step's two scripts only note that they ran, in
// order. Main starts as 'main 0'..'main 2' (release r2). The data repository's own validator
// (scripts/validate-release.mjs there, which the dev channel's step runs in the clone) only
// notes that it ran and that the release it was given is there.
function withDataRepository(run: (repo: ReturnType<typeof dataRepository>) => void) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arkpedia-publish-'));
  try { run(dataRepository(root)); } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
function dataRepository(root: string) {
  const origin = path.join(root, 'origin.git'), seed = path.join(root, 'seed'), app = path.join(root, 'app');
  const bin = path.join(root, 'bin'), runner = path.join(root, 'runner');
  for (const dir of [path.join(app, 'scripts/content'), bin, runner, path.join(root, 'home')]) fs.mkdirSync(dir, { recursive: true });
  const scriptLog = path.join(root, 'scripts.log');
  for (const script of ['hydrate-source', 'check-completeness']) {
    fs.writeFileSync(path.join(app, `scripts/content/${script}.mjs`),
      `import fs from 'node:fs';\nfs.appendFileSync(${JSON.stringify(scriptLog)}, [${JSON.stringify(script)}, ...process.argv.slice(2)].join(' ') + '\\n');\n`);
  }
  // The release gate asks production over the network (test-release-gates.ts); here it notes
  // what it was asked about, and holds when a case says so, as the real one does: exit 1 and
  // the reason in --held-file.
  fs.writeFileSync(path.join(app, 'scripts/content/deploy-gate.mjs'), [
    "import fs from 'node:fs';",
    `fs.appendFileSync(${JSON.stringify(scriptLog)}, ['deploy-gate', ...process.argv.slice(2)].join(' ') + '\\n');`,
    "if (process.env.FAKE_GATE === 'hold') { fs.writeFileSync(process.argv[process.argv.indexOf('--held-file') + 1], 'production runs other code\\n'); process.exit(1); }",
    '',
  ].join('\n'));
  fs.copyFileSync('scripts/content/data-remote.sh', path.join(app, 'scripts/content/data-remote.sh'));
  fs.writeFileSync(path.join(bin, 'curl'), '#!/bin/sh\necho \'{"ssh_keys":[]}\'\n', { mode: 0o755 });
  const realGit = spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim();
  const deepenLog = path.join(root, 'deepen.log');
  fs.writeFileSync(path.join(bin, 'git'), ['#!/bin/sh', `case " $* " in *" --deepen="*) echo "$*" >> '${deepenLog}' ;; esac`,
    `exec '${realGit}' "$@"`, ''].join('\n'), { mode: 0o755 });
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
    commit(message: string, release: string, value = release, readme?: string, content?: string) {
      fs.mkdirSync(path.join(seed, 'source'), { recursive: true });
      fs.mkdirSync(path.join(seed, 'release'), { recursive: true });
      fs.writeFileSync(path.join(seed, 'source/a.json'), JSON.stringify({ value }));
      fs.writeFileSync(path.join(seed, 'release/manifest.json'), JSON.stringify({ release, ...(content ? { content } : {}) }));
      if (readme) fs.writeFileSync(path.join(seed, 'README.md'), readme);
      git('-C', seed, 'add', '-A');
      git('-C', seed, 'commit', '-q', '-m', message);
    },
    push: (ref: string) => git('-C', seed, 'push', '-q', 'origin', `HEAD:${ref}`),
    checkout: (...args: string[]) => git('-C', seed, 'checkout', '-q', ...args),
    load(ref: string) {
      const result = repo.tryLoad(ref);
      assert.equal(result.status, 0, result.output);
    },
    tryLoad: (ref: string) => step(loadStep, { DATA_REF: ref }),
    loadWith: (ref: string, extra: Record<string, string>) => step(loadStep, { DATA_REF: ref, ...extra }),
    // What export.mjs leaves for the publish step.
    prepare(release: string, value = release, content?: string) {
      const out = path.join(runner, 'prepared-content');
      fs.rmSync(out, { recursive: true, force: true });
      fs.mkdirSync(path.join(out, 'source'), { recursive: true });
      fs.mkdirSync(path.join(out, 'release'), { recursive: true });
      fs.writeFileSync(path.join(out, 'source/a.json'), JSON.stringify({ value }));
      fs.writeFileSync(path.join(out, 'release/manifest.json'), JSON.stringify({ release, ...(content ? { content } : {}) }));
    },
    publish: (extra: Record<string, string> = {}) => step(publishStep, { CONTENT_DATA_DEPLOY_KEY: 'test-key', GITHUB_OUTPUT: path.join(runner, 'github-output'), ...extra }),
    // The dev channel's step, with what the channel step puts in every later step's environment.
    publishDev: (extra: Record<string, string> = {}) => step(devPublishStep, { CONTENT_DATA_DEPLOY_KEY: 'test-key', GITHUB_OUTPUT: path.join(runner, 'github-output'),
      ARKPEDIA_RELEASE_BRANCH: 'dev', ARKPEDIA_DATA_BRANCH: 'dev', ARKPEDIA_CONTENT_POINTER: 'dev-live', GITHUB_SHA: 'f'.repeat(40), ...extra }),
    // A prepared release as export.mjs writes it, with the fields a site's pointer checks need.
    prepareRelease(manifest: { release: string; content: string }, value = manifest.release) {
      repo.prepare(manifest.release, value);
      fs.writeFileSync(path.join(runner, 'prepared-content/release/manifest.json'), JSON.stringify({ schema: CONTENT_SCHEMA, ...manifest }));
    },
    // A pointer branch (live/current.json) as arkpedia-data's Content release writes it.
    pointTo(branch: string, revision: string) {
      git('-C', seed, 'checkout', '-q', '--orphan', branch);
      git('-C', seed, 'rm', '-q', '-rf', '--cached', '.');
      fs.writeFileSync(path.join(root, 'current.json'), JSON.stringify({ schema: CONTENT_SCHEMA, release: 'e'.repeat(64), revision, manifestSha256: 'e'.repeat(64) }));
      const tree = git('-C', seed, 'hash-object', '-w', path.join(root, 'current.json'));
      git('-C', seed, 'update-index', '--add', '--cacheinfo', `100644,${tree},current.json`);
      git('-C', seed, 'commit', '-q', '-m', `point ${branch}`);
      git('-C', seed, 'push', '-q', '--force', 'origin', `HEAD:${branch}`);
      git('-C', seed, 'checkout', '-q', '-f', 'main');
    },
    // A file exactly as the branch holds it, untrimmed: a digest is taken of these bytes.
    bytes: (ref: string, file: string) => spawnSync('git', ['-C', origin, 'show', `${ref}:${file}`], { env }).stdout as Buffer,
    exists: (ref: string) => spawnSync('git', ['-C', origin, 'rev-parse', '--verify', '--quiet', ref], { env }).status === 0,
    // The next run: a job of its own, so a RUNNER_TEMP of its own, and the data loaded afresh.
    nextRun(ref = 'main') {
      fs.rmSync(runner, { recursive: true, force: true });
      fs.mkdirSync(runner);
      repo.load(ref);
    },
    outputs: () => fs.existsSync(path.join(runner, 'github-output')) ? fs.readFileSync(path.join(runner, 'github-output'), 'utf8') : '',
    heartbeat: (extra: Record<string, string> = {}) => step(heartbeatStep, { CONTENT_DATA_DEPLOY_KEY: 'test-key', GITHUB_EVENT_NAME: 'schedule', RUN_URL: 'https://example.invalid/run/1', PUSHED: '', ...extra }),
    log: (ref: string) => git('-C', origin, 'log', '--format=%s', ref).split('\n'),
    head: (ref: string) => git('-C', origin, 'rev-parse', ref),
    file: (ref: string, file: string) => JSON.parse(git('-C', origin, 'show', `${ref}:${file}`)),
    root,
    main: () => git('-C', origin, 'log', '--format=%s', 'main').split('\n'),
    deepened: () => fs.existsSync(deepenLog) ? fs.readFileSync(deepenLog, 'utf8').trim().split('\n') : [],
    scripts: () => fs.existsSync(scriptLog) ? fs.readFileSync(scriptLog, 'utf8').trim().split('\n') : [],
    mainFile: (file: string) => JSON.parse(git('-C', origin, 'show', `main:${file}`)),
    mainText: (file: string) => git('-C', origin, 'show', `main:${file}`),
  };
  git('init', '-q', '--bare', origin);
  git('clone', '-q', `file://${origin}`, seed);
  fs.mkdirSync(path.join(seed, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(seed, 'scripts/validate-release.mjs'), [
    "import fs from 'node:fs';",
    "JSON.parse(fs.readFileSync('release/manifest.json', 'utf8'));",
    `fs.appendFileSync(${JSON.stringify(scriptLog)}, 'data validate-release\\n');`,
    '',
  ].join('\n'));
  for (const n of [0, 1, 2]) repo.commit(`main ${n}`, `r${n}`);
  repo.push('main');
  return repo;
}
const regenerated = 'Refresh game content and prepared page data';

test('main and dev publication commit the new casing of a replaced operator page', () => {
  for (const channel of ['main', 'dev']) withDataRepository(repo => {
    const oldPath = 'release/pages/operators/Gallus².json';
    const newPath = 'release/pages/operators/GALLUS².json';
    fs.mkdirSync(path.dirname(path.join(repo.root, 'seed', oldPath)), { recursive: true });
    fs.writeFileSync(path.join(repo.root, 'seed', oldPath), '{"old":true}');
    repo.commit('old operator route', 'r2');
    repo.push('main');
    repo.load('main');
    // Exercise the runner's index behavior even on a case-sensitive CI filesystem.
    const configured = spawnSync('git', ['config', 'core.ignorecase', 'true'], {
      cwd: path.join(repo.root, 'runner/arkpedia-data'), encoding: 'utf8',
    });
    assert.equal(configured.status, 0, configured.stderr);
    repo.prepareRelease({ release: '3'.repeat(64), content: 'c'.repeat(64) });
    const prepared = path.join(repo.root, 'runner/prepared-content', newPath);
    fs.mkdirSync(path.dirname(prepared), { recursive: true });
    fs.writeFileSync(prepared, '{"canonical":"GALLUS²"}');
    const result = channel === 'main' ? repo.publish() : repo.publishDev();
    assert.equal(result.status, 0, result.output);
    assert.deepEqual(JSON.parse(repo.bytes(channel, newPath).toString()), { canonical: 'GALLUS²' });
    assert.equal(repo.bytes(channel, oldPath).length, 0, 'the old path must not remain in the Git tree');
  });
});

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

test('loading the data records what each collection held before any refresh step', () => {
  // check-completeness fails the release if a collection shrinks by more than 2% from these
  // counts, so they must be taken from the loaded data itself, right after it is written.
  withDataRepository(repo => {
    repo.load('main');
    assert.deepEqual(repo.scripts().map(line => line.replace(/ \S+arkpedia-data$/, ' <data>')),
      ['hydrate-source <data>', 'check-completeness --record-baseline']);
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
  // Main moved while a correction branch compiled.
  withDataRepository(repo => {
    repo.checkout('-b', 'fix');
    repo.commit('fix', 'r2', 'fixed');
    repo.push('fix');
    repo.load('fix');
    repo.prepare('r4', 'fixed');
    repo.checkout('main');
    repo.commit('concurrent', 'r9');
    repo.push('main');
    const result = repo.publish();
    assert.equal(result.status, 1);
    assert.match(result.output, /is not contained in the compiled data/);
    assert.deepEqual(repo.main(), ['concurrent', 'main 2', 'main 1', 'main 0']);
  });
});

test('a correction branch cut before main last moved fails when it is loaded, before the compile', () => {
  withDataRepository(repo => {
    repo.checkout('-b', 'fix', 'HEAD~1');
    repo.commit('fix', 'r1', 'fixed');
    repo.push('fix');
    const result = repo.tryLoad('fix');
    assert.equal(result.status, 1);
    assert.match(result.output, /::error::fix \([0-9a-f]{40}\) does not contain data main \([0-9a-f]{40}\)\. Merge main into the correction branch/);
    assert.deepEqual(repo.main(), ['main 2', 'main 1', 'main 0']);
  });
});

test('with merge_main, a branch main moved past is merged with main when loaded and publishes as a fast-forward', () => {
  withDataRepository(repo => {
    repo.checkout('-b', 'fix', 'HEAD~1');
    repo.commit('fix', 'r1', 'r1', 'an editorial note');
    repo.push('fix');
    const loaded = repo.loadWith('fix', { MERGE_MAIN: 'true' });
    assert.equal(loaded.status, 0, loaded.output);
    assert.match(loaded.output, /Merged data main \([0-9a-f]{40}\) into fix/);
    repo.prepare('r4', 'r2');
    const result = repo.publish();
    assert.equal(result.status, 0, result.output);
    const published = repo.main();
    for (const subject of [regenerated, 'Merge data main into fix', 'fix', 'main 2']) assert.ok(published.includes(subject), `${subject} in ${published}`);
    assert.equal(repo.mainText('README.md'), 'an editorial note');
  });
  // A conflict still fails, before the compile, and leaves main alone.
  withDataRepository(repo => {
    repo.checkout('-b', 'fix', 'HEAD~1');
    repo.commit('fix', 'r1', 'clashes with main 2');
    repo.push('fix');
    const result = repo.loadWith('fix', { MERGE_MAIN: 'true' });
    assert.equal(result.status, 1);
    assert.match(result.output, /::error::fix \([0-9a-f]{40}\) conflicts with data main/);
    assert.deepEqual(repo.main(), ['main 2', 'main 1', 'main 0']);
  });
});

// Every step the runner gets, with the lines of its own block.
function steps() {
  const lines = fs.readFileSync('.github/workflows/prepare-content.yml', 'utf8').split('\n');
  const starts = lines.flatMap((line, i) => /^ {6}- /.test(line) ? [i] : []);
  return starts.map((start, i) => {
    const block = lines.slice(start, starts[i + 1] ?? lines.length);
    return { name: block[0].match(/- name: (.*)$/)?.[1] ?? block[0].trim(), block };
  });
}

test('the asset-sync and quarantine reports can neither hold back nor fail the publication', () => {
  const all = steps();
  const publish = all.findIndex(step => step.name === 'Publish the validated public release');
  for (const name of ['Report failing asset syncs', 'Report quarantined content']) {
    const report = all.findIndex(step => step.name === name);
    assert.ok(publish >= 0 && report > publish, `${name} runs after the publish step`);
    const settings = all[report].block.map(line => line.trim());
    assert.ok(settings.includes('continue-on-error: true'), name);
    const timeout = settings.find(line => line.startsWith('timeout-minutes:'));
    assert.ok(timeout && Number(timeout.split(':')[1]) <= 5, `${name} has a short timeout of its own`);
  }
});

/* A release holding only the given source files, validated. It has no source hashes, so
   files that pass their own checks stop at 'Source records changed without regenerating
   the release'; the output says which check stopped it. */
function validateSources(files: Record<string, unknown>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arkpedia-release-'));
  try {
    const assets = Object.fromEntries(['image-assets', 'skin-assets', 'color-palette', 'voice-english', 'voice-japanese', 'voice-korean', 'voice-mandarin', 'voice-regional']
      .map(repo => [`arkpedia-${repo}`, 'a'.repeat(40)]));
    fs.mkdirSync(path.join(root, 'release'));
    fs.writeFileSync(path.join(root, 'release/manifest.json'), JSON.stringify({ schema: 2, release: 'b'.repeat(64), generator: 'c'.repeat(40), codeFingerprint: 'f'.repeat(64), assets, pages: {}, files: {} }));
    for (const [file, value] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, 'source', file)), { recursive: true });
      fs.writeFileSync(path.join(root, 'source', file), JSON.stringify(value));
    }
    const run = spawnSync(process.execPath, ['scripts/content/validate-release.mjs', root], { encoding: 'utf8' });
    assert.notEqual(run.status, 0);
    return run.stderr;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
test('the release validator holds the published quarantine and upstream lock to their formats', () => {
  const passes = /Source records changed without regenerating the release/;
  const entry = { key: 'banner:SINGLE_77_0_1', stage: 'catalogue', reason: 'unknown operator', action: 'omitted-new', firstSeen: '2026-09-20', lastSeen: '2026-09-23' };
  const quarantine = (...entries: object[]) => validateSources({ 'data/quarantine.json': { version: 1, entries } });
  assert.match(quarantine(), passes);
  assert.match(quarantine({ ...entry, stage: 'catalogue' }, { ...entry, stage: 'completeness', sourceRef: 'x' }), passes);
  assert.match(quarantine({ ...entry, action: 'dropped' }), /entries\[0\] has an unknown action: dropped/);
  // Entries no longer carry lastSeen; one written before 2026-09 still may, and must be sane.
  const { lastSeen: _, ...current } = entry;
  assert.match(quarantine(current), passes);
  assert.match(quarantine({ ...current, firstSeen: '23 Sept' }), /entries\[0\] needs firstSeen as YYYY-MM-DD/);
  assert.match(quarantine({ ...entry, firstSeen: '2026-09-24' }), /entries\[0\] needs firstSeen <= lastSeen/);
  assert.match(quarantine({ ...entry, reason: '' }), /entries\[0\] needs a key, stage and reason/);
  assert.match(quarantine(entry, entry), /entries\[1\] repeats catalogue banner:SINGLE_77_0_1/);
  assert.match(quarantine({ ...entry, key: 'z' }, { ...entry, key: 'a' }), /must be sorted by stage, then key/);
  assert.match(validateSources({ 'data/quarantine.json': [] }), /must be \{"version":1,"entries":\[\.\.\.\]\}/);
  const lock = (repositories: object) => validateSources({ 'data/upstream.lock.json': { version: 1, repositories } });
  assert.match(lock({ 'Kengxxiao/ArknightsGameData': { branch: 'master', commit: 'd'.repeat(40), source: 'resolved' }, 'a/b': { branch: 'main', commit: null } }), passes);
  assert.match(lock({ 'Kengxxiao/ArknightsGameData': { branch: 'master', commit: 'master' } }), /invalid pin for Kengxxiao\/ArknightsGameData/);
  assert.match(lock({ 'ArknightsAssets/ArknightsAssets2:cn': { branch: 'cn', commit: '6'.repeat(40) } }), passes);
  assert.match(lock({ 'ArknightsAssets/ArknightsAssets2:cn': { branch: 'en', commit: '6'.repeat(40) } }), /invalid pin/);
  // Where the run's CN tables came from (scripts/content/cn-tables.mjs) names a source at a commit.
  const tables = (cnTables: object) => validateSources({ 'data/upstream.lock.json': { version: 1, repositories: {}, cnTables } });
  assert.match(tables({ repository: 'yuanyan3060/ArknightsGameResource', commit: 'e'.repeat(40), folder: 'gamedata', serialization: 'numeric' }), passes);
  assert.match(tables({ repository: 'yuanyan3060/ArknightsGameResource', commit: 'e'.repeat(40), folder: 'zh_CN/gamedata', serialization: 'numeric' }), /cnTables must name a CN table source at a commit/);
  assert.match(tables({ repository: 'Kengxxiao/ArknightsGameData', commit: 'master', folder: 'zh_CN/gamedata', serialization: 'named' }), /cnTables must name a CN table source at a commit/);
  // The per-run stage report never goes out: its timings would make every day a release.
  assert.match(validateSources({ 'data/stage-report.json': { version: 1, stages: [] } }), /data\/stage-report\.json must not be published/);
  const ignored = spawnSync('git', ['check-ignore', '-q', 'data/stage-report.json']);
  assert.equal(ignored.status, 0, 'export.mjs leaves ignored files out, so .gitignore keeps the stage report out of every release');
});

// What export.mjs hashes into both ids, in path order, as it and the validator list them.
const hashes = (files: Record<string, string>) => Object.fromEntries(Object.entries(files).sort(([a], [b]) => (a < b ? -1 : 1))
  .map(([file, text]) => [file, createHash('sha256').update(text).digest('hex')]));
// A release's pages and public files as the manifest lists them: { path, bytes, sha256 }.
const outputs = (texts: Record<string, string>, pathOf: (name: string) => string) => Object.fromEntries(Object.entries(texts)
  .map(([name, text]) => [name, { path: pathOf(name), bytes: Buffer.byteLength(text), sha256: createHash('sha256').update(text).digest('hex') }]));
const pagesOf = (texts: Record<string, string>) => outputs(texts, route => (route === '/' ? 'pages/index.json' : `pages${route}.json`));
const filesOf = (texts: Record<string, string>) => outputs(texts, name => `public/${name}`);
const PAGES = { '/': '{"props":{"banners":[]}}', '/gacha-simulator': '{"props":{"banners":[1]}}' };
const FILES = { 'stages-index.json': '[]' };
type Release = { generator?: string; sources: Record<string, string>; pages?: Record<string, string>; files?: Record<string, string> };
const ids = ({ generator = 'c'.repeat(40), sources, pages = PAGES, files = FILES }: Release) => ({
  release: releaseInput({ generator, sourceHashes: hashes(sources) }),
  content: contentInput({ sourceHashes: hashes(sources), pages: pagesOf(pages), files: filesOf(files) }),
});
const records = { 'data/headhunting_banners.json': '[]', 'data/skins.json': '[]', 'data/assets/revisions.json': '{"arkpedia-image-assets":"a"}' };

// A mirror commits most days whether or not any record changes, and the lock records it; the
// catalogue's report names that day's links and commits. Neither may make a published release.
test('a day that changes only the upstream lock or the catalogue\'s run report publishes nothing', () => {
  const lock = (commit: string) => JSON.stringify({ version: 1, repositories: { 'Kengxxiao/ArknightsGameData': { branch: 'master', commit, source: 'resolved' } } });
  const monday = { ...records, 'data/upstream.lock.json': lock('a'.repeat(40)), 'data/catalogue-sync.json': '{"poolIdsLinked":{"cn":1,"global":4}}' };
  const tuesday = { ...records, 'data/upstream.lock.json': lock('b'.repeat(40)), 'data/catalogue-sync.json': '{"poolIdsLinked":{"cn":0,"global":0}}' };
  const edited = { ...tuesday, 'data/skins.json': '[{}]' };
  // The release id still covers every published file: arkpedia-data's validator recomputes it so.
  assert.notEqual(ids({ sources: tuesday }).release, ids({ sources: monday }).release);
  assert.equal(ids({ sources: tuesday }).content, ids({ sources: monday }).content);
  assert.notEqual(ids({ sources: edited }).content, ids({ sources: monday }).content, 'a record that changes is new content');
  // The publish step compares content ids, and falls back to the release id of an older manifest.
  withDataRepository(repo => {
    repo.commit('main 3', ids({ sources: monday }).release, 'm', undefined, ids({ sources: monday }).content);
    repo.push('main');
    repo.load('main');
    repo.prepare(ids({ sources: tuesday }).release, 'm', ids({ sources: tuesday }).content);
    const unchanged = repo.publish();
    assert.equal(unchanged.status, 0, unchanged.output);
    assert.match(unchanged.output, /Release inputs are unchanged/);
    assert.deepEqual(repo.main(), ['main 3', 'main 2', 'main 1', 'main 0']);
    repo.prepare(ids({ sources: edited }).release, 'e', ids({ sources: edited }).content);
    assert.equal(repo.publish().status, 0);
    assert.deepEqual(repo.main(), [regenerated, 'main 3', 'main 2', 'main 1', 'main 0']);
    assert.deepEqual(repo.mainFile('release/manifest.json'), ids({ sources: edited }));
  });
  // The validator holds the manifest to both, and the lock to its format.
  assert.match(validate(tuesday), /Missing required page: \//);
  assert.match(validate(tuesday, { content: ids({ sources: monday }).release }), /Release content fingerprint mismatch/);
  assert.match(validate({ ...tuesday, 'data/upstream.lock.json': lock('master') }), /invalid pin for Kengxxiao\/ArknightsGameData/, 'the lock is still held to its format');
});

// arkpedia-data 3c128fd (2026-09-16): a run after an app merge that changed no source record, no
// page and no public file still published, because the content id hashed the app commit.
test('two runs with the same inputs give the same content id, whatever app commit compiled them', () => {
  const run = (generator: string) => ids({ generator, sources: records });
  // The same run twice is the same release.
  assert.deepEqual(run('c'.repeat(40)), run('c'.repeat(40)));
  // After a merge that changes no output (docs, tests, a refactor), only the release id moves:
  // arkpedia-data's validator recomputes it with the generator, and export.mjs re-exports on it.
  assert.notEqual(run('d'.repeat(40)).release, run('c'.repeat(40)).release);
  assert.equal(run('d'.repeat(40)).content, run('c'.repeat(40)).content);
  // The order a caller lists things in is no input.
  const reversed = Object.fromEntries(Object.entries(records).reverse());
  assert.equal(contentInput({ sourceHashes: hashes(reversed), pages: pagesOf(Object.fromEntries(Object.entries(PAGES).reverse())), files: filesOf(FILES) }),
    run('c'.repeat(40)).content);
  // What the code produces is content: a merge that changes a page, or where the site finds
  // it (lib/content/server.ts refuses a path its pageFilePath would not give), publishes.
  const base = run('c'.repeat(40)).content;
  assert.notEqual(ids({ generator: 'd'.repeat(40), sources: records, pages: { ...PAGES, '/gacha-simulator': '{"props":{"banners":[2]}}' } }).content, base);
  assert.notEqual(ids({ sources: records, files: { 'stages-index.json': '[1]' } }).content, base);
  assert.notEqual(contentInput({ sourceHashes: hashes(records), pages: { ...pagesOf(PAGES), '/gacha-simulator': { ...pagesOf(PAGES)['/gacha-simulator'], path: 'pages/gacha/index.json' } }, files: filesOf(FILES) }), base);
  // A reader gets these, or the next run reads them back from data main, so each is content
  // though no page file changes (release-input.mjs): the asset commit every art URL is pinned
  // to; when a held record was first seen, which the three-day overdue mark counts from; a wiki
  // page's last good rows and the hold on it.
  for (const [file, text] of [
    ['data/assets/revisions.json', '{"arkpedia-image-assets":"b"}'],
    ['data/quarantine.json', '{"version":1,"entries":[{"key":"banner:LINKAGE_65_0_1","stage":"catalogue","reason":"r","action":"kept-previous","firstSeen":"2026-09-25"}]}'],
    ['data/wiki-cache/Headhunting-Banners-2026.json', '{"rows":[{"operators":"Uika Misumi"}]}'],
  ]) assert.notEqual(ids({ sources: { ...records, [file]: text } }).content, base, `${file} is content`);
  // Every argument is required: a caller that forgot the outputs must not hash nothing.
  assert.throws(() => contentInput({ sourceHashes: hashes(records) }), /needs the release's pages/);
  assert.throws(() => contentInput({ sourceHashes: hashes(records), pages: pagesOf(PAGES) }), /needs the release's files/);
  // The publish step: a release that differs only in its generator pushes nothing.
  withDataRepository(repo => {
    repo.commit('main 3', run('c'.repeat(40)).release, 'm', undefined, run('c'.repeat(40)).content);
    repo.push('main');
    repo.load('main');
    repo.prepare(run('d'.repeat(40)).release, 'm', run('d'.repeat(40)).content);
    const unchanged = repo.publish();
    assert.equal(unchanged.status, 0, unchanged.output);
    assert.match(unchanged.output, /Release inputs are unchanged/);
    assert.deepEqual(repo.main(), ['main 3', 'main 2', 'main 1', 'main 0']);
    assert.equal(repo.outputs(), '', 'no pushed commit, so no live check and no page-cache clear');
  });
  // The validator recomputes the id from the pages and files the manifest lists, whose bytes it
  // has checked: a manifest carrying the old, generator-hashed id is refused.
  const legacy = createHash('sha256').update(JSON.stringify({ schema: 2, generator: 'c'.repeat(40), sourceHashes: hashes(records) })).digest('hex');
  assert.match(validate(records, { content: legacy }), /Release content fingerprint mismatch/);
  assert.match(validate(records), /Missing required page: \//, 'past every fingerprint check');
});

/** validate-release.mjs's complaints about a release of these sources, with no pages or files
 *  on disk (so it stops at the first page it needs). */
function validate(files: Record<string, string>, manifest: object = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arkpedia-release-'));
  try {
    const assets = Object.fromEntries(['image-assets', 'skin-assets', 'color-palette', 'voice-english', 'voice-japanese', 'voice-korean', 'voice-mandarin', 'voice-regional']
      .map(repo => [`arkpedia-${repo}`, 'a'.repeat(40)]));
    const generator = 'c'.repeat(40);
    const own = { release: releaseInput({ generator, sourceHashes: hashes(files) }), content: contentInput({ sourceHashes: hashes(files), pages: {}, files: {} }) };
    fs.mkdirSync(path.join(root, 'release'));
    fs.writeFileSync(path.join(root, 'release/manifest.json'), JSON.stringify({ schema: 2, ...own, generator, codeFingerprint: 'f'.repeat(64), assets, pages: {}, files: {}, sourceHashes: hashes(files), ...manifest }));
    for (const [file, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(root, 'source', file)), { recursive: true });
      fs.writeFileSync(path.join(root, 'source', file), text);
    }
    return spawnSync(process.execPath, ['scripts/content/validate-release.mjs', root], { encoding: 'utf8' }).stderr;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('a correction branch that changes no release input goes to main as it is, with no new release', () => {
  withDataRepository(repo => {
    repo.checkout('-b', 'fix');
    repo.commit('readme only', 'r2', 'r2', 'How to correct a record.\n');
    repo.push('fix');
    repo.load('fix');
    repo.prepare('r2');
    const result = repo.publish();
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /Data main already serves this release: the branch's commits go to data main as they are/);
    assert.deepEqual(repo.main(), ['readme only', 'main 2', 'main 1', 'main 0'], 'a fast-forward, no release commit');
    assert.equal(repo.mainText('README.md'), 'How to correct a record.');
    assert.equal(repo.outputs(), '', 'the release live serves is unchanged: no live check, no page-cache clear');
  });
});

// 2026-10-22: an editorial edit that the guide-videos stage had just made on main too (the same
// video in the same record) merged cleanly and compiled to the release main served. The run
// published nothing, so the editorial branch never reached main, and the watcher compiled it
// again every six minutes. Its commits now reach main, and the branch reads as published.
test('with merge_main, an editorial edit main already made itself still reaches main, so it is not compiled again', () => {
  withDataRepository(repo => {
    repo.checkout('-b', 'editorial');
    repo.commit('the same guide by hand', 'r2', 'with the guide');
    repo.push('editorial');
    repo.checkout('main');
    repo.commit('main 3', 'r3', 'with the guide');
    repo.push('main');
    const loaded = repo.loadWith('editorial', { MERGE_MAIN: 'true' });
    assert.equal(loaded.status, 0, loaded.output);
    repo.prepare('r3', 'with the guide');
    const result = repo.publish();
    assert.equal(result.status, 0, result.output);
    const published = repo.main();
    for (const subject of ['Merge data main into editorial', 'the same guide by hand', 'main 3']) assert.ok(published.includes(subject), `${subject} in ${published}`);
    assert.ok(!published.includes(regenerated), 'no release commit');
    const contained = spawnSync('git', ['-C', path.join(repo.root, 'origin.git'), 'merge-base', '--is-ancestor', repo.head('editorial'), repo.head('main')]);
    assert.equal(contained.status, 0, 'the editorial branch is in main: the watcher\'s compare reads it as behind');
    assert.deepEqual(repo.mainFile('release/manifest.json'), { release: 'r3' });
    assert.equal(repo.outputs(), '');
  });
});

test('the publish step fetches more history only when the loaded history does not contain main', () => {
  withDataRepository(repo => {
    repo.checkout('-b', 'fix');
    for (const n of [1, 2]) repo.commit(`fix ${n}`, 'r2', `fixed ${n}`);
    repo.push('fix');
    repo.load('fix');
    assert.equal(repo.deepened().length, 1, 'the load step deepens the branch until it reaches main');
    // Main moves meanwhile, but along the branch, to a commit the load step already has.
    repo.checkout('fix~1');
    repo.push('main');
    repo.prepare('r4', 'fixed 2');
    const result = repo.publish();
    assert.equal(result.status, 0, result.output);
    assert.deepEqual(repo.main(), [regenerated, 'fix 2', 'fix 1', 'main 2', 'main 1', 'main 0']);
    assert.equal(repo.deepened().length, 1, 'the publish step fetched no more history');
  });
  // Main moves outside the branch: the publish step looks further back, then refuses.
  withDataRepository(repo => {
    repo.checkout('-b', 'fix');
    repo.commit('fix', 'r2', 'fixed');
    repo.push('fix');
    repo.load('fix');
    repo.prepare('r4', 'fixed');
    repo.checkout('main');
    repo.commit('concurrent', 'r9');
    repo.push('main');
    assert.equal(repo.publish().status, 1);
    assert.equal(repo.deepened().length, 2);
    assert.deepEqual(repo.main(), ['concurrent', 'main 2', 'main 1', 'main 0']);
  });
});

// The release gate (scripts/content/deploy-gate.mjs): production must run the code that
// compiled a release before it goes out. On 2026-09-25 a release from main would have reached
// a production two commits behind, which dereferenced props main no longer exported.
test('a release production cannot be shown to read is not pushed', () => {
  withDataRepository(repo => {
    repo.load('main');
    repo.prepare('r3');
    const held = repo.publish({ FAKE_GATE: 'hold' });
    assert.notEqual(held.status, 0, 'the step fails, so the run is reported and nothing is cached as prepared');
    assert.deepEqual(repo.main(), ['main 2', 'main 1', 'main 0']);
    assert.equal(repo.outputs(), '', 'no pushed commit for the live check');
    const [gate] = repo.scripts().filter(line => line.startsWith('deploy-gate'));
    assert.match(gate, /^deploy-gate --manifest \S+\/prepared-content\/release\/manifest\.json --held-file \S+\/release-held\.md$/, 'the gate is asked about the compiled release');
    assert.equal(fs.readFileSync(path.join(repo.root, 'runner/release-held.md'), 'utf8'), 'production runs other code\n');
    // Production catches up: the same release goes out, and names the commit it pushed.
    const published = repo.publish();
    assert.equal(published.status, 0, published.output);
    assert.deepEqual(repo.main(), ['Refresh game content and prepared page data', 'main 2', 'main 1', 'main 0']);
    assert.equal(repo.outputs(), `pushed=${repo.head('main')}\n`);
  });
  // Nothing to publish asks production nothing and names no commit: there is nothing to hold.
  withDataRepository(repo => {
    repo.load('main');
    repo.prepare('r2');
    const unchanged = repo.publish({ FAKE_GATE: 'hold' });
    assert.equal(unchanged.status, 0, unchanged.output);
    assert.match(unchanged.output, /Release inputs are unchanged/);
    assert.deepEqual(repo.scripts().filter(line => line.startsWith('deploy-gate')), []);
    assert.equal(repo.outputs(), '');
  });
});

test('the gate is asked before anything runs, and again in the publish step before the push', () => {
  const all = steps();
  const index = (name: string) => all.findIndex(step => step.name === name);
  const early = index('Hold the release while production runs other code');
  assert.ok(early >= 0 && early < index('Load public source records') && early < index('Check upstream revisions'), 'before the probe, the load and the compile');
  const earlyBlock = all[early].block.map(line => line.trim());
  assert.ok(!earlyBlock.some(line => line.startsWith('if:')), 'for every event: schedule, dispatch and a data_ref correction alike');
  assert.ok(earlyBlock.includes('run: node scripts/content/deploy-gate.mjs --ref HEAD --held-file "$RUNNER_TEMP/release-held.md"'));
  const lines = publishStep.split('\n');
  const at = (pattern: RegExp) => lines.findIndex(line => pattern.test(line));
  const gate = at(/^node scripts\/content\/deploy-gate\.mjs --manifest /);
  assert.ok(gate > at(/Release inputs are unchanged/), 'after the step knows there is something to publish');
  assert.ok(gate < at(/checkout -B main/) && gate < at(/push origin HEAD:main/), 'before the commit and the push');
  assert.ok(at(/pushed=/) > at(/push origin HEAD:main/), 'the pushed commit is named only once it is pushed');
});

// arkpedia-data's watchdog (release-heartbeat.yml there) alarms when neither a release nor a
// heartbeat is newer than 26 hours, so a quiet day that published nothing is not an outage.
test('every successful run leaves one heartbeat commit on a branch of its own', () => {
  withDataRepository(repo => {
    const first = repo.heartbeat();
    assert.equal(first.status, 0, first.output);
    assert.deepEqual(repo.log('heartbeat'), ['Prepare content release succeeded (schedule)']);
    const beat = repo.file('heartbeat', 'heartbeat.json');
    assert.deepEqual({ ...beat, at: 'x' }, { version: 1, at: 'x', event: 'schedule', run: 'https://example.invalid/run/1', published: null });
    assert.ok(Math.abs(Date.parse(beat.at) - Date.now()) < 60_000);
    const second = repo.heartbeat({ GITHUB_EVENT_NAME: 'workflow_dispatch', PUSHED: 'a'.repeat(40) });
    assert.equal(second.status, 0, second.output);
    assert.deepEqual(repo.log('heartbeat'), ['Prepare content release succeeded (workflow_dispatch)', 'Prepare content release succeeded (schedule)']);
    assert.equal(repo.file('heartbeat', 'heartbeat.json').published, 'a'.repeat(40));
    // Main, which the data repository's Content release publishes from, is untouched.
    assert.deepEqual(repo.main(), ['main 2', 'main 1', 'main 0']);
    assert.deepEqual(fs.readdirSync(path.join(repo.root, 'runner')).filter(name => /^(?:data-remote|branch)\./.test(name)), [], 'the key and the scratch clone are removed');
    assert.equal(fs.existsSync(path.join(repo.root, 'home/.ssh/known_hosts')), false, 'the runner\'s own known_hosts is left alone');
  });
  const settings = steps().find(step => step.name === 'Record the heartbeat')!.block.map(line => line.trim());
  // Main's channel only: the heartbeat is production's signal (scripts/content/channel.mjs).
  assert.ok(settings.includes("if: success() && github.ref_name == 'main'") && settings.includes('continue-on-error: true'), 'only after a good run, and it never fails one');
});

/* The dev channel (scripts/content/channel.mjs): data main's records compiled with dev's code,
   published to data dev, rebuilt from data main every run (so force-pushed), and named by its
   own pointer, dev-live, which arkpedia-dev reads (lib/content/server.ts). Data main and live
   are never written. Nothing ran this step before it shipped; these cases run it as the runner
   does, against a local data repository. */
test("the dev channel publishes data main plus its release to data dev, and points dev-live at it", () => {
  withDataRepository(repo => {
    repo.pointTo('live', repo.head('main'));
    const main = repo.head('main'), live = repo.head('live');
    const SHA = /^[a-f0-9]{64}$/, GIT_SHA = /^[a-f0-9]{40}$/;
    // What lib/content/server.ts checks before it reads a release through a pointer.
    const served = (manifest: { release: string }) => {
      const pointer = repo.file('dev-live', 'current.json');
      assert.ok(pointer.schema === CONTENT_SCHEMA && SHA.test(pointer.release) && GIT_SHA.test(pointer.revision) && SHA.test(pointer.manifestSha256), JSON.stringify(pointer));
      assert.equal(pointer.revision, repo.head('dev'), 'dev-live names data dev\'s head');
      assert.equal(pointer.release, manifest.release);
      assert.equal(pointer.manifestSha256, createHash('sha256').update(repo.bytes(pointer.revision, 'release/manifest.json')).digest('hex'), 'the digest of the manifest at that revision');
      assert.deepEqual(repo.file(pointer.revision, 'release/manifest.json'), { schema: CONTENT_SCHEMA, ...manifest });
    };
    const untouched = () => {
      assert.equal(repo.head('main'), main, 'data main is never written');
      assert.equal(repo.head('live'), live, 'live is never written');
    };
    repo.load('main');
    const first = { release: 'a'.repeat(64), content: 'b'.repeat(64) };
    repo.prepareRelease(first);
    const published = repo.publishDev();
    assert.equal(published.status, 0, published.output);
    untouched();
    assert.deepEqual(repo.log('dev'), [`Dev channel: data main compiled with arkpedia ${'f'.repeat(40)}`, 'main 2', 'main 1', 'main 0'], 'data main plus one commit');
    assert.equal(repo.head('dev~1'), main);
    assert.deepEqual(repo.file('dev', 'source/a.json'), { value: first.release });
    served(first);
    assert.equal(repo.outputs(), `pushed=${repo.head('dev')}\n`);
    assert.ok(repo.scripts().includes('data validate-release'), 'the data repository\'s validator ran on the commit');
    const [gate] = repo.scripts().filter(line => line.startsWith('deploy-gate'));
    assert.match(gate, /^deploy-gate --manifest \S+\/prepared-content\/release\/manifest\.json --held-file \S+\/release-held\.md$/);
    // The next run's release: data dev is rebuilt from data main again (one commit on top, not
    // two), and dev-live moves to it.
    repo.nextRun();
    const second = { release: 'c'.repeat(64), content: 'd'.repeat(64) };
    repo.prepareRelease(second);
    const again = repo.publishDev();
    assert.equal(again.status, 0, again.output);
    untouched();
    assert.equal(repo.log('dev').length, 4, 'force-pushed: still data main plus one commit');
    assert.equal(repo.head('dev~1'), main);
    served(second);
    assert.equal(repo.log('dev-live').length, 2, 'the pointer moved with a commit of its own');
    assert.equal(repo.outputs(), `pushed=${repo.head('dev')}\n`);
    // A run whose release has the content dev-live serves -- the same records, compiled by a dev
    // commit that changed no output -- moves neither, as main's step skips one. Pushed anyway, the
    // pointer would name a new commit of the same release id, and a warm server would go on
    // reading the old one (lib/content/server.ts), by then on no branch.
    const head = repo.head('dev'), pointer = repo.head('dev-live');
    repo.nextRun();
    repo.prepareRelease({ release: 'e'.repeat(64), content: second.content });
    const unchanged = repo.publishDev();
    assert.equal(unchanged.status, 0, unchanged.output);
    assert.match(unchanged.output, /dev-live already serves this content/);
    assert.deepEqual([repo.head('dev'), repo.head('dev-live'), repo.outputs()], [head, pointer, ''], 'nothing pushed, so nothing to refresh');
    untouched();
    // But a dev-live that names some other commit than data dev's head (its last push failed
    // after data dev moved) is published again, so the two agree.
    repo.nextRun();
    repo.prepareRelease(second);
    repo.pointTo('dev-live', main);
    const repaired = repo.publishDev();
    assert.equal(repaired.status, 0, repaired.output);
    served(second);
    // Published again, as its output says. Not told by the SHA: data dev's new commit has the
    // parent, tree and message of the one before, so made within the same second it is that commit.
    assert.equal(repo.outputs(), `pushed=${repo.head('dev')}\n`, 'published again');
    assert.deepEqual(repo.scripts().filter(line => line === 'data validate-release').length, 3);
  });
  // A hold pushes nothing: the dev deployment does not run the code that compiled it.
  withDataRepository(repo => {
    repo.load('main');
    repo.prepareRelease({ release: 'a'.repeat(64), content: 'b'.repeat(64) });
    const held = repo.publishDev({ FAKE_GATE: 'hold' });
    assert.notEqual(held.status, 0);
    assert.equal(repo.exists('dev'), false);
    assert.equal(repo.exists('dev-live'), false);
    assert.equal(repo.outputs(), '');
  });
});
