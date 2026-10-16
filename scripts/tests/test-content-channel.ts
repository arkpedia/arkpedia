import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
import { refreshScripts } from './fixtures/refresh-stages';
// @ts-expect-error Node scripts are plain JavaScript.
import { REFRESH_PATHS, decide, needsRefresh, refreshes } from '../content/dev-refresh.mjs';

/*
 * The dev content channel (scripts/content/channel.mjs): dev's run publishes to data `dev` and
 * the `dev-live` pointer, arkpedia-dev reads dev-live, and nothing of it reaches main or live.
 */
test('main publishes to data main and live; dev to data dev and dev-live; no other branch publishes', () => {
  assert.deepEqual(channelFor('main'), { dataBranch: 'main', pointer: 'live' });
  assert.deepEqual(channelFor('dev'), { dataBranch: 'dev', pointer: 'dev-live' });
  for (const branch of ['feat/x', 'release/1', 'live', '', undefined, 'constructor']) assert.throws(() => channelFor(branch), /no content channel/);
  // The run prints the channel for $GITHUB_ENV, and fails for any other branch.
  const out = execFileSync(process.execPath, ['scripts/content/channel.mjs', '--branch', 'dev'], { encoding: 'utf8' });
  assert.equal(out, 'ARKPEDIA_RELEASE_BRANCH=dev\nARKPEDIA_DATA_BRANCH=dev\nARKPEDIA_CONTENT_POINTER=dev-live\n');
  assert.throws(() => execFileSync(process.execPath, ['scripts/content/channel.mjs', '--branch', 'feat/x'], { stdio: 'pipe' }));
  // No channel writes production's pointer except main's.
  assert.deepEqual(Object.entries(CHANNELS).filter(([, c]) => (c as { pointer: string }).pointer === 'live' || (c as { dataBranch: string }).dataBranch === 'main').map(([b]) => b), ['main']);
});

