import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { test } from 'node:test';
// @ts-expect-error js-yaml ships no types; only load() is used.
import yaml from 'js-yaml';
// @ts-expect-error Node scripts are plain JavaScript.
import { CHANNELS, channelFor, contentPointer, pointerForBranch } from '../content/channel.mjs';
// @ts-expect-error Node scripts are plain JavaScript.
import { deployTargets, readDeployments } from '../deploy/deploy-targets.mjs';
// @ts-expect-error Node scripts are plain JavaScript.
import { deploymentUrls } from '../content/deploy-gate.mjs';
import { contentChannel } from '../../lib/content/server';

/* Main alone publishes; retired dev has no deployment or publishing channel. */
test('main publishes to data main and live; retired dev and feature branches cannot publish', () => {
  assert.deepEqual(channelFor('main'), { dataBranch: 'main', pointer: 'live' });
  assert.throws(() => channelFor('dev'), /no content channel/);
  for (const branch of ['feat/x', 'release/1', 'live', '', undefined, 'constructor']) assert.throws(() => channelFor(branch), /no content channel/);
  // The run prints the channel for $GITHUB_ENV, and fails for any other branch.
  const out = execFileSync(process.execPath, ['scripts/content/channel.mjs', '--branch', 'main'], { encoding: 'utf8' });
  assert.equal(out, 'ARKPEDIA_RELEASE_BRANCH=main\nARKPEDIA_DATA_BRANCH=main\nARKPEDIA_CONTENT_POINTER=live\n');
  assert.throws(() => execFileSync(process.execPath, ['scripts/content/channel.mjs', '--branch', 'feat/x'], { stdio: 'pipe' }));
  // No channel writes production's pointer except main's.
  assert.deepEqual(Object.entries(CHANNELS).filter(([, c]) => (c as { pointer: string }).pointer === 'live' || (c as { dataBranch: string }).dataBranch === 'main').map(([b]) => b), ['main']);
});

test('a reader takes its pointer from ARKPEDIA_CONTENT_CHANNEL, live by default, in the site and in the scripts alike', () => {
  for (const env of [{}, { ARKPEDIA_CONTENT_CHANNEL: '' }, { ARKPEDIA_CONTENT_CHANNEL: 'fixture-live' }]) {
    const before = process.env.ARKPEDIA_CONTENT_CHANNEL;
    if ('ARKPEDIA_CONTENT_CHANNEL' in env) process.env.ARKPEDIA_CONTENT_CHANNEL = env.ARKPEDIA_CONTENT_CHANNEL; else delete process.env.ARKPEDIA_CONTENT_CHANNEL;
    try {
      assert.equal(contentChannel(), contentPointer(env));
    } finally {
      if (before === undefined) delete process.env.ARKPEDIA_CONTENT_CHANNEL; else process.env.ARKPEDIA_CONTENT_CHANNEL = before;
    }
  }
  assert.equal(contentPointer({}), 'live');
  assert.equal(contentPointer({ ARKPEDIA_CONTENT_CHANNEL: 'fixture-live' }), 'fixture-live');
  // The site writes the rule out (importing the .cjs would pull config into its bundle), so both
  // refuse exactly the same names.
  for (const bad of ['../main', 'Dev', 'a/b', '-x', 'dev_live', 'live ', ' live', 'fixture-live\n', '.']) {
    assert.throws(() => contentPointer({ ARKPEDIA_CONTENT_CHANNEL: bad }), /lower-case/, JSON.stringify(bad));
    const before = process.env.ARKPEDIA_CONTENT_CHANNEL;
    process.env.ARKPEDIA_CONTENT_CHANNEL = bad;
    try {
      assert.throws(() => contentChannel(), /Invalid content channel/, JSON.stringify(bad));
    } finally {
      if (before === undefined) delete process.env.ARKPEDIA_CONTENT_CHANNEL; else process.env.ARKPEDIA_CONTENT_CHANNEL = before;
    }
  }
  // One rule for the pointer a branch's deployments read: Deploy's matrix and a build's lookup.
  assert.deepEqual(['main', 'dev', 'feat/x', undefined, 'constructor'].map(pointerForBranch), ['live', 'live', 'live', 'live', 'live']);
  assert.match(fs.readFileSync('scripts/deploy/deploy-targets.mjs', 'utf8'), /contentChannel: pointerForBranch\(branch\),/);
});

test('each deployment builds against its branch\'s channel, and the gate asks the deployments of the branch that compiled', () => {
  const deployments = readDeployments();
  assert.deepEqual(deployTargets({ branch: 'main', deployments }), []);
  assert.deepEqual(deployTargets({ branch: 'dev', deployments }), []);
  assert.deepEqual(deploymentUrls({}), ['https://www.arkpedia.net']);
  assert.deepEqual(deploymentUrls({ ARKPEDIA_RELEASE_BRANCH: 'main' }), ['https://www.arkpedia.net']);
  assert.deepEqual(deploymentUrls({ ARKPEDIA_RELEASE_BRANCH: 'dev' }), []);
});

