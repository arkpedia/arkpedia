import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { pages, pathToTarget } from './browser-graph';
import {
  animationButtons, appearanceSkinId, assertDynamicArtIndex, cameraAt, fadesAt, handoverIn, handoverOut, openingPlan, operatorDynamicArt,
  parseDynamicModel, pressPlan, restingView, viewBetween, HANDOVER_IN_SECONDS,
  skinDynamicArt, type DynamicArtIndex,
} from '../../lib/skins/dynamicArt';
import { LIMITS, combine, followMatrix, frameAt, layerClock, layerPose, parseDynamicLayers, partRanges, wrapUnit, type DynamicLayer } from '../../lib/skins/dynamicLayers';
import { contentUrl } from '../../lib/content/urls';
import { readGolden } from '../particles/golden';
import { SPINE_RUNTIMES_LICENSE } from '../../lib/credits/spineLicense';
import { LINKS } from '../../lib/nav/navLinks';

/*
 * Animated outfit art (lib/skins/dynamicArt.ts): the pointer each page attaches, how the focused
 * artwork view names and plays a model's animations, and that nothing of it loads with a page.
 * Which artwork has a Spine model is written by arkpedia-data's importer (its
 * scripts/sync/sync-dynamic-art.mjs, whose own test lives beside it).
 */

const COMMIT = 'a'.repeat(40);
const HOSHIGUMA_E2 = 'models/char_1044_hsgma2_2/0123456789ab/model.json';
const FUGUE = 'models/char_113_cqbw_epoque_7/ba9876543210/model.json';
const raw = (file: string, commit = COMMIT) => `https://raw.githubusercontent.com/arkpedia/arkpedia-l2d-assets/${commit}/${file}`;

/* --- the committed record ------------------------------------------------------------ */

test('the committed pointers are ones the pages accept, and a new model wakes the daily refresh', () => {
  assertDynamicArtIndex(JSON.parse(fs.readFileSync('data/dynamic-art.json', 'utf8')));
  // A new model wakes the refresh, like a new commit of any repository it reads. The stage
  // that writes the file is arkpedia-data's importer, whose own test lives beside it.
  assert.match(fs.readFileSync('scripts/content/refresh-fingerprint.mjs', 'utf8'), /'arkpedia\/arkpedia-l2d-assets'/);
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

test('animated models use R2 while preserving their independently pinned source commit', () => {
  const release = { release: 'f'.repeat(64), baseUrl: 'https://example.invalid/release', assets: { 'arkpedia-image-assets': 'c'.repeat(40), 'arkpedia-skin-assets': 'd'.repeat(40) } };
  const expected = raw(HOSHIGUMA_E2).replace('https://raw.githubusercontent.com', 'https://assets.arkpedia.net');
  assert.equal(contentUrl(raw(HOSHIGUMA_E2)), expected);
  assert.equal(contentUrl(raw(HOSHIGUMA_E2), release), expected);
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
    camera: null,
    audio: { file: 'entrance.mp3', duration: 22.772 },
  });
  assert.equal(parseDynamicModel({ ...model, entrance: { ...entrance, audio: null } }).entrance?.audio, null);
  assert.throws(() => parseDynamicModel({ ...model, entrance: { ...entrance, audio: { file: '../x.mp3', duration: 1 } } }), /entrance audio/);
  assert.throws(() => parseDynamicModel({ ...model, entrance: { ...entrance, animations: { Idle: 1 } } }), /entrance has no Start/);
  assert.throws(() => parseDynamicModel({ ...model, entrance: { ...entrance, textures: [] } }), /entrance textures/);

  // The mesh layers: a file in the model's folder, or none.
  assert.equal(parsed.layers, null);
  assert.deepEqual(parseDynamicModel({ ...model, layers: { file: 'layers.json', bytes: 2293, sha256: '0'.repeat(64) } }).layers, { file: 'layers.json' });
  assert.throws(() => parseDynamicModel({ ...model, layers: { file: '../layers.json' } }), /layers/);
  assert.throws(() => parseDynamicModel({ ...model, layers: { file: 'https://example.com/layers.json' } }), /layers/);
});

/* --- the mesh layers ------------------------------------------------------------------- */

