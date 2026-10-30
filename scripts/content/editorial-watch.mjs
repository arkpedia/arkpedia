#!/usr/bin/env node
/** Public data is polled with this repository's own token; no cross-repository secret. */
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { closeAlert, openAlert } from './alert-issue.mjs';

const DATA = 'arkpedia/arkpedia-data';
const APP = 'arkpedia/arkpedia';
const api = route => JSON.parse(execFileSync('gh', ['api', route], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }));
export function editorialPlan(comparison, busy = false) {
  if (busy) return { request: false, reason: 'A main preparation is already queued or running.' };
  if (['identical', 'behind'].includes(comparison.status)) return { request: false, reason: 'Editorial commits are already in data main.' };
  // Diverged is the usual case: each daily refresh moves main past the branch. The preparation
  // merges main in (merge_main), and fails on a conflict.
  if (!['ahead', 'diverged'].includes(comparison.status)) throw new Error(`GitHub compare answered ${JSON.stringify(comparison.status)}.`);
  if (comparison.ahead_by > 100) throw new Error('Editorial branch is over 100 commits ahead of main; consolidate it before publishing.');
  const changed = comparison.files ?? [];
  if (changed.length >= 300) throw new Error('The compare may be truncated. Review this large change and prepare it manually.');
  const allowed = name => name.startsWith('source/') || name.endsWith('.md');
  if (changed.some(file => !allowed(file.filename) || (file.previous_filename && !allowed(file.previous_filename)))) throw new Error('Automatic editorial releases accept source records and documentation only. Submit workflow, script, or generated release changes through a reviewed pull request.');
  if (!changed.some(file => file.filename.startsWith('source/') || file.previous_filename?.startsWith('source/'))) return { request: false, reason: 'No source records changed.' };
  return { request: true, reason: 'Unpublished editorial source changes.' };
}
// Editorial source commits not in data main this long are reported: an edit is compiled within
// minutes when nothing fails, so two hours means it is stuck. On 2026-10-13 a palette recipe
// failed every editorial compile, and it and two later edits waited nine hours unnoticed.
export const UNPUBLISHED_AFTER_HOURS = 2;
export const UNPUBLISHED_ALERT = 'editorial-unpublished';
export const UNPUBLISHED_TITLE = 'Editorial edits unpublished';
/**
 * Whether the editorial branch holds source edits data main has not published for too long:
 * { open: false } once they are in, else the issue body. The body names the commits by sha and
 * subject only (no ages or times, which change by themselves), so an unchanged backlog edits
 * nothing; a new stuck commit is news.
 */
export function unpublishedPlan(comparison, now = new Date()) {
  if (!comparison || !['ahead', 'diverged'].includes(comparison.status)) return { open: false };
  const commits = (comparison.commits ?? []).map(entry => ({
    sha: entry.sha, subject: String(entry.commit?.message ?? '').split('\n')[0],
    at: Date.parse(entry.commit?.committer?.date ?? entry.commit?.author?.date ?? ''),
  }));
  const oldest = Math.min(...commits.map(entry => entry.at).filter(Number.isFinite));
  if (!Number.isFinite(oldest) || now - oldest < UNPUBLISHED_AFTER_HOURS * 3_600_000) return { open: false, waiting: true };
  const listed = commits.map(entry => `- \`${entry.sha.slice(0, 12)}\` ${entry.subject}`).join('\n');
  return { open: true, body: `${commits.length} editorial commit(s) in arkpedia-data have not reached data main for over ${UNPUBLISHED_AFTER_HOURS} hours. `
    + 'An editorial edit is published within minutes unless its main preparation fails: see "Prepare content release" on main '
    + '(and the "Content release failing" issue) for the reason.\n\n'
    + `${listed}\n<!-- arkpedia-alert-digest:${commits.map(entry => entry.sha).sort().join(',')} -->` };
}
function reportUnpublished(comparison, dryRun) {
  const repo = process.env.GITHUB_REPOSITORY;
  const plan = unpublishedPlan(comparison);
  if (plan.waiting || dryRun || !repo) return;
  if (plan.open) console.log(`Unpublished editorial edits: ${openAlert({ repo, alert: UNPUBLISHED_ALERT, title: UNPUBLISHED_TITLE, body: plan.body, rewrite: true })}.`);
  else closeAlert({ repo, alert: UNPUBLISHED_ALERT, title: UNPUBLISHED_TITLE, comment: 'Every editorial commit is in data main.' });
}
/*
 * arkpedia-data's import (its import.yml) leaves its records on the `imports` branch, which the
 * nightly compile reads at 19:57. An import started after a game patch (its client-version
 * dispatcher) says so in its commit, "Import game records (<day>, patch)", and is compiled as
 * soon as this watcher sees it, so the patch's tables do not wait for the night. A compile
 * publishes the branch's head into data main, which then reads as identical or behind.
 */
