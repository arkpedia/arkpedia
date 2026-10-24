#!/usr/bin/env node
/*
 * Whether a Check needs the desktop and mobile browser regressions (.github/workflows/check.yml,
 * "Which browser regressions this change needs").
 *
 * That step is 14 of a full Check's 23 minutes on the NAS (846s of 23m, 2026-10-13), and a
 * change to an importer, a sync script, a unit test or another workflow cannot change what it
 * tests: the browser specs run against this checkout's build and bundled data/, which no
 * importer touches in a Check. So a change whose every file lies outside what the build and the
 * specs read skips it. Everything else in Check still runs.
 *
 * What they read is derived, not listed by hand (relevantFiles): pages/, components/, lib/,
 * styles/, public/, data/, config/ and tests/ wholesale (fs reads by path are invisible to an
 * import graph, so those folders count whole), every file at the top level (next.config.js,
 * package.json, playwright.config.ts...), the scripts package.json runs for build, start and
 * test:browser, and everything any of those imports, transitively, or names by path in a string.
 *
 * The skip is truthful only on top of a base that passed: the tree checked is the base plus
 * changes nothing in the step reads. The base must have trusted evidence of actual full
 * browser execution; a green draft-only, targeted-only or skipped workflow is insufficient.
 * An exact-tree merged PR proof may supply it with verified repository/branch provenance.
 * 2026-10-13 is why: main had been red behind cancelled Checks for a
 * day, and an importer-only pull request on top of it must still run the browser specs and
 * fail. A manual run (workflow_dispatch) is a full re-check and always runs them. So does any
 * doubt: no base, an unreachable API, an unreadable diff. Prints `run=true|false` for
 * $GITHUB_OUTPUT; the reasons go to stderr.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ARTIFACT_PREFIX } from './already-checked.mjs';
import { fullBrowserBaseline } from './full-browser-baseline.mjs';

/** Read whole: their files are read by path at build and test time, not only imported. */
export const WHOLE = ['pages/', 'components/', 'lib/', 'styles/', 'public/', 'data/', 'config/', 'tests/'];
/** The npm scripts the Build step and the browser step run (playwright's webServer is `start`). */
export const ENTRY_SCRIPTS = ['prebuild', 'build', 'postbuild', 'start', 'test:browser'];
/** A change to how the decision is made always runs the step it decides about. */
export const SELF = ['.github/workflows/check.yml', 'scripts/ci/browser-relevant.mjs', 'scripts/ci/already-checked.mjs'];
const CODE = /\.(?:[cm]?[jt]sx?|mts|cts)$/;
const EXTENSIONS = ['', '.ts', '.tsx', '.mts', '.mjs', '.js', '.jsx', '.cjs', '.json', '.d.ts', '.d.mts'];

const topLevel = file => !file.includes('/') && !file.endsWith('.md');
const inWhole = file => WHOLE.some(dir => file.startsWith(dir));

