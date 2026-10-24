#!/usr/bin/env node
/* Production releases may be cherry-picked, so merge main back into dev after each one.
 * A temporary integration branch gets a full Check; only that exact green commit may
 * fast-forward dev. No force pushes, ours strategy, or automatic conflict resolutions.
 * GITHUB_TOKEN does not start push workflows: dispatch Check, Deploy and the CF sync
 * explicitly. Deploy is pinned to the tested SHA, even if dev moves meanwhile. */
import fs from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { openAlert, closeAlert } from '../content/alert-issue.mjs';

export const PREFIX = 'sync/main-to-dev-';
const BRANCH = /^sync\/main-to-dev-([a-f0-9]{12})-([a-f0-9]{12})$/;
const SHA = /^[a-f0-9]{40}$/;
const ALERT = 'main-dev-sync';
const TITLE = 'Production changes could not sync into dev';

export function eligible(run, repo, workflowId) {
  return run?.event === 'workflow_dispatch' && run.workflow_id === workflowId
    && run.head_repository?.full_name === repo && BRANCH.test(run.head_branch ?? '')
    && SHA.test(run.head_sha ?? '') && run.status === 'completed';
}

export async function prepare(d) {
  d.fetch();
  const main = d.sha('origin/main'), dev = d.sha('origin/dev');
  if (d.ancestor(main, dev)) {
    await d.syncCloudflare();
    await d.clear();
    return { status: 'current', main, dev };
  }
  const branch = `${PREFIX}${main.slice(0, 12)}-${dev.slice(0, 12)}`;
  const existing = await d.ref(branch);
  let head;
  if (existing) {
    d.fetchBranch(branch);
    const parents = d.parents(existing);
    if (parents.length !== 2 || parents[0] !== dev || parents[1] !== main) {
      throw new Error(`Integration branch ${branch} was modified; refusing to overwrite it.`);
    }
    head = existing;
  } else {
    const merged = d.merge(dev, main);
    if (merged.conflicts) throw new Error(`Merge main into dev needs a reviewed resolution. No branch was changed.\n\nConflicting files:\n${merged.conflicts.map(file => `- ${file}`).join('\n')}`);
    head = merged.sha;
    await d.publish(branch, head);
  }
  await d.check(branch);
  return { status: 'checking', branch, head, main, dev };
}

export async function finish(d, run) {
  if (!eligible(run, d.repo, await d.checkWorkflowId())) return { status: 'ignored' };
  const { head_branch: branch, head_sha: head } = run;
  if (await d.ref(branch) !== head) return { status: 'obsolete' };
  if (run.conclusion !== 'success') throw new Error(`Integration Check ${run.html_url} ended with ${run.conclusion}. Dev was not updated. Retry this Check for a transient failure; resolve a regression through a reviewed branch, then dispatch the sync again to check a fresh merge.`);
  d.fetch();
  d.fetchBranch(branch);
  const [, mainPrefix, devPrefix] = BRANCH.exec(branch);
  const parents = d.parents(head);
  if (parents.length !== 2 || !parents[0].startsWith(devPrefix) || !parents[1].startsWith(mainPrefix)) {
    throw new Error('Integration commit parents do not match its branch; refusing to update dev.');
  }
  const main = d.sha('origin/main'), dev = d.sha('origin/dev');
  // Another release or feature landed while Check ran: build and check a fresh merge.
  if (!d.ancestor(main, head) || !d.ancestor(dev, head)) return prepare(d);
  // GitHub rejects a non-fast-forward atomically, including a dev push racing this one.
  // The checked commit itself becomes dev, keeping main ancestry and the exact tested tree.
  if (dev !== head) {
    try { await d.advanceDev(head); }
    catch (error) {
      d.fetch();
      if (d.sha('origin/dev') !== dev) return prepare(d);
      throw error;
    }
  }
  await d.deploy(head);
  await d.syncCloudflare();
  await d.remove(branch);
  await d.clear();
  return { status: 'synced', main, dev: head };
}

/** Check's notifier explicitly dispatches this workflow before its own job finalizes.
 * Read the authoritative run record, allowing only that short finalization delay. */
export async function resume(d, id, { pause = () => new Promise(resolve => setTimeout(resolve, 5000)), attempts = 24 } = {}) {
  if (!/^[1-9][0-9]{0,15}$/.test(String(id))) throw new Error('Expected a numeric Check run ID.');
  for (let attempt = 0; attempt < attempts; attempt++) {
    const run = await d.run(id);
    if (run.status === 'completed') return finish(d, run);
    if (attempt < attempts - 1) await pause();
  }
  throw new Error(`Check run ${id} has not finalized; dev was not updated. Rerun the sync with checked_run=${id} once it finishes.`);
}

