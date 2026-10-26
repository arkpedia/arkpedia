import test from 'node:test';
import assert from 'node:assert/strict';
import { listedCases, coveragePlan, executionEvidence } from '../ci/browser-coverage.mjs';

const spec = (title, projectName = 'desktop') => ({ title, file: 'layout-census.spec.ts', tests: [{ projectName }] });
function report() {
  return { errors: [], suites: [
    ...['desktop', 'mobile'].flatMap(projectName => [
      { title: 'story-library.spec.ts', column: 0, specs: [{ title: 'reads stories', file: 'story-library.spec.ts', tests: [{ projectName }] }] },
      { title: 'layout-census.spec.ts', column: 0, specs: ['/story, dark theme', '/story, light theme', '/story?view=list (filtered list), dark theme', '/music, dark theme'].map(title => spec(title, projectName)) },
    ]),
    { title: 'layout-census-after.spec.ts', column: 0, specs: [{ title: 'no stale entries', file: 'layout-census-after.spec.ts', tests: [{ projectName: 'after-census' }] }] },
  ] };
}
const plan = { lane: 'targeted', reason: 'story change', domains: ['story'], selected: ['tests/browser/story-library.spec.ts'], omitted: ['tests/browser/layout-census.spec.ts', 'tests/browser/layout-census-after.spec.ts'] };

test('affected census retains every registered theme, project and driven state', () => {
  const result = coveragePlan(plan, report());
  assert.equal(result.lane, 'targeted');
  assert.equal(result.selected.length, 8);
  assert.equal(result.omitted.length, 3);
  for (const project of ['desktop', 'mobile']) {
    assert.ok(result.selected.some(item => item.project === project && item.titlePath[0].includes('filtered list')));
    assert.ok(result.selected.some(item => item.project === project && item.titlePath[0] === '/story, light theme'));
  }
  assert.equal(result.completionAudit, 'omitted-requires-full-census');
  assert.equal(result.outcome, 'planned-only');
  assert.equal(result.reusableCheckProof, false);
  assert.match(result.inventorySha256, /^[a-f0-9]{64}$/);
});

test('unknown domain, missing root/project/file or changed census naming retains full inventory', () => {
  const modified = report();
  modified.suites.find(item => item.specs.some(item => item.tests[0].projectName === 'mobile') && item.title === 'layout-census.spec.ts').specs = [];
  const malformed = report();
  malformed.suites.find(item => item.title === 'layout-census.spec.ts').specs[0].title = 'new title convention';
  for (const [candidate, inventory] of [
    [{ ...plan, domains: ['unknown'] }, report()],
    [plan, modified], [plan, malformed],
    [{ ...plan, selected: [...plan.selected, 'tests/browser/missing.spec.ts'] }, report()],
    [plan, { ...report(), suites: report().suites.filter(item => item.title !== 'layout-census-after.spec.ts') }],
  ]) {
    const result = coveragePlan(candidate, inventory);
    assert.equal(result.lane, 'full');
    assert.equal(result.omitted.length, 0);
  }
});

test('spec-only plans retain the complete page census without claiming its completion audit', () => {
  const result = coveragePlan({ ...plan, domains: [] }, report());
  assert.equal(result.selected.length, 10);
  assert.equal(result.omitted[0].file, 'layout-census-after.spec.ts');
});

test('release journeys explicitly omit visual census and cannot claim full execution', () => {
  const result = coveragePlan({ ...plan, domains: [], releaseOnly: true }, report());
  assert.equal(result.lane, 'targeted');
  assert.equal(result.selected.length, 2);
  assert.ok(result.selected.every(item => item.file === 'story-library.spec.ts'));
  assert.equal(result.omitted.length, 9);
  assert.equal(result.completionAudit, 'omitted-requires-full-census');
  assert.equal(result.selected.length + result.omitted.length, listedCases(report()).length);
  assert.throws(() => executionEvidence(result, completed()), /identities/);
});

test('full includes completion audit and documentation-only plan selects nothing', () => {
  const full = coveragePlan({ ...plan, lane: 'full' }, report());
  assert.equal(full.selected.length, 11);
  assert.equal(full.completionAudit, 'included');
  const none = coveragePlan({ ...plan, lane: 'none', selected: [] }, report());
  assert.equal(none.selected.length, 0);
  assert.equal(none.omitted.length, 11);
  assert.equal(none.testList, '');
});

test('collection failures and ambiguous or unrepresentable entries cannot yield a usable test list', () => {
  for (const inventory of [null, { ...report(), errors: [{ message: 'cannot import fixture' }] }, { errors: [], suites: [] }]) assert.throws(() => listedCases(inventory));
  const duplicate = report(); duplicate.suites.push(duplicate.suites[0]);
  assert.throws(() => listedCases(duplicate), /ambiguous/);
  const invalid = report(); invalid.suites[0].specs[0].title = 'title\nsecond test';
  assert.throws(() => listedCases(invalid), /Unrepresentable/);
});

test('nested describe paths survive Playwright test-list serialization', () => {
  const inventory = { errors: [], suites: [{ title: 'sample.spec.ts', column: 0, suites: [{ title: 'journey > summary', column: 1, specs: [{ title: 'opens', file: 'sample.spec.ts', tests: [{ projectName: 'desktop' }] }] }] }] };
  assert.equal(listedCases(inventory)[0].line, '[desktop] › sample.spec.ts › journey > summary › opens');
});

function completed() {
  const inventory = report();
  for (const suite of inventory.suites) for (const spec of suite.specs) {
    Object.assign(spec.tests[0], { expectedStatus: 'passed', status: 'expected', results: [{ status: 'passed', duration: 10, errors: [] }] });
  }
  return inventory;
}

test('execution evidence rejects collection-only, missing/extra tests, failures and hidden retries', () => {
  const coverage = coveragePlan({ ...plan, lane: 'full' }, report());
  const missing = completed(); missing.suites.pop();
  const failed = completed(); failed.suites[0].specs[0].tests[0].results[0].status = 'failed';
  const retried = completed(); retried.suites[0].specs[0].tests[0].results.push({ status: 'passed', duration: 1 });
  for (const result of [report(), missing, failed, retried]) assert.throws(() => executionEvidence(coverage, result));
  assert.throws(() => executionEvidence({ ...coverage, selected: coverage.selected.slice(1) }, completed()), /identities/);
  const result = executionEvidence(coverage, completed());
  assert.deepEqual(result.counts, { passed: 11, skipped: 0, expectedFailed: 0 });
  assert.equal(result.caseMilliseconds, 110);
  assert.equal(result.reusableCheckProof, false);
});

test('intentional runtime skips are recorded explicitly while interrupted skips fail', () => {
  const coverage = coveragePlan({ ...plan, lane: 'full' }, report());
  const result = completed();
  const first = result.suites[0].specs[0].tests[0];
  Object.assign(first, { expectedStatus: 'skipped', status: 'skipped', results: [{ status: 'skipped', duration: 0, errors: [] }] });
  assert.deepEqual(executionEvidence(coverage, result).counts, { passed: 10, skipped: 1, expectedFailed: 0 });
  first.expectedStatus = 'passed';
  assert.throws(() => executionEvidence(coverage, result), /does not satisfy/);
});