/** Module specifiers and path-like strings in one source file. */
export function references(source) {
  const out = new Set();
  const specifier = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)(['"`])([^'"`\n]+)\1/g;
  for (const match of source.matchAll(specifier)) out.add(match[2]);
  // A repository path written out: execFileSync('python3', ['scripts/x.py']), readFileSync('config/y.json').
  for (const match of source.matchAll(/['"`]((?:\.\/)?(?:scripts|lib|config|data|public|tests|components|pages|styles|infra)\/[^'"`\s$*{}]+)['"`]/g)) {
    out.add(match[1].replace(/^\.\//, ''));
  }
  return out;
}

/** The repository files a reference from `from` names: one file, a directory's files, or none. */
export function resolve(reference, from, files) {
  let base;
  if (reference.startsWith('@/')) base = reference.slice(2);
  else if (reference.startsWith('./') || reference.startsWith('../')) base = path.posix.normalize(path.posix.join(path.posix.dirname(from), reference));
  else if (/^(?:scripts|lib|config|data|public|tests|components|pages|styles|infra)\//.test(reference)) base = reference;
  else return [];
  base = base.replace(/\/$/, '');
  for (const extension of EXTENSIONS) if (files.has(base + extension)) return [base + extension];
  for (const extension of EXTENSIONS.slice(1)) if (files.has(`${base}/index${extension}`)) return [`${base}/index${extension}`];
  // A directory named whole (`node scripts/build/`, a glob root): every file under it counts.
  const prefix = `${base}/`;
  return [...files].filter(file => file.startsWith(prefix));
}

/** The npm scripts `names` run, following `npm run x` chains, and the repository paths they name. */
export function scriptPaths(scripts, names, files) {
  const seen = new Set(), paths = new Set(), queue = [...names];
  while (queue.length) {
    const name = queue.shift();
    if (seen.has(name) || typeof scripts[name] !== 'string') continue;
    seen.add(name);
    for (const match of scripts[name].matchAll(/npm run ([\w:.-]+)/g)) queue.push(match[1]);
    for (const match of scripts[name].matchAll(/(?:^|\s)((?:scripts|lib|tests|config)\/[^\s'"&|;]+)/g)) {
      for (const file of resolve(match[1], 'package.json', files)) paths.add(file);
    }
  }
  return paths;
}

/** Every repository file the Build step and the browser step read. `read(file)` gives a file's text. */
export function relevantFiles(files, read) {
  const relevant = new Set(SELF.filter(file => files.has(file)));
  const queue = [];
  const add = file => { if (!relevant.has(file)) { relevant.add(file); queue.push(file); } };
  for (const file of files) if (topLevel(file) || inWhole(file)) add(file);
  const scripts = JSON.parse(read('package.json') ?? '{}').scripts ?? {};
  for (const file of scriptPaths(scripts, ENTRY_SCRIPTS, files)) add(file);
  while (queue.length) {
    const file = queue.shift();
    // public/ and data/ are read whole already; their JSON and bundles import nothing of ours.
    if (!CODE.test(file) || file.startsWith('public/') || file.startsWith('data/')) continue;
    const source = read(file);
    if (source == null) continue;
    for (const reference of references(source)) for (const target of resolve(reference, file, files)) add(target);
  }
  return relevant;
}

/**
 * The decision for `changes` ([{status, path}] from git diff --name-status, a rename giving both
 * paths). A deleted file counts by where it was: one the build or the specs read was imported by
 * a file that must change with it, which is itself read, so only its folder needs looking at.
 */
export function decide(changes, relevant) {
  const read = [], unread = [];
  for (const { status = 'M', path: file } of changes) {
    const counts = topLevel(file) || inWhole(file) || SELF.includes(file) || (!status.startsWith('D') && relevant.has(file));
    (counts ? read : unread).push(file);
  }
  return { run: read.length > 0 || unread.length === 0, read, unread };
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const api = route => JSON.parse(execFileSync('gh', ['api', route], { encoding: 'utf8' }));

/** The commit this checkout's changes are measured from, or null. */
function baseCommit(event) {
  if (event === 'pull_request') {
    // The merge result (refs/pull/N/merge): its first parent is the base branch as merged
    // against. A shallow commit still names its parents.
    return git('cat-file', '-p', 'HEAD').match(/^parent ([0-9a-f]{40})$/m)?.[1] ?? null;
  }
  if (event === 'push') {
    const before = process.env.BEFORE ?? '';
    return /^[0-9a-f]{40}$/.test(before) && !/^0+$/.test(before) ? before : null;
  }
  return null;
}

/** A green draft/targeted workflow is insufficient: require actual full browser execution. */
export function baselineForCommit(base, repository, baseRef, { query = api, treeOf = commit => git('rev-parse', `${commit}^{tree}`) } = {}) {
  if (!baseRef) return null;
  const tree = treeOf(base);
  const jobCache = new Map();
  function full(run, artifact) {
    if (!run?.id || run.event === 'pull_request' && !artifact) return null;
    let record = run;
    // GitHub can remove pull_requests[] after merge/head deletion. Recover only
    // through matching, merged same-repository PR metadata and its actual merge tree.
    if (run.event === 'pull_request' && Array.isArray(run.pull_requests) && !run.pull_requests.length) {
      if (!/^[a-f0-9]{40}$/.test(run.head_sha ?? '')) return null;
      const associated = query(`repos/${repository}/commits/${run.head_sha}/pulls?per_page=100`);
      if (!Array.isArray(associated) || associated.length >= 100) return null;
      const matches = associated.filter(pr => pr.head?.repo?.full_name === repository && pr.head.sha === run.head_sha
        && pr.base?.repo?.full_name === repository && pr.base.ref === baseRef && pr.merged_at
        && /^[a-f0-9]{40}$/.test(pr.merge_commit_sha ?? ''));
      if (matches.length !== 1) return null;
      const merged = query(`repos/${repository}/git/commits/${matches[0].merge_commit_sha}`);
      if (merged.tree?.sha !== tree) return null;
      record = { ...run, pull_requests: matches };
    }
    if (!jobCache.has(run.id)) {
      const response = query(`repos/${repository}/actions/runs/${run.id}/jobs?filter=latest&per_page=100`);
      jobCache.set(run.id, Array.isArray(response.jobs) && response.total_count === response.jobs.length ? response.jobs : []);
    }
    return fullBrowserBaseline({ run: record, jobs: jobCache.get(run.id), repository, baseRef, commit: base, tree, artifact });
  }
  const runs = query(`repos/${repository}/actions/workflows/check.yml/runs?head_sha=${base}&status=success&per_page=10`).workflow_runs ?? [];
  for (const run of runs) { const proof = full(run); if (proof) return proof; }
  const { artifacts = [] } = query(`repos/${repository}/actions/artifacts?name=${ARTIFACT_PREFIX}${tree}&per_page=20`);
  for (const artifact of artifacts) {
    if (artifact.expired) continue;
    const run = query(`repos/${repository}/actions/runs/${artifact.workflow_run?.id}`);
    const proof = full(run, artifact);
    if (proof) return proof;
  }
  return null;
}

export const passed = (...args) => !!baselineForCommit(...args);

function main() {
  const say = message => console.error(message);
  const event = process.env.EVENT ?? '';
  const repository = process.env.GITHUB_REPOSITORY ?? '';
  try {
    if (event === 'workflow_dispatch') { say('A manual Check is a full re-check: running the browser regressions.'); return 'true'; }
    const base = baseCommit(event);
    if (!base) { say(`No base commit for this ${event || 'unknown'} event: running the browser regressions.`); return 'true'; }
    git('fetch', '--no-tags', '--quiet', '--depth=1', 'origin', base);
    const baseRef = event === 'pull_request' ? process.env.GITHUB_BASE_REF : process.env.GITHUB_REF_NAME;
    if (!passed(base, repository, baseRef)) {
      say(`The base ${base.slice(0, 12)} has no green Check, so nothing vouches for the rest of the tree: running the browser regressions.`);
      return 'true';
    }
    const changes = git('diff', '--name-status', '-M', base, 'HEAD').split('\n').filter(Boolean).flatMap(line => {
      const [status, ...paths] = line.split('\t');
      return paths.map(file => ({ status, path: file }));
    });
    const files = new Set(git('ls-files').split('\n').filter(Boolean));
    const relevant = relevantFiles(files, file => { try { return fs.readFileSync(file, 'utf8'); } catch { return null; } });
    const { run, read, unread } = decide(changes, relevant);
    if (!changes.length) { say('No file changed against the base: running the browser regressions.'); return 'true'; }
    if (run) {
      say(`Running the browser regressions: ${read.length} of ${changes.length} changed file(s) are read by the site build or the browser tests:`);
      for (const file of read) say(`  ${file}`);
      return 'true';
    }
    say(`Browser regressions skipped: ${changes.length} changed file(s) against ${base.slice(0, 12)} (green), none read by the site build or browser tests (${relevant.size} files are):`);
    for (const file of unread) say(`  ${file}`);
    return 'false';
  } catch (error) {
    say(`Could not decide (${String(error.message).split('\n')[0]}): running the browser regressions.`);
    return 'true';
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(`run=${main()}`);