const frame = (t: number, values: Record<number, number> = {}) => {
  const f = [t, 1, 0, 0, 1, 0, 0, 1, 1, 1, 1, 1, 1, 0, 1, 0];
  for (const [i, v] of Object.entries(values)) f[Number(i)] = v;
  return f;
};
const quad = { uvs: [0, 1, 1, 1, 0, 0, 1, 0], colors: null, triangles: [0, 3, 1, 3, 0, 2], scroll: null, only: null, delay: 0, follow: null };
// Eyjafjalla's Summer Flowers FA394 shape: a sky behind the skeleton's first part, a glow on a bone
// between its parts, an Interact effect that starts 1.5 s in, a scrolling ribbon.
const LAYERS = {
  schemaVersion: 1,
  textures: [{ file: 'layer0.webp', width: 1024, height: 1024, bytes: 1, sha256: '0'.repeat(64), wrap: ['clamp', 'clamp'] },
    { file: 'layer1.webp', width: 512, height: 512, bytes: 1, sha256: '0'.repeat(64), wrap: ['repeat', 'repeat'] }],
  bounds: { x: -1028, y: -7, width: 2060, height: 1300 },
  separators: ['Agoat2_Braid_B_17'],
  draw: [
    { layer: { ...quad, name: 'bg_02', blend: 'alpha', texture: 1, color: [1, 1, 1, 1], vertices: [-672, 123, 400, 123, -672, 1200, 400, 1200], animation: null } },
    { part: 0 },
    { layer: { ...quad, name: 'glow', blend: 'add', texture: 0, color: null, vertices: [-1, -1, 1, -1, -1, 1, 1, 1],
      follow: { bone: 'hand', xy: true, rotation: true, localScale: false, mirrored: false, parent: [100, 0, 0, 100], position: [0, 0], angle: 0 },
      animation: { length: 2, loop: true, loopFrom: 0, frames: [frame(0), frame(1, { 11: 0 }), frame(2)] } } },
    { part: 1 },
    { layer: { ...quad, name: 'spark', blend: 'add', texture: 0, color: [2, 1, 1, 1], vertices: [0, 0, 10, 0, 0, 10, 10, 10], animation: null, only: 'Interact', delay: 1.5 } },
    { layer: { ...quad, name: 'ribbon', blend: 'alpha', texture: 1, color: [1, 1, 1, 1], vertices: [0, 0, 10, 0, 0, 10, 10, 10], animation: null, scroll: [-0.15, 0] } },
  ],
  omitted: { particles: 84, trails: 0, skinned: 0, hidden: 0, holders: 0, custom: [{ name: 'bg_cloud_01', reason: 'flow distortion (up to 0.06 UV, 30.7 texels)' }], externalTexture: [], other: [] },
};
const layerOf = (name: string) => {
  const entry = parseDynamicLayers(LAYERS).draw.find((e) => e.kind === 'layer' && e.layer.name === name);
  assert.ok(entry && entry.kind === 'layer');
  return entry.layer as DynamicLayer;
};

test('a layers.json is checked before its textures are fetched, and a layer this reader does not know is dropped alone', () => {
  const layers = parseDynamicLayers(LAYERS);
  assert.deepEqual(layers.draw.map((e) => (e.kind === 'part' ? e.index : e.kind === 'layer' ? e.layer.name : e.systems)), ['bg_02', 0, 'glow', 1, 'spark', 'ribbon']);
  assert.equal(layers.particles, null);
  assert.deepEqual(layers.textures.map((t) => t.file), ['layer0.webp', 'layer1.webp']);
  assert.deepEqual(layers.bounds, LAYERS.bounds);
  assert.equal(layers.skipped, 0);
  const sky = layerOf('bg_02');
  assert.ok(sky.vertices instanceof Float32Array && sky.triangles instanceof Uint16Array);
  // Never a path, never another schema, never a part or texture out of range.
  const textures = (file: string) => ({ ...LAYERS, textures: [{ ...LAYERS.textures[0], file }, LAYERS.textures[1]] });
  assert.throws(() => parseDynamicLayers(textures('../layer0.webp')), /textures\[0\]/);
  assert.throws(() => parseDynamicLayers(textures('https://example.com/layer0.webp')), /textures\[0\]/);
  assert.throws(() => parseDynamicLayers({ ...LAYERS, schemaVersion: 2 }), /schemaVersion 2/);
  assert.throws(() => parseDynamicLayers({ ...LAYERS, draw: [...LAYERS.draw, { part: 2 }] }), /part/);
  assert.throws(() => parseDynamicLayers({ ...LAYERS, draw: LAYERS.draw.filter((e) => !('part' in e)) }), /no skeleton part/);
  assert.throws(() => parseDynamicLayers({ ...LAYERS, bounds: null }), /bounds/);
  // One layer it does not understand (an unknown blend, a texture or vertex out of range) is left out, the rest draw.
  const odd = (change: Record<string, unknown>) => parseDynamicLayers({ ...LAYERS, draw: [{ layer: { ...LAYERS.draw[0].layer, ...change } }, ...LAYERS.draw.slice(1)] });
  for (const change of [{ blend: 'multiply' }, { texture: 2 }, { triangles: [0, 1, 4] }, { uvs: [0, 1] }, { only: 'Touch' }]) {
    const read = odd(change);
    assert.equal(read.skipped, 1, JSON.stringify(change));
    assert.equal(read.draw.length, LAYERS.draw.length - 1);
  }
});

