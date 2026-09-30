import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
// @ts-expect-error js-yaml ships no types; only load() is used.
import yaml from 'js-yaml';
import { RELEASE_REFRESH_ROUTES } from '../../lib/content/releaseRefresh';
import handler, { authorized } from '../../pages/api/release-refresh';
// @ts-expect-error Node import scripts are plain JavaScript.
import { refreshPages } from '../content/refresh-pages.mjs';

/*
 * A content release refreshes the pages that wait longest for one as soon as it is live
 * (2026-09-30: the home page, every 25 minutes, showed the previous release's events and
 * skins for that long after the release that fixed them).
 */

/** Every content route whose revalidate is longer than a minute, read from the page sources. */
function slowContentRoutes(): string[] {
  const files: string[] = [];
  const walk = (dir: string) => { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const at = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (entry.name !== 'api') walk(at); } else if (/\.tsx?$/.test(entry.name)) files.push(at);
  } };
  walk('pages');
  const routes: string[] = [];
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    const route = source.match(/withContentPage(?:<[^>]*>)?\(\s*['"]([^'"]+)['"]/)?.[1];
    if (!route) continue;
    const revalidate = Number(source.match(/withContentPage[\s\S]*?\{[^{}]*\brevalidate:\s*(\d+)/)?.[1] ?? source.match(/\brevalidate:\s*(\d+)\s*[,}]/)?.[1] ?? 60);
    if (revalidate > 60) routes.push(route);
  }
  return routes.sort();
}

test('the release refreshes exactly the content pages that wait longer than a minute', () => {
  const slow = slowContentRoutes();
  assert.ok(slow.includes('/'), 'the home page is one');
  assert.deepEqual([...RELEASE_REFRESH_ROUTES].sort(), slow, 'a content page with a long revalidate belongs in lib/content/releaseRefresh.ts');
});

test('the endpoint takes POST with the secret, and regenerates only its fixed list', async () => {
  assert.equal(authorized('Bearer s3cret', 's3cret'), true);
  assert.equal(authorized('Bearer s3cre', 's3cret'), false);
  assert.equal(authorized('s3cret', 's3cret'), false);
  assert.equal(authorized('Bearer ', ''), false, 'no secret configured: nothing is authorized');
  assert.equal(authorized(undefined, 's3cret'), false);
  const call = async (method: string, authorization?: string) => {
    const revalidated: string[] = [];
    let status = 0, body: unknown = null;
    const res = { setHeader() {}, status(code: number) { status = code; return this; }, json(value: unknown) { body = value; return this; }, revalidate: async (route: string) => { revalidated.push(route); } };
    const before = process.env.ARKPEDIA_RELEASE_REFRESH_SECRET;
    process.env.ARKPEDIA_RELEASE_REFRESH_SECRET = 's3cret';
    try { await handler({ method, headers: authorization ? { authorization } : {} } as never, res as never); }
    finally { if (before === undefined) delete process.env.ARKPEDIA_RELEASE_REFRESH_SECRET; else process.env.ARKPEDIA_RELEASE_REFRESH_SECRET = before; }
    return { status, body, revalidated };
  };
  assert.equal((await call('GET', 'Bearer s3cret')).status, 405);
  const refused = await call('POST', 'Bearer wrong');
  assert.deepEqual([refused.status, refused.revalidated], [401, []]);
  const ok = await call('POST', 'Bearer s3cret');
  assert.deepEqual([ok.status, ok.revalidated], [200, [...RELEASE_REFRESH_ROUTES]]);
});

test('the release asks each live deployment, and a failure only warns', async () => {
  const calls: string[] = [];
  const logs: string[] = [];
  const deployments = [
    { name: 'up', url: 'https://up.example', live: true },
    { name: 'down', url: 'https://down.example', live: true },
    { name: 'waiting', url: 'https://waiting.example', live: false },
  ];
  const fetch = async (url: string, init: { method: string; headers: Record<string, string> }) => {
    calls.push(`${init.method} ${url} ${init.headers.authorization}`);
    if (url.startsWith('https://down')) throw new Error('connection refused');
    return new Response('{"refreshed":{}}', { status: 200 });
  };
  const results = await refreshPages({ secret: 's3cret', deployments, fetch, log: (line: string) => logs.push(line) });
  assert.deepEqual(calls, ['POST https://up.example/api/release-refresh Bearer s3cret', 'POST https://down.example/api/release-refresh Bearer s3cret']);
  assert.deepEqual(results.map((r: { name: string; ok: boolean }) => [r.name, r.ok]), [['up', true], ['down', false]]);
  assert.ok(logs.some((line) => line.startsWith('::warning::down')));
  // No secret: a warning, and nothing asked.
  const none: string[] = [];
  assert.deepEqual(await refreshPages({ secret: '', deployments, fetch, log: (line: string) => none.push(line) }), []);
  assert.match(none[0], /^::warning::ARKPEDIA_RELEASE_REFRESH_SECRET is not set/);
});

test('prepare-content refreshes them right after the release is confirmed live, never failing the run', () => {
  type Step = { id?: string; name?: string; if?: string; run?: string; env?: Record<string, string>; 'continue-on-error'?: boolean };
  const workflow = yaml.load(fs.readFileSync('.github/workflows/prepare-content.yml', 'utf8')) as { jobs: Record<string, { steps?: Step[] }> };
  const steps = Object.values(workflow.jobs).flatMap((job) => job.steps ?? []);
  const live = steps.findIndex((step) => step.name === 'Confirm the release went live');
  const refresh = steps.findIndex((step) => step.name === 'Refresh the pages that wait longest for a release');
  assert.equal(steps[live].id, 'live');
  assert.equal(refresh, live + 1, 'straight after the pointer is confirmed');
  const step = steps[refresh];
  assert.deepEqual([step.if, step.run, step['continue-on-error'], step.env?.ARKPEDIA_RELEASE_REFRESH_SECRET], [
    "steps.live.outcome == 'success'", 'node scripts/content/refresh-pages.mjs', true, '${{ secrets.ARKPEDIA_RELEASE_REFRESH_SECRET }}',
  ]);
});
