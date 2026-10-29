#!/usr/bin/env node
/**
 * Fills data/ and the public/*.json records from arkpedia-data, the one home of every game
 * record. This repository keeps website code only: Check, the browser specs, local dev and
 * every build read the records this writes, never a copy kept here.
 *
 *   node scripts/content/pull-data.mjs [--ref live|<branch>|<commit> | --pinned] [--if-missing]
 *
 * --pinned reads the commit tests/browser/data-pin.json names: the browser specs check the
 * site's behaviour against fixed records, so a nightly release cannot turn their Check red.
 *
 * --if-missing does nothing when data/ already holds records: predev, prebuild and pretest
 * run it, so a fresh checkout works without a separate step and a pulled one is left alone.
 *
 * --ref defaults to ARKPEDIA_DATA_REF, then to `live`: the commit live/current.json names,
 * which is what www serves. That data already passed main's `npm test` in the release job
 * that compiled it, so a unit test cannot fail on it for a reason main's code did not see.
 *
 * Only source/ is fetched, shallow and without other blobs (about 20 s and 116 MB on
 * 2026-10-29), into ARKPEDIA_DATA_CACHE or .cache/arkpedia-data, which later runs reuse.
 * hydrate-source.mjs then swaps the records in, exactly as the release job does. What was
 * pulled is written to .cache/data-source.json (outside data/, so no export publishes it).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const DATA_REPOSITORY = 'arkpedia/arkpedia-data';
export const LIVE_POINTER = `https://raw.githubusercontent.com/${DATA_REPOSITORY}/live/current.json`;
const COMMIT = /^[0-9a-f]{40}$/;

/** Where the pulled arkpedia-data checkout lives for the repository at `root`. */
export const dataCache = (root = process.cwd(), env = process.env) => path.resolve(env.ARKPEDIA_DATA_CACHE || path.join(root, '.cache/arkpedia-data'));
/** A record exactly as pulled, before any build step rewrote the working copy. */
export const pulledPath = (file, root = process.cwd(), env = process.env) => path.join(dataCache(root, env), 'source', file);
/** The data commit the browser specs run against (tests/browser/data-pin.json). */
export function pinnedRevision(root = process.cwd()) {
  const { revision } = JSON.parse(fs.readFileSync(path.join(root, 'tests/browser/data-pin.json'), 'utf8'));
  if (!COMMIT.test(revision ?? '')) throw new Error('tests/browser/data-pin.json names no commit');
  return revision;
}

/**
 * The top-level entries of data/ at the pinned commit, read from its tree alone (no file is
 * downloaded), or null when that cannot be read (offline, no pulled checkout yet).
 * test-data-records.ts holds these to having a reader; a record only the live data has yet
 * is arriving: the data lands first, then the code that reads it (README, "keeps code only").
 */
export function pinnedDataEntries(root = process.cwd(), env = process.env) {
  try {
    const revision = pinnedRevision(root);
    const cache = dataCache(root, env);
    if (!fs.existsSync(path.join(cache, '.git'))) return null;
    const quiet = args => execFileSync('git', args, { cwd: cache, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    try { quiet(['cat-file', '-e', `${revision}^{tree}`]); } catch { quiet(['fetch', '-q', '--depth', '1', '--filter=blob:none', 'origin', revision]); }
    return new Set(quiet(['ls-tree', '--name-only', `${revision}:source/data`]).split('\n').filter(Boolean));
  } catch {
    return null;
  }
}

/** What the last pull fetched (scripts/content/pull-data.mjs writes it), or null. */
export function pulledSource(root = process.cwd()) {
  try { return JSON.parse(fs.readFileSync(path.join(root, '.cache/data-source.json'), 'utf8')); } catch { return null; }
}
const REF = /^[A-Za-z0-9][A-Za-z0-9_./-]*$/;

/** The data commit or branch to pull: `live` resolves through the live pointer. */
export async function resolveDataRef(ref, fetchImpl = globalThis.fetch) {
  if (!ref || ref === 'live') {
    const response = await fetchImpl(LIVE_POINTER, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`${LIVE_POINTER}: HTTP ${response.status}`);
    const pointer = await response.json();
    if (!COMMIT.test(pointer?.revision ?? '')) throw new Error(`${LIVE_POINTER} names no commit`);
    return { ref: 'live', revision: pointer.revision, release: pointer.release ?? null };
  }
  if (!REF.test(ref) || ref.split('/').some(part => part === '..')) throw new Error(`Not a data ref: ${ref}`);
  return { ref, revision: COMMIT.test(ref) ? ref : null, release: null };
}

const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();

/** A shallow, source/-only checkout of `target` (a commit or branch) in `cache`. */
export function fetchSource(cache, target) {
  if (!fs.existsSync(path.join(cache, '.git'))) {
    fs.mkdirSync(cache, { recursive: true });
    git(cache, ['init', '-q']);
    git(cache, ['remote', 'add', 'origin', `https://github.com/${DATA_REPOSITORY}.git`]);
    git(cache, ['sparse-checkout', 'set', '--no-cone', '/source/']);
  }
  git(cache, ['fetch', '-q', '--depth', '1', '--filter=blob:none', 'origin', target]);
  git(cache, ['checkout', '-q', '--force', '--detach', 'FETCH_HEAD']);
  return git(cache, ['rev-parse', 'HEAD']);
}

async function main(argv) {
  const at = argv.indexOf('--ref');
  const root = process.cwd();
  const wanted = argv.includes('--pinned') ? pinnedRevision(root) : at >= 0 ? argv[at + 1] : process.env.ARKPEDIA_DATA_REF;
  if (!fs.existsSync(path.join(root, 'scripts/content/hydrate-source.mjs'))) throw new Error('Run from the repository root');
  if (argv.includes('--if-missing') && fs.existsSync(path.join(root, 'data/headhunting_banners.json'))) return;
  const cache = dataCache(root);
  const started = Date.now();
  const { ref, revision: pinned, release } = await resolveDataRef(wanted);
  const revision = fetchSource(cache, pinned ?? ref);
  execFileSync(process.execPath, ['scripts/content/hydrate-source.mjs', cache], { cwd: root, stdio: 'inherit' });
  // Two catalogues are built from the records, not published (export.mjs leaves them out).
  // Build them from what was just pulled, as the release job does before its tests.
  for (const builder of ['scripts/build/build-operator-search.ts', 'scripts/build/build-selector-catalogue.ts']) {
    execFileSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', builder], { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] });
  }
  const record = { repository: DATA_REPOSITORY, ref, revision, release, pulledAt: new Date().toISOString() };
  fs.mkdirSync(path.join(root, '.cache'), { recursive: true });
  fs.writeFileSync(path.join(root, '.cache/data-source.json'), `${JSON.stringify(record, null, 2)}\n`);
  console.log(`Pulled ${DATA_REPOSITORY}@${revision.slice(0, 9)} (${ref}) in ${Math.round((Date.now() - started) / 1000)} s.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => { console.error(`pull-data: ${error.message}`); process.exitCode = 1; });
}
