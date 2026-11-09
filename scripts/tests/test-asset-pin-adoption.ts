import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// @ts-expect-error Node publication scripts are plain JavaScript.
import { adoptReleaseAssetPins, choosePins, readLiveAssetPins } from '../build/adopt-release-asset-pins.mjs';
// @ts-expect-error Node publication scripts are plain JavaScript.
import { FIX, checkAssetRedirects, encodePath, probe, probeFile } from '../deploy/check-asset-redirects.mjs';
// @ts-expect-error Node publication scripts are plain JavaScript.
import { uncommittedChanges } from '../content/code-fingerprint.mjs';

/*
 * The deployment's own asset pin (data/assets/revisions.json) lagged the release: it moved only
 * when someone bumped it by hand, while the release moved its pins nightly, so a root-relative
 * path to newer art 307'd to a commit without it (/material-icons/涤墨之旗.webp to
 * arkpedia-image-assets@6058775e, 404, on 2026-09-25; the release's 0936e52a had it).
 *
 * prebuild now builds with the live release's pins wherever they are newer, never older
 * (scripts/build/adopt-release-asset-pins.mjs), after write-build-info.mjs so the build stays
 * clean for the release gate. Deploy then asks production for a file only the live pin has
 * (scripts/deploy/check-asset-redirects.mjs) and goes red when it does not reach it.
 */

const A = (c: string) => c.repeat(40);
const ORIGIN = 'https://content.example';
type Reply = { status?: number; body?: string | Buffer; location?: string };

/** A fetch that answers from a table of URL -> reply, and remembers what it was asked. */
function fakeFetch(routes: Record<string, Reply | ((init?: RequestInit) => Reply)>) {
  // Completed version-one media receipts used by these redirect fixtures.
  for (const repository of ['arkpedia-image-assets', 'arkpedia-skin-assets']) for (const revision of ['1', 'a', 'b', 'f'].map(A)) {
    const url = `https://assets.arkpedia.net/__ready/${repository}/${revision}`;
    routes[url] ??= { body: JSON.stringify({ version: 1, repository, revision, files: 1 }) };
  }
  const calls: { url: string; method: string }[] = [];
  const fetch = async (url: string, init: RequestInit = {}) => {
    calls.push({ url, method: init.method ?? 'GET' });
    const route = routes[url];
    const reply = typeof route === 'function' ? route(init) : route ?? { status: 404 };
    const status = reply.status ?? 200;
    const bytes = Buffer.from(reply.body ?? '');
    return {
      ok: status >= 200 && status < 300, status,
      headers: new Headers(reply.location ? { location: reply.location } : {}),
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      json: async () => JSON.parse(bytes.toString()),
    };
  };
  return { fetch, calls };
}

/** The live pointer and manifest as arkpedia-data publishes them. */
function liveRelease(assets: Record<string, string>, { corrupt = false } = {}) {
  const manifest = JSON.stringify({ schema: 2, assets, pages: {}, files: {} });
  const pointer = { schema: 2, release: 'e'.repeat(64), revision: A('d'), manifestSha256: createHash('sha256').update(corrupt ? `${manifest} ` : manifest).digest('hex') };
  return {
    [`${ORIGIN}/live/current.json`]: { body: JSON.stringify(pointer) },
    [`${ORIGIN}/${A('d')}/release/manifest.json`]: { body: manifest },
  };
}
const env = (extra: Record<string, string> = {}) => ({ ARKPEDIA_CONTENT_URL: ORIGIN, ...extra });

test('each repository keeps the newer of its committed and live pins, never an older one', async () => {
  const committed = { images: A('1'), skins: A('2'), voices: A('3'), palette: A('4'), stale: A('5') };
  const live = { images: A('a'), skins: A('b'), voices: A('3'), palette: A('c'), stale: A('f'), onlyLive: A('9') };
  const order: Record<string, string> = { images: 'ahead', skins: 'behind', palette: 'diverged' };
  const asked: string[] = [];
  const { pins, adopted, notes, warnings } = await choosePins({
    committed, live,
    compare: async (repository: string, base: string, head: string) => {
      asked.push(`${repository} ${base.slice(0, 1)}...${head.slice(0, 1)}`);
      if (repository === 'stale') throw new Error('HTTP 403');
      return order[repository];
    },
  });
  assert.deepEqual(pins, { images: A('a'), skins: A('2'), voices: A('3'), palette: A('4'), stale: A('5') });
  assert.deepEqual(adopted, [{ repository: 'images', from: A('1'), to: A('a') }]);
  // Equal pins need no call; a repository only the release names is not added.
  assert.deepEqual(asked, ['images 1...a', 'skins 2...b', 'palette 4...c', 'stale 5...f']);
  assert.equal(notes.length, 1);
  assert.match(notes[0], /skins: the committed 22222222 is newer than the release's bbbbbbbb; keeping it/);
  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /palette: .* have diverged, so neither is newer; keeping 44444444/);
  assert.match(warnings[1], /stale: cannot tell .* \(HTTP 403\); keeping 55555555/);
});

