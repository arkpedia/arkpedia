#!/usr/bin/env node
/**
 * Whether the content run a dev deploy starts refreshes the upstream records (prepare-content's
 * refresh_upstream), or only compiles data main's records with the deployed code.
 *
 *   node scripts/content/dev-refresh.mjs     prints true or false, for the checked-out commit
 *
 * Why: every green dev deploy started a full upstream refresh -- every scraper and importer,
 * against every source -- so the load on the sources grew with the number of dev merges, and
 * each run held a NAS runner that main's Check and Deploy wait for. A refresh only shows
 * something new when the commit changes what the refresh runs: a stage's script, a module one
 * imports, the stage list, a config or data file a stage reads (REFRESH_PATHS; test-content-
 * channel.ts holds it to every file the refresh's stages reach). Any other commit -- a page, a
 * component, a style -- gets refresh_upstream=false, which still compiles data main's records
 * with dev's page builders, so what it does to the pages still shows on arkpedia-dev. Dev's
 * nightly run, started after main's scheduled one (start-dev, prepare-content.yml), refreshes
 * whatever changed, so a commit this misjudges normally waits until that run.
 *
 * What counts is the commit against its first parent (Deploy checks out both). When that diff
 * cannot be read, the answer is true, and when this script itself fails, Deploy's step takes
 * anything but a plain false as true: the old behaviour, never a missed change.
 *
 * Where a change still waits longer than that night, as the queues work (nothing here guards
 * against these):
 *   - Dev's runs share one queue that cancels the run in progress whenever a newer one starts
 *     (prepare-content.yml's concurrency), whatever either one's refresh_upstream. A refreshing
 *     run superseded by a compile-only one -- a page change deployed while the refresh still
 *     ran -- leaves the refresh undone, and so does the nightly run's: a dev deploy during it
 *     cancels the day's refresh. The change then waits for the next refreshing run that
 *     finishes: the next night's, or the deploy of a commit that touches REFRESH_PATHS.
 *   - Only the deployed commit is diffed. A push of several commits (a rebase merge) deploys its
 *     last one; a Check cancelled by a newer push (check.yml's concurrency) or a Deploy replaced
 *     while it waited in its branch's queue (deploy.yml holds one pending run) never deploys its
 *     commit, and the next deploy carries it. A refresh path that an earlier commit changed is
 *     then not in the diff, and the change waits for the nightly run. A merge commit's first
 *     parent is dev before the merge, so a pull request merged with one is diffed whole.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** What the refresh's stages run or read: a folder (ending in /) or one file. */
export const REFRESH_PATHS = [
  '.github/workflows/prepare-content.yml', 'package.json', 'package-lock.json', 'config/', 'data/',
  'scripts/audits/', 'scripts/build/', 'scripts/content/', 'scripts/imports/', 'scripts/lib/', 'scripts/palettes/',
  'scripts/stage-pipeline/', 'scripts/sync/',
  'lib/farming/', 'lib/gacha/', 'lib/guesser/', 'lib/minigames/', 'lib/music/', 'lib/music-guesser/', 'lib/operators/',
  'lib/pulls/', 'lib/schedule/', 'lib/skins/', 'lib/stages/',
];

export const refreshes = file => REFRESH_PATHS.some(entry => (entry.endsWith('/') ? file.startsWith(entry) : file === entry));

/** Whether a commit that changed these files needs the upstream refresh. */
export const needsRefresh = files => files.some(refreshes);

/** The files the checked-out commit changed against its first parent. */
export function changedFiles({ cwd = process.cwd() } = {}) {
  return execFileSync('git', ['diff', '--name-only', 'HEAD^1', 'HEAD'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).split('\n').filter(Boolean);
}

export function decide({ cwd, log = console.error } = {}) {
  let files;
  try {
    files = changedFiles({ cwd });
  } catch (error) {
    log(`Cannot list what this commit changed (${String(error.stderr ?? error.message).trim().split('\n').at(-1)}): refreshing upstream, to be safe.`);
    return true;
  }
  const refresh = needsRefresh(files);
  const shown = files.filter(refreshes).slice(0, 5);
  log(refresh
    ? `This commit changes what the refresh runs (${shown.join(', ')}${files.filter(refreshes).length > shown.length ? ', ...' : ''}): refreshing upstream.`
    : `This commit changes nothing the refresh runs (${files.length} file(s)): compiling data main's records with it, no upstream refresh.`);
  return refresh;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  console.log(String(decide()));
}
