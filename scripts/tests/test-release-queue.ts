import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
// @ts-expect-error Available in the supported Node runtime.
import { DatabaseSync } from 'node:sqlite';
import type { D1Database } from '@cloudflare/workers-types';
import { releaseGateway, type ReleaseGateway } from '../../lib/release-queue/github';
import { releaseQueue } from '../../lib/release-queue/service';
import { releaseStore } from '../../lib/release-queue/store';
import { reviewPaths, type ReleaseCandidate } from '../../lib/release-queue/types';
import { readPublishedUpdates } from '../../lib/site-updates/store';

const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const C = 'c'.repeat(40);
const T = 'd'.repeat(40);
const fingerprint = 'f'.repeat(64);
const actor = 'editor@example.invalid';
const candidate: ReleaseCandidate = { source: A, base: B, fingerprint, pullRequest: 172, title: 'Planner changes', paths: ['/pulls'] };
const note = { title: 'The new planner', body: 'A smaller layout.', major: true, images: [] };

function database() {
  const sqlite = new DatabaseSync(':memory:');
  for (const migration of ['0033_site_updates', '0034_release_queue']) {
    sqlite.exec(readFileSync('migrations/accounts/' + migration + '.sql', 'utf8'));
  }
  function prepare(sql: string, args: unknown[] = []) {
    const stmt = sqlite.prepare(sql);
    return {
      bind: (...args: unknown[]) => prepare(sql, args),
      first: async () => stmt.get(...args) ?? null,
      all: async () => ({ results: stmt.all(...args) }),
      run: () => stmt.run(...args),
    };
  }
  const db = { prepare, batch: async (queries: ReturnType<typeof prepare>[]) => {
    sqlite.exec('BEGIN');
    try {
      const results = queries.map(query => query.run());
      sqlite.exec('COMMIT');
      return results;
    } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  } } as unknown as D1Database;
  return { db, close: () => sqlite.close() };
}

test('a note is private until the confirmed release fingerprint is live', async () => {
  const { db, close } = database();
  try {
    const store = releaseStore(db);
    let main = B;
    let live = { source: B, fingerprint: 'a'.repeat(64) };
    let reviewed = candidate;
    let writes = 0;
    let healthy = false;
    let reusableCheck = false;
    const gateway: ReleaseGateway = {
      enabled: true,
      identity: async role => role === 'staging' ? reviewed : live,
      deployment: async () => healthy ? 'success' : 'pending',
      review: async () => ({ candidate: reviewed, target: C, reusableCheck }),
      main: async () => main,
      advance: async target => { assert.equal(target, C); writes++; main = target; },
      rejected: () => false,
    };
    const queue = releaseQueue(store, gateway);
    const pending = await queue.run({ action: 'queue', pullRequest: 172, paths: ['/pulls'] }, actor);
    assert.equal(pending.readySource, null);
    assert.equal(writes, 0);
    await queue.run({ action: 'save-note', source: A, revision: 1, note }, actor);
    await assert.rejects(queue.run({ action: 'publish', source: A, revision: 2 }, actor), /reusable Check/);
    reusableCheck = true;
    assert.equal((await queue.snapshot()).readySource, A);
    await assert.rejects(queue.run({ action: 'publish', source: A, revision: 1 }, actor), /changed/);
    reviewed = { ...candidate, base: T };
    assert.equal((await queue.snapshot()).readySource, null);
    await assert.rejects(queue.run({ action: 'publish', source: A, revision: 2 }, actor), /base changed/);
    assert.equal(writes, 0);
    reviewed = candidate;
    await queue.run({ action: 'publish', source: A, revision: 2 }, actor);
    assert.equal(writes, 1);
    assert.equal((await store.read(A))?.state, 'publishing');
    await queue.run({ action: 'refresh', source: A, revision: 3 }, actor);
    assert.deepEqual(await readPublishedUpdates(db, false), []);
    live = { source: C, fingerprint };
    await queue.run({ action: 'refresh', source: A, revision: 3 }, actor);
    assert.deepEqual(await readPublishedUpdates(db, false), []);
    healthy = true;
    await Promise.all([queue.run({ action: 'refresh', source: A, revision: 3 }, actor),
      queue.run({ action: 'refresh', source: A, revision: 3 }, actor)]);
    assert.equal((await store.read(A))?.state, 'published');
    assert.deepEqual((await readPublishedUpdates(db, true)).map(update => update.title), [note.title]);
  } finally { close(); }
});

