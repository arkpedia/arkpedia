#!/usr/bin/env node
/** Public data is polled with this repository's own token; no cross-repository secret. */
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const DATA = 'arkpedia/arkpedia-data';
const APP = 'arkpedia/arkpedia';
const api = route => JSON.parse(execFileSync('gh', ['api', route], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }));
export function editorialPlan(comparison, busy = false) {
  if (busy) return { request: false, reason: 'A main preparation is already queued or running.' };
  if (['identical', 'behind'].includes(comparison.status)) return { request: false, reason: 'Editorial commits are already in data main.' };
  if (comparison.status !== 'ahead') throw new Error('Editorial branch must contain current data main. Pull data main into the editorial branch before pushing.');
  if (comparison.ahead_by > 100) throw new Error('Editorial branch is over 100 commits ahead of main; consolidate it before publishing.');
  const changed = comparison.files ?? [];
  if (changed.length >= 300) throw new Error('The compare may be truncated. Review this large change and prepare it manually.');
  const allowed = name => name.startsWith('source/') || name.endsWith('.md');
  if (changed.some(file => !allowed(file.filename) || (file.previous_filename && !allowed(file.previous_filename)))) throw new Error('Automatic editorial releases accept source records and documentation only. Submit workflow, script, or generated release changes through a reviewed pull request.');
  if (!changed.some(file => file.filename.startsWith('source/') || file.previous_filename?.startsWith('source/'))) return { request: false, reason: 'No source records changed.' };
  return { request: true, reason: 'Unpublished editorial source changes.' };
}
export function devPlan(comparison, busy = false) {
  if (busy) return { request: false, reason: 'A preparation is already queued or running.' };
  if (comparison && ['identical', 'ahead'].includes(comparison.status)) return { request: false, reason: 'Dev already includes shared data main.' };
  return { request: true, reason: 'Dev needs the shared data main revision.' };
}
const busy = branch => api(`repos/${APP}/actions/workflows/prepare-content.yml/runs?branch=${branch}&per_page=30`).workflow_runs.some(run => run.status !== 'completed');
const ref = branch => api(`repos/${DATA}/commits/${encodeURIComponent(branch)}`).sha;
const compare = (base, head) => api(`repos/${DATA}/compare/${base}...${head}`);
function dispatch(branch, revision, dryRun) {
  console.log(`${dryRun ? 'Would start' : 'Starting'} ${branch} preparation from data ${revision}, refresh_upstream=false.`);
  if (!dryRun) execFileSync('gh', ['workflow', 'run', 'prepare-content.yml', '--repo', APP, '--ref', branch, '-f', `data_ref=${revision}`, '-f', 'refresh_upstream=false'], { stdio: 'inherit' });
}
export function watch({ mode = 'poll', editorialBranch = process.env.ARKPEDIA_EDITORIAL_BRANCH || 'editorial', dryRun = false } = {}) {
  if (!['poll', 'dev'].includes(mode)) throw new Error('Mode must be poll or dev.');
  if (!/^[A-Za-z0-9][A-Za-z0-9_./-]*$/.test(editorialBranch) || ['main', 'dev', 'dev-live', 'live', 'heartbeat'].includes(editorialBranch)) throw new Error('Select a source-editing branch, not a generated release branch.');
  if (process.env.GITHUB_REPOSITORY && process.env.GITHUB_REPOSITORY !== APP) throw new Error('This watcher runs only in arkpedia/arkpedia.');
  const main = ref('main');
  const mainBusy = busy('main');
  if (mode === 'poll') {
    const head = ref(editorialBranch);
    const plan = editorialPlan(compare(main, head), mainBusy);
    console.log(plan.reason);
    if (plan.request) dispatch('main', head, dryRun);
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
