#!/usr/bin/env node
/**
 * The "Content release failing" issue, told by WHICH source failed, so it closes only when
 * that source has been compiled.
 *
 *   node scripts/content/release-failure.mjs record  --alert <id> --title <t> --body-file <f> [--source <sha>]
 *   node scripts/content/release-failure.mjs recover --alert <id> --title <t> --source <sha> --comment <text>
 *
 * Until 2026-10-13 any successful run closed the issue as "Recovered". An editorial edit
 * (compiled from the editorial commit, data_ref=<sha>) failed three runs in a row; a run of
 * data main that did not contain that commit then succeeded and closed the issue, while the
 * edit and two later ones stayed unpublished for nine hours with nothing open about it.
 *
 * `record` keeps every failing source commit in the issue body, one hidden line each
 * (<!-- arkpedia-failed-source:<sha> -->), merged with the ones already there, so a later
 * failure of another commit is not lost to the day's one-comment limit. `recover` closes the
 * issue only when the source this run compiled contains every one of them (a failure that
 * named no source, one before the data checkout, still closes on any success, as before);
 * otherwise it leaves the issue open and says which commit is still out.
 */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { closeAlert, findIssue, openAlert } from './alert-issue.mjs';

const SHA = /^[0-9a-f]{40}$/;
const SOURCE = /<!-- arkpedia-failed-source:([0-9a-f]{40}) -->/g;

/** The failing source commits an issue body records, in the order first recorded. */
export function failedSources(body) {
  return [...new Set([...String(body ?? '').matchAll(SOURCE)].map(match => match[1]))];
}

/** The issue body for a failure: its text, then every failing source, old and new. */
export function recordBody({ body, previous = '', source = null }) {
  const sources = failedSources(previous);
  if (source && !sources.includes(source)) sources.push(source);
  if (!sources.length) return body.trim();
  const listed = sources.map(sha => `- data \`${sha.slice(0, 12)}\` <!-- arkpedia-failed-source:${sha} -->`).join('\n');
  // The digest is the set of failing sources: a new one is news (the day's comment), another
  // failure of the same ones only refreshes the body.
  return `${body.trim()}\n\nSource commits that failed and are not published yet:\n${listed}\n` +
    `<!-- arkpedia-alert-digest:${[...sources].sort().join(',')} -->`;
}

/**
 * Whether a successful run that compiled `head` recovers the issue: every recorded failing
 * source must be `head` or an ancestor of it (`contains(sha, head)`).
 */
export function recoveryPlan({ body, head, contains }) {
  const sources = failedSources(body);
  if (!sources.length) return { close: true, missing: [] };
  if (!head || !SHA.test(head)) return { close: false, missing: sources };
  const missing = sources.filter(sha => sha !== head && !contains(sha, head));
  return { close: missing.length === 0, missing };
}

/** `sha` is in `head`'s history, asked of GitHub (the run's data checkout is shallow). */
function containsOnGitHub(sha, head) {
  try {
    const status = execFileSync('gh', ['api', `repos/arkpedia/arkpedia-data/compare/${sha}...${head}`, '--jq', '.status'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    return status === 'ahead' || status === 'identical';
  } catch {
    return false;
  }
}

function options(args) {
  const parsed = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!args[i].startsWith('--') || args[i + 1] === undefined) throw new Error(`Unexpected argument: ${args[i]}`);
    parsed[args[i].slice(2)] = args[i + 1];
  }
  return parsed;
}

function main([action, ...args]) {
  const repo = process.env.GITHUB_REPOSITORY;
  const opts = options(args);
  if (!repo || !opts.alert || !opts.title) throw new Error('Needs GITHUB_REPOSITORY, --alert and --title');
  const source = SHA.test(opts.source ?? '') ? opts.source : null;
  if (action === 'record') {
    const issue = findIssue(repo, opts.alert, opts.title);
    const body = recordBody({ body: fs.readFileSync(opts['body-file'], 'utf8'), previous: issue?.body, source });
    return openAlert({ repo, alert: opts.alert, title: opts.title, body, rewrite: failedSources(body).length > 0 });
  }
  if (action === 'recover') {
    const issue = findIssue(repo, opts.alert, opts.title);
    if (!issue) return 'none';
    const plan = recoveryPlan({ body: issue.body, head: source, contains: containsOnGitHub });
    if (plan.close) return closeAlert({ repo, alert: opts.alert, title: opts.title, comment: opts.comment ?? 'Recovered.' });
    console.log(`Left open: this run compiled data ${source ?? '(no source)'}, which does not contain the failing source ` +
      `${plan.missing.map(sha => sha.slice(0, 12)).join(', ')}.`);
    return 'still-failing';
  }
  throw new Error('usage: release-failure.mjs record|recover --alert <id> --title <title> ...');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(`${main(process.argv.slice(2))}`);
