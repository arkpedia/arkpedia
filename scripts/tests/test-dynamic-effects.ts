import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LIMITS, animatedShader, continueOffsets, dissolveK, layerPose, mapOffset, parseDynamicLayers, parseShader, roundEven, unityUvMap, type DynamicLayer,
  type NoiseShader, type ParticleShader,
} from '../../lib/skins/dynamicLayers';
import { effectVertex, followProjection, noiseFragment, particleFeatures, particleFragment, programKey } from '../../components/skins/dynamicLayerRenderer';

/*
 * The illustration layers drawn with the game's effect shaders (layers.json layersVersion 2: `effect`
 * entries and a plain layer's `exact`, arkpedia-l2d-assets scripts/effects.py): how they are read,
 * strictly and without breaking the plain layers, and the maths the renderer takes from the game's
 * GLSL (dissolve rounding, scroll offsets, UV maps, which stages a program has).
 */

const texture = (i: number, wrap = ['repeat', 'repeat']) => ({ file: `layer${i}.webp`, width: 64, height: 64, bytes: 1, sha256: '0'.repeat(64), wrap, opaque: [0, 0, 1, 1] });
const map = (extra: Record<string, unknown> = {}) => ({ texture: 1, st: [1, 1, 0, 0], speed: [0, 0.1], scroll: [0, 0], ...extra });
const particle = (extra: Record<string, unknown> = {}) => ({
  family: 'particle', main: { st: [1, 1, 0, 0], speed: [0, 0], scroll: [0, 0], fract: false }, distort: null, dissolve: [], edge: null, ramp: null, vertex: null, animated: [], ...extra,
});
const FLOW_DISTORT = { space: 'main', main: 1, dissolve: 0, constant: [0, 0], maps: [map({ anchor: [0, 0], intensity: [0.02, 0] })], weight: null };
const flow = particle({ distort: FLOW_DISTORT });
const quad = { vertices: [0, 0, 10, 0, 0, 10, 10, 10], colors: null, triangles: [0, 3, 1, 3, 0, 2], follow: null, animation: null, only: null, delay: 0 };
// A sky drawn approximately for older readers (and exactly for this one), a flame only effects draw,
// and the skeleton between them.
const EFFECTS = {
  schemaVersion: 1,
  textures: [texture(0, ['clamp', 'clamp'])],
  effectTextures: [texture(1)],
  bounds: { x: 0, y: 0, width: 10, height: 10 },
  effectBounds: { x: 0, y: 0, width: 20, height: 10 },
  separators: [],
  draw: [
    { layer: { ...quad, name: 'sky', blend: 'alpha', texture: 0, color: [1, 1, 1, 1], uvs: [0, 1, 1, 1, 0, 0, 1, 0], scroll: [0.1, 0],
      approximated: 'flow distortion (up to 0.02 UV, 1.3 texels) drawn without it', exact: { uvs: [0, 0, 1, 0, 0, 1, 1, 1], shader: flow } } },
    { part: 0 },
    { effect: { ...quad, name: 'flame', blend: 'add', texture: 0, color: [2, 1, 1, 1], uvs: [0, 0, 1, 0, 0, 1, 1, 1],
      shader: particle({ dissolve: [map({ fract: false, amount: 0.3, border: 0.1 })] }) } },
  ],
  omitted: { particles: 0, trails: 0, skinned: 0, hidden: 0, holders: 0, custom: [], externalTexture: [], other: [] },
};
const named = (layers: ReturnType<typeof parseDynamicLayers>, name: string) => {
  const entry = layers.draw.find((e) => e.kind === 'layer' && e.layer.name === name);
  assert.ok(entry && entry.kind === 'layer', name);
  return entry.layer as DynamicLayer;
};