test('the skeleton\'s parts follow the draw order: a separator starts its part, inactive slots are skipped', () => {
  const slot = (name: string, index: number, active = true) => ({ name, index, active });
  const order = [slot('a', 0), slot('b', 1), slot('sep', 4), slot('c', 2, false), slot('d', 3)];
  assert.deepEqual(partRanges(order, ['sep'], 2), [[0, 1], [4, 3]]);
  // The draw order moved the separator: the parts move with it, by position, not by name.
  assert.deepEqual(partRanges([slot('sep', 4), slot('a', 0)], ['sep'], 2), [null, [4, 0]]);
  // A renderer beyond the separators draws nothing; slots beyond the renderers are not drawn.
  assert.deepEqual(partRanges(order, [], 2), [[0, 3], null]);
  assert.deepEqual(partRanges(order, ['b', 'sep'], 2), [[0, 0], [1, 1]]);
  assert.deepEqual(partRanges([slot('a', 0, false)], [], 1), [null]);
});

test('a layer\'s timeline loops from loopFrom or holds, steps its switch, and follows its bone', () => {
  const timeline = { length: 2, loop: true, loopFrom: 0, frames: [frame(0, { 5: 0 }), frame(1, { 5: 10, 11: 0 }), frame(2, { 5: 0 })] };
  assert.equal(frameAt(timeline, 0.5)[4], 5);
  assert.equal(frameAt(timeline, 0.5)[10], 1, 'switched until the next frame');
  assert.equal(frameAt(timeline, 1.5)[10], 0);
  assert.equal(frameAt(timeline, 2.5)[4], 5, 'wraps');
  assert.equal(frameAt({ ...timeline, loopFrom: 1 }, 3.25)[4], 7.5, 'wraps to loopFrom after a prelude');
  assert.equal(frameAt({ ...timeline, loop: false }, 9)[4], 0, 'holds');

  const bone = { worldX: 10, worldY: 20, scaleX: 1, scaleY: 1, getWorldRotationX: () => 90 };
  const glow = layerOf('glow');
  const m = combine(followMatrix(glow.follow!, bone), [1, 0, 0, 1, 0, 0]);
  const close = (a: readonly number[], b: readonly number[]) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-9, `${a} vs ${b}`));
  close(m, [0, -100, 100, 0, 10, 20]);
  close(followMatrix({ ...glow.follow!, mirrored: true }, bone), [0, 100, -100, 0, 10, 20]);
  close(followMatrix({ ...glow.follow!, localScale: true }, { ...bone, scaleX: -1, getWorldRotationX: () => 0 }), [100, 0, 0, -100, 10, 20]);
});

test('layers show on their clocks: groups with their animation, after their delay, and still under reduced motion', () => {
  const idle = { playing: 'Idle', animationTime: 3, time: 3.5 };
  // The sky: always, as shipped.
  assert.deepEqual(layerPose(layerOf('bg_02'), idle)?.color, [1, 1, 1, 1]);
  // The glow runs on the illustration's clock and is switched off between 1 and 2 s of its loop.
  assert.equal(layerPose(layerOf('glow'), { ...idle, time: 0.5 })?.color[3], 1);
  assert.equal(layerPose(layerOf('glow'), { ...idle, time: 1.5 }), null);
  assert.ok(layerPose(layerOf('glow'), { ...idle, time: 2.5 }));
  // The Interact effect: only during Interact, from 1.5 s into it.
  const spark = layerOf('spark');
  assert.equal(layerPose(spark, idle), null);
  assert.equal(layerPose(spark, { playing: 'Interact', animationTime: 1, time: 9 }), null);
  assert.deepEqual(layerPose(spark, { playing: 'Interact', animationTime: 2, time: 9 })?.color, [2, 1, 1, 1]);
  // The ribbon scrolls with the clock; reduced motion holds every clock at 0, so it stands still.
  assert.deepEqual(layerPose(layerOf('ribbon'), { ...idle, time: 2 })?.uv, [1, 0.7, 1, 0]); // -0.3, wrapped
  assert.deepEqual(layerPose(layerOf('ribbon'), { playing: 'Idle', animationTime: 0, time: 0 })?.uv, [1, 0, 1, 0]);
  // A layer whose Animator the controller triggers plays that state's timeline from the animation's start.
  const triggered: DynamicLayer = { ...layerOf('glow'), animation: { ...layerOf('glow').animation!, states: {
    Special: { length: 1, loop: false, loopFrom: 0, frames: [frame(0, { 7: 0.5 }), frame(1, { 7: 0.25 })] },
  } } };
  assert.equal(layerPose(triggered, { playing: 'Special', animationTime: 0.5, time: 7 })?.color[0], 0.375);
  assert.equal(layerPose(triggered, { playing: 'Special', animationTime: 5, time: 7 })?.color[0], 0.25, 'holds its end');
  assert.equal(layerPose(triggered, { playing: 'Idle', animationTime: 1.5, time: 0.5 }), null, 'Idle restarts the default state');
});

