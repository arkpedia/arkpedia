import test from 'node:test';
import assert from 'node:assert/strict';
import { lanePlan, completeLane, canonicalNextTypeRewrite, unexpectedBrowserInputs } from '../ci/browser-lane.mjs';
import { coveragePlan } from '../ci/browser-coverage.mjs';

const metadata = { commit: 'a'.repeat(40), tree: 'b'.repeat(40), repository: 'arkpedia/arkpedia', baseRef: 'main',
  runId: 40, policySha256: 'c'.repeat(64) };
const baseline = { coverage: 'full', commit: 'd'.repeat(40), tree: 'e'.repeat(40), repository: metadata.repository,
  baseRef: 'main', runId: 10, jobId: 20, artifactId: 30, event: 'pull_request', sourceCommit: 'f'.repeat(40) };
const specs = ['nav-bar.spec.ts', 'mobile-touch-nav.spec.ts', 'navigation-continuity.spec.ts', 'story-library.spec.ts',
  'layout-census.spec.ts', 'layout-census-after.spec.ts', 'other-feature.spec.ts'];

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