test('effect layers are read with their shaders; the plain layers stay as they were', () => {
  const layers = parseDynamicLayers(EFFECTS);
  assert.deepEqual(layers.textures.map((t) => t.file), ['layer0.webp', 'layer1.webp'], 'effect textures numbered on');
  assert.deepEqual(layers.bounds, EFFECTS.effectBounds, 'framed with the effects drawn');
  assert.equal(layers.skipped, 0);
  // The approximated sky is drawn exactly: the mesh's own UVs, the shader, no image-space scroll.
  const sky = named(layers, 'sky');
  assert.equal(sky.shader?.family, 'particle');
  assert.deepEqual([...sky.uvs], [0, 0, 1, 0, 0, 1, 1, 1]);
  assert.equal(sky.scroll, null);
  const flame = named(layers, 'flame');
  assert.equal((flame.shader as ParticleShader).dissolve[0].amount, 0.3);
  // A file from before effects: no effectBounds, and every layer plain.
  const plain = parseDynamicLayers({ ...EFFECTS, effectTextures: undefined, effectBounds: undefined,
    draw: [{ layer: { ...EFFECTS.draw[0].layer, exact: undefined } }, { part: 0 }] });
  assert.deepEqual(plain.bounds, EFFECTS.bounds);
  assert.equal(named(plain, 'sky').shader, null);
  assert.deepEqual(named(plain, 'sky').scroll, [0.1, 0]);
});

test('a shader this reader does not understand leaves its effect out, and its approximation draws', () => {
  const variant = (shader: unknown) => parseDynamicLayers({ ...EFFECTS, draw: [
    { layer: { ...EFFECTS.draw[0].layer, exact: { ...EFFECTS.draw[0].layer!.exact, shader } } }, { part: 0 }, { effect: { ...EFFECTS.draw[2].effect, shader } }] });
  const odd = [
    { ...flow, family: 'ripple' },
    { ...flow, rotation: [0, 1] },
    particle({ dissolve: [map({ fract: false, amount: 0.3, border: 0 })] }),
    particle({ dissolve: [1, 2, 3].map(() => map({ fract: false, amount: 0.3, border: 0.1 })) }),
    particle({ ramp: map({ texture: 2 }) }),
    particle({ ramp: map({ texture: null }) }),
    particle({ ramp: map({ st: [1, 1] }) }),
    particle({ ramp: map({ speed: [1e9, 0] }) }),
    particle({ vertex: { ...map(), intensity: [1, 1, 1], weight: null, matrix: [1, 0, 0, 0, 1] } }),
    { family: 'noise', mode: 'glow', main: flow.main, noise: map(), noise1: [1, 1, 1, 1], noise2: [1, 1, 1, 1], glow: null, animated: [] },
    particle({ animated: ['dissolve.0.amount'] }),
    particle({ dissolve: [map({ fract: false, amount: 0.3, border: 0.1 })], animated: ['dissolve.0.amount', 'dissolve.0.amount'] }),
    { ...flow, animated: undefined },
  ];
  for (const shader of odd) {
    const read = variant(shader);
    assert.equal(read.skipped, 1, JSON.stringify(shader));
    assert.equal(read.draw.length, 2);
    assert.equal(named(read, 'sky').shader, null, 'the approximation');
  }
  // An unbound noise map reads 0 (texture null) — only a noise map may be unbound.
  assert.ok(parseShader({ ...flow, distort: { ...FLOW_DISTORT, maps: [map({ texture: null, anchor: [0.5, 0.5], intensity: [0.1, 0] })] } }, 2));
  // Textures stay bounded: plain and effect textures count together.
  const many = Array.from({ length: LIMITS.textures }, (_, i) => texture(i + 1));
  assert.throws(() => parseDynamicLayers({ ...EFFECTS, effectTextures: many }), /textures/);
});

test('dissolve rounding is GLSL\'s roundEven, not Math.round', () => {
  assert.deepEqual([0.5, 1.5, 2.5, -0.5, 0.49, 0.51, 3].map(roundEven), [0, 2, 2, 0, 0, 1, 3]);
  assert.ok(Object.is(roundEven(-0.5), 0));
  // k = 1 - roundEven(amount + 0.5): 1 at 0 (nothing dissolved), 0 inside, -1 at 1 (all of it).
  assert.deepEqual([0, 0.1, 0.5, 0.99, 1].map(dissolveK), [1, 0, 0, 0, -1]);
});

