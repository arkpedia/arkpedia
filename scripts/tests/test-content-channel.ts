import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { test } from 'node:test';
// @ts-expect-error Node scripts are plain JavaScript.
import { CHANNELS, channelFor, contentPointer } from '../content/channel.mjs';
// @ts-expect-error Node scripts are plain JavaScript.
import { deployTargets, readDeployments } from '../deploy/deploy-targets.mjs';
// @ts-expect-error Node scripts are plain JavaScript.
import { deploymentUrls } from '../content/deploy-gate.mjs';
import { contentChannel } from '../../lib/content/server';

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
  for (const bad of ['../main', 'Dev', 'a/b', '-x']) assert.throws(() => contentPointer({ ARKPEDIA_CONTENT_CHANNEL: bad }), /lower-case/);
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
  // Main's publish step stops at once on any other channel.
  const mainStep = workflow.slice(workflow.indexOf('- name: Publish the validated public release'), workflow.indexOf("- name: Publish the dev channel's release"));
  assert.ok(mainStep.indexOf('if [ "${ARKPEDIA_RELEASE_BRANCH:-main}" != main ]; then exit 0; fi') < mainStep.indexOf('git -C "$repo"'));
  const commands = devBlock.split('\n').filter(line => !line.trim().startsWith('#')).join('\n');
  assert.ok(!/HEAD:(?:refs\/heads\/)?(?:main|live)\b|origin (?:main|live)\b/.test(commands), 'the dev block pushes or fetches neither data main nor live');
  assert.match(devBlock, /push --force origin "HEAD:refs\/heads\/\$ARKPEDIA_DATA_BRANCH"/);
  assert.match(devBlock, /push --quiet origin "HEAD:\$ARKPEDIA_CONTENT_POINTER"/);
  const publisher = fs.readFileSync('scripts/sync/publish-catalogue-assets.sh', 'utf8');
  assert.ok(publisher.indexOf('"$ARKPEDIA_RELEASE_BRANCH" != main') < publisher.indexOf('git push') || !publisher.includes('git push'));
  assert.ok(publisher.indexOf('"$ARKPEDIA_RELEASE_BRANCH" != main') < publisher.indexOf('push "git@github.com'));
  const out = execFileSync('bash', ['scripts/sync/publish-catalogue-assets.sh'], { encoding: 'utf8', env: { ...process.env, ARKPEDIA_RELEASE_BRANCH: 'dev' } });
  assert.match(out, /The dev channel publishes no art/);
});

test('after a release goes live, only the deployments of the branch that compiled it are refreshed', async () => {
  // @ts-expect-error Node scripts are plain JavaScript.
  const { refreshPages } = await import('../content/refresh-pages.mjs');
  for (const [branch, site] of [['main', 'https://www.arkpedia.net'], ['dev', 'https://arkpedia-dev.vercel.app']]) {
    const calls: string[] = [];
    await refreshPages({ secret: 's', branch, fetch: async (url: string) => { calls.push(url); return new Response('{}'); }, log: () => {} });
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
