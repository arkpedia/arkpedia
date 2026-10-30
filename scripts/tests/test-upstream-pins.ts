import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// @ts-expect-error Node publication scripts are plain JavaScript.
import { MIRRORS, pinEnvironment, pinUpstream, pinVariable, pinnedCommit, pinnedRef, rawUrl } from '../content/pin-upstream.mjs';
// @ts-expect-error Node publication scripts are plain JavaScript.
import { rememberRevisions, upstreamRevisions } from '../content/refresh-fingerprint.mjs';

const commit = (c: string) => c.repeat(40);
const heads: Record<string, string> = {
  'Kengxxiao/ArknightsGameData': commit('1'), 'ArknightsAssets/ArknightsGamedata': commit('2'),
  'yuanyan3060/ArknightsGameResource': commit('3'), 'PuppiizSunniiz/ArknightsGameData_YoStar': commit('4'),
  'ArknightsAssets/ArknightsAssets2': commit('5'),
  'ArknightsAssets/ArknightsAssets2:cn': commit('6'),
};
const resolveAll = async (repository: string, branch: string) => heads[branch === 'cn' ? `${repository}:cn` : repository];

test('every mirror the refresh reads is pinned to one commit, under its own variable', async () => {
  assert.deepEqual(MIRRORS.map((mirror: any) => mirror.key ?? mirror.repository), Object.keys(heads));
  const { lock, warnings } = await pinUpstream({ resolve: resolveAll });
  assert.deepEqual(warnings, []);
  assert.deepEqual(lock.repositories['yuanyan3060/ArknightsGameResource'],
    { branch: 'main', commit: commit('3'), variable: 'ARKPEDIA_PIN_YUANYAN3060_ARKNIGHTSGAMERESOURCE', source: 'resolved' });
  assert.equal(lock.repositories['PuppiizSunniiz/ArknightsGameData_YoStar'].variable, 'ARKPEDIA_PIN_PUPPIIZSUNNIIZ_ARKNIGHTSGAMEDATA_YOSTAR');
  assert.equal(lock.repositories['ArknightsAssets/ArknightsGamedata'].variable, 'ARKPEDIA_PIN_ARKNIGHTSASSETS_ARKNIGHTSGAMEDATA');
  assert.equal(lock.repositories['Kengxxiao/ArknightsGameData'].variable, 'ARKPEDIA_PIN_KENGXXIAO_ARKNIGHTSGAMEDATA');
  assert.deepEqual(lock.repositories['ArknightsAssets/ArknightsAssets2'],
    { branch: 'en', commit: commit('5'), variable: 'ARKPEDIA_PIN_ARKNIGHTSASSETS_ARKNIGHTSASSETS2', source: 'resolved' });
  assert.equal(lock.repositories['ArknightsAssets/ArknightsAssets2:cn'].commit, commit('6'));
  assert.equal(lock.repositories['ArknightsAssets/ArknightsAssets2:cn'].variable, 'ARKPEDIA_PIN_ARKNIGHTSASSETS_ARKNIGHTSASSETS2_CN');
});

test('a mirror that cannot be reached keeps the last known commit, and never fails the pin', async () => {
  const previous = { version: 1, repositories: { 'Kengxxiao/ArknightsGameData': { commit: commit('a') } } };
  const unreachable = new Set(['Kengxxiao/ArknightsGameData', 'PuppiizSunniiz/ArknightsGameData_YoStar']);
  const resolve = async (repository: string) => {
    if (unreachable.has(repository)) throw new Error('Could not resolve host: github.com');
    return heads[repository];
  };
  const { lock, warnings } = await pinUpstream({ previous, resolve });
  assert.deepEqual([lock.repositories['Kengxxiao/ArknightsGameData'].commit, lock.repositories['Kengxxiao/ArknightsGameData'].source], [commit('a'), 'last-known']);
  assert.deepEqual([lock.repositories['PuppiizSunniiz/ArknightsGameData_YoStar'].commit, lock.repositories['PuppiizSunniiz/ArknightsGameData_YoStar'].source], [null, 'unpinned']);
  assert.equal(lock.repositories['yuanyan3060/ArknightsGameResource'].commit, commit('3'));
  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /Kengxxiao\/ArknightsGameData: cannot resolve master \(Could not resolve host: github\.com\); using the last known commit aaaaaaaaaaaa/);
  assert.match(warnings[1], /no earlier commit is known; its readers use the branch/);
  // A garbled answer is no better than none.
  const garbled = await pinUpstream({ previous, resolve: async () => 'HEAD' });
  assert.equal(garbled.lock.repositories['Kengxxiao/ArknightsGameData'].source, 'last-known');
});

