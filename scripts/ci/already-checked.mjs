#!/usr/bin/env node
/*
 * Whether a push to main is code a pull request's Check already passed, so Check need not
 * run it again (.github/workflows/check.yml, the `seen` job).
 *
 * A pull request's Check runs on its merge result (refs/pull/N/merge) and, when green,
 * uploads an empty artifact named checked-tree-<tree>, the git tree of that result. When
 * main has not moved since, merging the pull request makes a commit with that same tree,
 * so the code is the code already checked, and Deploy can follow at once. When anything
 * else landed in between, the tree differs and the full Check runs.
 *
 * Only a completed, successful Check of a pull_request event from this repository counts:
 * not a fork's run, not a run that uploaded and then failed, not another workflow. Any
 * doubt (the API unreachable, no match) prints checked=false, and the full Check runs.
 *
 * Prints `checked=true|false` for $GITHUB_OUTPUT; the reason goes to stderr.
 */
import { execFileSync } from 'node:child_process';

export const ARTIFACT_PREFIX = 'checked-tree-';

/** The run among `runs` that vouches for `tree`, or null. `artifacts` are those named for
 *  it; `runs` maps a run id to that run's API record. */
export function vouching(tree, artifacts, runs, repository) {
  for (const artifact of artifacts) {
    if (artifact.name !== `${ARTIFACT_PREFIX}${tree}` || artifact.expired) continue;
    const run = runs[artifact.workflow_run?.id];
    if (!run) continue;
    if (run.status !== 'completed' || run.conclusion !== 'success') continue;
    if (run.event !== 'pull_request') continue;
    if (run.path !== '.github/workflows/check.yml') continue;
    if (run.repository?.full_name !== repository || run.head_repository?.full_name !== repository) continue;
    return run;
  }
  return null;
}

function api(path) {
  return JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8' }));
}

async function main() {
  const repository = process.env.GITHUB_REPOSITORY;
  const tree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim();
  try {
    const { artifacts = [] } = api(`repos/${repository}/actions/artifacts?name=${ARTIFACT_PREFIX}${tree}&per_page=20`);
    const runs = {};
    for (const artifact of artifacts) {
      const id = artifact.workflow_run?.id;
      if (id && !runs[id]) runs[id] = api(`repos/${repository}/actions/runs/${id}`);
    }
    const run = vouching(tree, artifacts, runs, repository);
    if (run) {
      console.error(`Tree ${tree.slice(0, 12)} passed Check in pull request run ${run.html_url}; not checking it again.`);
      console.log('checked=true');
      return;
    }
    console.error(`No green pull request Check of tree ${tree.slice(0, 12)}; running the full Check.`);
  } catch (error) {
    console.error(`Could not look for an earlier Check (${String(error.message).split('\n')[0]}); running the full Check.`);
  }
  console.log('checked=false');
}

if (import.meta.url === `file://${process.argv[1]}`) main();
