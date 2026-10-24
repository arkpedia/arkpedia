import test from 'node:test';
import assert from 'node:assert/strict';
import { fullBrowserBaseline } from '../ci/full-browser-baseline.mjs';

const commit = 'a'.repeat(40), tree = 'b'.repeat(40);
function fixture(event = 'pull_request') {
  return {
    repository: 'arkpedia/arkpedia', baseRef: 'main', commit, tree,
    run: { id: 101, status: 'completed', conclusion: 'success', event,
      path: '.github/workflows/check.yml', head_sha: commit, head_branch: 'main',
      repository: { full_name: 'arkpedia/arkpedia' }, head_repository: { full_name: 'arkpedia/arkpedia' },
      pull_requests: [{ base: { ref: 'main' } }] },
    jobs: [{ id: 202, run_id: 101, name: 'check', status: 'completed', conclusion: 'success',
      steps: [{ name: 'Desktop and mobile browser regressions', status: 'completed', conclusion: 'success' }] }],
    artifact: { id: 303, name: `checked-tree-${tree}`, expired: false, workflow_run: { id: 101 } },
  };
}
function rejects(mutate, event) {
  const input = fixture(event);
  mutate(input);
  assert.equal(fullBrowserBaseline(input), null);
}

test('full PR evidence returns exact tree, branch and run/job/artifact provenance', () => {
  const input = fixture();
  // PR workflows may test a merge tree while head_sha identifies the source head.
  input.run.head_sha = 'c'.repeat(40);
  assert.deepEqual(fullBrowserBaseline(input), { coverage: 'full', commit, tree, runId: 101,
    jobId: 202, artifactId: 303, event: 'pull_request', repository: 'arkpedia/arkpedia',
    baseRef: 'main', sourceCommit: 'c'.repeat(40) });
});

test('push and manual full runs bind the exact commit and branch without an artifact', () => {
  for (const event of ['push', 'workflow_dispatch']) {
    const input = fixture(event);
    delete input.artifact;
    const proof = fullBrowserBaseline(input);
    assert.equal(proof.event, event);
    assert.equal(proof.artifactId, null);
    assert.equal(proof.commit, commit);
    rejects(value => { value.run.head_sha = 'c'.repeat(40); }, event);
    rejects(value => { value.run.head_branch = 'dev'; }, event);
    rejects(value => { delete value.run.head_branch; }, event);
  }
});

test('quick draft, skipped check and targeted-only browsers cannot provide full evidence', () => {
  rejects(value => { value.jobs[0].name = 'draft'; });
  rejects(value => { value.jobs[0].conclusion = 'skipped'; });
  rejects(value => { value.jobs[0].steps[0].conclusion = 'skipped'; });
  rejects(value => { value.jobs[0].steps[0].name = 'Affected desktop and mobile browser regressions'; });
  rejects(value => { value.jobs[0].steps = []; });
  rejects(value => { value.jobs = []; });
});

test('running, failed or cancelled workflow/job/browser steps fail closed', () => {
  for (const target of ['run', 'job', 'step']) for (const field of ['status', 'conclusion']) {
    for (const invalid of field === 'status' ? ['queued', 'in_progress', undefined] : ['failure', 'cancelled', 'neutral', 'timed_out', undefined]) {
      rejects(value => {
        const record = target === 'run' ? value.run : target === 'job' ? value.jobs[0] : value.jobs[0].steps[0];
        record[field] = invalid;
      });
    }
  }
});

test('fork, wrong workflow, unsupported event and missing repository provenance are rejected', () => {
  for (const field of ['repository', 'head_repository']) {
    rejects(value => { value.run[field].full_name = 'someone/arkpedia'; });
    rejects(value => { delete value.run[field]; });
  }
  rejects(value => { value.run.path = '.github/workflows/other.yml'; });
  rejects(value => { value.run.event = 'pull_request_target'; });
  rejects(value => { delete value.run.event; });
});

test('PR proofs require a unique matching base and a live exact-tree artifact from the same run', () => {
  for (const pullRequests of [undefined, [], [{ base: { ref: 'dev' } }], [{}, {}], [{}]]) {
    rejects(value => { value.run.pull_requests = pullRequests; });
  }
  rejects(value => { delete value.artifact; });
  rejects(value => { value.artifact.expired = true; });
  rejects(value => { delete value.artifact.expired; });
  rejects(value => { value.artifact.name = `checked-tree-${'c'.repeat(40)}`; });
  rejects(value => { value.artifact.name = `targeted-tree-${tree}`; });
  rejects(value => { value.artifact.workflow_run.id = 999; });
  rejects(value => { delete value.artifact.workflow_run; });
});

test('ambiguous checks, duplicate full steps and unrelated jobs are rejected', () => {
  rejects(value => { value.jobs.push(structuredClone(value.jobs[0])); });
  rejects(value => { value.jobs[0].steps.push(structuredClone(value.jobs[0].steps[0])); });
  rejects(value => { value.jobs[0].run_id = 999; });
  rejects(value => { delete value.jobs[0].run_id; });
});

test('missing/malformed identifiers and inputs cannot create proof', () => {
  assert.equal(fullBrowserBaseline(), null);
  for (const key of ['run', 'jobs', 'repository', 'baseRef', 'commit', 'tree']) rejects(value => { delete value[key]; });
  for (const key of ['commit', 'tree']) for (const invalid of ['', 'main', 'a'.repeat(39), '../x']) rejects(value => { value[key] = invalid; });
  for (const invalid of [null, 0, -1, '101', 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    rejects(value => { value.run.id = invalid; });
    rejects(value => { value.jobs[0].id = invalid; });
    rejects(value => { value.artifact.id = invalid; });
  }
  rejects(value => { value.run.head_sha = 'main'; });
  rejects(value => { value.jobs = {}; });
  rejects(value => { value.jobs[0].steps = null; });
  rejects(value => { value.baseRef = ' '; });
  rejects(value => { value.repository = 'arkpedia'; });
});
