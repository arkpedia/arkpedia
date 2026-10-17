import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
// @ts-expect-error js-yaml ships no types; only load() is used.
import yaml from 'js-yaml';
import { defaultContentRevalidate } from '../../lib/content/revalidation';
import { RELEASE_REFRESH_ROUTES } from '../../lib/content/releaseRefresh';
import handler, { authorized } from '../../pages/api/release-refresh';
// @ts-expect-error Node import scripts are plain JavaScript.
import { POINTER_CACHE_MS, SERVER_REFRESH_MS, awaitPointer, main as refreshMain, refreshPages } from '../content/refresh-pages.mjs';

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
    const revalidate = Number(source.match(/withContentPage[\s\S]*?\{[^{}]*\brevalidate:\s*(\d+)/)?.[1] ?? source.match(/\brevalidate:\s*(\d+)\s*[,}]/)?.[1] ?? defaultContentRevalidate(route));
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
  type Step = { id?: string; name?: string; if?: string; run?: string; env?: Record<string, string>; 'continue-on-error'?: boolean; 'timeout-minutes'?: number };
  const workflow = yaml.load(fs.readFileSync('.github/workflows/prepare-content.yml', 'utf8')) as { jobs: Record<string, { steps?: Step[] }> };
  const steps = Object.values(workflow.jobs).flatMap((job) => job.steps ?? []);
  const live = steps.findIndex((step) => step.name === 'Confirm the release went live');
  const refresh = steps.findIndex((step) => step.name === 'Refresh the pages that wait longest for a release');
  assert.equal(steps[live].id, 'live');
  assert.equal(refresh, live + 1, 'straight after the pointer is confirmed');
  const step = steps[refresh];
  // On main it waits for what the live check found live serving (await-live.mjs's `revision`
  // output), not the pushed commit, which the pointer never names once a later push superseded it.
  assert.deepEqual([step.if, step.run, step['continue-on-error'], step.env?.ARKPEDIA_RELEASE_REFRESH_SECRET, step.env?.REVISION], [
    "steps.live.outcome == 'success' || steps.publish_dev.outputs.pushed != ''",
    'node scripts/content/refresh-pages.mjs --revision "$REVISION" --pointer "$ARKPEDIA_CONTENT_POINTER"', true,
    '${{ secrets.ARKPEDIA_RELEASE_REFRESH_SECRET }}', '${{ steps.live.outputs.revision || steps.publish_dev.outputs.pushed }}',
  ]);
  assert.ok(!Object.keys(step.env ?? {}).includes('PUSHED'), 'nothing hands it the pushed commit any more');
  // Long enough for the wait (below) and the requests after it, and the job's budget has room
  // for it: a job timeout during the wait would report a published release as failed.
  assert.ok(step['timeout-minutes']! * 60_000 > 9 * 60_000 + SERVER_REFRESH_MS + 60_000, `timeout-minutes: ${step['timeout-minutes']}`);
  const job = fs.readFileSync('.github/workflows/prepare-content.yml', 'utf8').match(/timeout-minutes: \$\{\{ vars\.ARKPEDIA_RUNNER && (\d+) \|\| (\d+) \}\}/);
  assert.ok(job && Number(job[1]) >= 90 + step['timeout-minutes']! && Number(job[2]) >= 70 + step['timeout-minutes']!, job?.[0]);
});

/* On 2026-10-04 the refresh fired the moment the pointer moved. A server reads the pointer through
   raw.githubusercontent, which keeps it five minutes, and asks again at most once a minute, so
   the pages regenerated with the previous release and kept it for their whole interval. The
   wait reads the pointer exactly as a server does, and gives the CDN's other edges their five
   minutes and the servers their minute. */
const REVISION = 'a'.repeat(40), OLD = 'b'.repeat(40);
function clock() {
  let at = 0;
  const slept: number[] = [];
  return { now: () => at, sleep: async (ms: number) => { slept.push(ms); at += ms; }, slept, at: () => at };
}
function pointerHost(answers: (string | number)[]) {
  const requests: { url: string; init: RequestInit }[] = [];
  const fetch = async (url: string, init: RequestInit) => {
    requests.push({ url, init });
    const answer = answers[Math.min(requests.length, answers.length) - 1];
    if (typeof answer === 'number') return new Response('nope', { status: answer });
    return new Response(JSON.stringify({ schema: 2, release: 'r'.repeat(64), revision: answer, manifestSha256: 'm'.repeat(64) }));
  };
  return { fetch, requests };
}