test('a reader takes its pointer from ARKPEDIA_CONTENT_CHANNEL, live by default, in the site and in the scripts alike', () => {
  for (const env of [{}, { ARKPEDIA_CONTENT_CHANNEL: '' }, { ARKPEDIA_CONTENT_CHANNEL: 'dev-live' }]) {
    const before = process.env.ARKPEDIA_CONTENT_CHANNEL;
    if ('ARKPEDIA_CONTENT_CHANNEL' in env) process.env.ARKPEDIA_CONTENT_CHANNEL = env.ARKPEDIA_CONTENT_CHANNEL; else delete process.env.ARKPEDIA_CONTENT_CHANNEL;
    try {
      assert.equal(contentChannel(), contentPointer(env));
    } finally {
      if (before === undefined) delete process.env.ARKPEDIA_CONTENT_CHANNEL; else process.env.ARKPEDIA_CONTENT_CHANNEL = before;
    }
  }
  assert.equal(contentPointer({}), 'live');
  assert.equal(contentPointer({ ARKPEDIA_CONTENT_CHANNEL: 'dev-live' }), 'dev-live');
  // The site writes the rule out (importing the .cjs would pull config into its bundle), so both
  // refuse exactly the same names.
  for (const bad of ['../main', 'Dev', 'a/b', '-x', 'dev_live', 'live ', ' live', 'dev-live\n', '.']) {
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
  assert.deepEqual(['main', 'dev', 'feat/x', undefined, 'constructor'].map(pointerForBranch), ['live', 'dev-live', 'live', 'live', 'live']);
  assert.match(fs.readFileSync('scripts/deploy/deploy-targets.mjs', 'utf8'), /contentChannel: pointerForBranch\(branch\),/);
});

test('each deployment builds against its branch\'s channel, and the gate asks the deployments of the branch that compiled', () => {
  const deployments = readDeployments();
  assert.equal(deployTargets({ branch: 'main', deployments })[0].contentChannel, 'live');
  assert.equal(deployTargets({ branch: 'dev', deployments })[0].contentChannel, 'dev-live');
  assert.deepEqual(deploymentUrls({}), ['https://www.arkpedia.net']);
  assert.deepEqual(deploymentUrls({ ARKPEDIA_RELEASE_BRANCH: 'main' }), ['https://www.arkpedia.net']);
  assert.deepEqual(deploymentUrls({ ARKPEDIA_RELEASE_BRANCH: 'dev' }), ['https://arkpedia-dev.vercel.app']);
});

test('the nightly publishes dev to its own branches only, and never pushes art from it', () => {
  const workflow = fs.readFileSync('.github/workflows/prepare-content.yml', 'utf8');
  const devBlock = workflow.slice(workflow.indexOf("- name: Publish the dev channel's release"), workflow.indexOf('- name: Confirm the release went live'));
  assert.match(devBlock, /if: github\.ref_name != 'main'/);
  // Main's publish step, the one that writes data main, runs on main's channel only, by its own
  // condition: a default in its script (`${ARKPEDIA_RELEASE_BRANCH:-main}`) let a run without the
  // channel's variables through, and the test that held it passed with the guard deleted.
  const mainStep = workflow.slice(workflow.indexOf('- name: Publish the validated public release'), workflow.indexOf("- name: Publish the dev channel's release"));
  const settings = mainStep.split('\n').map(line => line.trim());
  assert.ok(settings.includes("if: github.ref_name == 'main' && (github.event_name != 'schedule' || steps.prepared.outputs.cache-hit != 'true')"), mainStep.slice(0, 400));
  assert.ok(settings.includes('git -C "$repo" push origin HEAD:main'), 'not vacuous: this is the step that pushes data main');
  assert.doesNotMatch(mainStep, /ARKPEDIA_RELEASE_BRANCH/, 'the condition carries the safety, not a default in the script');
  const commands = devBlock.split('\n').filter(line => !line.trim().startsWith('#')).join('\n');
  assert.ok(!/HEAD:(?:refs\/heads\/)?(?:main|live)\b|origin (?:main|live)\b/.test(commands), 'the dev block pushes or fetches neither data main nor live');
  assert.match(devBlock, /push --force origin "HEAD:refs\/heads\/\$ARKPEDIA_DATA_BRANCH"/);
  assert.match(devBlock, /push_file_to_branch "\$ARKPEDIA_CONTENT_POINTER" /);
  const publisher = fs.readFileSync('scripts/sync/publish-catalogue-assets.sh', 'utf8');
  const guard = '"$ARKPEDIA_RELEASE_BRANCH" != main', push = 'push "git@github.com';
  assert.ok(publisher.includes(guard) && publisher.includes(push), 'the publisher has its channel guard and its push');
  assert.ok(publisher.indexOf(guard) < publisher.indexOf(push), 'the guard comes before the push');
  const out = execFileSync('bash', ['scripts/sync/publish-catalogue-assets.sh'], { encoding: 'utf8', env: { ...process.env, ARKPEDIA_RELEASE_BRANCH: 'dev' } });
  assert.match(out, /The dev channel publishes no art/);
});

/* A dev run is cancelled whenever a newer one starts (the workflow's concurrency), so reporting
   every cancellation opened a "Content release failing (dev)" issue per superseded run. A
   dispatch on a branch with no channel fails at the channel step, and its issue -- under a suffix
   no later run ever closes -- stayed open forever. The first fix asked for a channel step that
   succeeded, which silenced main too whenever it failed before that step (the checkout,
   setup-node): main always reports now, and only a channel step that failed keeps a run quiet. */
test('a superseded dev run and a branch with no channel open no failed-release issue; main always reports', () => {
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
   that can start workflows (only the job that starts dev's run after the scheduled one has it),
   and on the dev channel no write key to the art repositories, which are production's. */
test('only the dev dispatch can start workflows, and only main\'s run gets the art repositories\' keys', () => {
  type Job = { if?: string; needs?: string; 'runs-on'?: string; permissions?: Record<string, string>; steps: { name?: string; run?: string; env?: Record<string, string>; 'continue-on-error'?: boolean }[] };
  const workflow = yaml.load(fs.readFileSync('.github/workflows/prepare-content.yml', 'utf8')) as { permissions: Record<string, string>; jobs: Record<string, Job> };
  assert.deepEqual(workflow.permissions, { contents: 'read', issues: 'write' });
  const dispatchers = Object.entries(workflow.jobs).filter(([, job]) => job.steps.some(step => /\bgh workflow run\b/.test(step.run ?? '')));
  assert.deepEqual(dispatchers.map(([name]) => name), ['start-dev']);
  const [, start] = dispatchers[0];
  assert.deepEqual([start.needs, start.if, start.permissions], ['prepare', "${{ !cancelled() && github.event_name == 'schedule' }}", { contents: 'read', actions: 'write' }]);
  assert.equal(start.steps.length, 1, 'no checkout: it runs one gh command');
  // One gh call, so the light runner, as Deploy's targets job (which also only calls GitHub's API):
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

test('after a release goes live, only the deployments of the branch that compiled it are refreshed', async () => {
  // @ts-expect-error Node scripts are plain JavaScript.
  const { refreshPages } = await import('../content/refresh-pages.mjs');
  for (const [branch, site] of [['main', 'https://www.arkpedia.net'], ['dev', 'https://arkpedia-dev.vercel.app']]) {
    const calls: string[] = [];
    await refreshPages({ secret: 's', env: { ARKPEDIA_RELEASE_BRANCH: branch }, fetch: async (url: string) => { calls.push(url); return new Response('{}'); }, log: () => {} });
    assert.deepEqual(calls, [`${site}/api/release-refresh`]);
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
  Object.assign(process.env, { ARKPEDIA_CONTENT_URL: `http://127.0.0.1:${address.port}`, ARKPEDIA_CONTENT_TEST: '1', ARKPEDIA_CONTENT_DISABLED: '0', ARKPEDIA_EXPORT_CONTENT: '0', ARKPEDIA_CONTENT_CHANNEL: 'dev-live' });
  const warn = console.warn;
  console.warn = () => {};
  try {
    const get = withContentPage('/operators/[name]', async () => ({ props: { value: 'bundled' } }));
    const read = async () => { const result = await get({ params: { name: 'Penance' }, revalidateReason: 'build' as const }); assert.ok('props' in result); return (await result.props as { value: string }).value; };
    assert.equal(await read(), 'main\'s', 'no dev-live yet: live\'s release');
    documents.set('/dev-live/current.json', publish('b', 'dev\'s'));
    assert.equal(await read(), 'dev\'s', 'dev-live published: its own release');
  } finally {
    console.warn = warn;
    for (const key of keys) if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key];
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('a Deploy build reads the channel of the project it builds for, whichever revision of deploy.yml runs', () => {
  // Deploy is started by the Check workflow, so GitHub runs main's deploy.yml even for a dev
  // build: the project id it sets for every build is what names the channel.
  const deployments = readDeployments() as { branch: string; projectId: string }[];
  const net = deployments.find(deployment => deployment.branch === 'main')!, dev = deployments.find(deployment => deployment.branch === 'dev')!;
  assert.equal(contentPointer({ VERCEL_PROJECT_ID: dev.projectId }), 'dev-live');
  assert.equal(contentPointer({ VERCEL_PROJECT_ID: net.projectId }), 'live');
  assert.equal(contentPointer({ VERCEL_PROJECT_ID: 'prj_unknown' }), 'live');
  assert.equal(contentPointer({ VERCEL_PROJECT_ID: dev.projectId, ARKPEDIA_CONTENT_CHANNEL: 'live' }), 'live', 'an explicit channel wins');
});

test('npm test runs without the channel the nightly put in the environment', () => {
  const script = JSON.parse(fs.readFileSync('package.json', 'utf8')).scripts.test as string;
  for (const name of ['ARKPEDIA_RELEASE_BRANCH', 'ARKPEDIA_DATA_BRANCH', 'ARKPEDIA_CONTENT_POINTER', 'ARKPEDIA_CONTENT_CHANNEL']) {
    assert.ok(script.startsWith('env ') && script.includes(`-u ${name} `), `npm test unsets ${name}`);
  }
});

/* Every green dev deploy started a full upstream refresh, so the load on the sources grew with
   each dev merge. Now only a commit that changes what the refresh runs asks for one; anything
   else compiles data main's records with the new code (refresh_upstream=false). */
test('a dev deploy refreshes upstream only when the commit changes what the refresh runs', () => {
  // Every file a refresh stage runs or reads, through npm, shell and local imports, is covered:
  // a stage that starts importing from a new folder fails here until REFRESH_PATHS lists it.
  const uncovered = (refreshScripts() as string[]).filter(file => !refreshes(file));
  assert.deepEqual(uncovered, []);
  for (const file of ['.github/workflows/prepare-content.yml', 'scripts/sync/refresh-stage-data.sh', 'scripts/requirements.txt', 'package-lock.json']) assert.ok(refreshes(file), file);
  assert.equal(needsRefresh(['components/layout/MobileNavDrawer.tsx', 'pages/optimizer.tsx', 'styles/core/nav.css', 'docs/x.md', 'lib/changelog/entries.ts']), false);
  assert.equal(needsRefresh(['pages/optimizer.tsx', 'scripts/sync/sync-catalogue.mjs']), true);
  assert.ok(!(REFRESH_PATHS as string[]).some(entry => /^(?:components|pages|styles|public)\//.test(entry)));
  // Against a commit's first parent; when that cannot be read, it refreshes.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arkpedia-dev-refresh-'));
  try {
    const git = (...args: string[]) => execFileSync('git', ['-C', root, '-c', 'user.name=t', '-c', 'user.email=t@localhost', ...args], { encoding: 'utf8' });
    git('init', '-q');
    const commit = (file: string) => {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      fs.writeFileSync(path.join(root, file), String(Math.random()));
      git('add', '-A'); git('commit', '-qm', file);
    };
    commit('README.md');
    assert.equal(decide({ cwd: root, log: () => {} }), true, 'no parent to compare with');
    commit('components/a.tsx');
    assert.equal(decide({ cwd: root, log: () => {} }), false);
    commit('scripts/sync/sync-x.mjs');
    assert.equal(decide({ cwd: root, log: () => {} }), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  // Deploy asks it for the run it starts, with the deployed commit's parent checked out.
  const deploy = fs.readFileSync('.github/workflows/deploy.yml', 'utf8');
  const job = deploy.slice(deploy.indexOf('\n  deploy:'));
  assert.match(job.slice(0, job.indexOf('- uses: actions/setup-node')), /fetch-depth: 2/);
});

/* The step that starts dev's run read the decision with `refresh=$(node ...)` under GitHub's
   `bash -e`: a crash ended the step there, and no dev run started at all. Run as the runner runs
   it, with a node that answers each way and a gh that notes what it was asked. */
test('Deploy starts dev\'s run with the refresh unless the script plainly says false', () => {
  type Step = { name?: string; run?: string };
  const workflow = yaml.load(fs.readFileSync('.github/workflows/deploy.yml', 'utf8')) as { jobs: Record<string, { steps: Step[] }> };
  const script = workflow.jobs.deploy.steps.find(step => step.name === "Prepare dev's own content release")?.run;
  assert.ok(script?.includes('node scripts/content/dev-refresh.mjs'), 'the step asks dev-refresh.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arkpedia-dev-dispatch-'));
  try {
    const bin = path.join(root, 'bin'), asked = path.join(root, 'gh.log');
    fs.mkdirSync(bin);
    // Plain sh, not node: the stub node below shadows the real one on PATH.
    fs.writeFileSync(path.join(bin, 'gh'), `#!/bin/sh\necho "$*" >> '${asked}'\n`, { mode: 0o755 });
    const dispatch = (node: string) => {
      fs.writeFileSync(path.join(bin, 'node'), `#!/bin/sh\n${node}\n`, { mode: 0o755 });
      fs.rmSync(asked, { force: true });
      // `bash -e`, GitHub's default shell for a run step.
      execFileSync('bash', ['-e', '-c', script!], { cwd: root, encoding: 'utf8', stdio: 'pipe',
        env: { ...process.env, PATH: `${bin}${path.delimiter}${process.env.PATH}`, GITHUB_REPOSITORY: 'arkpedia/test' } });
      return fs.readFileSync(asked, 'utf8').trim();
    };
    const run = (refresh: string) => `workflow run prepare-content.yml --repo arkpedia/test --ref dev -f refresh_upstream=${refresh}`;
    assert.equal(dispatch('echo false'), run('false'), 'a page-only commit: no refresh');
    assert.equal(dispatch('echo true'), run('true'));
    assert.equal(dispatch('echo "boom" >&2; exit 1'), run('true'), 'a crash still starts the run, refreshing');
    assert.equal(dispatch('echo false; exit 3'), run('true'), 'a failing script is not trusted, whatever it printed');
    assert.equal(dispatch('exit 0'), run('true'), 'nothing printed');
    assert.equal(dispatch('echo maybe'), run('true'), 'a value gh would refuse for a boolean input');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
