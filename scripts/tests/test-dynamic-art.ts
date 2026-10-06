import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { pages, pathToTarget } from './browser-graph';
import {
  animationButtons, appearanceSkinId, assertDynamicArtIndex, openingPlan, operatorDynamicArt, parseDynamicModel, pressPlan,
  skinDynamicArt, type DynamicArtIndex,
} from '../../lib/skins/dynamicArt';
import { contentUrl } from '../../lib/content/urls';
import { SPINE_RUNTIMES_LICENSE } from '../../lib/credits/spineLicense';
// @ts-expect-error Node publication scripts are plain JavaScript.
import { REPOSITORY, dynamicArtFromManifest, emptyDynamicArt, readDynamicArt, writeDynamicArt } from '../sync/sync-dynamic-art.mjs';

/*
 * Animated outfit art (lib/skins/dynamicArt.ts): the content stage that says which artwork has a
 * Spine model (scripts/sync/sync-dynamic-art.mjs), the pointer each page attaches, how the
 * focused artwork view names and plays a model's animations, and that nothing of it loads with
 * a page.
 */

const COMMIT = 'a'.repeat(40);
const HOSHIGUMA_E2 = 'models/char_1044_hsgma2_2/0123456789ab/model.json';
const FUGUE = 'models/char_113_cqbw_epoque_7/ba9876543210/model.json';
const raw = (file: string, commit = COMMIT) => `https://raw.githubusercontent.com/arkpedia/arkpedia-l2d-assets/${commit}/${file}`;

/* --- the content stage --------------------------------------------------------------- */

test('the stage turns the manifest into pointers pinned to the commit it was read at', () => {
  const { data, skipped } = dynamicArtFromManifest({
    schemaVersion: 1, server: 'en', resVersion: '25-09-30-12-00-00-abcdef',
    models: { 'char_113_cqbw@epoque#7': FUGUE, 'char_1044_hsgma2#2': HOSHIGUMA_E2 },
  }, COMMIT);
  assert.deepEqual(skipped, []);
  assert.deepEqual(data, {
    schemaVersion: 1, repository: 'arkpedia/arkpedia-l2d-assets', commit: COMMIT,
    models: { 'char_1044_hsgma2#2': raw(HOSHIGUMA_E2), 'char_113_cqbw@epoque#7': raw(FUGUE) },
  });
  // What the pages read back is exactly that.
  assert.equal(assertDynamicArtIndex(data), data);
});

test('a broken manifest entry is skipped, a manifest that is not one fails the stage', () => {
  const { data, skipped } = dynamicArtFromManifest({
    schemaVersion: 1,
    models: {
      'char_1044_hsgma2#2': HOSHIGUMA_E2,
      'not a skin': HOSHIGUMA_E2,
      'char_002_amiya#1': '../../etc/passwd',
      'char_003_kalts#1': 'models/char_003_kalts_1/0123456789ab/skeleton.skel',
      'char_010_chen#2': null,
    },
  }, COMMIT);
  assert.deepEqual(Object.keys(data.models), ['char_1044_hsgma2#2']);
  assert.equal(skipped.length, 4);
  assert.ok(skipped.some((line: string) => line.startsWith('not a skin: not a skin id')));
  assert.throws(() => dynamicArtFromManifest({ schemaVersion: 2, models: {} }, COMMIT), /schemaVersion/);
  assert.throws(() => dynamicArtFromManifest({ schemaVersion: 1 }, COMMIT), /no models/);
  assert.throws(() => dynamicArtFromManifest([], COMMIT), /not an object/);
  assert.throws(() => dynamicArtFromManifest({ schemaVersion: 1, models: {} }, 'main'), /Not a commit/);
});

/** A stand-in for GitHub: the API's answer for the branch head, then the raw host's. */
function github(head: { status: number; sha?: string }, manifest: { status: number; body?: string }) {
  const asked: string[] = [];
  const fetch = async (url: string) => {
    asked.push(url);
    if (url === `https://api.github.com/repos/${REPOSITORY}/commits/main`) {
      return new Response(head.sha ? JSON.stringify({ sha: head.sha }) : '{}', { status: head.status });
    }
    if (url === raw('manifest.json', head.sha)) return new Response(manifest.body ?? '', { status: manifest.status });
    throw new Error(`unexpected request: ${url}`);
  };
  return { fetch, asked };
}