test('the refresh waits until a server reading the pointer gets the pushed release', async () => {
  // The server's own refresh interval is the one this waits out.
  assert.match(fs.readFileSync('lib/content/server.ts', 'utf8'), new RegExp(`const REFRESH_MS = ${SERVER_REFRESH_MS.toLocaleString('en').replace(/,/g, '_')};`));
  const url = 'https://raw.githubusercontent.com/arkpedia/arkpedia-data/dev-live/current.json';
  // The CDN still serves the old pointer twice (and fails once), then the new one.
  const time = clock();
  const host = pointerHost([OLD, 503, OLD, REVISION]);
  const logs: string[] = [];
  assert.deepEqual(await awaitPointer({ url, revision: REVISION, fetch: host.fetch, now: time.now, sleep: time.sleep, log: (line: string) => logs.push(line) }), { served: true });
  assert.ok(host.requests.every(request => request.url === url), 'exactly the address a server reads: no cache-busting query');
  assert.equal(host.requests.length, 4);
  assert.equal(time.at(), POINTER_CACHE_MS + SERVER_REFRESH_MS, 'five minutes since the pointer moved, then a server\'s minute');
  // Already named on the first read: the other edges still get their five minutes.
  const early = clock();
  await awaitPointer({ url, revision: REVISION, fetch: pointerHost([REVISION]).fetch, now: early.now, sleep: early.sleep, log: () => {} });
  assert.deepEqual(early.slept, [POINTER_CACHE_MS, SERVER_REFRESH_MS]);
  // Named only after the five minutes: the server's minute after that.
  const late = clock();
  await awaitPointer({ url, revision: REVISION, fetch: pointerHost([...Array(24).fill(OLD), REVISION]).fetch, now: late.now, sleep: late.sleep, log: () => {} });
  assert.equal(late.at(), 24 * 15_000 + SERVER_REFRESH_MS);
  // Never named: a warning, and the refresh is still asked for.
  const stuck = clock();
  const warned: string[] = [];
  assert.deepEqual(await awaitPointer({ url, revision: REVISION, fetch: pointerHost([OLD]).fetch, now: stuck.now, sleep: stuck.sleep, log: (line: string) => warned.push(line) }), { served: false });
  assert.match(warned.at(-1)!, new RegExp(`^::warning::${url.replace(/[./]/g, '\\$&')} still does not name ${REVISION} after 540 s \\(it names ${OLD}\\); asking for the refresh anyway\\.$`));
});

test('the refresh command needs the pushed revision and the channel\'s pointer, and reads that pointer', async () => {
  const env = { ARKPEDIA_RELEASE_REFRESH_SECRET: 's3cret', ARKPEDIA_RELEASE_BRANCH: 'dev' };
  for (const argv of [[], ['--revision', REVISION], ['--pointer', 'dev-live'], ['--revision', 'main', '--pointer', 'dev-live'], ['--revision', REVISION, '--pointer', '../live']]) {
    await assert.rejects(refreshMain(argv, { env, fetch: async () => { throw new Error('nothing is asked'); } }), /usage: refresh-pages\.mjs --revision/, argv.join(' '));
  }
  const time = clock();
  const calls: string[] = [];
  const fetch = async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${url}`);
    return url.endsWith('/current.json') ? new Response(JSON.stringify({ revision: REVISION })) : new Response('{"refreshed":{}}');
  };
  await refreshMain(['--revision', REVISION, '--pointer', 'dev-live'], { env, fetch, now: time.now, sleep: time.sleep, log: () => {} });
  assert.deepEqual(calls, ['GET https://raw.githubusercontent.com/arkpedia/arkpedia-data/dev-live/current.json', 'POST https://arkpedia-dev.vercel.app/api/release-refresh']);
  // Without the secret nothing would be refreshed, so nothing is waited for either.
  const none = clock();
  calls.length = 0;
  await refreshMain(['--revision', REVISION, '--pointer', 'dev-live'], { env: { ARKPEDIA_RELEASE_BRANCH: 'dev' }, fetch, now: none.now, sleep: none.sleep, log: () => {} });
  assert.deepEqual([calls, none.slept], [[], []]);
});