export function runtime(repo, { cwd = process.cwd(), request } = {}) {
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8', cwd }).trim();
  const api = request ?? ((endpoint, method = 'GET', body) => {
    const args = ['api', `repos/${repo}/${endpoint}`, '--method', method];
    if (body !== undefined) args.push('--input', '-');
    const output = execFileSync('gh', args, { encoding: 'utf8', input: body === undefined ? undefined : JSON.stringify(body) });
    return output.trim() ? JSON.parse(output) : undefined;
  });
  const dispatch = (workflow, ref, inputs) => api(`actions/workflows/${workflow}/dispatches`, 'POST', { ref, ...(inputs ? { inputs } : {}) });
  return {
    repo,
    fetch: () => git('fetch', 'origin', '+refs/heads/main:refs/remotes/origin/main', '+refs/heads/dev:refs/remotes/origin/dev'),
    fetchBranch: branch => git('fetch', 'origin', `refs/heads/${branch}:refs/remotes/origin/${branch}`),
    sha: ref => git('rev-parse', '--verify', ref),
    parents: sha => git('show', '-s', '--format=%P', sha).split(' ').filter(Boolean),
    ancestor: (base, head) => {
      const result = spawnSync('git', ['merge-base', '--is-ancestor', base, head], { cwd });
      if (result.status !== 0 && result.status !== 1) throw new Error('Could not establish Git ancestry.');
      return result.status === 0;
    },
    ref: branch => {
      // A missing ref is normal, but an API permission/network failure must not be.
      try { return api(`git/ref/heads/${branch}`).object.sha; }
      catch (error) {
        if (error.status === 404 || /HTTP 404/.test(String(error.stderr))) return null;
        throw error;
      }
    },
    merge: (dev, main) => {
      git('checkout', '--detach', dev);
      git('config', 'user.name', 'github-actions[bot]');
      git('config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com');
      const result = spawnSync('git', ['merge', '--no-ff', '-m', `Sync main into dev after ${main.slice(0, 12)}`, main], { encoding: 'utf8', cwd });
      if (result.status !== 0) {
        const conflicts = git('diff', '--name-only', '--diff-filter=U').split('\n').filter(Boolean);
        git('merge', '--abort');
        if (!conflicts.length) throw new Error(`Merge failed: ${result.stderr}`);
        return { conflicts };
      }
      return { sha: git('rev-parse', 'HEAD') };
    },
    publish: (branch, head) => git('push', 'origin', `${head}:refs/heads/${branch}`),
    check: branch => dispatch('check.yml', branch, { reuse_pr_check: 'true' }),
    checkWorkflowId: () => api('actions/workflows/check.yml').id,
    run: id => api(`actions/runs/${id}`),
    advanceDev: head => api('git/refs/heads/dev', 'PATCH', { sha: head, force: false }),
    deploy: head => dispatch('deploy.yml', 'dev', { preview: 'false', commit: head }),
    syncCloudflare: () => dispatch('sync-cloudflare.yml', 'dev'),
    remove: branch => api(`git/refs/heads/${branch}`, 'DELETE'),
    clear: () => closeAlert({ repo, alert: ALERT, title: TITLE, comment: 'Production history is included in dev; the Cloudflare sync has been dispatched.' }),
  };
}

async function main() {
  const repo = process.env.GITHUB_REPOSITORY;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo ?? '')) throw new Error('GITHUB_REPOSITORY is required.');
  const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const d = runtime(repo);
  try {
    const result = event.inputs?.checked_run ? await resume(d, event.inputs.checked_run) : await prepare(d);
    console.log(JSON.stringify(result));
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\nProduction branch sync: **${result.status}**\n\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\`\n`);
  } catch (error) {
    const url = `${process.env.GITHUB_SERVER_URL}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}`;
    openAlert({ repo, alert: ALERT, title: TITLE, rewrite: true, body: `${error.message}\n\nRun: ${url}\n\nNo conflicts are resolved automatically and no branch history is overwritten. Resolve on a temporary branch, pass Check and merge with a merge commit; then dispatch Sync main into dev again.` });
    throw error;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error(error); process.exitCode = 1; });
