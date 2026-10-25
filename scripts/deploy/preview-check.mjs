// Reuse the established CI proof policy; a green workflow, draft result, receipt
// or caller-supplied `checked: true` is never a preview approval.
import { fullRunProof } from '../ci/browser-baseline.mjs';
import { policyVouching, policyProofStillValid } from '../ci/already-checked.mjs';
import { ARTIFACT_PREFIX, POLICY_ARTIFACT_PREFIX, POLICY_FILES, policyFingerprint } from '../ci/browser-evidence.mjs';

const REPOSITORY = 'arkpedia/arkpedia';
const SHA = /^[a-f0-9]{40}$/;
const requireValue = (value, message) => { if (!value) throw new Error(`Preview Check refused: ${message}`); };

/** query must read authenticated GitHub API records. readEvidence must download
 * only the indicated artifact, enforce the existing JSON size/content limits and
 * return parsed data without executing it. This module never runs feature code.
 */
export function verifyPreviewCheck({ source, tree, pr, runId }, { query, readEvidence }) {
  requireValue(SHA.test(source ?? '') && SHA.test(tree ?? '') && Number.isSafeInteger(pr) && pr > 0
    && Number.isSafeInteger(runId) && runId > 0, 'missing explicit source/tree/PR/run');
  requireValue(query(`repos/${REPOSITORY}/git/commits/${source}`).tree?.sha === tree,
    'source commit tree differs');
  const run = query(`repos/${REPOSITORY}/actions/runs/${runId}`);
  requireValue(run?.id === runId && run.status === 'completed' && run.conclusion === 'success'
    && run.event === 'pull_request' && run.path === '.github/workflows/check.yml'
    && run.repository?.full_name === REPOSITORY && run.head_repository?.full_name === REPOSITORY
    && run.head_sha === source && Array.isArray(run.pull_requests) && run.pull_requests.length === 1
    && run.pull_requests[0].number === pr && run.pull_requests[0].base?.ref === 'main',
  'Check is not a successful current-source main PR run');
  const listing = query(`repos/${REPOSITORY}/actions/runs/${runId}/artifacts?per_page=100`);
  requireValue(Array.isArray(listing.artifacts) && listing.total_count === listing.artifacts.length,
    'incomplete artifact inventory');
  const full = listing.artifacts.filter(a => a.name === `${ARTIFACT_PREFIX}${tree}`);
  requireValue(full.length <= 1, 'ambiguous full proof');
  if (full.length === 1) {
    const proof = fullRunProof({ run, artifact: full[0], repository: REPOSITORY,
      baseRef: 'main', commit: source, tree, query });
    requireValue(proof, 'full marker lacks actual successful full-browser execution');
    return { lane: 'full', runId, artifactId: full[0].id, source, tree, baseline: proof };
  }
  const gitTree = query(`repos/${REPOSITORY}/git/trees/${tree}?recursive=1`);
  requireValue(gitTree?.truncated === false && Array.isArray(gitTree.tree), 'incomplete policy tree');
  const blobs = Object.fromEntries(POLICY_FILES.map(path => {
    const matches = gitTree.tree.filter(entry => entry.path === path && entry.type === 'blob');
    requireValue(matches.length === 1, 'missing or ambiguous policy source');
    return [path, matches[0].sha];
  }));
  const policySha256 = policyFingerprint(blobs);
  const partial = listing.artifacts.filter(a => a.name === `${POLICY_ARTIFACT_PREFIX}${tree}-${policySha256}`);
  requireValue(partial.length === 1 && partial[0].expired === false && partial[0].workflow_run?.id === runId,
    'no unexpired current-policy proof');
  const jobs = query(`repos/${REPOSITORY}/actions/runs/${runId}/jobs?filter=latest&per_page=100`);
  requireValue(Array.isArray(jobs.jobs) && jobs.total_count === jobs.jobs.length, 'incomplete Check jobs');
  const record = readEvidence(run, partial[0]);
  requireValue(policyVouching({ tree, policySha256, artifact: partial[0], run, jobs: jobs.jobs,
    record, repository: REPOSITORY, baseRef: 'main' }), 'selected proof or execution ledger differs');
  requireValue(policyProofStillValid(record, source, { query }), 'full baseline or source ancestry differs');
  return { lane: record.coverage.lane, runId, artifactId: partial[0].id, source, tree,
    policySha256, baseline: record.baseline };
}