/* --- the entrance's camera --------------------------------------------------------------- */

// Skadi's Red Countess, shortened: a close-up high on the scene, a cut under a dip to black at 3.6 s,
// and the pull-out that ends in a white flash; the hand-over colour is white.
const RED_COUNTESS = {
  frames: [[0, 11, 1170.1, 708.5, 0], [3.6, 10.2, 1151, 691.8, 0], [3.7, 301, 538.5, 691, 0], [22.333, -36.4, 803.8, 818.7, -10]],
  fades: [
    { color: [0, 0, 0], keys: [[0, 0], [3, 0.3], [3.6, 1], [3.95, 1], [5, 0]] },
    { color: [1, 1, 1], keys: [[0, 0], [20.3, 0], [21.867, 1], [22.333, 1]] },
  ],
  handover: [1, 1, 1],
};
const modelWith = (camera: unknown) => ({
  schemaVersion: 1, skinId: 'char_1012_skadi2@iteration#2', premultipliedAlpha: true,
  skeleton: { file: 'skeleton.skel', format: 'binary' }, atlas: { file: 'skeleton.atlas' },
  textures: [{ file: 'page0.webp', width: 2156, height: 2156 }], animations: { Idle: 16, Start: 2.667 },
  bounds: { x: -1005, y: 4, width: 1951, height: 1586 },
  entrance: {
    skeleton: { file: 'entrance.skel', format: 'binary' }, atlas: { file: 'entrance.atlas' },
    textures: [{ file: 'entrance-page0.webp', width: 2168, height: 2168 }], animations: { Start: 22.333 },
    camera, audio: null,
  },
});

test('an entrance camera is read from model.json, and anything malformed is refused', () => {
  const camera = parseDynamicModel(modelWith(RED_COUNTESS)).entrance?.camera;
  assert.ok(camera);
  assert.equal(camera.frames.length, 4);
  assert.deepEqual(camera.handover, [1, 1, 1]);
  // A model from before cameras, or an entrance the game names none for: the illustration's framing.
  assert.equal(parseDynamicModel(modelWith(null)).entrance?.camera, null);
  assert.equal(parseDynamicModel(modelWith(undefined)).entrance?.camera, null);
  const broken: [unknown, RegExp][] = [
    [{ ...RED_COUNTESS, frames: [] }, /camera frames/],
    [{ ...RED_COUNTESS, frames: [[0.5, 0, 0, 1, 0]] }, /camera frames/],
    [{ ...RED_COUNTESS, frames: [[0, 0, 0, 0, 0]] }, /camera frames/],
    [{ ...RED_COUNTESS, frames: [[0, 0, 0, 1]] }, /camera frames/],
    [{ ...RED_COUNTESS, frames: [[0, 0, 0, 1, 0], [0, 1, 1, 1, 0]] }, /camera frames/],
    [{ ...RED_COUNTESS, fades: [{ color: [0, 0, 2], keys: [[0, 0]] }] }, /camera fades/],
    [{ ...RED_COUNTESS, fades: [{ color: [0, 0, 0], keys: [] }] }, /camera fades/],
    [{ ...RED_COUNTESS, fades: [{ color: [0, 0, 0], keys: [[0, 1.5]] }] }, /camera fades/],
    [{ ...RED_COUNTESS, handover: [1, 1] }, /camera handover/],
  ];
  for (const [value, message] of broken) assert.throws(() => parseDynamicModel(modelWith(value)), message);
});

test('the camera interpolates between its keys, holds at both ends, and carries its roll', () => {
  const camera = parseDynamicModel(modelWith(RED_COUNTESS)).entrance!.camera!;
  assert.deepEqual(cameraAt(camera, 0), { x: 11, y: 1170.1, height: 708.5, roll: 0 });
  assert.deepEqual(cameraAt(camera, -1), cameraAt(camera, 0));
  assert.deepEqual(cameraAt(camera, 99), { x: -36.4, y: 803.8, height: 818.7, roll: -10 });
  const mid = cameraAt(camera, 1.8);
  assert.ok(Math.abs(mid.x - 10.6) < 1e-9 && Math.abs(mid.height - 700.15) < 1e-9);
  // The cut is a tenth of a second across, under the black.
  assert.ok(cameraAt(camera, 3.65).x > 150);
  assert.deepEqual(fadesAt(camera, 3.8), [[0, 0, 0, 1]]);
  assert.deepEqual(fadesAt(camera, 10), []);
  assert.deepEqual(fadesAt(camera, 22.333), [[1, 1, 1, 1]]);
});

