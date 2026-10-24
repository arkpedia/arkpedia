import test from 'node:test';
import assert from 'node:assert/strict';
import { baselineForCommit, passed } from '../ci/browser-relevant.mjs';
import { fullBaselineAncestor, revalidateFullBaseline } from '../ci/browser-baseline.mjs';

const repository = 'arkpedia/arkpedia', commit = 'a'.repeat(40), tree = 'b'.repeat(40), head = 'c'.repeat(40);
const run = () => ({ id: 10, status: 'completed', conclusion: 'success', event: 'push', path: '.github/workflows/check.yml',
  head_sha: commit, head_branch: 'main', repository: { full_name: repository }, head_repository: { full_name: repository } });
const job = () => ({ id: 20, run_id: 10, name: 'check', status: 'completed', conclusion: 'success',
  steps: [{ name: 'Desktop and mobile browser regressions', status: 'completed', conclusion: 'success' }] });
function fixtures({ workflow = run(), jobs = [job()], artifacts = [], associated = [], mergeTree = tree } = {}) {
  const query = path => {
    if (path.includes('/workflows/check.yml/runs?')) return { workflow_runs: workflow.event === 'pull_request' ? [] : [workflow] };
    if (path.includes('/actions/artifacts?')) return { artifacts };
    if (path.includes('/jobs?')) return { jobs, total_count: jobs.length };
    if (path.endsWith('/actions/runs/10')) return workflow;
    if (path.includes('/pulls?')) return associated;
    if (path.includes('/git/commits/')) return { tree: { sha: mergeTree } };
    assert.fail(`Unexpected API call: ${path}`);
  };
  return { query, treeOf: () => tree };
}

test('baseline lookup accepts actual full push execution but rejects green draft and partial jobs', () => {
  const proof = baselineForCommit(commit, repository, 'main', fixtures());
  assert.equal(proof.runId, 10); assert.equal(proof.coverage, 'full');
  for (const jobs of [[], [{ ...job(), name: 'draft' }], [{ ...job(), conclusion: 'skipped' }],
    [{ ...job(), steps: [{ name: 'Selected browser regressions', status: 'completed', conclusion: 'success' }] }],
    [{ ...job(), steps: [{ ...job().steps[0], conclusion: 'skipped' }] }]]) {
    assert.equal(passed(commit, repository, 'main', fixtures({ jobs })), false);
  }
  assert.equal(passed(commit, repository, '', fixtures()), false);
  const complete = fixtures();
  assert.equal(passed(commit, repository, 'main', { ...complete, query: path => path.includes('/jobs?')
    ? { jobs: [job()], total_count: 2 } : complete.query(path) }), false, 'truncated jobs cannot establish unique full execution');
});

test('merged PR metadata hydration requires matching repository, head, base and actual merge tree', () => {
  const workflow = { ...run(), event: 'pull_request', head_sha: head, head_branch: 'feature', pull_requests: [] };
  const artifact = { id: 30, expired: false, name: `checked-tree-${tree}`, workflow_run: { id: 10 } };
  const pr = { head: { sha: head, repo: { full_name: repository } }, base: { ref: 'main', repo: { full_name: repository } },
    merged_at: '2026-10-24T22:00:00Z', merge_commit_sha: commit };
  const options = overrides => fixtures({ workflow, artifacts: [artifact], associated: [pr], ...overrides });
  assert.equal(baselineForCommit(commit, repository, 'main', options()).artifactId, 30);
  for (const associated of [[], [pr, pr], [{ ...pr, merged_at: null }], [{ ...pr, head: { ...pr.head, sha: 'd'.repeat(40) } }],
    [{ ...pr, base: { ...pr.base, ref: 'dev' } }], [{ ...pr, head: { ...pr.head, repo: { full_name: 'fork/arkpedia' } } }]]) {
    assert.equal(passed(commit, repository, 'main', options({ associated })), false);
  }
  assert.equal(passed(commit, repository, 'main', options({ mergeTree: 'd'.repeat(40) })), false);
  assert.equal(passed(commit, repository, 'main', options({ artifacts: [{ ...artifact, expired: true }] })), false);
  assert.equal(passed(commit, repository, 'main', options({ jobs: [{ ...job(), conclusion: 'skipped' }] })), false);
});

test('ancestor lookup skips a newer partial result and preserves the older full comparison base', () => {
  const newest = 'd'.repeat(40), newestTree = 'e'.repeat(40);
  const newerRun = { ...run(), id: 11, head_sha: newest };
  const original = fixtures().query;
  const query = path => {
    if (path.endsWith('/actions/artifacts?per_page=100')) return { artifacts: [] };
    if (path.endsWith('/runs?status=success&per_page=100')) return { workflow_runs: [newerRun, run()] };
    if (path.includes('/runs/11/jobs?')) return { total_count: 1, jobs: [{ ...job(), run_id: 11, steps: [{ name: 'Selected browser regressions', status: 'completed', conclusion: 'success' }] }] };
    return original(path);
  };
  const proof = fullBaselineAncestor([{ commit: newest, tree: newestTree }, { commit, tree }], repository, 'main', { query });
  assert.equal(proof.commit, commit); assert.equal(proof.tree, tree);
  assert.equal(fullBaselineAncestor([], repository, 'main', { query }), null);
});

test('recorded baseline is revalidated against its own source and actual tree', () => {
  const proof = baselineForCommit(commit, repository, 'main', fixtures());
  const original = fixtures().query;
  const query = path => path.includes('/git/commits/') ? { tree: { sha: tree } } : original(path);
  assert.deepEqual(revalidateFullBaseline(proof, { query }), proof);
  assert.equal(revalidateFullBaseline({ ...proof, jobId: 999 }, { query }), null);
  assert.equal(revalidateFullBaseline(proof, { query: path => path.includes('/git/commits/') ? { tree: { sha: 'f'.repeat(40) } } : original(path) }), null);
});
