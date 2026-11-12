#!/usr/bin/env node
// API-only completion: no build and no provider credential. The content workflow
// retains its own publication gate, so a concurrent main update still fails closed.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { deploymentUrls, readBuildInfo, releaseFromRef, judge } from '../content/deploy-gate.mjs';

export async function resumePilotContent({ source, release, urls, head, findHeld, read, dispatch, isBusy = async () => false }) {
  if (!/^[a-f0-9]{40}$/.test(source ?? '') || release?.generator !== source) throw new Error('Expected exact released source');
  if (await head() !== source) return { action: 'obsolete' };
  const held = await findHeld();
  if (held === 'none') return { action: 'not-held' };
  if (!/^[1-9][0-9]*$/.test(String(held))) throw new Error('Invalid held-release issue');
  if (await isBusy()) return { action: 'already-running' };
  const deployments = await Promise.all(urls.map(read));
  const decision = judge({ release, deployments, pointer: 'live' });
  if (!decision.publish) return { action: 'waiting-for-readers', problems: decision.problems };
  if (await head() !== source) return { action: 'obsolete' };
  if (await isBusy()) return { action: 'already-running' };
  await dispatch();
  return { action: 'requested', heldIssue: Number(held), source };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const source = process.argv[2];
    if (process.argv.length !== 3 || !/^[a-f0-9]{40}$/.test(source ?? '')) throw new Error('Expected released source SHA');
    const gh = args => execFileSync('gh', args, { encoding: 'utf8', timeout: 30_000, maxBuffer: 4_000_000 }).trim();
    const result = await resumePilotContent({ source, release: releaseFromRef(source),
      urls: deploymentUrls({ ARKPEDIA_RELEASE_BRANCH: 'main' }), read: url => readBuildInfo(url),
      head: () => JSON.parse(gh(['api', 'repos/arkpedia/arkpedia/branches/main'])).commit.sha,
      findHeld: () => execFileSync(process.execPath, ['scripts/content/alert-issue.mjs', 'find', '--alert', 'content-release-held', '--title', 'Content release held'], { encoding: 'utf8', timeout: 30_000 }).trim(),
      isBusy: () => {
        const runs = JSON.parse(gh(['api', 'repos/arkpedia/arkpedia/actions/workflows/prepare-content.yml/runs?branch=main&per_page=30'])).workflow_runs;
        if (!Array.isArray(runs)) throw new Error('Invalid content run inventory');
        return runs.some(run => run.status !== 'completed');
      },
      dispatch: () => gh(['workflow', 'run', 'prepare-content.yml', '--repo', 'arkpedia/arkpedia', '--ref', 'main', '-f', 'refresh_upstream=true']),
    });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
