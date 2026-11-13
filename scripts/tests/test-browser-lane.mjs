import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { lanePlan, laneScope, completeLane, canonicalNextTypeRewrite, unexpectedBrowserInputs, hydratedBrowserFiles, expeditedChanges, expeditedBrowserPlan } from '../ci/browser-lane.mjs';
import { dependencyIndex } from '../ci/browser-plan.mjs';
import { coveragePlan } from '../ci/browser-coverage.mjs';

const metadata = { commit: 'a'.repeat(40), tree: 'b'.repeat(40), repository: 'arkpedia/arkpedia', baseRef: 'main',
  runId: 40, policySha256: 'c'.repeat(64) };
const baseline = { coverage: 'full', commit: 'd'.repeat(40), tree: 'e'.repeat(40), repository: metadata.repository,
  baseRef: 'main', runId: 10, jobId: 20, artifactId: 30, event: 'pull_request', sourceCommit: 'f'.repeat(40) };
const specs = ['nav-bar.spec.ts', 'mobile-touch-nav.spec.ts', 'navigation-continuity.spec.ts', 'story-library.spec.ts',
  'layout-census.spec.ts', 'layout-census-after.spec.ts', 'other-feature.spec.ts'];

test('validated hydrated JSON participates in the import graph without admitting untracked executable code', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-inputs-'));
  try {
    fs.mkdirSync(path.join(root, 'data'), { recursive: true });
    fs.writeFileSync(path.join(root, 'data/record.json'), '{}');
    fs.writeFileSync(path.join(root, 'data/untracked.js'), 'export default 1');
    const sources = { 'pages/feature.ts': "import record from '../data/record.json'", 'package.json': '{}', 'tsconfig.json': '{}' };
    const files = hydratedBrowserFiles(Object.keys(sources), root);
    const index = dependencyIndex(files, file => sources[file] ?? fs.readFileSync(path.join(root, file), 'utf8'));
    assert.deepEqual(index.unreadable, []);
    assert(index.consumers.get('data/record.json').has('pages/feature.ts'));
    assert(!files.has('data/untracked.js'));
    fs.rmSync(path.join(root, 'data/record.json'));
    assert(dependencyIndex(hydratedBrowserFiles(Object.keys(sources), root), file => sources[file]).unreadable.length > 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test('expedited policy changes require a same-repository PR scope, explicit approval, a full baseline and a complete graph', () => {
  const changes = [{ path: 'scripts/ci/browser-lane.mjs' }, { path: 'pages/support.tsx' }, { path: 'lib/patreon/sync.d.mts' }];
  const args = { scope: 'pull_request', approved: '1', baseline, dependencies: { consumers: new Map(), unreadable: [] } };
  assert.deepEqual(expeditedChanges(changes, args), [changes[1]]);
  for (const extra of [{ scope: null }, { scope: 'main' }, { approved: '' }, { baseline: null }, { dependencies: { consumers: new Map(), unreadable: ['missing runtime module'] } }]) assert.equal(expeditedChanges(changes, { ...args, ...extra }), null);
});
test('expedited coverage records omissions and runs the changed feature suites plus every required smoke suite', () => {
  const specs = ['nav-bar', 'mobile-touch-nav', 'navigation-continuity', 'privacy', 'new-feature', 'other-feature', 'layout-census'].map(name => `tests/browser/${name}.spec.ts`);
  const original = { lane: 'full' };
  const changes = [{ path: specs[4], status: 'M' }];
  const plan = expeditedBrowserPlan(original, { changes, specs });
  assert.equal(plan.lane, 'targeted'); assert.deepEqual(plan.selected, specs.slice(0, 5).sort());
  assert.deepEqual(plan.omitted, specs.slice(5));
  for (const input of [{ changes: [], specs }, { changes: [{ ...changes[0], status: 'D' }], specs }, { changes, specs: specs.slice(1) }]) assert.equal(expeditedBrowserPlan(original, input), original);
});

test('only complete canonical Next live type rewrites are accepted; other dirty inputs remain guarded', () => {
  const head = '/// <reference types="next" />\nimport "./.next/types/routes.d.ts";\nimport "./.next/types/root-params.d.ts";\n';
  const live = head.replaceAll('./.next/types/', './.next-live/types/');
  assert.equal(canonicalNextTypeRewrite(head, live), true);
  assert.equal(canonicalNextTypeRewrite(head, live.replaceAll('\n', '\r\n')), true);
  for (const current of [head, live.replace('.next-live/types/routes', '.next/types/routes'),
    `${live}import "./unexpected-types";\n`, live.replace('types/root-params', 'types/other'), `${live} `, null]) {
    assert.equal(canonicalNextTypeRewrite(head, current), false);
  }
  assert.equal(canonicalNextTypeRewrite(`${head}import "./.next/types/routes.d.ts";\n`, live), false);
  const paths = ['next-env.d.ts', 'data/quarantine.json', 'components/story/StoryMapView.tsx'];
  assert.deepEqual(unexpectedBrowserInputs(paths, () => head, () => live), paths.slice(1));
  assert.deepEqual(unexpectedBrowserInputs(paths, () => head, () => `${live}// unexpected\n`), paths);
});
function inventory(executed = false) {
  const suites = [];
  for (const file of specs) {
    const projects = file === 'layout-census-after.spec.ts' ? ['after-census'] : ['desktop', 'mobile'];
    const title = file === 'layout-census.spec.ts' ? '/story, dark theme' : file.replace('.spec.ts', '');
    suites.push({ title: file, column: 0, specs: [{ title, file, tests: projects.map(projectName => ({ projectName,
      ...(executed ? { expectedStatus: 'passed', status: 'expected', results: [{ duration: 10, status: 'passed', errors: [] }] } : {}) })) }] });
  }
  return { suites, errors: [] };
}
function input(changes = ['components/story/StoryMapView.tsx']) {
  return { metadata, baseline, changes: changes.map(path => ({ status: 'M', path })), specs: specs.map(file => `tests/browser/${file}`),
    relevant: new Set(), dependencies: { consumers: new Map(), unreadable: [], effects: new Set() }, inventory: inventory() };
}
function selectedReport(plan) {
  const lines = new Set(plan.coverage.selected.map(item => item.line));
  const result = inventory(true);
  for (const suite of result.suites) for (const spec of suite.specs) {
    spec.tests = spec.tests.filter(item => lines.has(`[${item.projectName}] › ${spec.file} › ${spec.title}`));
  }
  return result;
}

test('scoped lane executes core/family/census identities and records the full ancestor', () => {
  const plan = lanePlan(input());
  assert.equal(plan.coverage.lane, 'targeted');
  assert.equal(plan.comparisonBase, baseline.commit);
  assert.ok(plan.coverage.selected.some(item => item.file === 'layout-census.spec.ts'));
  assert.ok(plan.coverage.omitted.some(item => item.file === 'layout-census-after.spec.ts'));
  const completed = completeLane(plan, selectedReport(plan));
  assert.equal(completed.coverage.counts.passed, completed.coverage.selected.length);
  assert.equal(completed.coverage.outcome, 'executed-contracts-satisfied');
});

test('manual/unknown/shared policy and absent baselines retain complete execution', () => {
  for (const args of [{ ...input(), forceFull: true }, { ...input(), baseline: null }, input(['styles/core/shared.css']), input(['scripts/ci/browser-lane.mjs'])]) {
    const plan = lanePlan(args);
    assert.equal(plan.coverage.lane, 'full'); assert.equal(plan.coverage.omitted.length, 0);
    assert.equal(completeLane(plan, selectedReport(plan)).coverage.completionAudit, 'included');
  }
});

test('collection/missing/extra/failed execution cannot create a completed ledger', () => {
  const plan = lanePlan(input());
  const collection = selectedReport(plan);
  for (const suite of collection.suites) for (const spec of suite.specs) for (const item of spec.tests) delete item.results;
  assert.throws(() => completeLane(plan, collection), /execution|retry/i);
  const missing = selectedReport(plan);
  missing.suites.find(suite => suite.specs[0].tests.length).specs[0].tests.shift();
  assert.throws(() => completeLane(plan, missing), /identities/);
  assert.throws(() => completeLane(plan, inventory(true)), /identities/);
  const failed = selectedReport(plan);
  const first = failed.suites.find(suite => suite.specs[0].tests.length).specs[0].tests[0];
  first.status = 'unexpected'; first.results[0].status = 'failed';
  assert.throws(() => completeLane(plan, failed), /contract/);
});

test('no-impact tooling records zero executed tests and every explicit omission', () => {
  const plan = lanePlan(input(['scripts/imports/isolated.py']));
  assert.equal(plan.coverage.lane, 'none');
  const completed = completeLane(plan);
  assert.equal(completed.coverage.outcome, 'no-browser-impact'); assert.equal(completed.coverage.selected.length, 0);
  assert.ok(completed.coverage.omitted.length > 0);
  assert.throws(() => completeLane({ ...plan, baseline: null }), /baseline/);
});

test('completion rejects a tampered plan inventory even when selected cases passed', () => {
  const plan = lanePlan(input());
  const tampered = structuredClone(plan); tampered.coverage.inventorySha256 = '0'.repeat(64);
  assert.throws(() => completeLane(tampered, selectedReport(plan)), /digest/);
  const full = { ...plan, coverage: coveragePlan({ lane: 'full', selected: [], omitted: [], domains: [], reason: 'full' }, inventory()) };
  assert.equal(completeLane(full, inventory(true)).coverage.omitted.length, 0);
});

test('a same-repository PR and an unvouched push to main are scoped; manual runs, forks and other pushes run everything', () => {
  const repository = 'arkpedia/arkpedia';
  assert.equal(laneScope({ event: 'pull_request', headRepository: repository, repository }), 'pull_request');
  assert.equal(laneScope({ event: 'push', ref: 'refs/heads/main', repository }), 'main');
  assert.equal(laneScope({ event: 'pull_request', headRepository: 'someone/arkpedia', repository }), null);
  assert.equal(laneScope({ event: 'push', ref: 'refs/heads/ci/faster-check', repository }), null);
  assert.equal(laneScope({ event: 'workflow_dispatch', ref: 'refs/heads/main', repository }), null);
  assert.equal(laneScope({ event: 'push', ref: 'refs/heads/main', repository: '' }), null);
});
