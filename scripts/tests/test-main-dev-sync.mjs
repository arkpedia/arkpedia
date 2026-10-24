import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { eligible, finish, prepare, runtime } from '../ci/sync-main-to-dev.mjs';

function fixture(t, conflict = false) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arkpedia-sync-test-'));
  t.after(() => {
    assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const seed = path.join(dir, 'seed'), remote = path.join(dir, 'remote.git'), work = path.join(dir, 'work');
  fs.mkdirSync(seed);
  const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  git(seed, 'init', '-q', '-b', 'main');
  git(seed, 'config', 'user.name', 'Test'); git(seed, 'config', 'user.email', 'test@example.invalid');
  const commit = (file, body) => { fs.writeFileSync(path.join(seed, file), body); git(seed, 'add', '.'); git(seed, 'commit', '-qm', body); return git(seed, 'rev-parse', 'HEAD'); };
  const base = commit('shared.txt', 'base');
  const main = commit(conflict ? 'shared.txt' : 'production.txt', 'released change');
  git(seed, 'checkout', '-qb', 'dev', base);
  const dev = commit(conflict ? 'shared.txt' : 'development.txt', 'newer development feature');
  git(seed, 'init', '-q', '--bare', remote);
  git(seed, 'remote', 'add', 'origin', remote); git(seed, 'push', '-q', 'origin', 'main', 'dev');
  git(seed, 'clone', '-q', remote, work);
  const calls = [];
  const readRef = branch => {
    const result = spawnSync('git', ['rev-parse', '--verify', `refs/heads/${branch}`], { cwd: remote, encoding: 'utf8' });
    return result.status === 0 ? result.stdout.trim() : null;
  };
  const request = (endpoint, method = 'GET', body) => {
    calls.push({ endpoint, method, body });
    if (endpoint === 'actions/workflows/check.yml') return { id: 111 };
    if (endpoint.startsWith('git/ref/heads/')) {
      const sha = readRef(endpoint.slice('git/ref/heads/'.length));
      if (sha) return { object: { sha } };
      throw Object.assign(new Error('Missing ref'), { status: 404 });
    }
    if (endpoint === 'git/refs/heads/dev' && method === 'PATCH') {
      assert.equal(body.force, false);
      const previous = readRef('dev');
      if (spawnSync('git', ['merge-base', '--is-ancestor', previous, body.sha], { cwd: remote }).status !== 0) throw new Error('Not a fast-forward');
      git(remote, 'update-ref', 'refs/heads/dev', body.sha, previous);
    } else if (endpoint.startsWith('git/refs/heads/') && method === 'DELETE') {
      git(remote, 'update-ref', '-d', `refs/heads/${endpoint.slice('git/refs/heads/'.length)}`);
    } else assert.match(endpoint, /^actions\/workflows\/(check|deploy|sync-cloudflare)\.yml\/dispatches$/);
  };
  const d = { ...runtime('arkpedia/arkpedia', { cwd: work, request }), clear: async () => {} };
  const run = candidate => ({ event: 'workflow_dispatch', workflow_id: 111, head_repository: { full_name: d.repo }, head_branch: candidate.branch, head_sha: candidate.head, status: 'completed', conclusion: 'success', html_url: 'https://github.com/arkpedia/arkpedia/actions/runs/1' });
  return { d, calls, readRef, git, seed, remote, work, commit, main, dev, run };
}

test('a real integration merge is checked before dev moves, then the exact green commit keeps both sides', async t => {
  const f = fixture(t);
  const candidate = await prepare(f.d);
  assert.equal(candidate.status, 'checking');
  assert.equal(f.readRef('dev'), f.dev);
  assert.ok(f.calls.some(call => call.endpoint.includes('check.yml/dispatches') && call.body.ref === candidate.branch));
  const result = await finish(f.d, f.run(candidate));
  assert.equal(result.status, 'synced');
  assert.equal(f.readRef('dev'), candidate.head);
  assert.equal(f.git(f.remote, 'show', 'dev:production.txt'), 'released change');
  assert.equal(f.git(f.remote, 'show', 'dev:development.txt'), 'newer development feature');
  assert.equal(f.git(f.remote, 'merge-base', f.main, 'dev'), f.main);
  assert.equal(f.readRef(candidate.branch), null);
  const deploy = f.calls.find(call => call.endpoint.includes('deploy.yml/dispatches'));
  assert.deepEqual(deploy.body, { ref: 'dev', inputs: { preview: 'false', commit: candidate.head } });
  assert.ok(f.calls.some(call => call.endpoint.includes('sync-cloudflare.yml/dispatches')));
});

test('a conflict leaves dev untouched and never publishes a candidate', async t => {
  const f = fixture(t, true);
  await assert.rejects(prepare(f.d), /reviewed resolution.*\n[\s\S]*shared.txt/);
  assert.equal(f.readRef('dev'), f.dev);
  assert.equal(f.calls.some(call => call.endpoint.endsWith('/dispatches')), false);
  assert.equal(fs.existsSync(path.join(f.work, '.git', 'MERGE_HEAD')), false);
});

test('red CI and an obsolete result cannot advance dev or deploy', async t => {
  const f = fixture(t), candidate = await prepare(f.d);
  await assert.rejects(finish(f.d, { ...f.run(candidate), conclusion: 'failure' }), /Dev was not updated/);
  assert.equal(f.readRef('dev'), f.dev);
  const old = { ...f.run(candidate), head_sha: 'a'.repeat(40) };
  assert.equal((await finish(f.d, old)).status, 'obsolete');
  assert.equal(f.calls.some(call => call.endpoint.includes('deploy.yml')), false);
});

test('a dev feature landing during CI is preserved and gets a new integration Check', async t => {
  const f = fixture(t), candidate = await prepare(f.d);
  const newer = f.commit('later.txt', 'later dev work');
  f.git(f.seed, 'push', '-q', 'origin', 'dev');
  const result = await finish(f.d, f.run(candidate));
  assert.equal(result.status, 'checking');
  assert.notEqual(result.branch, candidate.branch);
  assert.equal(f.readRef('dev'), newer);
  assert.equal(f.git(f.remote, 'show', `${result.head}:later.txt`), 'later dev work');
  assert.equal(f.calls.some(call => call.endpoint.includes('deploy.yml')), false);
});

test('a later main release during CI gets its own checked merge', async t => {
  const f = fixture(t), candidate = await prepare(f.d);
  f.git(f.seed, 'checkout', '-q', 'main');
  const newer = f.commit('next-release.txt', 'another release');
  f.git(f.seed, 'push', '-q', 'origin', 'main');
  const result = await finish(f.d, f.run(candidate));
  assert.equal(result.status, 'checking');
  assert.equal(result.main, newer);
  assert.equal(f.readRef('dev'), f.dev);
});

test('a retry reuses the immutable integration branch; a modified one is refused', async t => {
  const f = fixture(t), candidate = await prepare(f.d);
  assert.equal((await prepare(f.d)).head, candidate.head);
  f.git(f.remote, 'update-ref', `refs/heads/${candidate.branch}`, f.dev);
  await assert.rejects(prepare(f.d), /modified|non-fast-forward/);
  assert.equal(f.readRef(candidate.branch), f.dev, 'a modified integration branch is never overwritten');
  assert.equal(f.readRef('dev'), f.dev);
});

test('untrusted repository, wrong workflow and unrelated manual checks are ignored', async t => {
  const f = fixture(t), candidate = await prepare(f.d), run = f.run(candidate);
  for (const changed of [{ head_repository: { full_name: 'elsewhere/fork' } }, { workflow_id: 222 }, { event: 'pull_request' }, { head_branch: 'dev' }, { status: 'in_progress' }]) {
    assert.equal(eligible({ ...run, ...changed }, f.d.repo, 111), false);
    assert.equal((await finish(f.d, { ...run, ...changed })).status, 'ignored');
  }
  assert.equal(f.readRef('dev'), f.dev);
});

test('an already synced main is a no-op for dev and still repairs the downstream dispatch', async t => {
  const f = fixture(t), candidate = await prepare(f.d);
  await finish(f.d, f.run(candidate));
  f.calls.length = 0;
  assert.equal((await prepare(f.d)).status, 'current');
  assert.equal(f.calls.some(call => call.endpoint.includes('check.yml/dispatches')), false);
  assert.ok(f.calls.some(call => call.endpoint.includes('sync-cloudflare.yml/dispatches')));
});

test('a dev push racing the final update cannot be overwritten or deployed', async t => {
  const f = fixture(t), candidate = await prepare(f.d);
  const advance = f.d.advanceDev;
  let newer;
  f.d.advanceDev = async head => {
    newer = f.commit('race.txt', 'concurrent dev feature');
    f.git(f.seed, 'push', '-q', 'origin', 'dev');
    return advance(head);
  };
  const retried = await finish(f.d, f.run(candidate));
  assert.equal(retried.status, 'checking');
  assert.notEqual(retried.branch, candidate.branch);
  assert.equal(f.readRef('dev'), newer);
  assert.equal(f.readRef(candidate.branch), candidate.head, 'the obsolete candidate is not overwritten');
  assert.equal(f.calls.some(call => call.endpoint.includes('deploy.yml')), false);
});

test('workflow orchestration uses trusted main, explicit downstream dispatch and a pinned deploy', () => {
  const workflow = fs.readFileSync('.github/workflows/sync-main.yml', 'utf8');
  assert.match(workflow, /push:\s+branches: \[main\]/);
  assert.match(workflow, /workflow_run:\s+workflows: \[Check\]/);
  assert.match(workflow, /branches: \['sync\/main-to-dev-\*'\]/);
  assert.match(workflow, /ref: main\s+fetch-depth: 0/);
  assert.match(workflow, /timeout-minutes: 5/);
  const deploy = fs.readFileSync('.github/workflows/deploy.yml', 'utf8');
  assert.match(deploy, /commit:\s+description: Exact checked commit/);
  assert.equal((deploy.match(/inputs\.commit \|\| github\.event\.workflow_run\.head_sha \|\| github\.sha/g) ?? []).length, 4);
  assert.match(deploy, /\^\[0-9a-f\]\{40\}\$/);
  const cf = fs.readFileSync('.github/workflows/sync-cloudflare.yml', 'utf8');
  assert.match(cf, /if: failure\(\)/);
  assert.match(cf, /--alert cloudflare-sync/);
});
