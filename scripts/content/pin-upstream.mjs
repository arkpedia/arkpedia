#!/usr/bin/env node
/**
 * Resolves each upstream game-data mirror to ONE commit at the start of a refresh, so a
 * mirror that moves while the run is in progress cannot leave it with tables from two
 * versions.
 *
 *   node scripts/content/pin-upstream.mjs                       write data/upstream.lock.json
 *   node scripts/content/pin-upstream.mjs raw-url <repo> <path>  print a raw file URL at the pin
 *
 * The lock is published with the release, so the next run loads it with the rest of the
 * data and falls back to its commit for a mirror it cannot reach, with a warning instead of
 * a failed run. It has no timestamps on purpose: it changes only when a mirror moves.
 *
 * Every stage run by run-stage.mjs gets one environment variable per mirror (pinVariable),
 * holding the commit. A script that reads a mirror builds its URL from pinnedRef() (or
 * pinnedCommit() when it records the commit), a Python one from the variable itself:
 *   os.environ.get('ARKPEDIA_PIN_KENGXXIAO_ARKNIGHTSGAMEDATA') or 'master'
 * and scripts/lib/upstream.sh reads the variable for its clone by itself.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

export const LOCK = 'data/upstream.lock.json';
export const MIRRORS = [
  { repository: 'Kengxxiao/ArknightsGameData', branch: 'master' },
  { repository: 'ArknightsAssets/ArknightsGamedata', branch: 'master' },
  { repository: 'yuanyan3060/ArknightsGameResource', branch: 'main' },
  { repository: 'PuppiizSunniiz/ArknightsGameData_YoStar', branch: 'main' },
];
const sha = /^[a-f0-9]{40}$/;
// Names the runner filled in from the lock itself, which pinUpstream must not read back as
// a commit someone chose: that would freeze every run on the first lock it ever wrote.
export const INJECTED = 'ARKPEDIA_PINS_INJECTED';

/** ARKPEDIA_PIN_<OWNER>_<REPO>, upper case, every other character run an underscore. */
export const pinVariable = repository => `ARKPEDIA_PIN_${repository.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`;

export function readLock(root) {
  try {
    const lock = JSON.parse(fs.readFileSync(path.join(root, LOCK), 'utf8'));
    return lock?.version === 1 && lock.repositories && typeof lock.repositories === 'object' ? lock : null;
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return null;
    throw error;
  }
}

/** The pinned commits as environment variables, leaving any already set alone. */
export function pinEnvironment(root, env = process.env) {
  const lock = readLock(root);
  const pins = {};
  for (const [repository, entry] of Object.entries(lock?.repositories ?? {})) {
    const name = pinVariable(repository);
    if (sha.test(entry?.commit ?? '') && !env[name]) pins[name] = entry.commit;
  }
  if (Object.keys(pins).length) pins[INJECTED] = Object.keys(pins).join(',');
  return pins;
}

/**
 * One commit per mirror: a commit given in the environment, else the branch head, else the
 * previous lock's commit (with a warning), else none (with a warning; readers then use the
 * branch, as they did before pinning).
 */
export async function pinUpstream({ previous = null, resolve, env = {}, mirrors = MIRRORS }) {
  const injected = new Set(String(env[INJECTED] ?? '').split(',').filter(Boolean));
  const repositories = {}, warnings = [];
  for (const { repository, branch } of mirrors) {
    const variable = pinVariable(repository);
    const given = injected.has(variable) ? '' : String(env[variable] ?? '');
    let commit = null, source;
    if (sha.test(given)) { commit = given; source = 'given'; } else {
      try {
        commit = await resolve(repository, branch);
        if (!sha.test(commit ?? '')) throw new Error(`not a commit: ${JSON.stringify(commit)}`);
        source = 'resolved';
      } catch (error) {
        const last = previous?.repositories?.[repository]?.commit;
        if (sha.test(last ?? '')) {
          commit = last; source = 'last-known';
          warnings.push(`${repository}: cannot resolve ${branch} (${error.message}); using the last known commit ${last.slice(0, 12)}`);
        } else {
          commit = null; source = 'unpinned';
          warnings.push(`${repository}: cannot resolve ${branch} (${error.message}) and no earlier commit is known; its readers use the branch`);
        }
      }
    }
    repositories[repository] = { branch, commit, variable, source };
  }
  return { lock: { version: 1, repositories }, warnings };
}

const run = promisify(execFile);
/** The branch head, from git itself: no API token, no rate limit. */
export async function lsRemote(repository, branch) {
  const { stdout } = await run('git', ['ls-remote', '--exit-code', `https://github.com/${repository}.git`, `refs/heads/${branch}`],
    { timeout: 30_000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  return stdout.split(/\s/)[0];
}

/**
 * What a script of the refresh reads a mirror at: the commit pinned for this run, which
 * run-stage.mjs passes to every stage, else the mirror's branch, as before pinning. Only the
 * environment, never the lock: run by hand, a reader wants today's branch, not the commit
 * of the release it was hydrated from. A test holds every stage's scripts to this.
 */
export function pinnedRef(repository, env = process.env) {
  const mirror = MIRRORS.find(entry => entry.repository === repository);
  if (!mirror) throw new Error(`Not a pinned mirror: ${repository}`);
  const commit = String(env[pinVariable(repository)] ?? '');
  return sha.test(commit) ? commit : mirror.branch;
}

/** For readers that record the commit they read: the pin, else the branch head as
 * `head(repository, branch)` resolves it -- so a pinned run makes no API call for it. */
export async function pinnedCommit(repository, head, env = process.env) {
  const ref = pinnedRef(repository, env);
  return sha.test(ref) ? ref : head(repository, ref);
}

/** https://raw.githubusercontent.com/<repo>/<pinned commit, else branch>/<path> */
export function rawUrl(root, repository, file, env = process.env) {
  const mirror = MIRRORS.find(entry => entry.repository === repository);
  if (!mirror) throw new Error(`Not a pinned mirror: ${repository}`);
  const commit = env[pinVariable(repository)] || readLock(root)?.repositories?.[repository]?.commit;
  return `https://raw.githubusercontent.com/${repository}/${sha.test(commit ?? '') ? commit : mirror.branch}/${file}`;
}

async function main(argv) {
  const root = process.cwd();
  if (argv[0] === 'raw-url') {
    if (argv.length !== 3) throw new Error('usage: pin-upstream.mjs raw-url <owner/repo> <path>');
    console.log(rawUrl(root, argv[1], argv[2]));
    return;
  }
  const { lock, warnings } = await pinUpstream({ previous: readLock(root), resolve: lsRemote, env: process.env });
  const file = path.join(root, LOCK);
  fs.writeFileSync(`${file}.tmp`, `${JSON.stringify(lock, null, 2)}\n`);
  fs.renameSync(`${file}.tmp`, file);
  const actions = process.env.GITHUB_ACTIONS === 'true';
  for (const warning of warnings) console.log(actions ? `::warning title=Upstream mirror not pinned::${warning}` : `warning: ${warning}`);
  for (const [repository, { commit, source }] of Object.entries(lock.repositories)) {
    console.log(`  ${repository} at ${commit ? commit.slice(0, 12) : '(branch)'} (${source})`);
  }
  // Deliberately not exported to later workflow steps: none of them reads a mirror, and
  // npm test runs in one, where a pin in the environment would change what a test of a
  // reader's branch fallback sees. The lock file is the record; pinEnvironment reads it.
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(error => { console.error(error); process.exitCode = 1; });
}
