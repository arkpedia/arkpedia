import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { decide, ENTRY_SCRIPTS, relevantFiles, scriptPaths } from '../ci/browser-relevant.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// A small repository: a page, its library, the prebuild script and what it imports two hops
// down, an importer the build never reads, and the unit tests.
const SOURCES = {
  'package.json': JSON.stringify({ scripts: { prebuild: 'node scripts/build/make-index.mjs && npm run extra', extra: 'npx tsx scripts/build/extra.ts', build: 'next build', test: 'tsx --test scripts/tests/*.ts' } }),
  'next.config.js': "module.exports = require('./scripts/build/guard.cjs');",
  'pages/index.tsx': "import { label } from '@/lib/label';\nexport default () => label;",
  'lib/label.ts': "export const label = 'x';",
  'scripts/build/make-index.mjs': "import { walk } from '../lib/walk.mjs';\nwalk();",
  'scripts/lib/walk.mjs': "import { deep } from './deep.mjs';\nexport const walk = deep;",
  'scripts/lib/deep.mjs': "export const deep = () => execFileSync('python3', ['scripts/build/helper.py']);",
  'scripts/build/helper.py': 'print(1)',
  'scripts/build/extra.ts': 'export {};',
  'scripts/build/guard.cjs': 'module.exports = {};',
  'scripts/imports/import-things.mjs': "import { walk } from '../lib/unread.mjs';",
  'scripts/lib/unread.mjs': 'export const walk = 1;',
  'scripts/sync/sync.py': 'print(2)',
  'scripts/tests/test-things.ts': "import '../imports/import-things.mjs';",
  'tests/browser/home.spec.ts': "import { cases } from '../../scripts/tests/helpers/cases';",
  'scripts/tests/helpers/cases.ts': 'export const cases = [];',
  '.github/workflows/check.yml': 'name: Check',
  '.github/workflows/other.yml': 'name: Other',
  'scripts/ci/browser-relevant.mjs': '',
  'data/operators.json': '{}',
  'infra/runners/nas/compose.yaml': '',
};
const FILES = new Set(Object.keys(SOURCES));
const RELEVANT = relevantFiles(FILES, file => SOURCES[file] ?? null);
const changed = (...files) => files.map(file => ({ status: 'M', path: file }));

test('a change only to importers, sync scripts, unit tests, other workflows and infra skips the browser regressions', () => {
  const result = decide(changed('scripts/imports/import-things.mjs', 'scripts/lib/unread.mjs', 'scripts/sync/sync.py',
    'scripts/tests/test-things.ts', '.github/workflows/other.yml', 'infra/runners/nas/compose.yaml'), RELEVANT);
  assert.equal(result.run, false);
  assert.deepEqual(result.read, []);
});

test('a page, library, data, style or browser-test change runs them', () => {
  for (const file of ['pages/index.tsx', 'lib/label.ts', 'data/operators.json', 'tests/browser/home.spec.ts', 'next.config.js', 'package.json']) {
    assert.equal(decide(changed('scripts/imports/import-things.mjs', file), RELEVANT).run, true, file);
  }
});

test('a change to check.yml or to the decision itself runs them', () => {
  assert.equal(decide(changed('.github/workflows/check.yml'), RELEVANT).run, true);
  assert.equal(decide(changed('scripts/ci/browser-relevant.mjs'), RELEVANT).run, true);
});

test('a prebuild script, one it imports two hops down, one it names by path, and what next.config and the specs import all run them', () => {
  for (const file of ['scripts/build/make-index.mjs', 'scripts/build/extra.ts', 'scripts/lib/walk.mjs', 'scripts/lib/deep.mjs',
    'scripts/build/helper.py', 'scripts/build/guard.cjs', 'scripts/tests/helpers/cases.ts']) {
    assert.ok(RELEVANT.has(file), file);
  }
  assert.ok(!RELEVANT.has('scripts/lib/unread.mjs'), 'imported only by an importer');
});

test('a deleted file counts by its folder; a rename counts by both paths; no change runs them', () => {
  assert.equal(decide([{ status: 'D', path: 'lib/gone.ts' }], RELEVANT).run, true);
  assert.equal(decide([{ status: 'D', path: 'scripts/imports/gone.mjs' }], RELEVANT).run, false);
  assert.equal(decide([{ status: 'R100', path: 'scripts/imports/import-things.mjs' }, { status: 'R100', path: 'lib/moved.mjs' }], RELEVANT).run, true);
  assert.equal(decide([], RELEVANT).run, true);
});