test('the stage reads the manifest at main\'s commit, and a repository with none yet has no models', async () => {
  const live = github({ status: 200, sha: COMMIT }, { status: 200, body: JSON.stringify({ schemaVersion: 1, models: { 'char_1044_hsgma2#2': HOSHIGUMA_E2 } }) });
  const read = await readDynamicArt({ fetch: live.fetch });
  assert.deepEqual(read.data.models, { 'char_1044_hsgma2#2': raw(HOSHIGUMA_E2) });
  // GET only: the commit from the API, then the manifest at that commit, nothing at the moving branch.
  assert.deepEqual(live.asked, [`https://api.github.com/repos/${REPOSITORY}/commits/main`, raw('manifest.json')]);

  // While the asset PR is open, main has no manifest.json: no models, and the stage succeeds.
  const noManifest = await readDynamicArt({ fetch: github({ status: 200, sha: COMMIT }, { status: 404 }).fetch });
  assert.deepEqual(noManifest.data, { schemaVersion: 1, repository: 'arkpedia/arkpedia-l2d-assets', commit: null, models: {} });
  assert.deepEqual(noManifest.data, emptyDynamicArt());
  // A repository with no commit at all (GitHub answers 409).
  assert.deepEqual((await readDynamicArt({ fetch: github({ status: 409 }, { status: 404 }).fetch })).data, emptyDynamicArt());

  // Anything else fails the stage, which then keeps yesterday's file.
  await assert.rejects(readDynamicArt({ fetch: github({ status: 503 }, { status: 404 }).fetch }), /HTTP 503/);
  await assert.rejects(readDynamicArt({ fetch: github({ status: 200, sha: 'main' }, { status: 404 }).fetch }), /names no commit/);
  await assert.rejects(readDynamicArt({ fetch: github({ status: 200, sha: COMMIT }, { status: 500 }).fetch }), /HTTP 500/);
  await assert.rejects(readDynamicArt({ fetch: github({ status: 200, sha: COMMIT }, { status: 200, body: '<html>' }).fetch }), /not JSON/);
});

test('the stage writes the data file only when it changed, and is a stage of the daily refresh', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arkpedia-dynamic-art-'));
  try {
    fs.mkdirSync(path.join(root, 'data'));
    assert.equal(writeDynamicArt(root, emptyDynamicArt()), true);
    assert.equal(writeDynamicArt(root, emptyDynamicArt()), false);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'data/dynamic-art.json'), 'utf8')), emptyDynamicArt());
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  assert.match(fs.readFileSync('scripts/sync/refresh-stage-data.sh', 'utf8'), /^stage dynamic-art -- node scripts\/sync\/sync-dynamic-art\.mjs$/m);
  // A new model wakes the daily refresh, like a new commit of any repository it reads.
  assert.match(fs.readFileSync('scripts/content/refresh-fingerprint.mjs', 'utf8'), /'arkpedia\/arkpedia-l2d-assets'/);
  // The committed file is one the pages accept.
  assertDynamicArtIndex(JSON.parse(fs.readFileSync('data/dynamic-art.json', 'utf8')));
});