test('the hand-over: the white flash already covers the end, so it only clears; with no fade the colour rises, then clears', () => {
  const camera = parseDynamicModel(modelWith(RED_COUNTESS)).entrance!.camera!;
  assert.equal(handoverIn(camera, 22.2, 22.333), null);
  assert.deepEqual(handoverOut(camera, 22.333), [1, 1, 1, 1]);
  // Wis'adel's: no fades, a black hand-over.
  const plain = parseDynamicModel(modelWith({ ...RED_COUNTESS, fades: [], handover: [0, 0, 0] })).entrance!.camera!;
  assert.equal(handoverIn(plain, 22.333 - HANDOVER_IN_SECONDS - 0.1, 22.333), null);
  assert.deepEqual(handoverIn(plain, 22.333 - HANDOVER_IN_SECONDS / 2, 22.333)?.slice(0, 3), [0, 0, 0]);
  assert.ok(Math.abs(handoverIn(plain, 22.333 - HANDOVER_IN_SECONDS / 2, 22.333)![3] - 0.5) < 1e-9);
  assert.deepEqual(handoverOut(plain, 22.333), [0, 0, 0, 1]);
  const none = parseDynamicModel(modelWith({ ...RED_COUNTESS, fades: [], handover: null })).entrance!.camera!;
  assert.equal(handoverIn(none, 22.3, 22.333), null);
  assert.equal(handoverOut(none, 22.333), null);
});

test('the view settles from the entrance onto the illustration\'s framing, which contains its bounds', () => {
  const bounds = { x: -1005, y: 4, width: 1951, height: 1586 };
  // A wide canvas fits the height; a narrow one the width, as the player always framed it.
  assert.deepEqual(restingView(bounds, 16 / 9), { x: -29.5, y: 797, height: 1586 * 1.02, roll: 0 });
  assert.ok(Math.abs(restingView(bounds, 1).height - 1951 * 1.02) < 1e-9);
  const from = { x: 0, y: 0, height: 800, roll: -10 }, to = restingView(bounds, 16 / 9);
  assert.deepEqual(viewBetween(from, to, 0), from);
  assert.deepEqual(viewBetween(from, to, 1), to);
  assert.deepEqual(viewBetween(from, to, 2), to);
  const half = viewBetween(from, to, 0.5);
  assert.ok(Math.abs(half.height - (800 + to.height) / 2) < 1e-9 && Math.abs(half.roll + 5) < 1e-9);
});

/* --- particle runs -------------------------------------------------------------------- */

test('a layers.json\'s particle runs stand where the export put them, beside a particle file this reader reads', () => {
  const POINTER = { file: 'layerParticles.json', bytes: 100, sha256: '0'.repeat(64), version: 1 };
  const draw = [LAYERS.draw[0], { particles: [0, 1] }, LAYERS.draw[1], { particles: [3] }, ...LAYERS.draw.slice(2)];
  const read = parseDynamicLayers({ ...LAYERS, particles: POINTER, draw });
  assert.deepEqual(read.particles, { file: 'layerParticles.json' });
  assert.equal(read.skipped, 0);
  assert.deepEqual(read.draw.map((e) => (e.kind === 'part' ? e.index : e.kind === 'layer' ? e.layer.name : e.systems)), ['bg_02', [0, 1], 0, [3], 'glow', 1, 'spark', 'ribbon']);
  // No pointer, or one this reader does not read (a path, another version): no particles, each run skipped as unknown
  // (as the deployed readers skip them), the rest drawn as before.
  for (const particles of [undefined, null, { ...POINTER, file: '../layerParticles.json' }, { ...POINTER, file: 'https://example.com/layerParticles.json' },
    { ...POINTER, version: 2 }]) {
    const other = parseDynamicLayers({ ...LAYERS, particles, draw });
    assert.equal(other.particles, null, JSON.stringify(particles));
    assert.equal(other.skipped, 2);
    assert.deepEqual(other.draw.map((e) => e.kind), ['layer', 'part', 'layer', 'part', 'layer', 'layer']);
  }
  // A run that is not one (empty, not whole numbers, out of order, a system an earlier run named, past the cap) is skipped alone.
  for (const run of [[], [1.5], [2, 1], [1, 1], [-1], [LIMITS.particleSystems], 'x']) {
    const odd = parseDynamicLayers({ ...LAYERS, particles: POINTER, draw: [{ particles: [0, 1] }, { particles: run }, { particles: [5] }, ...LAYERS.draw] });
    assert.equal(odd.skipped, 1, JSON.stringify(run));
    assert.deepEqual(odd.draw.filter((e) => e.kind === 'particles').map((e) => e.kind === 'particles' && e.systems), [[0, 1], [5]]);
  }
  const later = parseDynamicLayers({ ...LAYERS, particles: POINTER, draw: [{ particles: [4] }, { particles: [2, 3] }, ...LAYERS.draw] });
  assert.equal(later.skipped, 1, 'runs list their systems in index order');
  // The particle textures are capped on their own: a layers.json at the layers' cap still has its particles.
  const full = Array.from({ length: LIMITS.textures }, (_, i) => ({ ...LAYERS.textures[1], file: `layer${i}.webp` }));
  assert.deepEqual(parseDynamicLayers({ ...LAYERS, textures: full, particles: POINTER, draw }).particles, { file: 'layerParticles.json' });
});