test('a map\'s offset: the shader\'s scroll wrapped as fract, a script\'s only where the texture repeats', () => {
  const close = (a: readonly number[], b: readonly number[]) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-9, `${a} vs ${b}`));
  close(mapOffset({ speed: [0.25, -0.3], scroll: [0, 0] }, 5), [0.25, 0.5]);
  close(mapOffset({ speed: [0, 0], scroll: [0.3, 0.3] }, 5, ['repeat', 'clamp']), [0.5, 1.5]);
  close(mapOffset({ speed: [0, 0], scroll: [0.3, 0] }, 5, ['mirror', 'repeat']), [1.5, 0]);
  close(mapOffset({ speed: [0, 0], scroll: [0.3, 0] }, 10, ['mirror', 'repeat']), [1, 0]);
  // After an hour a mediump uniform would have lost the fraction: it stays in [0, 1).
  const late = mapOffset({ speed: [0.123, 0.0007], scroll: [0, 0] }, 3600.5);
  assert.ok(late.every((v) => v >= 0 && v < 1));
  // A frame's image-space UV map (v down) as the same map in Unity space (v up).
  assert.deepEqual(unityUvMap([1, 0, 1, 0]), [1, 0, 1, 0]);
  assert.deepEqual(unityUvMap([2, 0.5, 0.5, 0.25]), [2, 0.5, 0.5, 0.25]);
  // u' = 2u + 0.5 and image v' = 0.5 v + 0.25, i.e. Unity v' = 1 - (0.5 (1 - v) + 0.25) = 0.5 v + 0.25.
});

test('a shader layer\'s clock is its own: delayed, and still under reduced motion', () => {
  const flame = named(parseDynamicLayers(EFFECTS), 'flame');
  assert.equal(layerPose({ ...flame, delay: 1 }, { playing: 'Idle', animationTime: 3, time: 3 })!.t, 2);
  assert.equal(layerPose({ ...flame, delay: 1 }, { playing: 'Idle', animationTime: 0.5, time: 0.5 }), null);
  assert.equal(layerPose(flame, { playing: 'Idle', animationTime: 0, time: 0 })!.t, 0);
});

