// Trusted full execution lookup. A green workflow alone may be draft or partial.
import { execFileSync } from 'node:child_process';
import { fullBrowserBaseline } from './full-browser-baseline.mjs';
import { ARTIFACT_PREFIX } from './browser-evidence.mjs';
const api = path => JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8', maxBuffer: 16_000_000 }));
const treeOf = commit => execFileSync('git', ['rev-parse', `${commit}^{tree}`], { encoding: 'utf8' }).trim();

export function hydrateProofPullRequest(run, { repository, baseRef, tree, query = api }) {
  // GitHub may clear this association after the merged head branch is deleted.
  if (run.event === 'pull_request' && Array.isArray(run.pull_requests) && !run.pull_requests.length) {
    if (!/^[a-f0-9]{40}$/.test(run.head_sha ?? '')) return null;
    const associated = query(`repos/${repository}/commits/${run.head_sha}/pulls?per_page=100`);
    if (!Array.isArray(associated) || associated.length >= 100) return null;
    const matches = [];
    for (const pr of associated) {
      if (pr.head?.repo?.full_name !== repository || !/^[a-f0-9]{40}$/.test(pr.head.sha ?? '')
        || pr.base?.repo?.full_name !== repository || pr.base.ref !== baseRef || !pr.merged_at
        || !/^[a-f0-9]{40}$/.test(pr.merge_commit_sha ?? '')) continue;
      if (pr.head.sha !== run.head_sha) {
        // A history-only update can change the head SHA while preserving the tested
        // tree. Require the old head in that history, plus the actual merged tree.
        const comparison = query(`repos/${repository}/compare/${run.head_sha}...${pr.head.sha}`);
        if (!['ahead', 'identical'].includes(comparison.status) || comparison.merge_base_commit?.sha !== run.head_sha) continue;
      }
      if (query(`repos/${repository}/git/commits/${pr.merge_commit_sha}`).tree?.sha === tree) matches.push(pr);
    }
    if (matches.length !== 1) return null;
    return { ...run, pull_requests: matches };
  }
  return run;
}

export function fullRunProof({ run, artifact, repository, baseRef, commit, tree, query = api, jobsCache = new Map() }) {
  if (!run?.id || run.status !== 'completed' || run.conclusion !== 'success' || run.path !== '.github/workflows/check.yml'
    || run.repository?.full_name !== repository || run.head_repository?.full_name !== repository
    || run.event === 'pull_request' && !artifact) return null;
  const record = hydrateProofPullRequest(run, { repository, baseRef, tree, query });
  if (!record) return null;
  if (!jobsCache.has(run.id)) {
    const response = query(`repos/${repository}/actions/runs/${run.id}/jobs?filter=latest&per_page=100`);
    jobsCache.set(run.id, Array.isArray(response.jobs) && response.total_count === response.jobs.length ? response.jobs : []);
  }
  return fullBrowserBaseline({ run: record, jobs: jobsCache.get(run.id), repository, baseRef, commit, tree, artifact });
}

export function baselineForCommit(commit, repository, baseRef, { query = api, treeOf: readTree = treeOf } = {}) {
  if (!baseRef) return null;
  const tree = readTree(commit), jobsCache = new Map();
  const runs = query(`repos/${repository}/actions/workflows/check.yml/runs?head_sha=${commit}&status=success&per_page=10`).workflow_runs ?? [];
  for (const run of runs) {
    const proof = fullRunProof({ run, repository, baseRef, commit, tree, query, jobsCache });
    if (proof) return proof;
  }
  const { artifacts = [] } = query(`repos/${repository}/actions/artifacts?name=${ARTIFACT_PREFIX}${tree}&per_page=20`);
  for (const artifact of artifacts) {
    if (artifact.expired !== false || !Number.isSafeInteger(artifact.workflow_run?.id)) continue;
    const run = query(`repos/${repository}/actions/runs/${artifact.workflow_run.id}`);
    const proof = fullRunProof({ run, artifact, repository, baseRef, commit, tree, query, jobsCache });
    if (proof) return proof;
  }
  return null;
}

/** Callers supply actual first-parent history, newest first; no assumed-green flag exists. */
export function fullBaselineAncestor(ancestors, repository, baseRef, { query = api } = {}) {
  if (!Array.isArray(ancestors) || !ancestors.length || ancestors.some(value => !/^[a-f0-9]{40}$/.test(value.commit) || !/^[a-f0-9]{40}$/.test(value.tree))) return null;
  const artifacts = query(`repos/${repository}/actions/artifacts?per_page=100`).artifacts ?? [];
  const runs = query(`repos/${repository}/actions/workflows/check.yml/runs?status=success&per_page=100`).workflow_runs ?? [];
  const cache = new Map();
  const indexed = path => {
    if (path.includes('/workflows/check.yml/runs?head_sha=')) {
      const sha = new URLSearchParams(path.split('?')[1]).get('head_sha');
      return { workflow_runs: runs.filter(run => run.head_sha === sha) };
    }
    if (path.includes('/actions/artifacts?name=')) {
      const name = new URLSearchParams(path.split('?')[1]).get('name');
      return { artifacts: artifacts.filter(artifact => artifact.name === name) };
    }
    if (!cache.has(path)) cache.set(path, query(path));
    return cache.get(path);
  };
  for (const ancestor of ancestors) {
    if (!artifacts.some(artifact => artifact.name === `${ARTIFACT_PREFIX}${ancestor.tree}` && artifact.expired === false)
      && !runs.some(run => run.head_sha === ancestor.commit)) continue;
    const proof = baselineForCommit(ancestor.commit, repository, baseRef, { query: indexed, treeOf: () => ancestor.tree });
    if (proof) return proof;
  }
  return null;
}

/** Revalidate the recorded source itself, not a substitute later green run. */
export function revalidateFullBaseline(proof, { query = api } = {}) {
  if (!proof || !Number.isSafeInteger(proof.runId)) return null;
  if (query(`repos/${proof.repository}/git/commits/${proof.commit}`).tree?.sha !== proof.tree) return null;
  const run = query(`repos/${proof.repository}/actions/runs/${proof.runId}`);
  const artifact = proof.artifactId === null ? undefined : query(`repos/${proof.repository}/actions/artifacts/${proof.artifactId}`);
  const actual = fullRunProof({ run, artifact, repository: proof.repository, baseRef: proof.baseRef, commit: proof.commit, tree: proof.tree, query });
  return actual && Object.keys(actual).every(key => actual[key] === proof[key]) ? actual : null;
}