test('compat: today\'s file is drawn as the deployed reader draws it, and a file with particles draws the same layers in the same order, its runs between', () => {
  type Drawn = { draw: (number | string)[]; skipped: number; textures: string[]; bounds: unknown };
  const fixture = readGolden<{ today: { file: Record<string, unknown>; deployed: Drawn }; particles: { file: { draw: Record<string, unknown>[] }; deployed: Drawn } }>(
    'scripts/tests/fixtures/particles/compat.json.gz');
  const summary = (value: unknown): Drawn => {
    const read = parseDynamicLayers(value);
    return { draw: read.draw.flatMap((e): (number | string)[] => (e.kind === 'part' ? [e.index] : e.kind === 'layer' ? [e.layer.name] : [])), skipped: read.skipped,
      textures: read.textures.map((t) => t.file), bounds: read.bounds };
  };
  assert.deepEqual(summary(fixture.today.file), fixture.today.deployed);
  assert.equal(parseDynamicLayers(fixture.today.file).particles, null);
  const read = parseDynamicLayers(fixture.particles.file);
  assert.equal(read.skipped, 0, 'the new reader skips nothing');
  assert.deepEqual(read.particles, { file: 'layerParticles.json' });
  const runs = read.draw.filter((e) => e.kind === 'particles');
  assert.equal(runs.length, fixture.particles.deployed.skipped, 'each run is what the deployed reader skips');
  assert.ok(runs.length >= 20, `${runs.length} runs (Hoshiguma has 22)`);
  assert.deepEqual({ ...summary(fixture.particles.file), skipped: fixture.particles.deployed.skipped }, fixture.particles.deployed);
  // Every run where the file has it.
  fixture.particles.file.draw.forEach((entry, i) => {
    if (Object.hasOwn(entry, 'particles')) assert.deepEqual(read.draw[i], { kind: 'particles', systems: entry.particles }, `entry ${i}`);
  });
});

/* --- nothing loads with the page ------------------------------------------------------- */

const RUNTIME = 'lib/vendor/spine-3.8/spine-webgl.js';
const ARTWORK = 'components/skins/DynamicArtwork.tsx';
const LAYER_RENDERER = 'components/skins/dynamicLayerRenderer.ts';
const PARTICLE_DATA = 'lib/skins/particleData.ts';
const PARTICLE_SIM = 'lib/skins/particleSim.ts';
const PARTICLE_GEOMETRY = 'lib/skins/particleGeometry.ts';
const PARTICLE_RENDERER = 'components/skins/particleRenderer.ts';
const LAYER_FILES = ['lib/skins/dynamicLayers.ts', LAYER_RENDERER, PARTICLE_DATA, PARTICLE_SIM, PARTICLE_GEOMETRY, PARTICLE_RENDERER];