test('each program has only the stages its layers use, as the game\'s shaders do', () => {
  const read = (shader: unknown) => parseShader(shader, 2) as ParticleShader;
  const disturb = particleFragment(particleFeatures(read(flow)));
  assert.match(disturb, /m \+= d \* u_dInfluence\.x;/, 'Disturb/Ram: moved after the main tiling');
  assert.doesNotMatch(disturb, /u_s0|u_r\b|u_edge/);
  const anchor = read({ ...flow, distort: { ...FLOW_DISTORT, space: 'raw', maps: [map({ anchor: [0.5, 0.5], intensity: [0.1, 0] }), map({ anchor: [0.5, 0.5], intensity: [0, 0.2] })] },
    dissolve: [map({ fract: false, amount: 0.2, border: 0.1 })] });
  const anchored = particleFragment(particleFeatures(anchor));
  assert.match(anchored, /vec2 base = uv \+ d;/, 'Disturb Anchor: the mesh UV, before the tiling');
  assert.match(anchored, /vec2 s0 = base \* u_s0ST\.xy \+ u_s0ST\.zw \+ u_s0Off;/, 'its dissolve follows the distorted UV');
  assert.match(anchored, /u_d1/);
  const edged = particleFragment(particleFeatures(read(particle({ dissolve: [map({ fract: false, amount: 0.2, border: 0.1 }), map({ fract: true, amount: 0.4, border: 0.2 })],
    edge: { color: [1, 1, 1, 0.3], pow: 2, epsilon: true } }))));
  assert.match(edged, /\(f \+ 0\.001\) \/ \(u_edge\.a \+ 0\.001\)/);
  assert.match(edged, /e = max\(e, 0\.001\);/);
  assert.match(edged, /f \*= clamp\(\(sampleUnity\(u_s1, s1\)/);
  assert.notEqual(programKey(read(flow)), programKey(anchor));
  assert.equal(programKey(read(flow)), programKey(read({ ...flow, main: { ...flow.main, speed: [0.5, 0] } })), 'parameters are uniforms, not programs');
  for (const mode of ['default', 'add', 'glow'] as const) assert.match(noiseFragment(mode), /\* 0\.1\);/);
});

test('only a shader layer may go without a main texture (its material binds none: Unity\'s white)', () => {
  const white = parseDynamicLayers({ ...EFFECTS, draw: [{ part: 0 }, { effect: { ...EFFECTS.draw[2].effect, texture: null } }, { layer: { ...EFFECTS.draw[0].layer, exact: undefined, texture: null } }] });
  assert.equal(white.skipped, 1, 'the plain layer');
  assert.equal(named(white, 'flame').texture, null);
});

test('a parameter an Animator drives follows the layer\'s frames past their 16 numbers', () => {
  const frame = (t: number, amount: number, offset: number) => [t, 1, 0, 0, 1, 0, 0, 1, 1, 1, 1, 1, 1, 0, 1, 0, amount, 1, 1, offset, 0];
  const sweep = { ...EFFECTS.draw[2].effect, color: null, animation: { length: 2, loop: true, loopFrom: 0, frames: [frame(0, 0, 0), frame(2, 1, 0.5)] },
    shader: particle({ dissolve: [map({ fract: false, amount: 0, border: 0.1 })], animated: ['dissolve.0.amount', 'dissolve.0.st'] }) };
  const read = parseDynamicLayers({ ...EFFECTS, draw: [{ part: 0 }, { effect: sweep }] });
  assert.equal(read.skipped, 0);
  const layer = named(read, 'flame');
  const pose = layerPose(layer, { playing: 'Idle', animationTime: 1, time: 1 })!;
  assert.deepEqual(pose.extra, [0.5, 1, 1, 0.25, 0]);
  const now = animatedShader(layer.shader!, pose.extra) as ParticleShader;
  assert.equal(now.dissolve[0].amount, 0.5);
  assert.deepEqual(now.dissolve[0].st, [1, 1, 0.25, 0]);
  assert.equal((layer.shader as ParticleShader).dissolve[0].amount, 0, 'the parsed shader stays as read');
  // Frames that do not carry them, or a layer without a timeline that names them, are not understood.
  const short = { ...sweep, animation: { ...sweep.animation, frames: sweep.animation.frames.map((f) => f.slice(0, 16)) } };
  const still = { ...sweep, color: [1, 1, 1, 1], animation: null };
  for (const odd of [short, still]) assert.equal(parseDynamicLayers({ ...EFFECTS, draw: [{ part: 0 }, { effect: odd }] }).skipped, 1);
});

test('a moving effect layer culls the faces the game culls; a plain one never does', () => {
  const read = (cull: unknown, kind: 'effect' | 'layer' = 'effect') => parseDynamicLayers({ ...EFFECTS, draw: [{ part: 0 },
    kind === 'effect' ? { effect: { ...EFFECTS.draw[2].effect, cull } } : { layer: { ...EFFECTS.draw[0].layer, exact: undefined, cull } }] });
  assert.equal(named(read(2), 'flame').cull, 2);
  assert.equal(named(read(undefined), 'flame').cull, 0);
  assert.equal(read(3).skipped, 1);
  assert.equal(named(read(2, 'layer'), 'sky').cull, 0);
});

/* --- layersVersion 3: tilted entries and integrated scroll speeds -------------------------------- */

// A frame of a tilted layer: the 16 numbers, its depth column [e, f], then [u, v, speed u, speed v] of main.offset.
const solidFrame = (t: number, e: number, u: number) => [t, 1, 0, 0, 1, 0, 0, 1, 1, 1, 1, 1, 1, 0, 1, 0, e, 0, u, 0, 0.5, 0];
const STAR = { ...EFFECTS.draw[2].effect, name: 'star', color: null, vertices: [0, 0, 0, 10, 0, 5, 0, 10, -5], uvs: [0, 0, 1, 0, 0, 1], triangles: [0, 1, 2],
  animation: { length: 2, loop: true, loopFrom: 0, frames: [solidFrame(0, 0, 0), solidFrame(2, 1, 1)] }, cull: 2, shader: particle({ animated: ['main.offset'] }) };

test('a tilted entry is read with its 3D vertices and the depth column of its frames', () => {
  const read = parseDynamicLayers({ ...EFFECTS, draw: [{ part: 0 }, { tilted: STAR }] });
  assert.equal(read.skipped, 0);
  const star = named(read, 'star');
  assert.equal(star.solid, true);
  assert.deepEqual([...star.vertices], STAR.vertices);
  assert.deepEqual(star.offsets, [0]);
  const pose = layerPose(star, { playing: 'Idle', animationTime: 1, time: 1 })!;
  assert.deepEqual(pose.depth, [0.5, 0]);
  assert.deepEqual(pose.extra, [0.5, 0, 0.5, 0], 'the offset at 1 s, past the depth column');
  // Pairs instead of triples, frames without the depth column, or no shader: not understood.
  for (const odd of [{ ...STAR, vertices: STAR.vertices.slice(0, 6) }, { ...STAR, animation: { ...STAR.animation, frames: STAR.animation.frames.map((f) => f.slice(0, 16)) } },
    { ...STAR, shader: undefined }, { ...STAR, animation: null, color: [1, 1, 1, 1], shader: particle() }]) {
    assert.equal(parseDynamicLayers({ ...EFFECTS, draw: [{ part: 0 }, { tilted: odd }] }).skipped, 1);
  }
  // The renderer projects it with a 2x4 matrix of its own program variant.
  assert.equal(programKey(star.shader!, true), `${programKey(star.shader!)}3`);
  assert.match(effectVertex(false, true), /attribute vec3 a_position;[\s\S]*uniform vec4 u_row0;[\s\S]*vec4 q = vec4\(p, 1\.0\);/);
  assert.match(effectVertex(true, true), /p \+= d;/, 'a vertex effect moves it in 3D');
  // Under a bone follower turned a quarter: x' = -y, y' = x, the depth column turns with it.
  assert.deepEqual(followProjection([0, -1, 1, 0, 5, 6], [1, 0, 0, 1, 2, 3], [0.5, 0]), [0, -1, 0, 2, 1, 0, 0.5, 8]);
});

test('an integrated offset runs on past its timeline: once more per loop, or at its last speed', () => {
  const line = { length: 2, loop: true, loopFrom: 0, frames: [solidFrame(0, 0, 0), solidFrame(2, 0, 1)] };
  const at = 17; // after the 16 numbers (less t) and the depth column
  const extra = (t: number) => continueOffsets(line, t, line.frames[0].slice(1).slice(at).map((_, i) => {
    const wrapped = t > 2 ? t % 2 : t;
    return [wrapped / 2, 0, 0.5, 0][i];
  }), [0], at);
  assert.equal(extra(1)[0], 0.5);
  assert.equal(extra(3)[0], 1.5, 'one loop moved it 1');
  assert.equal(extra(5)[0], 2.5);
  const held = { ...line, loop: false };
  assert.equal(continueOffsets(held, 4, [1, 0, 0.5, 0], [0], at)[0], 2, 'held at the end: 1 + 0.5 x 2 s');
  assert.deepEqual(continueOffsets(held, 4, [1, 0, 0.5, 0], [], at), [1, 0, 0.5, 0], 'nothing to carry on');
});

test('an offset an Animator drives replaces t x speed, wrapped the same way', () => {
  assert.deepEqual(mapOffset({ speed: [0.5, 0], scroll: [0, 0], offset: [1.25, -0.25] }, 10), [0.25, 0.75]);
  const flowing = parseShader({ ...flow, animated: ['main.offset', 'distort.maps.0.offset', 'distort.main'] }, 2) as ParticleShader;
  assert.ok(flowing);
  const now = animatedShader(flowing, [0.3, 0.1, 1, 0, 2.5, 0, 1, 0, 0.5]) as ParticleShader;
  assert.deepEqual(now.main.offset, [0.3, 0.1]);
  assert.deepEqual(now.distort!.maps[0].offset, [2.5, 0]);
  assert.equal(now.distort!.main, 0.5);
  assert.equal(flowing.main.offset, undefined, 'the parsed shader stays as read');
  // An offset of a map the shader does not have is not understood.
  assert.equal(parseShader({ ...flow, animated: ['dissolve.0.offset'] }, 2), null);
  // Disturb2's animated noise params, glow and integrated noise scroll.
  const noise = { family: 'noise', mode: 'glow', main: flow.main, noise: map(), noise1: [1, 2, 0.1, 0], noise2: [1, 1, 0, 0.1], glow: [1, 1, 1, 1] };
  const animatedNoise = parseShader({ ...noise, animated: ['noise.offset', 'noise1', 'glow'] }, 2) as NoiseShader;
  assert.ok(animatedNoise);
  const lit = animatedShader(animatedNoise, [0.1, -0.05, 0.1, -0.05, 1, 2, 0.5, 0, 0, 0, 0, 1]) as NoiseShader;
  assert.deepEqual([lit.noise.offset, lit.noise1, lit.glow], [[0.1, -0.05], [1, 2, 0.5, 0], [0, 0, 0, 1]]);
  assert.equal(parseShader({ ...noise, glow: null, mode: 'default', animated: ['glow'] }, 2), null, 'no glow to animate');
});