test('the pages accept only model.json pointers at the file\'s own commit', () => {
  const index = (models: Record<string, string>, commit: string | null = COMMIT) => ({ schemaVersion: 1, repository: 'arkpedia/arkpedia-l2d-assets', commit, models });
  assert.throws(() => assertDynamicArtIndex(index({ 'char_1044_hsgma2#2': raw(HOSHIGUMA_E2, 'b'.repeat(40)) })), /not a model\.json at/);
  assert.throws(() => assertDynamicArtIndex(index({ 'char_1044_hsgma2#2': `https://example.com/${HOSHIGUMA_E2}` })), /not a model\.json at/);
  assert.throws(() => assertDynamicArtIndex(index({ 'char_1044_hsgma2#2': raw(HOSHIGUMA_E2) }, null)), /not a model\.json at/);
  assert.throws(() => assertDynamicArtIndex({ ...index({}), schemaVersion: 2 }), /schemaVersion 1/);
  // A local check may point at a model on this machine, and nothing else may.
  const local = index({ 'char_1044_hsgma2#2': 'http://127.0.0.1:8123/char_1044_hsgma2_2/model.json' });
  const before = process.env.ARKPEDIA_CONTENT_TEST;
  try {
    delete process.env.ARKPEDIA_CONTENT_TEST;
    assert.throws(() => assertDynamicArtIndex(local), /not a model\.json at/);
    process.env.ARKPEDIA_CONTENT_TEST = '1';
    assert.equal(assertDynamicArtIndex(local), local);
  } finally {
    if (before === undefined) delete process.env.ARKPEDIA_CONTENT_TEST; else process.env.ARKPEDIA_CONTENT_TEST = before;
  }
});

test('the site\'s URL rewriting leaves a model pointer as it is', () => {
  const release = { release: 'f'.repeat(64), baseUrl: 'https://example.invalid/release', assets: { 'arkpedia-image-assets': 'c'.repeat(40), 'arkpedia-skin-assets': 'd'.repeat(40) } };
  assert.equal(contentUrl(raw(HOSHIGUMA_E2)), raw(HOSHIGUMA_E2));
  assert.equal(contentUrl(raw(HOSHIGUMA_E2), release), raw(HOSHIGUMA_E2));
});

/* --- the pointers the pages attach ------------------------------------------------------ */

const INDEX: DynamicArtIndex = {
  schemaVersion: 1, repository: 'arkpedia/arkpedia-l2d-assets', commit: COMMIT,
  models: {
    'char_1044_hsgma2#2': raw(HOSHIGUMA_E2),
    'char_113_cqbw@epoque#7': raw(FUGUE),
    'char_1044_hsgma2@whirlwind#11': raw('models/char_1044_hsgma2_whirlwind_11/0123456789ab/model.json'),
  },
};
const HOSHIGUMA = { name: 'Hoshiguma the Breacher', internalName: 'char_1044_hsgma2' };
const SKINS = [
  { name: 'An Ultimate Flash', model: 'Hoshiguma the Breacher', image: '/six-star-skins/Hoshiguma the Breacher - An Ultimate Flash.webp', skinId: 'char_1044_hsgma2@whirlwind#11' },
  { name: 'Fugue', model: 'Lappland', image: '/six-star-skins/Lappland - Fugue.webp', skinId: 'char_113_cqbw@epoque#7' },
  { name: 'Unanimated', model: 'Hoshiguma the Breacher', image: '/six-star-skins/Hoshiguma the Breacher - Unanimated.webp', skinId: 'char_1044_hsgma2@other#3' },
];
const appearance = (label: string) => ({ label, fullPath: `/six-star-skins/${encodeURIComponent(`Hoshiguma the Breacher - ${label}`)}.webp` });

test('an operator page points Elite 2 at <internalName>#2, Base at #1, and an outfit at its skin record\'s id', () => {
  assert.equal(appearanceSkinId(HOSHIGUMA, appearance('Elite 2'), SKINS), 'char_1044_hsgma2#2');
  assert.equal(appearanceSkinId(HOSHIGUMA, appearance('Base'), SKINS), 'char_1044_hsgma2#1');
  assert.equal(appearanceSkinId(HOSHIGUMA, appearance('An Ultimate Flash'), SKINS), 'char_1044_hsgma2@whirlwind#11');
  // Matched by its art file too, when the label and the record's name differ in punctuation.
  assert.equal(appearanceSkinId(HOSHIGUMA, { label: 'An Ultimate Flash!', fullPath: appearance('An Ultimate Flash').fullPath }, SKINS), 'char_1044_hsgma2@whirlwind#11');
  // Elite 1 has no art of its own in the skin table, and an operator with no internal name none at all.
  assert.equal(appearanceSkinId(HOSHIGUMA, appearance('Elite 1'), SKINS), null);
  assert.equal(appearanceSkinId({ name: 'Hoshiguma the Breacher', internalName: null }, appearance('Elite 2'), SKINS), null);
  // Another operator's outfit of the same name is not this one's.
  assert.equal(appearanceSkinId({ name: 'Somebody', internalName: 'char_9_x' }, appearance('An Ultimate Flash'), SKINS), null);

  assert.deepEqual(operatorDynamicArt(INDEX, HOSHIGUMA, ['Base', 'Elite 2', 'An Ultimate Flash', 'Unanimated'].map(appearance), SKINS), {
    'Elite 2': raw(HOSHIGUMA_E2),
    'An Ultimate Flash': INDEX.models['char_1044_hsgma2@whirlwind#11'],
  });
});