test('no page loads the Spine runtime or the animated artwork with itself: only when the reader asks', () => {
  // Not vacuous: both pages that offer animated art do reach both, lazily.
  for (const page of ['pages/skins.tsx', 'pages/operators/[name].tsx']) {
    assert.deepEqual(pathToTarget(page, [ARTWORK]), [page, ...(page === 'pages/skins.tsx' ? ['components/skins/SkinDetailDialog.tsx'] : []), 'components/skins/SkinZoomOverlay.tsx', ARTWORK]);
    assert.equal(pathToTarget(page, [RUNTIME])?.at(-1), RUNTIME);
  }
  const eager = pages().flatMap((page) => {
    const chain = pathToTarget(page, [RUNTIME, ARTWORK, ...LAYER_FILES], { lazy: false });
    return chain ? [chain.join(' -> ')] : [];
  });
  assert.deepEqual(eager, [], 'A page bundle may not carry the Spine runtime or DynamicArtwork: import them with import() / next/dynamic.');

  // And in the source: the overlay brings the artwork in through next/dynamic, the artwork the
  // runtime through import(); chibi rendering and catalogue loading are lazy too.
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
  // Type-only imports (the layer renderer's) are erased from the bundle.
  const naming = ['pages', 'components', 'lib'].flatMap(walk)
    .filter((file) => /vendor\/spine-3\.8/.test(fs.readFileSync(file, 'utf8').replace(/^import type [^\n]*$/gm, '')));
  assert.deepEqual(naming.sort(), ['components/operators/ChibiCanvas.tsx', ARTWORK, 'lib/credits/spineLicense.ts', 'lib/operators/chibiAnimations.ts']);
  const chibiCatalogue = fs.readFileSync('lib/operators/chibiAnimations.ts', 'utf8');
  assert.match(chibiCatalogue, /import\('@\/lib\/vendor\/spine-3\.8\/spine-webgl'\)/);
  assert.doesNotMatch(chibiCatalogue, /^import (?!type )[^\n]*spine-3\.8/m);
  // The layers and the particle systems come in with the artwork, never on their own: the particle reader borrows
  // the layers' shader reader, the particle renderer the layers' programs and textures, and only the artwork and
  // the particle modules themselves import the simulator, the geometry and the renderer (type imports included).
  for (const [file, allowed] of [
    [LAYER_FILES[0], [ARTWORK, LAYER_RENDERER, PARTICLE_DATA, PARTICLE_GEOMETRY, PARTICLE_RENDERER]], [LAYER_RENDERER, [ARTWORK, PARTICLE_RENDERER]],
    [PARTICLE_DATA, [ARTWORK, PARTICLE_SIM, PARTICLE_GEOMETRY, PARTICLE_RENDERER]], [PARTICLE_SIM, [ARTWORK, PARTICLE_GEOMETRY, PARTICLE_RENDERER]],
    [PARTICLE_GEOMETRY, [ARTWORK, PARTICLE_RENDERER]], [PARTICLE_RENDERER, [ARTWORK]],
  ] as const) {
    const importers = ['pages', 'components', 'lib'].flatMap(walk).filter((other) => other !== file
      && new RegExp(`from '[^']*/${path.basename(file).replace(/\.tsx?$/, '')}'`).test(fs.readFileSync(other, 'utf8')));
    assert.deepEqual(importers.sort(), [...allowed].sort(), `${file} is imported only with the artwork`);
  }
});

/* --- the licence ----------------------------------------------------------------------- */

test('the Spine Runtimes License ships beside the runtime and on /credits, word for word', () => {
  assert.equal(SPINE_RUNTIMES_LICENSE, fs.readFileSync('lib/vendor/spine-3.8/LICENSE', 'utf8'));
  assert.match(SPINE_RUNTIMES_LICENSE, /^Spine Runtimes License Agreement\n/);
  assert.match(SPINE_RUNTIMES_LICENSE, /Copyright \(c\) 2013-2019, Esoteric Software LLC/);
  const credits = fs.readFileSync('pages/credits.tsx', 'utf8');
  assert.match(credits, /<summary>Spine Runtimes License<\/summary>/);
  assert.match(credits, /<pre className="credits-licence">\{SPINE_RUNTIMES_LICENSE\}<\/pre>/);
  // Reachable from every page: the nav links it.
  assert.ok(LINKS.some((link) => link.href === '/credits'), 'the nav links /credits');
  // The vendored runtime says where it came from and that it is not to be changed without a licence.
  const readme = fs.readFileSync('lib/vendor/spine-3.8/README.md', 'utf8');
  assert.match(readme, /8b4844bd4b193ba9e54487ed397a777993cbad56/);
  assert.match(readme, /Do not modify these files unless a Spine licence is in force/);
  assert.match(fs.readFileSync(RUNTIME, 'utf8'), /\nexport \{ spine \};\n$/);
});

test('a scrolling layer wraps its offset into [0, 1), as the game\'s fract(_Time * speed) does', () => {
  assert.equal(wrapUnit(2.25), 0.25);
  assert.equal(wrapUnit(-0.25), 0.75);
  assert.ok(Object.is(wrapUnit(-0), 0));
  const ribbon = layerOf('ribbon');
  // -0.15 UV/s: after 60 s the unwrapped offset was -9, where a mediump varying steps by 2^-7.
  const at = (t: number) => layerPose(ribbon, { playing: 'Idle', animationTime: t, time: t })!.uv[1];
  assert.equal(at(60), 0);
  assert.ok(Math.abs(at(61) - 0.85) < 1e-9);
  assert.ok([0, 1, 59.5, 600.25].every((t) => at(t) >= 0 && at(t) < 1));
});