test('the live pins are read the way pages read the release, digest checked', async () => {
  const good = fakeFetch(liveRelease({ 'arkpedia-image-assets': A('a'), 'arkpedia-skin-assets': A('b') }));
  assert.deepEqual((await readLiveAssetPins({ origin: ORIGIN, pointerBranch: 'live', fetch: good.fetch })).assets, { 'arkpedia-image-assets': A('a'), 'arkpedia-skin-assets': A('b') });
  const bad = fakeFetch(liveRelease({ 'arkpedia-image-assets': A('a') }, { corrupt: true }));
  await assert.rejects(readLiveAssetPins({ origin: ORIGIN, pointerBranch: 'live', fetch: bad.fetch }), /does not match its pointer/);
  const unpinned = fakeFetch(liveRelease({ 'arkpedia-image-assets': 'main' }));
  await assert.rejects(readLiveAssetPins({ origin: ORIGIN, pointerBranch: 'live', fetch: unpinned.fetch }), /names no commit-pinned assets/);
  // Which pointer is the caller's to say: no default can know the deployment's channel.
  await assert.rejects(readLiveAssetPins({ origin: ORIGIN, fetch: good.fetch }), /needs the pointer branch/);
});

/* The site read live's release while its channel had no pointer yet (dev-live before the dev
   channel's first run); the build's pin adoption and Deploy's asset-link check read the channel's
   pointer with no fallback, so arkpedia-dev's asset check failed where its pages worked. One
   reader now (lib/content/pointer.mjs), deciding on the error's status, not its message. */
