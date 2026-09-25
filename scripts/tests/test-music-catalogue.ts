import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { NextApiRequest, NextApiResponse } from 'next';
import { contentUrl } from '../../lib/content/urls';
import { MUSIC_CATALOGUE_PATH, loadMusicCatalogue, projectMusicCatalogue } from '../../lib/music/musicCatalogue';
import type { MonsterSirenSong } from '../../lib/music/albumsData';
import musicGuesserAudio from '../../pages/api/music-guesser/[id]';

const require = createRequire(import.meta.url);
const { ClientDataGuard, deniedClientModules } = require('../build/client-bundle-guard.cjs');
const release = { release: 'a'.repeat(64), baseUrl: 'https://example.test/rev/release', assets: {} };

function song(videoId: string, extra: Partial<MonsterSirenSong> = {}): MonsterSirenSong {
  return { videoId, title: `Title ${videoId}`, altTitle: null, artist: null, composer: 'Composer', credits: [{ role: 'composer', names: ['Composer'] }],
    genre: [], characters: ['Someone'], origin: [], albumId: '1', albumName: 'Album', coverPath: null, copyright: false, length: '03:00',
    lyricFilename: 'x.lrc', hasLyrics: true, ...extra };
}

test('the published queue catalogue carries what a queue row shows and nothing else', () => {
  assert.deepEqual(projectMusicCatalogue([
    song('plainVideo1'),
    song('fullVideo01', { altTitle: 'English', artist: 'Singer', copyright: true }),
  ]), { songs: [
    { videoId: 'plainVideo1', title: 'Title plainVideo1' },
    { videoId: 'fullVideo01', title: 'Title fullVideo01', altTitle: 'English', artist: 'Singer', copyright: true },
  ] });
});

test('the player reads the release catalogue, and the deployment copy only when the release cannot answer', async () => {
  const url = contentUrl(MUSIC_CATALOGUE_PATH, release);
  // A catalogue path left out of contentUrl would silently fetch the deploy's copy forever.
  assert.equal(url, 'https://example.test/rev/release/public/music-catalogue.json');
  assert.equal(contentUrl(MUSIC_CATALOGUE_PATH, null), MUSIC_CATALOGUE_PATH);
  const answer = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body });
  const releaseSongs = { songs: [{ videoId: 'releaseOnly', title: 'In the release' }, { title: 'no video id' }] };
  const deploySongs = { songs: [{ videoId: 'deployCopy', title: 'In the deploy' }] };
  const requests: string[] = [];
  const serve = (releaseAnswer: ReturnType<typeof answer>) => async (input: string) => {
    requests.push(input);
    return input === MUSIC_CATALOGUE_PATH ? answer(200, deploySongs) : releaseAnswer;
  };
  assert.deepEqual(await loadMusicCatalogue(url, undefined, serve(answer(200, releaseSongs))), [{ videoId: 'releaseOnly', title: 'In the release' }]);
  assert.deepEqual(requests, [url]);
  // A release published before the catalogue existed, or a broken one: the deploy's copy.
  for (const broken of [answer(404, null), answer(200, { songs: [] }), answer(200, { list: [] })]) {
    requests.length = 0;
    assert.deepEqual(await loadMusicCatalogue(url, undefined, serve(broken)), deploySongs.songs);
    assert.deepEqual(requests, [url, MUSIC_CATALOGUE_PATH]);
  }
  await assert.rejects(() => loadMusicCatalogue(MUSIC_CATALOGUE_PATH, undefined, async () => answer(500, null)), /returned 500/);
});

