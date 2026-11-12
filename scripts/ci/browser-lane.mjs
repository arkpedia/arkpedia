#!/usr/bin/env node
// Execute the existing suites proportionally; only completed coverage can become evidence.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { browserPlan, dependencyIndex } from './browser-plan.mjs';
import { dataReaders, releaseBrowserPlan, specRoutes } from './release-browser-plan.mjs';
import { coveragePlan, executionEvidence } from './browser-coverage.mjs';
import { relevantFiles } from './browser-relevant.mjs';
import { fullBaselineAncestor } from './browser-baseline.mjs';
import { BROWSER_POLICY, POLICY_FILES, policyFingerprint, validateBrowserEvidence } from './browser-evidence.mjs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 16_000_000 }).trim();
const api = path => JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8', maxBuffer: 16_000_000 }));
const read = path => { try { return fs.readFileSync(path, 'utf8'); } catch { return null; } };
const PLAN = '.cache/browser-plan.json', REPORT = '.cache/browser-results.json', EVIDENCE = '.cache/browser-evidence.json';

/** The live-content build only redirects these generated type references. Any other edit stays dirty. */
export function canonicalNextTypeRewrite(head, working) {
  if (typeof head !== 'string' || typeof working !== 'string') return false;
  let expected = head.replaceAll('\r\n', '\n');
  const actual = working.replaceAll('\r\n', '\n');
  if (expected.includes('\r') || actual.includes('\r')) return false;
  for (const name of ['routes', 'root-params']) {
    const from = `import "./.next/types/${name}.d.ts";`;
    if (expected.split(from).length !== 2) return false;
    expected = expected.replace(from, `import "./.next-live/types/${name}.d.ts";`);
  }
  return actual === expected;
}

export function unexpectedBrowserInputs(paths, readHead, readWorking) {
  return paths.filter(path => path !== 'next-env.d.ts' || !canonicalNextTypeRewrite(readHead(path), readWorking(path)));
}

export function currentPolicy() {
  return policyFingerprint(Object.fromEntries(POLICY_FILES.map(path => [path, git('rev-parse', `HEAD:${path}`)])));
}

/**
 * Which Checks may run less than the full browser suite: a same-repository PR, and a push to
 * main that no PR Check vouched for (main moved under the PR between its Check and its merge,
 * so the merged tree is new). Both are measured from the newest full-browser ancestor; main's
 * first parent is the main it was merged onto, as a PR merge result's is. A manual run, a
 * fork's PR and any other push keep the full suite.
 */
export function laneScope({ event, ref, headRepository, repository }) {
  if (!repository) return null;
  if (event === 'pull_request') return headRepository === repository ? 'pull_request' : null;
  return event === 'push' && ref === 'refs/heads/main' ? 'main' : null;
}

export function lanePlan({ metadata, baseline, changes, specs, relevant, dependencies, routes, readers, inventory, forceFull = false, releaseProfile = false }) {
  let plan = browserPlan({ changes, specs, relevant, dependencies, baselineVerified: !!baseline, forceFull });
  if (releaseProfile && !forceFull) plan = releaseBrowserPlan(plan, { changes, specs, baselineVerified: !!baseline, dependencies, routes, relevant, readers });
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
  const scope = laneScope({ event, ref: process.env.GITHUB_REF, headRepository: process.env.BROWSER_HEAD_REPOSITORY, repository });
  const mainPush = scope === 'main', scoped = scope !== null;
  if (scoped) {
    try {
      const base = git('cat-file', '-p', 'HEAD').match(/^parent ([a-f0-9]{40})$/m)?.[1];
      if (!base) throw new Error(mainPush ? 'Missing main parent' : 'Missing PR merge parent');
      git('fetch', '--no-tags', '--quiet', '--depth=250', 'origin', base);
      const ancestors = git('log', '--first-parent', '--max-count=200', '--format=%H %T', base)
        .split('\n').map(line => { const [commit, tree] = line.split(' '); return { commit, tree }; });
      baseline = fullBaselineAncestor(ancestors, repository, baseRef, { query: api });
      if (!baseline) throw new Error('No trusted full-browser ancestor in bounded history');
      // Include all changes since the full baseline, including earlier targeted merges.
      changes = git('diff', '--name-status', '-M', baseline.commit, 'HEAD').split('\n').filter(Boolean).flatMap(line => {
        const [status, ...paths] = line.split('\t'); return paths.map(path => ({ status, path }));
      });
      const dirty = git('diff', '--name-only', 'HEAD').split('\n').filter(Boolean);
      const unexpected = unexpectedBrowserInputs(dirty,
        path => execFileSync('git', ['show', `HEAD:${path}`], { encoding: 'utf8' }), read);
      if (unexpected.length) throw new Error(`Uncommitted generated inputs require full coverage: ${unexpected.slice(0, 5).join(', ')}`);
      if (dirty.length) console.error('Verified canonical Next live-build type references; no other generated input changed.');
      forceFull = false;
    } catch (error) { fallbackReason = error.message; }
  } else fallbackReason = 'Manual, branch push, fork or unknown context requires full coverage';
  const inventory = JSON.parse(execFileSync(process.execPath, ['node_modules/playwright/cli.js', 'test', '--list', '--reporter=json'],
    { encoding: 'utf8', maxBuffer: 16_000_000 }));
  const files = new Set(git('ls-files').split('\n').filter(Boolean));
  const specs = [...files].filter(path => /^tests\/browser\/.*\.spec\.ts$/.test(path));
  const result = lanePlan({ metadata, baseline, changes, specs,
    relevant: relevantFiles(files, read), dependencies: dependencyIndex(files, read), routes: specRoutes(specs, read),
    readers: file => dataReaders(file, files, read), inventory, forceFull,
    releaseProfile: scoped });
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