export const PATCH_IMPORT = /^Import game records \([^)]*, patch\)$/;
export function importsPlan(comparison, busy = false) {
  if (!comparison || ['identical', 'behind'].includes(comparison.status)) return { request: false, reason: 'Every import is in data main.' };
  const commits = comparison.commits ?? [];
  const subject = String(commits.at(-1)?.commit?.message ?? '').split('\n')[0];
  if (!PATCH_IMPORT.test(subject)) return { request: false, reason: 'The imports branch waits for the nightly compile.' };
  if (busy) return { request: false, reason: 'A patch import is waiting, but a main preparation is already queued or running.' };
  return { request: true, reason: 'A patch import is not in data main yet.' };
}
export function devPlan(comparison, busy = false) {
  if (busy) return { request: false, reason: 'A preparation is already queued or running.' };
  if (comparison && ['identical', 'ahead'].includes(comparison.status)) return { request: false, reason: 'Dev already includes shared data main.' };
  return { request: true, reason: 'Dev needs the shared data main revision.' };
}
// A run that dispatched this watcher as its last step (ARKPEDIA_AFTER_RUN) is still in progress
// then, but has nothing left to publish: it is not busy.
export const isBusy = (runs, afterRun = '') => runs.some(run => run.status !== 'completed' && String(run.id) !== String(afterRun));
const busy = branch => isBusy(api(`repos/${APP}/actions/workflows/prepare-content.yml/runs?branch=${branch}&per_page=30`).workflow_runs, process.env.ARKPEDIA_AFTER_RUN);
const ref = branch => api(`repos/${DATA}/commits/${encodeURIComponent(branch)}`).sha;
const compare = (base, head) => api(`repos/${DATA}/compare/${base}...${head}`);
function dispatch(branch, revision, dryRun, mergeMain = false, refresh = false) {
  const inputs = [`data_ref=${revision}`, `refresh_upstream=${refresh}`, ...(mergeMain ? ['merge_main=true'] : [])];
  console.log(`${dryRun ? 'Would start' : 'Starting'} ${branch} preparation from data ${revision}, ${inputs.slice(1).join(', ')}.`);
  if (!dryRun) execFileSync('gh', ['workflow', 'run', 'prepare-content.yml', '--repo', APP, '--ref', branch, ...inputs.flatMap(input => ['-f', input])], { stdio: 'inherit' });
}
export function watch({ mode = 'poll', editorialBranch = process.env.ARKPEDIA_EDITORIAL_BRANCH || 'editorial', dryRun = false } = {}) {
  if (!['poll', 'dev'].includes(mode)) throw new Error('Mode must be poll or dev.');
  if (!/^[A-Za-z0-9][A-Za-z0-9_./-]*$/.test(editorialBranch) || ['main', 'dev', 'dev-live', 'live', 'heartbeat'].includes(editorialBranch)) throw new Error('Select a source-editing branch, not a generated release branch.');
  if (process.env.GITHUB_REPOSITORY && process.env.GITHUB_REPOSITORY !== APP) throw new Error('This watcher runs only in arkpedia/arkpedia.');
  const main = ref('main');
  const mainBusy = busy('main');
  if (mode === 'poll') {
    const head = ref(editorialBranch);
    const comparison = compare(main, head);
    // Reported before the plan, which throws on a branch it refuses to publish: that is
    // exactly when its edits stay out.
    reportUnpublished(comparison, dryRun);
    const plan = editorialPlan(comparison, mainBusy);
    console.log(plan.reason);
    if (plan.request) { dispatch('main', head, dryRun, true); return; }
    // The branch by name, not its head: the compile fetches it and runs the stages that stay here.
    let imports = null;
    try { imports = compare(main, 'imports'); }
    catch (error) { if (!String(error.stderr ?? error.message).includes('HTTP 404')) throw error; }
    const patch = importsPlan(imports, mainBusy);
    console.log(patch.reason);
    if (patch.request) dispatch('main', 'imports', dryRun, true, true);
    return;
  }
  if (mainBusy) { console.log('Waiting for main preparation before refreshing dev.'); return; }
  let comparison;
  try { comparison = compare(main, ref('dev')); }
  catch (error) { if (!String(error.stderr ?? error.message).includes('HTTP 404')) throw error; }
  const plan = devPlan(comparison);
  console.log(plan.reason);
  if (plan.request) dispatch('dev', main, dryRun);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) watch({ mode: process.argv.includes('--dev') ? 'dev' : 'poll', dryRun: process.argv.includes('--dry-run') });