test('a commit chosen by hand wins, but the pins the runner injected from the last lock do not', async () => {
  const chosen = { ARKPEDIA_PIN_KENGXXIAO_ARKNIGHTSGAMEDATA: commit('c') };
  assert.equal((await pinUpstream({ resolve: resolveAll, env: chosen })).lock.repositories['Kengxxiao/ArknightsGameData'].source, 'given');
  // What the runner passed down from yesterday's lock would otherwise pin every run forever.
  const injected = { ...chosen, ARKPEDIA_PINS_INJECTED: 'ARKPEDIA_PIN_KENGXXIAO_ARKNIGHTSGAMEDATA' };
  const { lock } = await pinUpstream({ resolve: resolveAll, env: injected });
  assert.deepEqual([lock.repositories['Kengxxiao/ArknightsGameData'].commit, lock.repositories['Kengxxiao/ArknightsGameData'].source], [commit('1'), 'resolved']);
});

test('raw file URLs and the upstream checkouts read the same pin', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arkpedia-pins-'));
  try {
    fs.mkdirSync(path.join(root, 'data'));
    const file = 'en_US/gamedata/excel/charword_table.json';
    const puppiiz = 'PuppiizSunniiz/ArknightsGameData_YoStar';
    assert.equal(rawUrl(root, puppiiz, file, {}), `https://raw.githubusercontent.com/${puppiiz}/main/${file}`);
    fs.writeFileSync(path.join(root, 'data/upstream.lock.json'), JSON.stringify({ version: 1, repositories: { [puppiiz]: { branch: 'main', commit: commit('4') } } }));
    assert.equal(rawUrl(root, puppiiz, file, {}), `https://raw.githubusercontent.com/${puppiiz}/${commit('4')}/${file}`);
    assert.deepEqual(pinEnvironment(root, {}), { ARKPEDIA_PIN_PUPPIIZSUNNIIZ_ARKNIGHTSGAMEDATA_YOSTAR: commit('4'), ARKPEDIA_PINS_INJECTED: 'ARKPEDIA_PIN_PUPPIIZSUNNIIZ_ARKNIGHTSGAMEDATA_YOSTAR' });
    assert.throws(() => rawUrl(root, 'someone/else', file, {}), /Not a pinned mirror/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  // scripts/lib/upstream.sh derives the variable name itself, from the clone URL.
  for (const { repository } of MIRRORS.filter((mirror: any) => !mirror.key)) {
    const clean = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('ARKPEDIA_PIN_')));
    const shell = spawnSync('bash', ['-c', '. scripts/lib/upstream.sh && upstream_pin "$1"', '_', `https://github.com/${repository}.git`],
      { encoding: 'utf8', env: { ...clean, [pinVariable(repository)]: commit('9') } as NodeJS.ProcessEnv });
    assert.equal(shell.stdout.trim(), commit('9'), `${repository}: ${shell.stderr}`);
    const unset = spawnSync('bash', ['-c', '. scripts/lib/upstream.sh && upstream_pin "$1"', '_', `https://github.com/${repository}.git`], { encoding: 'utf8', env: clean as NodeJS.ProcessEnv });
    assert.equal(unset.stdout, '');
  }
  // Nothing the daily run fetches itself names a moving branch. (The import downloads the
  // charword supplement at the pin: arkpedia-data importer/scripts/tests/test-upstream-readers.ts.)
  const workflow = fs.readFileSync('.github/workflows/prepare-content.yml', 'utf8');
  assert.doesNotMatch(workflow, /raw\.githubusercontent\.com\/[^/\s]+\/[^/\s]+\/(main|master)\//);
});