/* A dev run is cancelled whenever a newer one starts (the workflow's concurrency), so reporting
   every cancellation opened a "Content release failing (dev)" issue per superseded run. A
   dispatch on a branch with no channel fails at the channel step, and its issue -- under a suffix
   no later run ever closes -- stayed open forever. The first fix asked for a channel step that
   succeeded, which silenced main too whenever it failed before that step (the checkout,
   setup-node): main always reports now, and only a channel step that failed keeps a run quiet. */
test('failure reporting preserves main errors and ignores unsupported channels', () => {
  type Step = { id?: string; name?: string; if?: string };
  const workflow = yaml.load(fs.readFileSync('.github/workflows/prepare-content.yml', 'utf8')) as { jobs: Record<string, { steps?: Step[] }> };
  const steps = workflow.jobs.prepare.steps!;
  const names = steps.map(step => step.name);
  assert.equal(steps.find(step => step.name === 'Choose the content channel')?.id, 'channel');
  const condition = steps.find(step => step.name === 'Report the failed release')?.if;
  assert.equal(condition, "(failure() || (cancelled() && github.ref_name == 'main')) && (github.ref_name == 'main' || steps.channel.outcome != 'failure')");
  // The condition, evaluated as GitHub does for each case it decides.
  const reports = ({ branch, failed = true, cancelled = false, channel }: { branch: string; failed?: boolean; cancelled?: boolean; channel: 'success' | 'failure' | 'skipped' }) =>
    (failed || (cancelled && branch === 'main')) && (branch === 'main' || channel !== 'failure');
  assert.ok(reports({ branch: 'main', channel: 'skipped' }), 'main failing at the checkout or setup-node reports');
  assert.ok(reports({ branch: 'main', channel: 'failure' }), 'main reports even when its channel step fails');
  assert.ok(reports({ branch: 'main', failed: false, cancelled: true, channel: 'success' }), 'a main timeout reports');
  assert.ok(reports({ branch: 'dev', channel: 'success' }) && reports({ branch: 'dev', channel: 'skipped' }), 'dev reports its failures, early ones too');
  assert.ok(!reports({ branch: 'dev', failed: false, cancelled: true, channel: 'success' }), 'a superseded dev run is quiet');
  assert.ok(!reports({ branch: 'feat/x', channel: 'failure' }), 'a branch with no channel is quiet');
  // The steps before the channel step are the ones a 'skipped' channel means failed: no others.
  assert.deepEqual(names.slice(0, names.indexOf('Choose the content channel')), [undefined, undefined], 'only the checkout and setup-node come first');
});

/* Least privilege for the release job, which runs the day's scrapers over upstream data: no token
   that can start workflows (only the job that starts dev after scheduled or successful manual main preparation has it),
   and on the dev channel no write key to the art repositories, which are production's. */
test('only the editorial notifier can start workflows; the scraper keeps least privilege', () => {
  type Job = { if?: string; needs?: string; 'runs-on'?: string; permissions?: Record<string, string>; steps: { name?: string; run?: string; env?: Record<string, string>; 'continue-on-error'?: boolean }[] };
  const workflow = yaml.load(fs.readFileSync('.github/workflows/prepare-content.yml', 'utf8')) as { permissions: Record<string, string>; jobs: Record<string, Job> };
  assert.deepEqual(workflow.permissions, { contents: 'read', issues: 'write' });
  const dispatchers = Object.entries(workflow.jobs).filter(([, job]) => job.steps.some(step => /\bgh workflow run\b/.test(step.run ?? '')));
  assert.deepEqual(dispatchers.map(([name]) => name), ['notify-editorial']);
  const [, start] = dispatchers[0];
  assert.deepEqual([start.needs, start.if, start.permissions], ['prepare', "${{ !cancelled() && github.ref_name == 'main' && needs.prepare.result == 'success' }}", { contents: 'read', actions: 'write' }]);
  assert.equal(start.steps.length, 1, 'no checkout: the one step rechecks main editorial edits');
  // API calls only, so the light runner, as Deploy's targets job (which also only calls GitHub's API):
  // on the NAS it queued behind a whole Check.
  const deploy = yaml.load(fs.readFileSync('.github/workflows/deploy.yml', 'utf8')) as { jobs: Record<string, { 'runs-on'?: string }> };
  assert.equal(start['runs-on'], deploy.jobs.targets['runs-on']);
  assert.equal(start['runs-on'], "${{ vars.ARKPEDIA_LIGHT_RUNNER || vars.ARKPEDIA_RUNNER || 'ubuntu-latest' }}");
  assert.equal(start.steps[0]['continue-on-error'], true, 'a failed dispatch never fails the release');
  const refresh = workflow.jobs.prepare.steps.find(step => step.name === 'Refresh supported upstream records')!;
  for (const key of ['CATALOGUE_IMAGE_DEPLOY_KEY', 'CATALOGUE_SKIN_DEPLOY_KEY']) {
    assert.equal(refresh.env?.[key], `\${{ github.ref_name == 'main' && secrets.${key} || '' }}`, key);
  }
  // The publisher stops on the dev channel before it asks for a key, so an empty one is never read there.
  const publisher = fs.readFileSync('scripts/sync/publish-catalogue-assets.sh', 'utf8');
  assert.ok(publisher.indexOf('"$ARKPEDIA_RELEASE_BRANCH" != main') < publisher.indexOf('CATALOGUE_IMAGE_DEPLOY_KEY:?'));
});