test('/skins points each outfit at its model by skin id, and lists only the ones that have one', () => {
  assert.deepEqual(skinDynamicArt(INDEX, [...SKINS, { skinId: undefined }]), {
    'char_1044_hsgma2@whirlwind#11': INDEX.models['char_1044_hsgma2@whirlwind#11'],
    'char_113_cqbw@epoque#7': raw(FUGUE),
  });
  // An inherited property is no model.
  assert.deepEqual(skinDynamicArt(INDEX, [{ skinId: 'constructor' }, { skinId: 'toString' }]), {});
});

/* --- playing a model ------------------------------------------------------------------- */

test('the buttons: Start is Intro, Interact is Touch, Idle and Special keep their names, any other its own', () => {
  assert.deepEqual(animationButtons(['Special', 'Interact', 'Idle', 'Start', 'Smile']), [
    { name: 'Start', label: 'Intro' },
    { name: 'Idle', label: 'Idle' },
    { name: 'Interact', label: 'Touch' },
    { name: 'Special', label: 'Special' },
    { name: 'Smile', label: 'Smile' },
  ]);
  assert.deepEqual(animationButtons(['Idle', 'Interact', 'Special']).map((button) => button.label), ['Idle', 'Touch', 'Special']);
});

test('on opening: Start once and then Idle on a loop where the model has a Start, else Idle on a loop', () => {
  assert.deepEqual(openingPlan(['Idle', 'Interact', 'Special', 'Start'], false, false), { pose: 'Idle', entrance: false, intro: 'Start', loop: 'Idle' });
  assert.deepEqual(openingPlan(['Idle', 'Interact', 'Special'], false, false), { pose: 'Idle', entrance: false, intro: null, loop: 'Idle' });
  // Under reduced motion it stands still in the Idle pose until a button is pressed.
  assert.deepEqual(openingPlan(['Idle', 'Interact', 'Special', 'Start'], true, false), { pose: 'Idle', entrance: false, intro: null, loop: null });
  // A model with no Idle rests in its first animation.
  assert.deepEqual(openingPlan(['Relax', 'Interact'], false, false), { pose: 'Relax', entrance: false, intro: null, loop: 'Relax' });
});

test('an outfit with an entrance opens with it, then Start, then Idle; under reduced motion nothing plays', () => {
  const names = ['Idle', 'Interact', 'Special', 'Start'];
  assert.deepEqual(openingPlan(names, false, true), { pose: 'Idle', entrance: true, intro: 'Start', loop: 'Idle' });
  assert.deepEqual(openingPlan(names, true, true), { pose: 'Idle', entrance: false, intro: null, loop: null });
  // Intro is the whole sequence; every other button skips the entrance.
  assert.deepEqual(pressPlan('Start', names, false, true), { entrance: true, play: 'Start', loop: false, then: 'Idle' });
  assert.deepEqual(pressPlan('Start', names, true, true), { entrance: true, play: 'Start', loop: false, then: null });
  assert.deepEqual(pressPlan('Interact', names, false, true), { entrance: false, play: 'Interact', loop: false, then: 'Idle' });
  assert.deepEqual(pressPlan('Idle', names, false, true), { entrance: false, play: 'Idle', loop: true, then: null });
});

