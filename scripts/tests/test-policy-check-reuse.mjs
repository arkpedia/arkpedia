import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { policyVouching, policyProofStillValid } from '../ci/already-checked.mjs';
import { BROWSER_POLICY, POLICY_ARTIFACT_PREFIX } from '../ci/browser-evidence.mjs';

function fixture(lane = 'targeted') {
  const repository = 'arkpedia/arkpedia', baseRef = 'main', tree = 'a'.repeat(40), policySha256 = 'b'.repeat(64);
  const item = (project, file, title) => ({ project, file, titlePath: [title], line: `[${project}] › ${file} › ${title}` });
  const inventory = [item('desktop', 'story-library.spec.ts', 'story'), item('mobile', 'story-library.spec.ts', 'story'),
    item('after-census', 'layout-census-after.spec.ts', 'completion')].sort((a,b) => a.line.localeCompare(b.line, 'en'));
  const selected = lane === 'none' ? [] : inventory.filter(value => value.project !== 'after-census');
  const baseline = { coverage: 'full', commit: 'c'.repeat(40), tree: 'd'.repeat(40), runId: 10, jobId: 20, artifactId: null,
    event: 'push', repository, baseRef, sourceCommit: 'c'.repeat(40) };
  const record = { schema: 1, policy: BROWSER_POLICY, commit: 'e'.repeat(40), tree, policySha256, repository, baseRef, runId: 40,
    baseline, comparisonBase: baseline.commit, coverage: { policy: 'shadow-coverage-v1', lane,
      inventorySha256: createHash('sha256').update(JSON.stringify(inventory)).digest('hex'), reusableCheckProof: false,
      outcome: lane === 'none' ? 'no-browser-impact' : 'executed-contracts-satisfied', counts: { passed: selected.length, skipped: 0, expectedFailed: 0 },
      caseMilliseconds: lane === 'none' ? 0 : 100, selected, omitted: inventory.filter(value => !selected.includes(value)), completionAudit: 'omitted-requires-full-census' } };
  const run = { id: 40, status: 'completed', conclusion: 'success', event: 'pull_request', path: '.github/workflows/check.yml',
    repository: { full_name: repository }, head_repository: { full_name: repository }, pull_requests: [{ base: { ref: baseRef } }] };
  const step = (name, conclusion) => ({ name, status: 'completed', conclusion });
  const jobs = [{ id: 50, run_id: 40, name: 'check', status: 'completed', conclusion: 'success', steps: [
    step('Desktop and mobile browser regressions', 'skipped'), step('Selected browser regressions', lane === 'none' ? 'skipped' : 'success'),
    step('Validate browser execution evidence', 'success'), step('Record selected browser coverage', 'success'),
  ] }];
  const artifact = { id: 60, name: `${POLICY_ARTIFACT_PREFIX}${tree}-${policySha256}`, expired: false, workflow_run: { id: 40 } };
  return { repository, baseRef, tree, policySha256, artifact, run, jobs, record };
}

test('completed targeted and no-impact jobs have separate, exact-policy reuse contracts', () => {
  for (const lane of ['targeted', 'none']) {
    const input = fixture(lane); assert.equal(policyVouching(input), input.record);
  }
});

test('draft/skipped/failed/wrong-repository jobs or missing verification cannot vouch', () => {
  for (const mutate of [x => { x.run.event = 'workflow_dispatch'; }, x => { x.run.conclusion = 'failure'; },
    x => { x.run.head_repository.full_name = 'fork/arkpedia'; }, x => { x.run.pull_requests = []; },
    x => { x.run.pull_requests[0].base.ref = 'dev'; }, x => { x.jobs[0].name = 'draft'; },
    x => { x.jobs[0].conclusion = 'skipped'; }, x => { x.jobs[0].run_id = 999; }, x => { x.jobs[0].id = null; },
    x => { x.jobs.push(structuredClone(x.jobs[0])); }, x => { x.jobs[0].steps.pop(); },
    x => { x.jobs[0].steps[2].conclusion = 'skipped'; }, x => { x.jobs[0].steps[1].conclusion = 'skipped'; },
    x => { x.jobs[0].steps[0].conclusion = 'success'; }]) {
    const input = fixture(); mutate(input); assert.equal(policyVouching(input), null);
  }
});

test('expired, mismatched, malformed or self-rebound coverage artifacts fail closed', () => {
  for (const mutate of [x => { x.artifact.expired = true; }, x => { x.artifact.workflow_run.id = 999; },
    x => { x.artifact.name = `checked-tree-${x.tree}`; }, x => { x.record.runId = 999; },
    x => { x.record.policySha256 = 'f'.repeat(64); }, x => { x.record.coverage.outcome = 'planned-only'; },
    x => { x.record.coverage.counts.passed++; }, x => { x.record.baseline.baseRef = 'dev'; }]) {
    const input = fixture(); mutate(input); assert.equal(policyVouching(input), null);
  }
  const none = fixture('none'); none.jobs[0].steps[1].conclusion = 'success'; assert.equal(policyVouching(none), null);
});

test('reuse revalidates the exact full source and requires that ancestor on the current head', () => {
  const { record } = fixture();
  const full = { id: 10, status: 'completed', conclusion: 'success', event: 'push', path: '.github/workflows/check.yml', head_sha: record.baseline.commit,
    head_branch: 'main', repository: { full_name: record.repository }, head_repository: { full_name: record.repository } };
  const job = { id: 20, run_id: 10, name: 'check', status: 'completed', conclusion: 'success',
    steps: [{ name: 'Desktop and mobile browser regressions', status: 'completed', conclusion: 'success' }] };
  const query = path => {
    if (path.includes('/git/commits/')) return { tree: { sha: record.baseline.tree } };
    if (path.endsWith('/actions/runs/10')) return full;
    if (path.includes('/jobs?')) return { jobs: [job], total_count: 1 };
    if (path.includes('/compare/')) return { status: 'ahead', merge_base_commit: { sha: record.baseline.commit } };
    assert.fail(path);
  };
  assert.equal(policyProofStillValid(record, 'f'.repeat(40), { query }), true);
  assert.equal(policyProofStillValid(record, 'f'.repeat(40), { query: path => path.includes('/compare/')
    ? { status: 'diverged', merge_base_commit: { sha: record.baseline.commit } } : query(path) }), false);
  assert.equal(policyProofStillValid(record, 'f'.repeat(40), { query: path => path.includes('/compare/')
    ? { status: 'ahead', merge_base_commit: { sha: '0'.repeat(40) } } : query(path) }), false);
  job.steps[0].name = 'Selected browser regressions';
  assert.equal(policyProofStillValid(record, 'f'.repeat(40), { query }), false);
});
