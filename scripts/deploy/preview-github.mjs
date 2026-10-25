#!/usr/bin/env node
// Read-only preflight. Run only this trusted controller checkout, never a feature
// branch's helper with deployment credentials. No Cloudflare token is needed.
import { execFileSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { verifyPreviewCheck } from './preview-check.mjs';

const REPOSITORY = 'arkpedia/arkpedia';
const positive = value => Number.isSafeInteger(value) && value > 0;
const requireValue = (value, message) => { if (!value) throw new Error(`Preview preflight refused: ${message}`); };

export function githubQuery(path) {
  requireValue(path.startsWith(`repos/${REPOSITORY}/`), 'unexpected repository endpoint');
  return JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8', maxBuffer: 16_000_000 }));
}

export function readPolicyArtifact(run, artifact) {
  requireValue(positive(run?.id) && positive(artifact?.id) && artifact.workflow_run?.id === run.id
    && artifact.expired === false && Number.isSafeInteger(artifact.size_in_bytes)
    && artifact.size_in_bytes > 0 && artifact.size_in_bytes <= 5_000_000, 'invalid policy artifact download');
  const bytes = execFileSync('gh', ['api', `repos/${REPOSITORY}/actions/artifacts/${artifact.id}/zip`],
    { maxBuffer: 5_000_001 });
  const reader = fileURLToPath(new URL('./read-preview-evidence.py', import.meta.url));
  return JSON.parse(execFileSync('python', [reader], {
    input: bytes, encoding: 'utf8', maxBuffer: 6_000_000,
  }));
}

export function inspectPreviewCheck({ number, source, runId }, { query = githubQuery, readEvidence = readPolicyArtifact } = {}) {
  requireValue(positive(number) && positive(runId) && /^[a-f0-9]{40}$/.test(source ?? ''), 'expected PR number, full SHA and Check run ID');
  const readPr = () => {
    const pr = query(`repos/${REPOSITORY}/pulls/${number}`);
    requireValue(pr?.number === number && pr.state === 'open' && pr.draft === false
      && pr.base?.ref === 'main' && pr.base.repo?.full_name === REPOSITORY
      && pr.head?.repo?.full_name === REPOSITORY && pr.head.sha === source,
    'PR is draft, closed, foreign, moved or not targeting main');
    return pr;
  };
  readPr();
  const tree = query(`repos/${REPOSITORY}/git/commits/${source}`).tree?.sha;
  const proof = verifyPreviewCheck({ source, tree, pr: number, runId }, { query, readEvidence });
  readPr();
  return { repository: REPOSITORY, pr: number, ...proof };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    requireValue(process.argv.length === 5, 'usage: node scripts/deploy/preview-github.mjs PR FULL_SHA CHECK_RUN');
    for (const value of [process.argv[2], process.argv[4]]) requireValue(/^[1-9][0-9]*$/.test(value), 'invalid numeric ID');
    console.log(JSON.stringify(inspectPreviewCheck({ number: Number(process.argv[2]), source: process.argv[3], runId: Number(process.argv[4]) }), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