test('Touch plays Interact once and returns to Idle; under reduced motion nothing loops on its own', () => {
  const names = ['Idle', 'Interact', 'Special', 'Start'];
  assert.deepEqual(pressPlan('Interact', names, false, false), { entrance: false, play: 'Interact', loop: false, then: 'Idle' });
  assert.deepEqual(pressPlan('Special', names, false, false), { entrance: false, play: 'Special', loop: false, then: 'Idle' });
  assert.deepEqual(pressPlan('Start', names, false, false), { entrance: false, play: 'Start', loop: false, then: 'Idle' });
  assert.deepEqual(pressPlan('Idle', names, false, false), { entrance: false, play: 'Idle', loop: true, then: null });
  assert.deepEqual(pressPlan('Interact', names, true, false), { entrance: false, play: 'Interact', loop: false, then: null });
  assert.deepEqual(pressPlan('Idle', names, true, false), { entrance: false, play: 'Idle', loop: false, then: null });
});

test('a model.json is checked before anything is fetched on its word', () => {
  const model = {
    schemaVersion: 1, skinId: 'char_1044_hsgma2#2', dynIllustId: 'dyn_illust_char_1044_hsgma2', spineVersion: '3.8.99',
    skeleton: { file: 'skeleton.skel', format: 'binary', bytes: 1479999, sha256: '0'.repeat(64) },
    atlas: { file: 'skeleton.atlas', bytes: 28513, sha256: '0'.repeat(64) },
    textures: [{ file: 'page0.webp', width: 2396, height: 2396, bytes: 1, sha256: '0'.repeat(64) }],
    premultipliedAlpha: true,
    animations: { Idle: 9.333, Interact: 13.6, Special: 15 },
    bounds: { x: -1018, y: -218, width: 1976, height: 2027 },
    source: { server: 'en', bundle: 'arts/dynchars/char_1044_hsgma2_2.ab', md5: '0'.repeat(32), resVersion: 'x' },
  };
  const parsed = parseDynamicModel(model);
  assert.deepEqual(Object.keys(parsed.animations), ['Idle', 'Interact', 'Special']);
  assert.equal(parsed.textures[0].file, 'page0.webp');
  // Never a path out of the model's folder, never another schema.
  assert.throws(() => parseDynamicModel({ ...model, atlas: { file: '../other/skeleton.atlas' } }), /atlas/);
  assert.throws(() => parseDynamicModel({ ...model, textures: [{ file: 'https://example.com/x.webp', width: 1, height: 1 }] }), /textures/);
  assert.throws(() => parseDynamicModel({ ...model, schemaVersion: 2 }), /schemaVersion/);
  assert.throws(() => parseDynamicModel({ ...model, bounds: { x: 0, y: 0, width: 0, height: 0 } }), /bounds/);
  assert.equal(parsed.entrance, null);
  assert.equal(parseDynamicModel({ ...model, dynEntranceId: null, entrance: null }).entrance, null);

  // An entrance: its own skeleton, page and soundtrack, all inside the model's folder.
  const entrance = {
    skeleton: { file: 'entrance.skel', format: 'binary', bytes: 809093, sha256: '0'.repeat(64) },
    atlas: { file: 'entrance.atlas', bytes: 27085, sha256: '0'.repeat(64) },
    textures: [{ file: 'entrance-page0.webp', width: 2168, height: 2168, bytes: 1, sha256: '0'.repeat(64) }],
    animations: { Start: 22.333 },
    bounds: { x: -1044, y: -36, width: 2049, height: 1672 },
    audio: { file: 'entrance.mp3', duration: 22.772, bytes: 456098, sha256: '0'.repeat(64) },
  };
  const withEntrance = parseDynamicModel({ ...model, dynEntranceId: 'dyn_entrance_char_1012_skadi2_iteration#2', entrance });
  assert.deepEqual(withEntrance.entrance, {
    skeleton: { file: 'entrance.skel', format: 'binary' },
    atlas: { file: 'entrance.atlas' },
    textures: [{ file: 'entrance-page0.webp', width: 2168, height: 2168 }],
    animations: { Start: 22.333 },
    audio: { file: 'entrance.mp3', duration: 22.772 },
  });
  assert.equal(parseDynamicModel({ ...model, entrance: { ...entrance, audio: null } }).entrance?.audio, null);
  assert.throws(() => parseDynamicModel({ ...model, entrance: { ...entrance, audio: { file: '../x.mp3', duration: 1 } } }), /entrance audio/);
  assert.throws(() => parseDynamicModel({ ...model, entrance: { ...entrance, animations: { Idle: 1 } } }), /entrance has no Start/);
  assert.throws(() => parseDynamicModel({ ...model, entrance: { ...entrance, textures: [] } }), /entrance textures/);
});