test('a layers.json asks for a bounded number of textures, draws and frames', () => {
  const many = Array.from({ length: LIMITS.textures + 1 }, (_, i) => ({ ...LAYERS.textures[1], file: `layer${i}.webp` }));
  assert.throws(() => parseDynamicLayers({ ...LAYERS, textures: many }), /textures/);
  const draws = [...LAYERS.draw, ...Array.from({ length: LIMITS.draw }, () => LAYERS.draw[0])];
  assert.throws(() => parseDynamicLayers({ ...LAYERS, draw: draws }), /draw/);
});

test('under reduced motion a pressed animation drives its own layers, held at its end; nothing else moves', () => {
  const track = (name: string, trackTime: number, timeScale = 1) => ({ name, trackTime, animationEnd: 1.2, timeScale });
  assert.deepEqual(layerClock(false, track('Idle', 3), 7), { playing: 'Idle', animationTime: 3, time: 7 });
  // Reduced motion: the still pose (timeScale 0) is frame 0; a pressed Interact plays, then holds at 1.2 s.
  assert.deepEqual(layerClock(true, track('Idle', 3, 0), 7), { playing: 'Idle', animationTime: 0, time: 0 });
  assert.deepEqual(layerClock(true, track('Interact', 0.6), 7), { playing: 'Interact', animationTime: 0.6, time: 0 });
  assert.deepEqual(layerClock(true, track('Interact', 5), 7), { playing: 'Interact', animationTime: 1.2, time: 0 });
  assert.deepEqual(layerClock(true, null, 7), { playing: null, animationTime: 0, time: 0 });
});

test('special illustration tags survive the manifest and are attached to the outfit and operator viewer', () => {
  const skinId = 'char_1041_angel2@iteration#6';
  const path = 'models/char_1041_angel2_iteration_6_sp_dyn/773ec69ee2c6/model.json';
  // The record as the importer files it: the outfit's own model, and the tagged one beside it.
  const data = assertDynamicArtIndex({ schemaVersion: 1, repository: 'arkpedia/arkpedia-l2d-assets', commit: COMMIT,
    models: { [skinId]: raw(FUGUE), [`${skinId}^sp_dyn`]: raw(path) } });
  const skins = [{skinId,model:'Exusiai the New Covenant',name:'The Legend Seeker',image:'/6-star-skins/Exusiai the New Covenant - The Legend Seeker.webp'}];
  assert.equal(skinDynamicArt(data,skins)[`${skinId}^sp_dyn`],raw(path));
  const appearance = {label:'The Legend Seeker',fullPath:skins[0].image};
  assert.equal(operatorDynamicArt(data,{name:skins[0].model,internalName:'char_1041_angel2'},[appearance],skins)['The Legend Seeker^sp_dyn'],raw(path));
});

test('older planner payloads receive artwork pointers and explicit nulls remain authoritative', async () => {
  const { withPlannerDynamicArt, withPullPlannerDynamicArt } = await import('../../lib/skins/dynamicArtFallback');
  const skinId = 'char_1041_angel2@iteration#6';
  const enriched = await withPlannerDynamicArt({catalogue:[{skinId} as {skinId:string;dynamic?:string|null;alternate?:string|null}]});
  assert.ok(enriched.catalogue[0].dynamic?.endsWith('/model.json'));
  assert.ok(enriched.catalogue[0].alternate?.includes('_sp_dyn/'));
  const explicit = await withPullPlannerDynamicArt({skinCatalogue:[{skinId,dynamic:null,alternate:null}]});
  assert.equal(explicit.skinCatalogue[0].skinId, skinId);
  assert.equal(explicit.skinCatalogue[0].dynamic, null);
  assert.equal(explicit.skinCatalogue[0].alternate, null);
  assert.ok((explicit.skinCatalogue[0] as {illustrator?:string}).illustrator);
  assert.ok((explicit.skinCatalogue[0] as {description?:string}).description);
});


test('account and friend payloads receive the same outfit and alternate artwork pointers', async () => {
  const { withFriendDynamicArt, loadDynamicArtIndex } = await import('../../lib/skins/dynamicArtFallback');
  const id = 'char_1041_angel2@iteration#6';
  const index = await loadDynamicArtIndex();
  const props = { skins: [{ id }, { id: 'unknown-outfit' }] };
  const enriched = await withFriendDynamicArt(props);
  assert.deepEqual(enriched.skins, [
    { id, dynamic: index.models[id], alternate: index.models[`${id}^sp_dyn`] },
    { id: 'unknown-outfit', dynamic: null, alternate: null },
  ]);
  assert.deepEqual(props.skins, [{ id }, { id: 'unknown-outfit' }]);
  const explicit = { skins: [{ id, dynamic: null, alternate: null }] };
  assert.equal(await withFriendDynamicArt(explicit), explicit);
});
