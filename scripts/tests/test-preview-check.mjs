import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { verifyPreviewCheck } from '../deploy/preview-check.mjs';
import { inspectPreviewCheck } from '../deploy/preview-github.mjs';
import { POLICY_FILES, policyFingerprint } from '../ci/browser-evidence.mjs';

const source = 'a'.repeat(40), tree = 'b'.repeat(40), base = 'c'.repeat(40), baseTree = 'd'.repeat(40);
const repo = 'arkpedia/arkpedia';
const success = { status: 'completed', conclusion: 'success' };
const skipped = { status: 'completed', conclusion: 'skipped' };
const blobs = Object.fromEntries(POLICY_FILES.map((path, index) => [path, (index + 1).toString(16).padStart(40, '0')]));
const policySha256 = policyFingerprint(blobs);
const step = (name, state = success) => ({ name, ...state });
function fixture(lane = 'full') {
  const request = { source, tree, pr: 10, runId: 20 };
  const run = { id: 20, ...success, event: 'pull_request', path: '.github/workflows/check.yml',
    repository: { full_name: repo }, head_repository: { full_name: repo }, head_sha: source,
    pull_requests: [{ number: 10, base: { ref: 'main' } }] };
  const artifact = { id: 30, expired: false, workflow_run: { id: 20 },
    name: lane === 'full' ? `checked-tree-${tree}` : `checked-policy-tree-${tree}-${policySha256}` };
  const jobs = [{ id: 40, run_id: 20, name: 'check', ...success,
    steps: [step('Desktop and mobile browser regressions', lane === 'full' ? success : skipped),
      step('Selected browser regressions', lane === 'none' ? skipped : success),
      step('Validate browser execution evidence'), step('Record selected browser coverage')] }];
  const identity = { project: 'desktop', file: 'story.spec.ts', titlePath: ['story'], line: '[desktop] › story.spec.ts › story' };
  const mobile = { ...identity, project: 'mobile', line: '[mobile] › story.spec.ts › story' };
  const completion = { project: 'after-census', file: 'layout-census-after.spec.ts', titlePath: ['completion'], line: '[after-census] › layout-census-after.spec.ts › completion' };
  const inventory = [completion, identity, mobile];
  const selected = lane === 'none' ? [] : [identity];
  const record = { schema: 1, policy: 'arkpedia-browser-v1', commit: source, tree, repository: repo,
    baseRef: 'main', runId: 20, policySha256, comparisonBase: base,
    baseline: { coverage: 'full', commit: base, tree: baseTree, runId: 50, jobId: 60, artifactId: null,
      event: 'push', repository: repo, baseRef: 'main', sourceCommit: base },
    coverage: { policy: 'shadow-coverage-v1', lane, inventorySha256: createHash('sha256').update(JSON.stringify(inventory)).digest('hex'),
      outcome: lane === 'none' ? 'no-browser-impact' : 'executed-contracts-satisfied', reusableCheckProof: false,
      selected, omitted: lane === 'none' ? inventory : [completion, mobile], counts: { passed: selected.length, skipped: 0, expectedFailed: 0 },
      caseMilliseconds: lane === 'none' ? 0 : 10, completionAudit: 'omitted-requires-full-census' } };
  const routes = {
    [`repos/${repo}/pulls/10`]: { number: 10, state: 'open', draft: false,
      base: { ref: 'main', repo: { full_name: repo } }, head: { sha: source, repo: { full_name: repo } } },
    [`repos/${repo}/git/commits/${source}`]: { tree: { sha: tree } },
    [`repos/${repo}/actions/runs/20`]: run,
    [`repos/${repo}/actions/runs/20/artifacts?per_page=100`]: { artifacts: [artifact], total_count: 1 },
    [`repos/${repo}/actions/runs/20/jobs?filter=latest&per_page=100`]: { jobs, total_count: 1 },
    [`repos/${repo}/git/trees/${tree}?recursive=1`]: { truncated: false, tree: Object.entries(blobs).map(([path, sha]) => ({ path, sha, type: 'blob' })) },
    [`repos/${repo}/git/commits/${base}`]: { tree: { sha: baseTree } },
    [`repos/${repo}/actions/runs/50`]: { ...run, id: 50, event: 'push', head_sha: base, head_branch: 'main' },
    [`repos/${repo}/actions/runs/50/jobs?filter=latest&per_page=100`]: {
      total_count: 1, jobs: [{ id: 60, run_id: 50, name: 'check', ...success, steps: [step('Desktop and mobile browser regressions')] }],
    },
    [`repos/${repo}/compare/${base}...${source}`]: { status: 'ahead', merge_base_commit: { sha: base } },
  };
  const query = path => { assert.ok(Object.hasOwn(routes, path), `unexpected API path: ${path}`); return routes[path]; };
  return { request, routes, record, artifact, run, jobs, query, verify: () => verifyPreviewCheck(request, { query, readEvidence: () => record }) };
}