/* --- nothing loads with the page ------------------------------------------------------- */

const RUNTIME = 'lib/vendor/spine-3.8/spine-webgl.js';
const ARTWORK = 'components/skins/DynamicArtwork.tsx';

test('no page loads the Spine runtime or the animated artwork with itself: only when the reader asks', () => {
  // Not vacuous: both pages that offer animated art do reach both, lazily.
  for (const page of ['pages/skins.tsx', 'pages/operators/[name].tsx']) {
    assert.deepEqual(pathToTarget(page, [ARTWORK]), [page, 'components/skins/SkinZoomOverlay.tsx', ARTWORK]);
    assert.equal(pathToTarget(page, [RUNTIME])?.at(-1), RUNTIME);
  }
  const eager = pages().flatMap((page) => {
    const chain = pathToTarget(page, [RUNTIME, ARTWORK], { lazy: false });
    return chain ? [chain.join(' -> ')] : [];
  });
  assert.deepEqual(eager, [], 'A page bundle may not carry the Spine runtime or DynamicArtwork: import them with import() / next/dynamic.');

  // And in the source: the overlay brings the artwork in through next/dynamic, the artwork the
  // runtime through import(), and nothing else names the runtime at all.
  const overlay = fs.readFileSync('components/skins/SkinZoomOverlay.tsx', 'utf8');
  assert.match(overlay, /= dynamic\(\(\) => import\('\.\/DynamicArtwork'\), \{ ssr: false \}\)/);
  assert.doesNotMatch(overlay, /^import (?!type )[^\n]*['"]\.\/DynamicArtwork['"]/m);
  const artwork = fs.readFileSync(ARTWORK, 'utf8');
  assert.match(artwork, /import\('@\/lib\/vendor\/spine-3\.8\/spine-webgl'\)/);
  assert.doesNotMatch(artwork, /^import (?!type )[^\n]*spine-3\.8/m);
  const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const at = path.join(dir, entry.name);
    if (entry.isDirectory()) return at === path.join('lib', 'vendor') ? [] : walk(at);
    return /\.(tsx?|mjs|js)$/.test(entry.name) ? [at] : [];
  });
  const naming = ['pages', 'components', 'lib'].flatMap(walk).filter((file) => /vendor\/spine-3\.8/.test(fs.readFileSync(file, 'utf8')));
  assert.deepEqual(naming.sort(), [ARTWORK, 'lib/credits/spineLicense.ts']);
});

/* --- the licence ----------------------------------------------------------------------- */

test('the Spine Runtimes License ships beside the runtime and on /support, word for word', () => {
  assert.equal(SPINE_RUNTIMES_LICENSE, fs.readFileSync('lib/vendor/spine-3.8/LICENSE', 'utf8'));
  assert.match(SPINE_RUNTIMES_LICENSE, /^Spine Runtimes License Agreement\n/);
  assert.match(SPINE_RUNTIMES_LICENSE, /Copyright \(c\) 2013-2019, Esoteric Software LLC/);
  const support = fs.readFileSync('pages/support.tsx', 'utf8');
  assert.match(support, />Credits and licences</);
  assert.match(support, /<pre className="support-licence">\{SPINE_RUNTIMES_LICENSE\}<\/pre>/);
  // The vendored runtime says where it came from and that it is not to be changed without a licence.
  const readme = fs.readFileSync('lib/vendor/spine-3.8/README.md', 'utf8');
  assert.match(readme, /8b4844bd4b193ba9e54487ed397a777993cbad56/);
  assert.match(readme, /Do not modify these files unless a Spine licence is in force/);
  assert.match(fs.readFileSync(RUNTIME, 'utf8'), /\nexport \{ spine \};\n$/);
});