test('a reader fetches at the pinned commit, and only an unpinned one asks for the branch head', async () => {
  const kengxxiao = 'Kengxxiao/ArknightsGameData';
  const pinned = { [pinVariable(kengxxiao)]: commit('5') };
  assert.equal(pinnedRef(kengxxiao, pinned), commit('5'));
  // Unpinned, or pinned to something that is not a commit: the branch, as before pinning.
  assert.equal(pinnedRef(kengxxiao, {}), 'master');
  assert.equal(pinnedRef('yuanyan3060/ArknightsGameResource', { ARKPEDIA_PIN_YUANYAN3060_ARKNIGHTSGAMERESOURCE: 'main' }), 'main');
  assert.throws(() => pinnedRef('someone/else', {}), /Not a pinned mirror/);
  // Never the lock: a script run by hand reads today's branch, not the hydrated release's commit.
  const asked: string[] = [];
  const head = async (repository: string, branch: string) => { asked.push(`${repository}@${branch}`); return commit('6'); };
  assert.equal(await pinnedCommit(kengxxiao, head, pinned), commit('5'));
  assert.deepEqual(asked, []);
  assert.equal(await pinnedCommit(kengxxiao, head, {}), commit('6'));
  assert.deepEqual(asked, ['Kengxxiao/ArknightsGameData@master']);
  const regional = { ARKPEDIA_PIN_ARKNIGHTSASSETS_ARKNIGHTSASSETS2: commit('5'), ARKPEDIA_PIN_ARKNIGHTSASSETS_ARKNIGHTSASSETS2_CN: commit('6') };
  assert.equal(pinnedRef('ArknightsAssets/ArknightsAssets2', regional, 'en'), commit('5'));
  assert.equal(pinnedRef('ArknightsAssets/ArknightsAssets2', regional, 'cn'), commit('6'));
});

test('the catalogue reads both regions and plans its art at the pinned commits, with no API call for them', async () => {
  // @ts-expect-error Node publication scripts are plain JavaScript.
  const { revision, source } = await import('../sync/sync-catalogue.mjs');
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'arkpedia-catalogue-pins-'));
  const realFetch = globalThis.fetch;
  const asked: string[] = [];
  globalThis.fetch = (async (url: string) => {
    asked.push(String(url));
    if (String(url).startsWith('https://api.github.com/')) return new Response(JSON.stringify({ sha: commit('7') }));
    throw new Error('offline');
  }) as typeof fetch;
  try {
    const env = { [pinVariable('yuanyan3060/ArknightsGameResource')]: commit('3'), [pinVariable('Kengxxiao/ArknightsGameData')]: commit('1') };
    assert.equal(await revision('yuanyan3060/ArknightsGameResource', env), commit('3'));
    // The tables come from the raw host at the commit (the stub refuses them, which is fine here).
    await assert.rejects(source('Kengxxiao/ArknightsGameData', 'zh_CN/gamedata/excel', cache, env), /offline/);
    assert.deepEqual(asked, [`https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/${commit('1')}/zh_CN/gamedata/excel/character_table.json`]);
    // Unpinned, the branch head is resolved once through the API, as before.
    assert.equal(await revision('ArknightsAssets/ArknightsGamedata', {}), commit('7'));
    assert.equal(asked.at(-1), 'https://api.github.com/repos/ArknightsAssets/ArknightsGamedata/commits/master');
  } finally {
    globalThis.fetch = realFetch;
    fs.rmSync(cache, { recursive: true, force: true });
  }
});

