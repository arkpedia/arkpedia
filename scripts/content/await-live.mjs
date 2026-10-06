#!/usr/bin/env node
/**
 * Waits for arkpedia-data's live pointer to serve a release this run pushed to data main.
 *
 *   node scripts/content/await-live.mjs --revision <pushed data main commit> --repo <data clone>
 *        [--timeout-seconds 300] [--interval-seconds 15]
 *
 * The data repository's Content release workflow validates every push to main, then commits
 * live/current.json naming it. If that workflow fails (its validator is a separate copy and
 * has refused releases before), the push sits on main and readers keep the old release with
 * nothing to say so. This polls the live branch with git, which no CDN caches (readers get
 * current.json through raw.githubusercontent, which keeps it for five minutes).
 *
 * Live counts as advanced when it names the pushed commit, or a later data main commit that
 * contains it (the next push superseded this one). Prints one line saying what live serves;
 * exits 0 once advanced, 1 when the time runs out. ARKPEDIA_LIVE_TIMEOUT_SECONDS and
 * ARKPEDIA_LIVE_INTERVAL_SECONDS override the defaults.
 *
 * Once advanced it also writes `revision=<what live names>` to $GITHUB_OUTPUT when that is set:
 * the commit the page refresh after it waits for readers to see (scripts/content/refresh-pages.mjs).
 * Not the pushed one: when a later push superseded it, the pointer never names the pushed commit,
 * and the refresh waited out its nine minutes for it and ended on a warning that misled.
 */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const DATA_REPOSITORY = 'https://github.com/arkpedia/arkpedia-data.git';
const GIT_SHA = /^[a-f0-9]{40}$/;

function git(repo, args) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/** What the live branch serves now: its pointer's revision, or why it cannot be read. */
export function readLive(repo) {
  // Into refs of their own, so the clone's branches and remote-tracking refs are left alone.
  // Main too, for the commits a later pointer may name.
  for (const branch of ['main', 'live']) {
    try {
      git(repo, ['fetch', '--quiet', '--no-tags', DATA_REPOSITORY, `+refs/heads/${branch}:refs/live-check/${branch}`]);
    } catch (error) {
      return { error: `fetching the ${branch} branch of arkpedia-data failed (${String(error.stderr ?? error.message).trim().split('\n').at(-1)})` };
    }
  }
  try {
    const pointer = JSON.parse(git(repo, ['show', 'refs/live-check/live:current.json']));
    if (!GIT_SHA.test(pointer?.revision ?? '')) return { error: 'live/current.json names no revision' };
    return { revision: pointer.revision, release: pointer.release };
  } catch {
    return { error: 'arkpedia-data has no readable live/current.json' };
  }
}

/** Whether live serves the pushed commit or a data main commit that contains it. */
export function advanced(repo, pushed, live) {
  if (!live.revision) return false;
  if (live.revision === pushed) return true;
  try {
    git(repo, ['merge-base', '--is-ancestor', pushed, live.revision]);
    return true;
  } catch {
    return false;
  }
}

export async function awaitLive({ repo, revision, timeoutSeconds, intervalSeconds, sleep = seconds => new Promise(resolve => setTimeout(resolve, seconds * 1000)) }) {
  const started = Date.now();
  for (;;) {
    const live = readLive(repo);
    if (advanced(repo, revision, live)) {
      return { ok: true, served: live.revision, line: live.revision === revision ? `Live serves ${revision}.` : `Live serves ${live.revision}, a later data main commit that contains ${revision}.` };
    }
    const waited = Math.round((Date.now() - started) / 1000);
    if (waited + intervalSeconds > timeoutSeconds) {
      const now = live.error ?? `it still serves ${live.revision}`;
      return { ok: false, line: `Live has not moved to ${revision} after ${waited} s: ${now}.` };
    }
    await sleep(intervalSeconds);
  }
}

function main(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i += 2) opts[argv[i].replace(/^--/, '')] = argv[i + 1];
  if (!GIT_SHA.test(opts.revision ?? '') || !opts.repo) throw new Error('usage: await-live.mjs --revision <40-hex commit> --repo <data clone> [--timeout-seconds N] [--interval-seconds N]');
  const number = (value, fallback) => (Number.isFinite(Number(value)) && value !== undefined && value !== '' ? Number(value) : fallback);
  return awaitLive({
    repo: opts.repo,
    revision: opts.revision,
    timeoutSeconds: number(opts['timeout-seconds'] ?? process.env.ARKPEDIA_LIVE_TIMEOUT_SECONDS, 300),
    intervalSeconds: number(opts['interval-seconds'] ?? process.env.ARKPEDIA_LIVE_INTERVAL_SECONDS, 15),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(({ ok, served, line }) => {
    console.log(line);
    if (ok && process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `revision=${served}\n`);
    process.exitCode = ok ? 0 : 1;
  }, error => { console.error(error.message); process.exitCode = 2; });
}