test('one release in flight blocks another without dropping either draft', async () => {
  const { db, close } = database();
  try {
    const store = releaseStore(db);
    await store.queue(candidate, actor);
    await store.queue({ ...candidate, source: T }, actor);
    assert.ok(await store.start((await store.read(A))!, C, actor));
    assert.equal(await store.start((await store.read(T))!, C, actor), null);
    assert.equal((await store.read(T))?.state, 'queued');
  } finally { close(); }
});

test('release links preserve reader routes and exclude other origins and private APIs', () => {
  assert.deepEqual(reviewPaths(['/pulls', '/schedule?view=calendar', '/pulls']), ['/pulls', '/schedule?view=calendar']);
  for (const invalid of ['//www.arkpedia.net', '/%2fexample.com', '/api/dashboard/releases', '/%61pi/site-updates', '/foo/../dashboard', '/\\example.com']) {
    assert.throws(() => reviewPaths([invalid]));
  }
});

test('GitHub uses the exact reviewed test merge and a non-forced update', async () => {
  const repo = { id: 1455377998, full_name: 'arkpedia/arkpedia' };
  const path = '.github/workflows/check.yml';
  const pr = { number: 172, title: candidate.title, state: 'open', draft: false, mergeable: true,
    merge_commit_sha: C, base: { ref: 'main', sha: B, repo }, head: { sha: A, repo } };
  let writes = 0;
  let targetTree = T;
  let expired = false;
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const resource = url.pathname.replace('/repos/arkpedia/arkpedia/', '');
    if (url.origin === 'https://preview.arkpedia.net') return Response.json({ version: 1, dirty: false, deploymentRole: 'staging', commit: A, codeFingerprint: fingerprint });
    if (resource === 'branches/main') return Response.json({ commit: { sha: B } });
    if (resource === 'pulls/172') return Response.json(pr);
    if (resource === 'actions/workflows/check.yml') return Response.json({ id: 101, path, state: 'active' });
    if (resource === 'actions/workflows/check.yml/runs') return Response.json({ workflow_runs: [{
      id: 102, workflow_id: 101, path, head_sha: A, status: 'completed', conclusion: 'success',
      repository: repo, head_repository: repo, pull_requests: [{ number: 172 }], event: 'pull_request',
    }] });
    if (resource === 'actions/runs/102/jobs') return Response.json({ total_count: 2, jobs: [
      { name: 'check', steps: [{ name: 'Validate browser execution evidence', status: 'completed', conclusion: 'success' }] },
      { name: 'production-build', steps: [{ name: 'Compile and check the production Worker', status: 'completed', conclusion: 'success' }] },
    ].map(job => ({ ...job, run_id: 102, status: 'completed', conclusion: 'success' })) });
    if (resource === 'git/commits/' + A) return Response.json({ sha: A, tree: { sha: T }, parents: [] });
    if (resource === 'git/commits/' + C) return Response.json({ sha: C, tree: { sha: targetTree }, parents: [{ sha: B }, { sha: A }] });
    if (resource === 'actions/artifacts') {
      assert.equal(url.searchParams.get('name'), 'checked-tree-' + T);
      return Response.json({ artifacts: [
        { name: 'checked-tree-' + T, expired: false, workflow_run: { id: 103 } },
        { name: 'checked-tree-' + T, expired, workflow_run: { id: 102 } },
      ] });
    }
    if (resource === 'commits/' + C + '/check-runs') {
      assert.equal(new Headers(init?.headers).has('authorization'), false);
      return Response.json({ check_runs: [{
        id: 20, name: 'Workers Builds: arkpedia', head_sha: C, app: { id: 85455 }, status: 'completed', conclusion: 'success',
      }] });
    }
    assert.equal(resource, 'git/refs/heads/main');
    assert.equal(init?.method, 'PATCH');
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer test-token');
    assert.deepEqual(JSON.parse(String(init?.body)), { sha: C, force: false });
    writes++;
    return Response.json({ object: { sha: C } });
  };
  const gateway = releaseGateway('test-token', fetcher);
  assert.deepEqual(await gateway.review(172, ['/pulls']), { candidate, target: C, reusableCheck: true });
  expired = true;
  assert.equal((await gateway.review(172, ['/pulls'])).reusableCheck, false);
  assert.equal(await gateway.deployment(C), 'success');
  targetTree = B;
  await assert.rejects(gateway.review(172, ['/pulls']), /merge tree differs/);
  assert.equal(writes, 0);
  await gateway.advance(C);
  assert.equal(writes, 1);
});