test('the npm script chain is followed through npm run', () => {
  assert.deepEqual([...scriptPaths(JSON.parse(SOURCES['package.json']).scripts, ['prebuild'], FILES)].sort(),
    ['scripts/build/extra.ts', 'scripts/build/make-index.mjs']);
});

test('in this repository every script the build and browser step run is read, and the importers are not', () => {
  const files = new Set(execFileSync('git', ['ls-files'], { cwd: REPO, encoding: 'utf8' }).split('\n').filter(Boolean));
  const relevant = relevantFiles(files, file => { try { return fs.readFileSync(path.join(REPO, file), 'utf8'); } catch { return null; } });
  const scripts = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')).scripts;
  const named = scriptPaths(scripts, ENTRY_SCRIPTS, files);
  assert.ok(named.size >= 9, `the prebuild chain names its scripts (${named.size})`);
  for (const file of named) assert.ok(relevant.has(file), file);
  for (const file of ['scripts/build/write-build-info.mjs', 'scripts/build/build-stage-details.ts', 'scripts/content/code-fingerprint.mjs', 'playwright.config.ts', 'next.config.js']) {
    assert.ok(relevant.has(file), file);
  }
  for (const file of ['scripts/imports/import-stage-renders.mjs', 'scripts/sync/catalogue-model.mjs', 'scripts/imports/import-reward-icons.py']) {
    assert.ok(!relevant.has(file), file);
  }
});

test('Check plans scoped execution, defaults to full, and validates actual reporter evidence', () => {
  const job = yaml.load(fs.readFileSync(path.join(REPO, '.github/workflows/check.yml'), 'utf8')).jobs.check;
  const index = name => job.steps.findIndex(step => step.name === name);
  const ask = job.steps[index('Which browser regressions this change needs')];
  const browser = job.steps[index('Desktop and mobile browser regressions')];
  assert.ok(index('Which browser regressions this change needs') < index('Desktop and mobile browser regressions'));
  assert.equal(ask.id, 'browser');
  assert.match(ask.run, /scripts\/ci\/browser-lane\.mjs plan >> "\$GITHUB_OUTPUT"/);
  assert.equal(ask.env.EVENT, '${{ github.event_name }}');
  assert.equal(browser.if, "steps.browser.outputs.lane != 'targeted' && steps.browser.outputs.lane != 'none'");
  const selected = job.steps[index('Selected browser regressions')];
  assert.equal(selected.if, "steps.browser.outputs.lane == 'targeted'");
  assert.match(selected.run, /--test-list \.cache\/browser-test-list\.txt --reporter=list,json/);
  assert.equal(browser.env.PLAYWRIGHT_JSON_OUTPUT_FILE, '.cache/browser-results.json');
  assert.equal(selected.env.PLAYWRIGHT_JSON_OUTPUT_FILE, '.cache/browser-results.json');
  assert.ok(index('Validate browser execution evidence') > index('Selected browser regressions'));
  assert.equal(job.permissions.actions, 'read');
  assert.equal(job.permissions['pull-requests'], 'read', 'merged full proofs require associated PR metadata');
  // The content runtime test launches Chromium too, so its install is never skipped.
  assert.equal(job.steps[index('Install Chromium only')].if, undefined);
});

test('a manual Check always runs the browser regressions, whatever changed', () => {
  const result = spawnSync('node', [path.join(REPO, 'scripts/ci/browser-relevant.mjs')], { cwd: REPO, encoding: 'utf8',
    env: { ...process.env, EVENT: 'workflow_dispatch', GITHUB_REPOSITORY: 'arkpedia/arkpedia' } });
  assert.equal(result.stdout.trim(), 'run=true');
  assert.match(result.stderr, /full re-check/);
  const push = spawnSync('node', [path.join(REPO, 'scripts/ci/browser-relevant.mjs')], { cwd: REPO, encoding: 'utf8',
    env: { ...process.env, EVENT: 'push', BEFORE: '0000000000000000000000000000000000000000', GITHUB_REPOSITORY: 'arkpedia/arkpedia' } });
  assert.equal(push.stdout.trim(), 'run=true', 'a new branch has no base');
});