test('full, selected and no-browser-impact previews use the existing proof validators', () => {
  for (const lane of ['full', 'targeted', 'none']) {
    const result = fixture(lane).verify();
    assert.equal(result.lane, lane);
    assert.equal(result.source, source);
    assert.equal(result.tree, tree);
  }
});

test('green draft, wrong PR/source and foreign workflow do not authorize a preview', () => {
  for (const mutate of [
    f => { f.jobs[0].name = 'draft'; },
    f => { f.jobs[0].steps[0].conclusion = 'skipped'; },
    f => { f.run.pull_requests[0].number = 11; },
    f => { f.run.head_sha = base; },
    f => { f.run.path = '.github/workflows/other.yml'; },
    f => { f.run.conclusion = 'failure'; },
    f => { f.artifact.expired = true; },
    f => { f.artifact.workflow_run.id = 21; },
  ]) {
    const f = fixture(); mutate(f); assert.throws(f.verify, undefined, mutate.toString());
  }
});

test('selected previews reject stale policy, partial inventories, bad ledger and lost baseline ancestry', () => {
  for (const mutate of [
    f => { f.artifact.name = `checked-policy-tree-${tree}-${'e'.repeat(64)}`; },
    f => { f.record.coverage.counts.passed = 0; },
    f => { f.routes[`repos/${repo}/git/trees/${tree}?recursive=1`].truncated = true; },
    f => { f.routes[`repos/${repo}/actions/runs/20/artifacts?per_page=100`].total_count = 2; },
    f => { f.routes[`repos/${repo}/actions/runs/20/jobs?filter=latest&per_page=100`].total_count = 2; },
    f => { f.routes[`repos/${repo}/actions/runs/50`].conclusion = 'failure'; },
    f => { f.routes[`repos/${repo}/compare/${base}...${source}`].merge_base_commit.sha = 'f'.repeat(40); },
    f => { f.jobs[0].steps.find(s => s.name === 'Validate browser execution evidence').conclusion = 'skipped'; },
  ]) {
    const f = fixture('targeted'); mutate(f); assert.throws(f.verify, undefined, mutate.toString());
  }
});

test('read-only preflight re-reads the PR after proof validation and refuses a concurrent push', () => {
  const f = fixture('targeted');
  const request = { number: 10, source, runId: 20 };
  const result = inspectPreviewCheck(request, { query: f.query, readEvidence: () => f.record });
  assert.equal(result.lane, 'targeted');
  let reads = 0;
  const query = path => {
    const result = structuredClone(f.query(path));
    if (path.endsWith('/pulls/10') && ++reads === 2) result.head.sha = base;
    return result;
  };
  assert.throws(() => inspectPreviewCheck(request, { query, readEvidence: () => f.record }), /moved/);
  assert.equal(reads, 2);
});

test('read-only preflight refuses draft/foreign PRs and invalid IDs before touching artifacts', () => {
  for (const change of [{ draft: true }, { state: 'closed' }, { base: { ref: 'dev' } },
    { head: { sha: source, repo: { full_name: 'fork/arkpedia' } } }]) {
    const f = fixture();
    Object.assign(f.routes[`repos/${repo}/pulls/10`], change);
    assert.throws(() => inspectPreviewCheck({ number: 10, source, runId: 20 }, {
      query: f.query, readEvidence: () => { assert.fail('must not download'); },
    }), /PR is draft/);
  }
  assert.throws(() => inspectPreviewCheck({ number: 10, source: 'main', runId: 20 }, {
    query: () => assert.fail('must not call API'),
  }), /expected PR number/);
});