test('every reader of the daily refresh fetches each mirror at its pinned commit', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arkpedia-readers-'));
  try {
    // Every request is recorded and refused, so each script stops at its first reads.
    const preload = path.join(root, 'offline.mjs'), log = path.join(root, 'fetched.txt');
    fs.writeFileSync(preload, "import fs from 'node:fs';\nglobalThis.fetch = async url => { fs.appendFileSync(process.env.FETCH_LOG, `${url}\\n`); throw new Error('offline'); };\n");
    fs.mkdirSync(path.join(root, 'cwd/data'), { recursive: true });
    const pins = Object.fromEntries(MIRRORS.map((mirror: any, i: number) => [pinVariable(mirror.key ?? mirror.repository), commit(String(i + 1))]));
    const clean = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('ARKPEDIA_'))) as NodeJS.ProcessEnv;
    // The readers this repository keeps (the completeness gate reaches the catalogue's); the
    // import's are held to the same in arkpedia-data (importer/scripts/tests/test-upstream-readers.ts).
    for (const script of ['sync/sync-module-stats.mjs', 'sync/sync-content-inventory.mjs', 'build/build-operator-voices.mjs', 'sync/sync-operator-english.mjs']) {
      fs.rmSync(log, { force: true });
      spawnSync(process.execPath, ['--import', preload, path.resolve('scripts', script)], { cwd: path.join(root, 'cwd'), encoding: 'utf8',
        env: { ...clean, ...pins, FETCH_LOG: log, ARKPEDIA_EN: path.join(root, 'none'), ARKPEDIA_CN: path.join(root, 'none') } });
      const urls = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n') : [];
      const mirrored = urls.filter(url => MIRRORS.some((mirror: any) => url.includes(`/${mirror.repository}/`)));
      assert.ok(mirrored.length, `${script} read no mirror: ${urls.join(', ')}`);
      for (const url of mirrored) {
        const { repository } = MIRRORS.find((mirror: any) => url.includes(`/${mirror.repository}/`));
        assert.ok(url.startsWith(`https://raw.githubusercontent.com/${repository}/${pins[pinVariable(repository)]}/`), `${script}: ${url}`);
      }
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('the voice lines name the mirrors by branch, so a mirror moving does not rewrite the file', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arkpedia-voice-meta-'));
  try {
    // Every input local, so nothing is fetched; the transcripts are read at the pins.
    const empty = path.join(root, 'empty.json'), output = path.join(root, 'voices.json');
    fs.writeFileSync(empty, '{}');
    fs.writeFileSync(path.join(root, 'assets.json'), JSON.stringify({ voice: [], voice_cn: [], voice_custom: [], voice_en: [], voice_kr: [] }));
    fs.mkdirSync(path.join(root, 'tlvr'));
    const pins = Object.fromEntries(MIRRORS.map((mirror: any, i: number) => [pinVariable(mirror.key ?? mirror.repository), commit(String(i + 1))]));
    const run = spawnSync(process.execPath, ['scripts/build/build-operator-voices.mjs'], { encoding: 'utf8', env: { ...process.env, ...pins,
      ARKPEDIA_EN_CHARWORDS: empty, ARKPEDIA_EN_SUPPLEMENTAL_CHARWORDS: empty, ARKPEDIA_CN_CHARWORDS: empty, ARKPEDIA_VOICE_INDEX: empty,
      ARKPEDIA_EN_SKINS: empty, ARKPEDIA_CN_SKINS: empty,
      ARKPEDIA_TLVR_DIR: path.join(root, 'tlvr'), ARKPEDIA_VOICE_ASSET_INDEX: path.join(root, 'assets.json'), ARKPEDIA_VOICE_OUTPUT: output } });
    assert.equal(run.status, 0, run.stderr);
    const published = JSON.parse(fs.readFileSync('data/operator-voice-lines.json', 'utf8')).meta;
    const written = JSON.parse(fs.readFileSync(output, 'utf8')).meta;
    // The transcripts and the skin tables the outfit voice sets come from.
    for (const key of ['transcripts', 'outfits']) {
      assert.deepEqual(written[key], published[key], key);
      assert.ok(published[key].length && published[key].every((url: string) => /\/(?:main|master)\//.test(url)), key);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('upstream.sh checks out the pinned commit, not the branch head', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arkpedia-upstream-'));
  try {
    const clean = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('ARKPEDIA_PIN_') && !name.startsWith('GIT_'))) as NodeJS.ProcessEnv;
    const git = (cwd: string, ...args: string[]) => {
      const result = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...clean, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' } });
      assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
      return result.stdout.trim();
    };
    // A stand-in mirror with two commits on main, served over file:// as GitHub serves it.
    const mirror = path.join(root, 'mirror');
    fs.mkdirSync(path.join(mirror, 'tables'), { recursive: true });
    git(mirror, 'init', '-q', '-b', 'main');
    git(mirror, 'config', 'uploadpack.allowAnySHA1InWant', 'true');
    git(mirror, 'config', 'uploadpack.allowFilter', 'true');
    const commitVersion = (n: string) => {
      fs.writeFileSync(path.join(mirror, 'tables/version.txt'), n);
      git(mirror, 'add', '-A');
      git(mirror, '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-q', '-m', n);
      return git(mirror, 'rev-parse', 'HEAD');
    };
    const pinned = commitVersion('one');
    commitVersion('two');
    const app = path.join(root, 'app');
    fs.mkdirSync(path.join(app, 'scripts/lib'), { recursive: true });
    fs.copyFileSync('scripts/lib/upstream.sh', path.join(app, 'scripts/lib/upstream.sh'));
    // The URL looks like GitHub's, so the variable name derives as it would in the refresh.
    const url = 'https://github.com/Kengxxiao/ArknightsGameData.git';
    const gitconfig = path.join(root, 'gitconfig');
    fs.writeFileSync(gitconfig, `[url "file://${mirror}"]\n\tinsteadOf = ${url}\n[protocol "file"]\n\tallow = always\n`);
    const sync = (env: Record<string, string>) => spawnSync('bash', ['scripts/lib/upstream.sh', 'cn', url, 'default', 'tables'],
      { cwd: app, encoding: 'utf8', env: { ...clean, GIT_CONFIG_GLOBAL: gitconfig, GIT_CONFIG_NOSYSTEM: '1', ...env } });
    const first = sync({ ARKPEDIA_PIN_KENGXXIAO_ARKNIGHTSGAMEDATA: pinned });
    assert.equal(first.status, 0, first.stdout + first.stderr);
    assert.match(first.stdout, /cn at [0-9a-f]+ \(pinned main\)/);
    assert.equal(fs.readFileSync(path.join(app, '.cache/upstream/cn/tables/version.txt'), 'utf8'), 'one');
    // Unpinned, the next sync of the same checkout moves to the branch head, as before.
    const later = sync({});
    assert.equal(later.status, 0, later.stdout + later.stderr);
    assert.equal(fs.readFileSync(path.join(app, '.cache/upstream/cn/tables/version.txt'), 'utf8'), 'two');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('the refresh fingerprint survives a repository it cannot reach', async () => {
  const lastKnown = { 'a/moved': commit('a'), 'c/fine': commit('0') };
  const responses: Record<string, () => Promise<Response>> = {
    'a/moved': async () => new Response('{}', { status: 404 }),
    'b/new': async () => { throw new Error('getaddrinfo ENOTFOUND api.github.com'); },
    'c/fine': async () => new Response(JSON.stringify([{ sha: commit('c') }]), { status: 200 }),
    'd/garbled': async () => new Response(JSON.stringify({ message: 'API rate limit exceeded' }), { status: 200 }),
  };
  const fetch = (url: string) => responses[url.match(/repos\/([^/]+\/[^/]+)\/commits/)![1]]();
  const { revisions, warnings } = await upstreamRevisions(Object.keys(responses), { lastKnown, fetch });
  assert.deepEqual(revisions, [['a/moved', commit('a')], ['b/new', 'b/new:unavailable'], ['c/fine', commit('c')], ['d/garbled', 'd/garbled:unavailable']]);
  assert.deepEqual(warnings, [
    'Cannot check a/moved (HTTP 404); using its last known commit aaaaaaaaaaaa.',
    'Cannot check b/new (getaddrinfo ENOTFOUND api.github.com) and no earlier commit is known; it counts as unchanged.',
    'Cannot check d/garbled (the response names no commit) and no earlier commit is known; it counts as unchanged.',
  ]);
  // Only real commits are remembered, so a marker never overwrites a known commit.
  assert.deepEqual(rememberRevisions({ ...lastKnown, 'b/new': commit('b') }, revisions),
    { 'a/moved': commit('a'), 'b/new': commit('b'), 'c/fine': commit('c') });
});

test('the daily run keeps the fingerprint\'s last known revisions between runs', () => {
  const workflow = fs.readFileSync('.github/workflows/prepare-content.yml', 'utf8');
  const restore = workflow.indexOf('uses: actions/cache/restore@'), check = workflow.indexOf('run: node scripts/content/refresh-fingerprint.mjs'), save = workflow.indexOf('uses: actions/cache/save@');
  assert.ok(restore > 0 && restore < check && check < save, 'restored before the probe, saved after it');
  for (const at of [restore, save]) assert.match(workflow.slice(at, at + 200), /path: \.cache\/refresh-fingerprint\n\s+key: refresh-fingerprint-\$\{\{ github\.run_id \}\}/);
  assert.match(workflow.slice(restore, restore + 300), /restore-keys: refresh-fingerprint-\n/);
});