test('every catalogue the release validator requires is published by the export and read from the release', () => {
  const validator = fs.readFileSync('scripts/content/validate-release.mjs', 'utf8');
  const required = JSON.parse(validator.match(/for \(const file of (\[[^\]]*'music-catalogue\.json'[^\]]*\])\) check\(m\.files\[file\], `Missing catalogue/)![1].replace(/'/g, '"'));
  const exporter = fs.readFileSync('scripts/content/export.mjs', 'utf8');
  const published = [...exporter.matchAll(/(\/\^public\\\/\(\?:[^/]+\)\\\.json\$\/)\.test\(file\)/g)].map(([, source]) => new RegExp(source.slice(1, -1)));
  assert.ok(published.length, 'export.mjs has a pattern for the top-level catalogues it publishes');
  for (const file of required) {
    assert.ok(published.some(pattern => pattern.test(`public/${file}`)), `export.mjs publishes public/${file}`);
    assert.equal(contentUrl(`/${file}`, release), `${release.baseUrl}/public/${file}`, `contentUrl reads /${file} from the release`);
  }
  assert.match(exporter, /scripts\/build\/build-music-catalogue\.ts/, 'the export writes the catalogue it publishes');
});

/* The value imports reachable from a module, following @/ and relative specifiers the way the
   bundler does; `import type` is erased at compile time, so it is not followed. */
function reachable(entry: string): Set<string> {
  const seen = new Set<string>();
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    if (file.endsWith('.json') || file.endsWith('.css')) return;
    const text = fs.readFileSync(file, 'utf8');
    const specifiers = [...text.matchAll(/^\s*import\s+(?!type\b)(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]/gm), ...text.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)].map(match => match[1]);
    for (const specifier of specifiers) {
      if (!specifier.startsWith('.') && !specifier.startsWith('@/')) continue;
      const base = specifier.startsWith('@/') ? path.resolve(specifier.slice(2)) : path.resolve(path.dirname(file), specifier);
      const found = [base, ...['.ts', '.tsx', '.mjs', '.js', '.json'].map(ext => base + ext), path.join(base, 'index.ts')]
        .find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
      if (found) visit(found);
    }
  };
  visit(path.resolve(entry));
  return new Set([...seen].map(file => path.relative(process.cwd(), file).split(path.sep).join('/')));
}

test('the player mounted on every page reaches no bundled album data', () => {
  // next.config.js enforces this on the real bundle (ClientDataGuard); this finds it before a build.
  for (const entry of ['lib/music/musicPlayerContext.tsx', 'components/music/MusicPlayer.tsx', 'lib/music/musicCatalogue.ts']) {
    const files = reachable(entry);
    assert.ok(!files.has('data/albums.json'), `${entry} reaches data/albums.json`);
    assert.ok(!files.has('lib/music/albumsData.ts'), `${entry} reaches lib/music/albumsData.ts`);
  }
  // The reachability walk does see a value import when there is one.
  assert.ok(reachable('lib/music/albumsData.ts').has('data/albums.json'));
});

test('the bundle guard fails a browser compilation that holds any data/ record it does not allow, and names who imported it', () => {
  const root = path.resolve('/repo');
  const none = () => [];
  // Denied by default: albums, and skins too, which the old named list never mentioned.
  assert.deepEqual(deniedClientModules([`${root}/data/albums.json`, `${root}/data/albums.json?x`, `${root}/data/skins.json`, undefined], root, none), ['data/albums.json', 'data/skins.json']);
  assert.deepEqual(deniedClientModules([`${root}/lib/music/musicCatalogue.ts`, `${root}/data/assets/revisions.json`, `${root}/data/final-poll-results.json`], root, none), []);
  // SL-4b's table passes only through its one importer.
  const windows = `${root}/data/skin-availability-windows.json`;
  assert.deepEqual(deniedClientModules([windows], root, () => ['lib/skins/localSkinWindows.ts']), []);
  assert.deepEqual(deniedClientModules([windows], root, () => ['lib/skins/localSkinWindows.ts', 'lib/skins/skinAvailability.ts']), ['data/skin-availability-windows.json']);

  const compile = (resources: string[]) => {
    const modules = resources.map(resource => ({ resource }));
    const issuers = new Map(modules.slice(1).map((module, i) => [module, modules[i]]));
    let onCompilation: (compilation: object) => void = () => {};
    let onFinish: (modules: object[]) => void = () => {};
    const compilation = { errors: [] as Error[], moduleGraph: { getIssuer: (module: object) => issuers.get(module as { resource: string }) ?? null,
      getIncomingConnections: (module: object) => [{ originModule: issuers.get(module as { resource: string }) ?? null }] },
      hooks: { finishModules: { tap: (_: string, fn: typeof onFinish) => { onFinish = fn; } } } };
    new ClientDataGuard(root).apply({ hooks: { compilation: { tap: (_: string, fn: typeof onCompilation) => { onCompilation = fn; } } } });
    onCompilation(compilation);
    onFinish(modules.reverse());
    return compilation.errors.map(error => error.message);
  };
  // Next's page entry module resolves to the repository root, which names nothing.
  const errors = compile([root, `${root}/pages/_app.tsx`, `${root}/lib/music/musicPlayerContext.tsx`, `${root}/lib/music/albumsData.ts`, `${root}/data/albums.json`]);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^data\/albums\.json is compiled into browser code \(imported by lib\/music\/albumsData\.ts <- lib\/music\/musicPlayerContext\.tsx <- pages\/_app\.tsx\)\. /);
  assert.deepEqual(compile([`${root}/pages/_app.tsx`, `${root}/lib/music/musicCatalogue.ts`]), []);
  assert.deepEqual(compile([`${root}/pages/skins.tsx`, `${root}/lib/skins/localSkinWindows.ts`, `${root}/data/skin-availability-windows.json`]), []);
  assert.match(compile([`${root}/pages/skins.tsx`, `${root}/lib/skins/skinAvailability.ts`, `${root}/data/skin-availability-windows.json`])[0], /^data\/skin-availability-windows\.json is compiled into browser code \(imported by lib\/skins\/skinAvailability\.ts/);
});

type Reply = { status: number; body: unknown; headers: Record<string, string> };
async function callAudio(id: unknown, upstream: (url: string) => unknown): Promise<Reply & { fetched: string[] }> {
  const fetched: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string) => { fetched.push(String(input)); return { ok: true, status: 200, json: async () => upstream(String(input)) }; }) as unknown as typeof fetch;
  const reply: Reply = { status: 0, body: null, headers: {} };
  const res = {
    setHeader(name: string, value: string) { reply.headers[name] = value; return res; },
    status(code: number) { reply.status = code; return res; },
    json(body: unknown) { reply.body = body; return res; },
  };
  try {
    await musicGuesserAudio({ method: 'GET', query: { id } } as unknown as NextApiRequest, res as unknown as NextApiResponse);
  } finally {
    globalThis.fetch = original;
  }
  return { ...reply, fetched };
}

test('the song guesser audio route takes any song Monster Siren serves, not a bundled allowlist', async () => {
  // 999999 is in no albums.json: a song only a later content release carries.
  const signed = 'https://res01.hycdn.cn/signed/999999.wav';
  const served = await callAudio('999999', () => ({ code: 0, data: { cid: '999999', sourceUrl: signed } }));
  assert.equal(served.status, 200);
  assert.deepEqual(served.body, { url: signed });
  assert.deepEqual(served.fetched, ['https://monster-siren.hypergryph.com/api/song/999999']);
  // Only digits ever reach the upstream address.
  for (const id of ['../albums', '12a', '', '1?x=2', ['1', '2'], undefined]) {
    const refused = await callAudio(id, () => { throw new Error('must not be asked'); });
    assert.equal(refused.status, 404, String(id));
    assert.deepEqual(refused.fetched, []);
  }
  // And only Monster Siren's own https audio for that song is passed on.
  for (const upstream of [{ code: 0, data: { cid: '999999', sourceUrl: 'https://evil.example/999999.wav' } }, { code: 0, data: { cid: '999999', sourceUrl: 'http://res01.hycdn.cn/x.wav' } },
    { code: 0, data: { cid: '111111', sourceUrl: signed } }, { code: -1, data: null }]) {
    assert.equal((await callAudio('999999', () => upstream)).status, 502, JSON.stringify(upstream));
  }
  // The route builds on no bundled record, so no release can be ahead of it.
  assert.doesNotMatch(fs.readFileSync('pages/api/music-guesser/[id].ts', 'utf8'), /from '@\/data\/|music-guesser\/catalogue|albumsData/);
});