test('a channel with no pointer yet reads live\'s release, as the site does; any other failure is still one', async () => {
  const warn = console.warn;
  const warnings: string[] = [];
  console.warn = (line: string) => warnings.push(line);
  try {
    const missing = fakeFetch(liveRelease({ 'arkpedia-image-assets': A('a'), 'arkpedia-skin-assets': A('b') }));
    assert.equal((await readLiveAssetPins({ origin: ORIGIN, pointerBranch: 'dev-live', fetch: missing.fetch })).assets['arkpedia-image-assets'], A('a'));
    // The missing pointer is asked for once: a 404 is an answer, so the fallback is immediate.
    assert.deepEqual(missing.calls.map(call => call.url).filter(url => url.endsWith('current.json')), [`${ORIGIN}/dev-live/current.json`, `${ORIGIN}/live/current.json`]);
    assert.match(warnings.join('\n'), /dev-live has no pointer yet: reading live's release until it does/);
    // A channel whose pointer exists but fails is not quietly main's release, and a failure that
    // may pass is tried again before it is one.
    const failing = fakeFetch({ ...liveRelease({ 'arkpedia-image-assets': A('a') }), [`${ORIGIN}/dev-live/current.json`]: { status: 500 } });
    await assert.rejects(readLiveAssetPins({ origin: ORIGIN, pointerBranch: 'dev-live', fetch: failing.fetch }), /HTTP 500/);
    assert.ok(!failing.calls.some(call => call.url === `${ORIGIN}/live/current.json`));
    assert.equal(failing.calls.filter(call => call.url === `${ORIGIN}/dev-live/current.json`).length, 3);
    // Live itself has nothing to fall back to.
    await assert.rejects(readLiveAssetPins({ origin: ORIGIN, pointerBranch: 'live', fetch: fakeFetch({}).fetch }), /HTTP 404/);
  } finally {
    console.warn = warn;
  }
  // Every reader goes through it: none matches the message text any more.
  for (const file of ['lib/content/release.ts', 'scripts/build/adopt-release-asset-pins.mjs']) {
    const text = fs.readFileSync(file, 'utf8');
    assert.match(text, /readChannelPointer\(\{/, file);
    assert.doesNotMatch(text, /HTTP 404'/, file);
  }
  // Deploy's asset-link check asks for the deployment's own channel, from the env it is given.
  assert.match(fs.readFileSync('scripts/deploy/check-asset-redirects.mjs', 'utf8'), /readLiveAssetPins\(\{ origin: contentOrigin\(env\), pointerBranch: contentPointer\(env\), fetch \}\)/);
});

function revisionsRoot(pins: Record<string, string>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arkpedia-pins-'));
  fs.mkdirSync(path.join(root, 'data/assets'), { recursive: true });
  const text = `${JSON.stringify(pins, null, 2)}\n`;
  fs.writeFileSync(path.join(root, 'data/assets/revisions.json'), text);
  return { root, text, read: () => fs.readFileSync(path.join(root, 'data/assets/revisions.json'), 'utf8'), cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

test('prebuild writes the adopted pins in the file\'s own form, and leaves the file alone when it adopts nothing', async () => {
  const quiet = { log: () => {}, warn: () => {} };
  const tree = revisionsRoot({ 'arkpedia-image-assets': A('1'), 'arkpedia-skin-assets': A('2') });
  try {
    const { fetch } = fakeFetch(liveRelease({ 'arkpedia-image-assets': A('a'), 'arkpedia-skin-assets': A('2') }));
    const result = await adoptReleaseAssetPins({ root: tree.root, env: env(), fetch, compare: async () => 'ahead', ...quiet });
    assert.deepEqual(result.adopted, [{ repository: 'arkpedia-image-assets', from: A('1'), to: A('a') }]);
    assert.equal(tree.read(), `${JSON.stringify({ 'arkpedia-image-assets': A('a'), 'arkpedia-skin-assets': A('2') }, null, 2)}\n`);
    // Check's build reads no release: its suites are written against the committed pins.
    fs.writeFileSync(path.join(tree.root, 'data/assets/revisions.json'), tree.text);
    const disabled = await adoptReleaseAssetPins({ root: tree.root, env: env({ ARKPEDIA_CONTENT_DISABLED: '1' }), fetch, compare: async () => 'ahead', ...quiet });
    assert.equal(disabled.skipped, true);
    assert.equal(tree.read(), tree.text);
    // An unreachable release keeps the committed pins, with a warning the Build step shows.
    const warned: string[] = [];
    const offline = await adoptReleaseAssetPins({ root: tree.root, env: env({ GITHUB_ACTIONS: 'true' }), fetch: fakeFetch({}).fetch, compare: async () => 'ahead', log: () => {}, warn: (line: string) => warned.push(line) });
    assert.equal(offline.adopted.length, 0);
    assert.equal(tree.read(), tree.text);
    assert.match(warned[0], /^::warning title=Asset pins not adopted::Cannot read the live content release/);
  } finally {
    tree.cleanup();
  }
});

test('the adopted pins leave the build clean for the release gate, then and on the next build', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arkpedia-pins-git-'));
  const git = (...args: string[]) => {
    const result = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'init.defaultBranch=main', ...args], { cwd: dir, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const buildInfo = () => {
    const result = spawnSync(process.execPath, [path.resolve('scripts/build/write-build-info.mjs')], { cwd: dir, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(fs.readFileSync(path.join(dir, 'public/build-info.json'), 'utf8'));
  };
  try {
    git('init', '-q');
    fs.mkdirSync(path.join(dir, 'data/assets'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'public'));
    fs.writeFileSync(path.join(dir, 'data/assets/revisions.json'), `${JSON.stringify({ 'arkpedia-image-assets': A('1') }, null, 2)}\n`);
    fs.writeFileSync(path.join(dir, 'lib.ts'), 'export {};\n');
    fs.writeFileSync(path.join(dir, '.gitignore'), 'public/build-info.json\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'start');
    assert.equal(buildInfo().dirty, false);
    const { fetch } = fakeFetch(liveRelease({ 'arkpedia-image-assets': A('a') }));
    await adoptReleaseAssetPins({ root: dir, env: env(), fetch, compare: async () => 'ahead', log: () => {}, warn: () => {} });
    assert.match(git('status', '--porcelain'), /data\/assets\/revisions\.json/, 'the tracked pin file was rewritten');
    assert.deepEqual(uncommittedChanges({ cwd: dir }), [], 'the rewrite is the build\'s own, not an uncommitted change');
    assert.equal(buildInfo().dirty, false, 'a rebuild in the same checkout is still the commit\'s build');
    fs.writeFileSync(path.join(dir, 'lib.ts'), 'export const x = 1;\n');
    assert.equal(buildInfo().dirty, true, 'any other change still makes a build of no commit');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  assert.match(pkg.scripts.prebuild, /^node scripts\/content\/pull-data\.mjs --if-missing && node scripts\/build\/write-build-info\.mjs && node scripts\/build\/adopt-release-asset-pins\.mjs && /,
    'prebuild pulls the records if they are missing, writes build-info, then adopts the pins before anything reads them');
  assert.doesNotMatch(pkg.scripts.predev, /adopt-release-asset-pins/, 'a dev server keeps the committed pins');
});

test('the deploy probe asks for a file only the live pin has, in a folder the site redirects', () => {
  const folders = ['material-icons', 'essential-icons'];
  const committedFiles = { 'essential-icons/Arkpedia.webp': { sha256: '1' }, 'material-icons/Old.webp': { sha256: '2' } };
  const liveFiles = { ...committedFiles, 'material-icons/涤墨之旗.webp': { sha256: '3' }, 'README.md': { sha256: '4' }, 'originals/x.png': { sha256: '5' } };
  assert.deepEqual(probeFile({ folders, committedFiles, liveFiles }), { file: 'material-icons/涤墨之旗.webp', fresh: true });
  // A file whose bytes changed counts as new too.
  assert.deepEqual(probeFile({ folders, committedFiles, liveFiles: { ...committedFiles, 'material-icons/Old.webp': { sha256: '9' } } }), { file: 'material-icons/Old.webp', fresh: true });
  // Equal commits: any served file of the live one stands in.
  assert.deepEqual(probeFile({ folders, committedFiles, liveFiles: committedFiles }), { file: 'essential-icons/Arkpedia.webp', fresh: false });
  assert.throws(() => probeFile({ folders, committedFiles: {}, liveFiles: { 'README.md': { sha256: '1' } } }), /lists no file in a folder the site redirects/);
  assert.equal(encodePath('headhunting-banner-images/Standard Pool 176 (Global).webp'), 'headhunting-banner-images/Standard%20Pool%20176%20(Global).webp');
});

test('the deploy check fails when production redirects new art to an older commit, and passes when it reaches it', async () => {
  const site = 'https://site.example';
  const raw = (repo: string, rev: string, file: string) => `https://assets.arkpedia.net/arkpedia/${repo}/${rev}/${file}`;
  const manifests = (images: object, skins: object) => ({
    [raw('arkpedia-image-assets', A('a'), 'asset-manifest.json')]: { body: JSON.stringify({ files: images }) },
    [raw('arkpedia-image-assets', A('1'), 'asset-manifest.json')]: { body: JSON.stringify({ files: { 'essential-icons/Arkpedia.webp': { sha256: '1' } } }) },
    [raw('arkpedia-skin-assets', A('b'), 'asset-manifest.json')]: { body: JSON.stringify({ files: skins }) },
  });
  const images = { 'essential-icons/Arkpedia.webp': { sha256: '1' }, 'material-icons/New.webp': { sha256: '2' } };
  const skins = { 'five-star-skins/A - Base.webp': { sha256: '3' } };
  const run = async (redirectTo: string) => {
    const { fetch, calls } = fakeFetch({
      ...liveRelease({ 'arkpedia-image-assets': A('a'), 'arkpedia-skin-assets': A('b') }),
      ...manifests(images, skins),
      [`${site}/material-icons/New.webp`]: { status: 307, location: raw('arkpedia-image-assets', redirectTo, 'material-icons/New.webp') },
      [raw('arkpedia-image-assets', A('a'), 'material-icons/New.webp')]: { status: 200 },
      [`${site}/five-star-skins/A%20-%20Base.webp`]: { status: 307, location: raw('arkpedia-skin-assets', A('b'), 'five-star-skins/A%20-%20Base.webp') },
      [raw('arkpedia-skin-assets', A('b'), 'five-star-skins/A%20-%20Base.webp')]: { status: 200 },
    });
    // A build that kept the committed pins, as one does when prebuild cannot adopt the release's.
    const committed = { 'arkpedia-image-assets': A('1'), 'arkpedia-skin-assets': A('b') };
    const compare = async () => assert.fail('pins the build did not adopt are not ordered');
    const result = await checkAssetRedirects({ fetch, env: env(), committed, baked: committed, compare, deployments: [site], attempts: 2, retryMs: 0, log: () => {} });
    return { problems: result.problems as string[], calls };
  };
  const lagging = await run(A('1'));
  assert.equal(lagging.problems.length, 1);
  assert.match(lagging.problems[0], /^https:\/\/site\.example\/material-icons\/New\.webp \(a file arkpedia-image-assets@aaaaaaaa has and the committed 11111111 does not\) redirects to https:\/\/assets\.arkpedia\.net\/arkpedia\/arkpedia-image-assets\/1{40}\/material-icons\/New\.webp, which answers 404/);
  assert.ok(lagging.calls.every(call => ['GET', 'HEAD'].includes(call.method)), 'GET and HEAD only');
  assert.equal(lagging.calls.filter(call => call.url === `${site}/material-icons/New.webp`).length, 2, 'retried before failing');
  assert.deepEqual((await run(A('a'))).problems, []);
});

/*
 * A release can go live while Deploy's Build step runs (the gate lets through one that the code
 * production still runs compiled), so its newest art is on no commit the build could redirect
 * to. The check reads the live release after the deploy and sets it against the pins the build
 * baked in: newer than a pin the build adopted is that race, a warning; a file of the pin the
 * build used must still answer 200. Keeping the committed pin while the release has a newer one
 * is the lag the check is for, and fails as before.
 */
test('a release that went live during the build is a warning, and a 404 for a file of the pin the build used still fails', async () => {
  const site = 'https://site.example';
  const raw = (repo: string, rev: string, file: string) => `https://assets.arkpedia.net/arkpedia/${repo}/${rev}/${file}`;
  const [committed, adopted, newer] = [A('1'), A('a'), A('f')];
  const icons = (...names: string[]) => ({ body: JSON.stringify({ files: Object.fromEntries(['Arkpedia', ...names].map((name, i) => [`material-icons/${name}.webp`, { sha256: String(i) }])) }) });
  const run = async ({ redirectTo, baked = adopted, order = 'ahead' }: { redirectTo: string; baked?: string; order?: string | Error }) => {
    const { fetch, calls } = fakeFetch({
      ...liveRelease({ 'arkpedia-image-assets': newer, 'arkpedia-skin-assets': A('b') }),
      [raw('arkpedia-image-assets', committed, 'asset-manifest.json')]: icons(),
      [raw('arkpedia-image-assets', adopted, 'asset-manifest.json')]: icons('New'),
      [raw('arkpedia-image-assets', newer, 'asset-manifest.json')]: icons('New', 'Newest'),
      [raw('arkpedia-skin-assets', A('b'), 'asset-manifest.json')]: { body: JSON.stringify({ files: { 'five-star-skins/A - Base.webp': { sha256: '3' } } }) },
      ...Object.fromEntries(['New', 'Newest'].map(name => [`${site}/material-icons/${name}.webp`, { status: 307, location: raw('arkpedia-image-assets', redirectTo, `material-icons/${name}.webp`) }])),
      [raw('arkpedia-image-assets', adopted, 'material-icons/New.webp')]: { status: 200 },
      [raw('arkpedia-image-assets', newer, 'material-icons/New.webp')]: { status: 200 },
      [raw('arkpedia-image-assets', newer, 'material-icons/Newest.webp')]: { status: 200 },
      [`${site}/five-star-skins/A%20-%20Base.webp`]: { status: 307, location: raw('arkpedia-skin-assets', A('b'), 'five-star-skins/A%20-%20Base.webp') },
      [raw('arkpedia-skin-assets', A('b'), 'five-star-skins/A%20-%20Base.webp')]: { status: 200 },
    });
    const compared: string[][] = [];
    const compare = async (repository: string, base: string, head: string) => {
      compared.push([repository, base, head]);
      if (order instanceof Error) throw order;
      return order;
    };
    const result = await checkAssetRedirects({
      fetch, env: env(), deployments: [site], attempts: 2, retryMs: 0, log: () => {}, compare,
      committed: { 'arkpedia-image-assets': committed, 'arkpedia-skin-assets': A('b') },
      baked: { 'arkpedia-image-assets': baked, 'arkpedia-skin-assets': A('b') },
    });
    return { problems: result.problems as string[], warnings: result.warnings as string[], calls, compared };
  };

  // The build adopted aaaaaaaa; the release moved to ffffffff while it built. Production reaches
  // aaaaaaaa's art, and Newest.webp, which only ffffffff has, is not asked for.
  const race = await run({ redirectTo: adopted });
  assert.deepEqual(race.problems, []);
  assert.equal(race.warnings.length, 1);
  assert.match(race.warnings[0], /^The live release moved arkpedia-image-assets to ffffffff after this build adopted aaaaaaaa: a release went live while it built\. .*the next deploy adopts ffffffff\.$/);
  assert.deepEqual(race.compared, [['arkpedia-image-assets', adopted, newer]]);
  assert.ok(race.calls.some(call => call.url === `${site}/material-icons/New.webp`));
  assert.ok(!race.calls.some(call => call.url === `${site}/material-icons/Newest.webp`));
  assert.ok(race.calls.every(call => ['GET', 'HEAD'].includes(call.method)), 'GET and HEAD only');

  // The same race, but production redirects to the committed pin, which lacks New.webp: that
  // 404 is the deployment's own, and still fails.
  const broken = await run({ redirectTo: committed });
  assert.equal(broken.warnings.length, 1);
  assert.equal(broken.problems.length, 1);
  assert.match(broken.problems[0], /^https:\/\/site\.example\/material-icons\/New\.webp \(a file arkpedia-image-assets@aaaaaaaa, the pin this build used, has and the committed 11111111 does not\) redirects to .*\/1{40}\/material-icons\/New\.webp, which answers 404\. This deployment redirects to arkpedia-image-assets@aaaaaaaa, the pin it was built with, which has that file\.$/);

  // The build kept the committed pin while the release had a newer one: the lag, a failure,
  // with nothing to order.
  const lag = await run({ redirectTo: committed, baked: committed });
  assert.deepEqual(lag.warnings, []);
  assert.deepEqual(lag.compared, []);
  assert.match(lag.problems[0], /^https:\/\/site\.example\/material-icons\/New\.webp \(a file arkpedia-image-assets@ffffffff has and the committed 11111111 does not\) redirects to .*, which answers 404\. The live release pins arkpedia-image-assets@ffffffff/);

  // A live pin that is not newer than the adopted one, or pins GitHub cannot order, are not the
  // race: the live pin's file is probed as before, and a 404 fails.
  for (const order of ['behind', 'diverged', new Error('GitHub compare answered HTTP 503')]) {
    const unordered = await run({ redirectTo: committed, order });
    assert.deepEqual(unordered.warnings, [], String(order));
    assert.equal(unordered.problems.length, 1, String(order));
    assert.match(unordered.problems[0], /New\.webp \(a file arkpedia-image-assets@ffffffff has and the committed 11111111 does not\)/, String(order));
  }
});

test('a failed asset-link check points at a redeploy from the live data, not at assets:update', () => {
  assert.doesNotMatch(FIX, /assets:update|update-asset-revisions/);
  assert.match(FIX, /Redeploy/);
  assert.match(FIX, /npm run data:pull/);
  const source = fs.readFileSync('scripts/deploy/check-asset-redirects.mjs', 'utf8');
  assert.doesNotMatch(source.slice(source.indexOf('export async function main')), /assets:update/);
});

test('a probe follows the redirect by hand and says where it led', async () => {
  const { fetch } = fakeFetch({
    'https://site.example/x.webp': { status: 307, location: '/elsewhere/x.webp' },
    'https://site.example/elsewhere/x.webp': { status: 200 },
    'https://site.example/y.webp': { status: 200 },
    'https://site.example/z.webp': { status: 500 },
  });
  assert.deepEqual(await probe(fetch, 'https://site.example/x.webp'), { ok: true, status: 200, location: 'https://site.example/elsewhere/x.webp' });
  assert.deepEqual(await probe(fetch, 'https://site.example/y.webp'), { ok: true, status: 200, location: null });
  assert.deepEqual(await probe(fetch, 'https://site.example/z.webp'), { ok: false, status: 500, location: null });
});
