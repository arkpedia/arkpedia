#!/usr/bin/env node
// Execute the existing suites proportionally; only completed coverage can become evidence.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { browserPlan, dependencyIndex } from './browser-plan.mjs';
import { coveragePlan, executionEvidence } from './browser-coverage.mjs';
import { relevantFiles } from './browser-relevant.mjs';
import { fullBaselineAncestor } from './browser-baseline.mjs';
import { BROWSER_POLICY, POLICY_FILES, policyFingerprint, validateBrowserEvidence } from './browser-evidence.mjs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 16_000_000 }).trim();
const api = path => JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8', maxBuffer: 16_000_000 }));
const read = path => { try { return fs.readFileSync(path, 'utf8'); } catch { return null; } };
const PLAN = '.cache/browser-plan.json', REPORT = '.cache/browser-results.json', EVIDENCE = '.cache/browser-evidence.json';

export function currentPolicy() {
  return policyFingerprint(Object.fromEntries(POLICY_FILES.map(path => [path, git('rev-parse', `HEAD:${path}`)])));
}

export function lanePlan({ metadata, baseline, changes, specs, relevant, dependencies, inventory, forceFull = false }) {
  const plan = browserPlan({ changes, specs, relevant, dependencies, baselineVerified: !!baseline, forceFull });
  const coverage = coveragePlan(plan, inventory);
  return { schema: 1, policy: BROWSER_POLICY, ...metadata, baseline, comparisonBase: baseline?.commit ?? null,
    analysisReason: coverage.reason, coverage };
}

export function completeLane(plan, report) {
  const coverage = plan.coverage.lane === 'none' ? {
    policy: plan.coverage.policy, inventorySha256: plan.coverage.inventorySha256, lane: 'none', outcome: 'no-browser-impact',
    counts: { passed: 0, skipped: 0, expectedFailed: 0 }, caseMilliseconds: 0, reusableCheckProof: false,
    selected: plan.coverage.selected, omitted: plan.coverage.omitted, completionAudit: plan.coverage.completionAudit,
  } : executionEvidence(plan.coverage, report);
  const record = { ...plan, coverage };
  return validateBrowserEvidence(record, { tree: plan.tree, policySha256: plan.policySha256,
    repository: plan.repository, baseRef: plan.baseRef, runId: plan.runId });
}

function plan() {
  const event = process.env.GITHUB_EVENT_NAME;
  const repository = process.env.GITHUB_REPOSITORY;
  const baseRef = event === 'pull_request' ? process.env.GITHUB_BASE_REF : process.env.GITHUB_REF_NAME;
  const metadata = { commit: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}'), repository, baseRef,
    runId: Number(process.env.GITHUB_RUN_ID), policySha256: currentPolicy() };
  if (!repository || !baseRef || !Number.isSafeInteger(metadata.runId) || metadata.runId < 1) throw new Error('Missing trusted workflow identity');
  let baseline = null, changes = [], forceFull = true, fallbackReason;
  if (event === 'pull_request' && process.env.BROWSER_HEAD_REPOSITORY === repository) {
    try {
      const base = git('cat-file', '-p', 'HEAD').match(/^parent ([a-f0-9]{40})$/m)?.[1];
      if (!base) throw new Error('Missing PR merge parent');
      git('fetch', '--no-tags', '--quiet', '--depth=50', 'origin', base);
      const ancestors = git('log', '--first-parent', '--max-count=25', '--format=%H %T', base)
        .split('\n').map(line => { const [commit, tree] = line.split(' '); return { commit, tree }; });
      baseline = fullBaselineAncestor(ancestors, repository, baseRef, { query: api });
      if (!baseline) throw new Error('No trusted full-browser ancestor in bounded history');
      // Include all changes since the full baseline, including earlier targeted merges.
      changes = git('diff', '--name-status', '-M', baseline.commit, 'HEAD').split('\n').filter(Boolean).flatMap(line => {
        const [status, ...paths] = line.split('\t'); return paths.map(path => ({ status, path }));
      });
      const dirty = git('diff', '--name-only', 'HEAD');
      if (dirty) throw new Error(`Uncommitted generated inputs require full coverage: ${dirty.split('\n').slice(0, 5).join(', ')}`);
      forceFull = false;
    } catch (error) { fallbackReason = error.message; }
  } else fallbackReason = 'Manual, main/push, fork or unknown context requires full coverage';
  const inventory = JSON.parse(execFileSync(process.execPath, ['node_modules/playwright/cli.js', 'test', '--list', '--reporter=json'],
    { encoding: 'utf8', maxBuffer: 16_000_000 }));
  const files = new Set(git('ls-files').split('\n').filter(Boolean));
  const result = lanePlan({ metadata, baseline, changes, specs: [...files].filter(path => /^tests\/browser\/.*\.spec\.ts$/.test(path)),
    relevant: relevantFiles(files, read), dependencies: dependencyIndex(files, read), inventory, forceFull });
  if (fallbackReason) result.analysisReason = fallbackReason;
  fs.mkdirSync('.cache', { recursive: true });
  fs.writeFileSync(PLAN, JSON.stringify(result, null, 2));
  fs.writeFileSync('.cache/browser-test-list.txt', result.coverage.testList);
  console.error(`Browser lane ${result.coverage.lane}: ${result.analysisReason}; ${result.coverage.selected.length} selected, ${result.coverage.omitted.length} omitted.`);
  console.log(`lane=${result.coverage.lane}`);
}

function complete() {
  const input = JSON.parse(fs.readFileSync(PLAN, 'utf8'));
  if (input.tree !== git('rev-parse', 'HEAD^{tree}') || input.commit !== git('rev-parse', 'HEAD')
    || input.policySha256 !== currentPolicy() || input.runId !== Number(process.env.GITHUB_RUN_ID)
    || input.repository !== process.env.GITHUB_REPOSITORY) throw new Error('Browser plan identity changed');
  const record = completeLane(input, input.coverage.lane === 'none' ? undefined : JSON.parse(fs.readFileSync(REPORT, 'utf8')));
  fs.writeFileSync(EVIDENCE, JSON.stringify(record, null, 2));
  console.log(`Validated ${record.coverage.lane} browser evidence: ${record.coverage.selected.length} executed identities; ${record.coverage.omitted.length} explicitly omitted.`);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `\n### Browser coverage\n\nLane: **${record.coverage.lane}**. ${record.analysisReason}\n\nSelected: ${record.coverage.selected.length}; omitted: ${record.coverage.omitted.length}. `
    + `Passed: ${record.coverage.counts.passed}; intentional skips: ${record.coverage.counts.skipped}; expected failures: ${record.coverage.counts.expectedFailed}.\n\n`
    + `Full baseline: ${record.baseline ? `${record.baseline.commit} (run ${record.baseline.runId})` : 'not required for a full run'}.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv[2] === 'plan') plan();
    else if (process.argv[2] === 'complete') complete();
    else throw new Error('Use plan or complete');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