test('Vercel retirement does not send the old Vercel refresh credential to its reader', async () => {
  // @ts-expect-error Node scripts are plain JavaScript.
  const { refreshPages } = await import('../content/refresh-pages.mjs');
  for (const branch of ['main', 'dev']) {
    const calls: string[] = [];
    await refreshPages({ secret: 's', env: { ARKPEDIA_RELEASE_BRANCH: branch }, fetch: async (url: string) => { calls.push(url); return new Response('{}'); }, log: () => {} });
    assert.deepEqual(calls, []);
  }
});

test('a site on a channel reads that channel\'s release, and live\'s while the channel has no pointer yet', async () => {
  const { createServer } = await import('node:http');
  const { createHash } = await import('node:crypto');
  const { withContentPage } = await import('../../lib/content/server');
  const { pageFilePath } = await import('../../lib/content/pagePaths.mjs');
  const { CONTENT_SCHEMA } = await import('../../lib/content/types');
  const sha = (value: string) => createHash('sha256').update(value).digest('hex');
  const documents = new Map<string, string>();
  const publish = (label: string, value: string) => {
    const revision = label.repeat(40), release = label.repeat(64), path = pageFilePath('/operators/Penance');
    const page = JSON.stringify({ props: { value } });
    documents.set(`/${revision}/release/${path}`, page);
    const manifest = JSON.stringify({ schema: CONTENT_SCHEMA, release, generatedAt: '2026-10-04T00:00:00Z', generator: revision,
      assets: { 'arkpedia-image-assets': revision, 'arkpedia-skin-assets': revision }, files: {},
      pages: { '/operators/Penance': { path, bytes: Buffer.byteLength(page), sha256: sha(page) } } });
    documents.set(`/${revision}/release/manifest.json`, manifest);
    return JSON.stringify({ schema: CONTENT_SCHEMA, release, revision, manifestSha256: sha(manifest) });
  };
  documents.set('/live/current.json', publish('a', 'main\'s'));
  const server = createServer((request, response) => {
    const body = documents.get(decodeURIComponent(request.url!));
    if (!body) { response.writeHead(404); response.end(); return; }
    response.end(body);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const keys = ['ARKPEDIA_CONTENT_URL', 'ARKPEDIA_CONTENT_TEST', 'ARKPEDIA_CONTENT_DISABLED', 'ARKPEDIA_EXPORT_CONTENT', 'ARKPEDIA_CONTENT_CHANNEL'] as const;
  const before = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  Object.assign(process.env, { ARKPEDIA_CONTENT_URL: `http://127.0.0.1:${address.port}`, ARKPEDIA_CONTENT_TEST: '1', ARKPEDIA_CONTENT_DISABLED: '0', ARKPEDIA_EXPORT_CONTENT: '0', ARKPEDIA_CONTENT_CHANNEL: 'fixture-live' });
  const warn = console.warn;
  console.warn = () => {};
  try {
    const get = withContentPage('/operators/[name]', async () => ({ props: { value: 'bundled' } }));
    const read = async () => { const result = await get({ params: { name: 'Penance' }, revalidateReason: 'build' as const }); assert.ok('props' in result); return (await result.props as { value: string }).value; };
    assert.equal(await read(), 'main\'s', 'no fixture-live yet: live\'s release');
    documents.set('/fixture-live/current.json', publish('b', 'fixture\'s'));
    assert.equal(await read(), 'fixture\'s', 'fixture-live published: its own release');
  } finally {
    console.warn = warn;
    for (const key of keys) if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key];
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('retired Vercel project IDs default to live and explicit channels still win', () => {
  assert.deepEqual(readDeployments(), []);
  assert.equal(contentPointer({ VERCEL_PROJECT_ID: 'prj_onqP9wnDB7c8qzYPIJAGNMcTyjLC' }), 'live');
  assert.equal(contentPointer({ VERCEL_PROJECT_ID: 'prj_unknown' }), 'live');
  assert.equal(contentPointer({ VERCEL_PROJECT_ID: 'prj_unknown', ARKPEDIA_CONTENT_CHANNEL: 'test-channel' }), 'test-channel');
});

test('npm test runs without the channel the nightly put in the environment', () => {
  const script = JSON.parse(fs.readFileSync('package.json', 'utf8')).scripts.test as string;
  for (const name of ['ARKPEDIA_RELEASE_BRANCH', 'ARKPEDIA_DATA_BRANCH', 'ARKPEDIA_CONTENT_POINTER', 'ARKPEDIA_CONTENT_CHANNEL']) {
    assert.ok(script.startsWith('env ') && script.includes(`-u ${name} `), `npm test unsets ${name}`);
  }
});
