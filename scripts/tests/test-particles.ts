import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import {
  EXPORT_DEFAULTS, PARTICLE_LIMITS, RANDOM_KEYS, color32, curveBounds, evaluateColor, evaluateCurve, keysBounds, parseColor, parseCurve, parseParticleDocument,
  parseParticleText, type ParticleDocument, type ParticleSystemData,
} from '../../lib/skins/particleData';
import {
  ACTION_END, LIVE_CAP, MODEL_SEED, ParticleDirector, ParticleSim, REDUCED_STILL, STEP, mix32, particleRandom, playSeed, poseFrom, poseInverseVector, posePoint,
  poseVector, shapeStart, type ParticleClock, type ParticleOptions,
} from '../../lib/skins/particleSim';
import { readGolden } from '../particles/golden';

/*
 * The particle simulator (lib/skins/particleSim.ts) and its file reader (lib/skins/particleData.ts) against
 * the specification, the reference simulator in arkpedia/arkpedia-l2d-assets (scripts/tests/particle_oracle.py):
 * - its tests (scripts/tests/test_particle_oracle.py), ported onto layerParticles.json records;
 * - golden fixtures it made from real exports (scripts/particles/make-golden.py): every particle's position,
 *   velocity, size, rotation, colour, custom data, UV rect, age and frame at every step, matched in Float64 to
 *   1e-6 relative. The committed fixture is a compact cover of every feature the full selection has; with
 *   PARTICLE_GOLDEN_DIR naming make-golden.py's --full folder, the whole selection (every Hoshiguma system and
 *   150 more, 20 of them for 10 s) is compared particle for particle;
 * - the site's own parts the oracle has no part in: the reader's strictness, and the director (activation on
 *   the layers' clock, the fixed step's grid, budgets, reduced motion).
 */

const GOLDEN = 'scripts/tests/fixtures/particles/golden.json.gz';
const TOLERANCE = 1e-6;

/* --- a layerParticles.json built in the test (the oracle tests' make_ps, in the export's terms) --- */

type Json = Record<string, unknown>;
const QUAD_MATERIAL = {
  blend: 'add', texture: null, color: [1, 1, 1, 1], custom: null, cull: 0,
  shader: { family: 'particle', main: { st: [1, 1, 0, 0], speed: [0, 0], scroll: [0, 0], fract: false }, distort: null, dissolve: [], edge: null, ramp: null, vertex: null, animated: [] },
};
/** make_ps: a 5 s one-shot that emits nothing, at the origin along +Z, lifetime 100, speed 0. */
function record(extra: { clock?: Json; emission?: Json; start?: Json } & Json = {}): Json {
  const { clock, emission, start, ...rest } = extra;
  return {
    name: 'test', requires: [], only: null, delay: 0, active: true, follow: null, child: false,
    emitter: { matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    clock: { loop: false, maxAlive: 1000, ...clock }, emission: { rate: 0, ...emission }, start: { lifetime: 100, speed: 0, ...start },
    render: { mode: 'billboard' }, material: 0, ...rest,
  };
}
function documentOf(...systems: Json[]): Json {
  return { version: 1, unit: 0.01, camera: { size: 10, height: 2000 }, controller: { fixFxDelay: 1, animTimeFixed: 0 }, textures: [], materials: [QUAD_MATERIAL], meshes: [], systems };
}
function parsed(system: Json): { data: ParticleSystemData; doc: ParticleDocument } {
  const doc = parseParticleDocument(documentOf(system), 0);
  assert.deepEqual(doc.skipped, []);
  return { data: doc.systems[0]!, doc };
}
function simOf(system: Json, options: Partial<ParticleOptions> = {}): ParticleSim {
  const { data, doc } = parsed(system);
  return new ParticleSim(data, doc, options, 64);
}
/** play(), then `seconds` of steps of dt (the oracle tests' run()). */
function run(system: Json, seconds: number, dt = 1 / 60, seed = 1, options: Partial<ParticleOptions> = {}): ParticleSim {
  const sim = simOf(system, options);
  sim.play(seed);
  for (let i = 0; i < Math.round(seconds / dt); i++) sim.step(dt);
  return sim;
}
function records(sim: ParticleSim): number[][] {
  const out: number[][] = [];
  const r = new Float64Array(30);
  for (let i = 0; i < sim.count; i++) { sim.record(i, r); out.push(Array.from(r)); }
  return out;
}
const near = (a: number, b: number, places = 7) => Math.abs(a - b) < 0.5 * 10 ** -places;
const burst = (time = 0, count = 1, cycles = 1, interval = 0.01, probability = 1) => [time, count, cycles, interval, probability];

/* --- curves and gradients (test_particle_oracle Curves) ---------------------------------------- */

test('curves: Hermite with flat and linear tangents, stepped keys, wrap modes', () => {
  const flat = parseCurve(['c', 1, [0, 0, 0, 0, 1, 1, 0, 0]]);
  assert.ok(near(evaluateCurve(flat, 0.5, 1), 0.5));
  assert.ok(near(evaluateCurve(flat, 0.25, 1), 0.15625), '3t^2 - 2t^3');
  assert.ok(near(evaluateCurve(parseCurve(['c', 1, [0, 0, 1, 1, 2, 2, 1, 1]]), 0.5, 1), 0.5), 'slope x segment length');
  assert.equal(evaluateCurve(parseCurve(['c', 1, [0, 3, 0, null, 1, 7, 0, 0]]), 0.99, 1), 3, 'a stepped segment holds its left value');
  const keys = [0, 0, 2, 2, 0.5, 1, 2, 2];
  const clamp = parseCurve(['c', 1, keys]), repeat = parseCurve(['c', 1, keys, ['w', 'clamp', 'repeat']]), pingPong = parseCurve(['c', 1, keys, ['w', 'clamp', 'pingPong']]);
  assert.ok(near(evaluateCurve(clamp, 0.75, 1), 1));
  assert.ok(near(evaluateCurve(repeat, 0.75, 1), evaluateCurve(clamp, 0.25, 1)));
  assert.ok(near(evaluateCurve(pingPong, 0.75, 1), evaluateCurve(clamp, 0.25, 1)));
  assert.ok(near(evaluateCurve(clamp, -0.1, 1), 0));
});

test('MinMaxCurve modes: constant, two constants, curve, two curves (both x scalar)', () => {
  const lin = [0, 0, 1, 1, 1, 1, 1, 1];
  assert.equal(evaluateCurve(parseCurve(3), 0.3, 0.7), 3);
  assert.ok(near(evaluateCurve(parseCurve(['r', 2, 10]), 0.3, 0.25), 4), 'lerp(min, max)');
  assert.ok(near(evaluateCurve(parseCurve(['c', 4, lin]), 0.5, 1), 2));
  assert.ok(near(evaluateCurve(parseCurve(['cc', 4, [0, 0, 0, 0, 1, 0, 0, 0], lin]), 0.5, 0.5), 1));
});

test('gradients: blend and fixed; MinMaxGradient modes; Color32 start colours', () => {
  const out = new Float64Array(4);
  evaluateColor(parseColor(['g', { c: [0, 0, 0, 0, 1, 1, 1, 1], a: [0, 1, 1, 0] }]), 0.5, 1, out);
  assert.ok(near(out[0], 0.5, 4) && near(out[3], 0.5, 4));
  const fixed = parseColor(['g', { c: [0.3, 1, 0, 0, 1, 0, 0, 1], a: [0, 1], fixed: true }]);
  evaluateColor(fixed, 0.2, 1, out);
  assert.deepEqual(Array.from(out.subarray(0, 3)), [1, 0, 0]);
  evaluateColor(fixed, 0.5, 1, out);
  assert.deepEqual(Array.from(out.subarray(0, 3)), [0, 0, 1]);
  evaluateColor(parseColor(['r', [0, 0, 0, 0], [1, 1, 1, 1]]), 0.9, 0.25, out);
  assert.deepEqual(Array.from(out), [0.25, 0.25, 0.25, 0.25]);
  evaluateColor(parseColor(['rg', { c: [0, 0, 0, 0, 1, 1, 0, 0], a: [0, 1] }]), 0, 0.5, out);
  assert.ok(near(out[0], 0.5, 4), 'RandomColor samples the gradient at the random value, not at t');
  assert.deepEqual([0.5, 0, 1, 0.2].map(color32), [128 / 255, 0, 1, 51 / 255]);
  // Python's round: halves to even (0.5 x 255 = 127.5 -> 128, as 128 is even; 2.5 / 255 -> 2).
  assert.equal(color32(2.5 / 255) * 255, 2);
});

/* --- emission (test_particle_oracle Emission) --------------------------------------------------- */

test('emission: rate over the duration, frame-rate independent', () => {
  assert.ok(Math.abs(run(record({ emission: { rate: 10 } }), 6).emittedTotal - 50) <= 1);
  const looping = record({ clock: { loop: true }, emission: { rate: 7 } });
  assert.ok(Math.abs(run(looping, 3, 1 / 30).emittedTotal - run(looping, 3, 1 / 144).emittedTotal) <= 1);
});

test('emission: bursts at 0 and their cycles, probability, every loop, infinite cycles', () => {
  assert.equal(run(record({ emission: { bursts: [burst(0, 7)] } }), 1 / 60).count, 7);
  assert.equal(run(record({ emission: { bursts: [burst(0, 2, 3, 0.1)] } }), 0.5).emittedTotal, 6);
  assert.equal(run(record({ emission: { bursts: [burst(0, 5, 1, 0.01, 0)] } }), 1).emittedTotal, 0);
  assert.equal(run(record({ clock: { duration: 1, loop: true }, emission: { bursts: [burst(0, 5)] } }), 2.5).emittedTotal, 15, 'loops 0, 1, 2');
  assert.equal(run(record({ clock: { duration: 1 }, emission: { bursts: [burst(0, 1, 0, 0.25)] } }), 2).emittedTotal, 4, '0, 0.25, 0.5, 0.75');
});

test('emission: maxParticles drops births (and a single sprite respawns with no gap); the start delay', () => {
  assert.equal(run(record({ clock: { maxParticles: 1 }, emission: { rate: 100 } }), 1).count, 1);
  const sim = simOf(record({ clock: { loop: true, duration: 1, maxParticles: 1 }, start: { lifetime: 0.5 }, emission: { rate: 50 } }));
  sim.play(1);
  const counts: number[] = [];
  for (let i = 0; i < 180; i++) { sim.step(1 / 60); counts.push(sim.count); }
  assert.equal(Math.min(...counts.slice(10)), 1, 'never a visible gap');
  const delayed = record({ clock: { startDelay: 0.5 }, emission: { rate: 50 } });
  assert.equal(run(delayed, 0.4).emittedTotal, 0);
  assert.ok(run(delayed, 0.7).emittedTotal > 0);
});

test('prewarm: a prewarmed loop starts full, and ignores its start delay', () => {
  const sim = simOf(record({ clock: { loop: true, prewarm: true, prewarmWindow: 1, duration: 1 }, start: { lifetime: 2 }, emission: { rate: 10 } }));
  sim.play(1);
  assert.ok(sim.count >= 9, 'one loop already simulated');
  const delayed = simOf(record({ clock: { loop: true, prewarm: true, prewarmWindow: 1, duration: 1, startDelay: 3 }, emission: { rate: 10 } }));
  delayed.play(1);
  assert.equal(delayed.delay, 0);
  // Hoshiguma's dust_04 (loop, prewarm, 60/s, lifetime 1-1.5 s; switched by a clip, so not in P1's export): a steady
  // state of rate x mean lifetime = 75 right after play(), its window or its whole first loop prewarmed.
  const dust = record({ clock: { loop: true, prewarm: true, prewarmWindow: 1.5 }, start: { lifetime: ['r', 1, 1.5] }, emission: { rate: 60 } });
  for (const prewarm of ['window', 'full'] as const) {
    const s = simOf(dust, { prewarm });
    s.play(1);
    assert.ok(s.count >= 60 && s.count <= 90, `${prewarm}: ${s.count}`);
  }
});

test('determinism: the same seed gives the same particles, another seed others', () => {
  const sys = record({ clock: { loop: true }, emission: { rate: 30 }, start: { speed: ['r', 1, 5] }, shape: { type: 'cone' } });
  const a = records(run(sys, 1, 1 / 60, 7)), b = records(run(sys, 1, 1 / 60, 7)), c = records(run(sys, 1, 1 / 60, 8));
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
});

/* --- motion (test_particle_oracle Motion) ------------------------------------------------------- */

test('motion: constant speed, gravity, velocity over lifetime not accumulated', () => {
  assert.ok(near(run(record({ start: { speed: 2 }, emission: { bursts: [burst()] } }), 1).pz[0], 2, 6));
  const fall = run(record({ start: { gravity: 1 }, emission: { bursts: [burst()] } }), 1, 1 / 600);
  assert.ok(Math.abs(fall.py[0] + 0.5 * 9.81) <= 0.5 * 9.81 * 0.01);
  const drift = run(record({ emission: { bursts: [burst()] }, velocity: { linear: [1, 0, 0] } }), 2);
  assert.ok(near(drift.px[0], 2, 6));
  assert.deepEqual([drift.vx[0], drift.vy[0], drift.vz[0]], [0, 0, 0]);
});

test('motion: limit velocity dampens towards the limit; rotation over lifetime', () => {
  const sim = simOf(record({ start: { speed: 10 }, emission: { bursts: [burst()] }, limit: { magnitude: 1, dampen: 0.1 } }));
  sim.play(1);
  const speeds: number[] = [];
  for (let i = 0; i < 120; i++) { sim.step(1 / 60); speeds.push(Math.hypot(sim.vx[0], sim.vy[0], sim.vz[0])); }
  assert.ok(speeds.every((s, i) => i === 0 || s <= speeds[i - 1] + 1e-9));
  assert.ok(Math.min(...speeds) >= 1 - 1e-9);
  assert.ok(speeds.at(-1)! < 1.01);
  assert.ok(near(run(record({ emission: { bursts: [burst()] }, rotation: { curve: Math.PI } }), 0.5).rz[0], Math.PI / 2, 6));
});

/* --- shapes (test_particle_oracle Shapes) ------------------------------------------------------- */

function shapeSamples(shape: Json, n = 400): ReturnType<typeof shapeStart>[] {
  const { data, doc } = parsed(record({ shape }));
  return Array.from({ length: n }, (_, i) => shapeStart(data, doc, mix32(i + 3)));
}

test('shapes: circle arc and edge, cone directions, box volume, edge, the shape rotation', () => {
  for (const { position: p } of shapeSamples({ type: 'circle', radius: 2, arc: 90 })) {
    assert.ok(Math.hypot(p[0], p[1]) <= 2 + 1e-9 && p[0] >= -1e-9 && p[1] >= -1e-9 && near(p[2], 0), 'the arc starts at +X and turns towards +Y');
  }
  for (const { position: p } of shapeSamples({ type: 'circle', radius: 2, thickness: 0 })) assert.ok(near(Math.hypot(p[0], p[1]), 2, 6));
  for (const { position: p, direction: d } of shapeSamples({ type: 'cone', angle: 30 })) {
    assert.ok((Math.acos(Math.max(-1, Math.min(1, d[2]))) * 180) / Math.PI <= 30 + 1e-6 && near(p[2], 0));
  }
  for (const { position: p, direction: d } of shapeSamples({ type: 'box', scale: [4, 2, 0] })) {
    assert.ok(Math.abs(p[0]) <= 2 + 1e-9 && Math.abs(p[1]) <= 1 + 1e-9);
    assert.deepEqual(d, [0, 0, 1]);
  }
  for (const { position: p, direction: d } of shapeSamples({ type: 'edge', radius: 3 })) {
    assert.ok(Math.abs(p[0]) <= 3 + 1e-9);
    assert.deepEqual(d, [0, 1, 0]);
  }
  for (const { direction: d } of shapeSamples({ type: 'box', rot: [-90, 0, 0], scale: [0, 0, 0] })) assert.ok(near(d[1], 1, 6), '-90 about X turns +Z into +Y');
});

test('shapes: burst spread places a burst evenly round the arc', () => {
  const sim = run(record({ shape: { type: 'circle', thickness: 0, arcMode: { mode: 'burstSpread' } }, emission: { bursts: [burst(0, 4)] } }), 1 / 60);
  const angles = Array.from({ length: sim.count }, (_, i) => Math.round(((Math.atan2(sim.py[i], sim.px[i]) * 180) / Math.PI + 360) % 360)).sort((a, b) => a - b);
  assert.deepEqual(angles, [0, 90, 180, 270]);
});

/* --- what a renderer reads (test_particle_oracle Rendering) -------------------------------------- */

test('texture sheet: frames over lifetime, frame 0 the top-left tile', () => {
  const sys = record({ emission: { bursts: [burst()] }, start: { lifetime: 1 }, sheet: { tiles: [2, 2], frameOverTime: ['c', 0.9999, [0, 0, 1, 1, 1, 1, 1, 1]] } });
  const sim = simOf(sys);
  sim.play(1);
  const frames: number[] = [];
  const out = new Float64Array(5);
  let steps = 0;
  for (const target of [6, 18, 33, 48, 57]) {
    while (steps < target) { sim.step(1 / 60); steps++; }
    sim.frameOf(0, out);
    frames.push(out[0]);
  }
  assert.deepEqual(frames, [0, 1, 2, 3, 3], 'floor(age x 0.9999 x 4)');
  const first = run(sys, 1 / 60);
  first.frameOf(0, out);
  assert.deepEqual(Array.from(out), [0, 0, 0.5, 0.5, 1]);
});

test('custom data: vector components past the count read 0; the materials name the inputs their streams feed', () => {
  const sim = run(record({ emission: { bursts: [burst()] }, start: { lifetime: 1 }, custom: [{ vector: [['c', 2, [0, 0, 1, 1, 1, 1, 1, 1]], 5] }, null] }), 0.5);
  const out = new Float64Array(8);
  sim.customOf(0, out);
  assert.ok(near(out[0], 1, 6));
  assert.deepEqual(Array.from(out.subarray(1)), [5, 0, 0, 0, 0, 0, 0]);
  // The exporter packs the renderer's vertex streams into the 8 values the shader reads (the oracle's
  // texcoord_layout); a reader sees only their sources.
  const inputs = ['uv2.x', 'uv2.y', 'c1.x', 'c1.y', 'c1.z', 'c1.w', 'c2.x', 0];
  const doc = parseParticleDocument({ ...documentOf(record()), materials: [{ ...QUAD_MATERIAL, custom: { inputs } }] }, 0);
  assert.deepEqual(doc.materials[0]?.custom, inputs);
  assert.equal(parseParticleDocument({ ...documentOf(record()), materials: [{ ...QUAD_MATERIAL, custom: { inputs: ['c3.x', 0, 0, 0, 0, 0, 0, 0] } }] }, 0).systems[0], null);
});

/* --- random numbers (test_particle_oracle Randoms) ------------------------------------------- */

test('the hash is the oracle\'s: pinned vectors, every key its own value, a replay new values', () => {
  // test_particle_oracle.py MIX32 / PARTICLE_RANDOM / PLAY_SEED, checked there against Math.imul.
  assert.deepEqual([0, 1, 0xdeadbeef].map(mix32), [0, 1753845952, 3861431939]);
  assert.deepEqual([0, 1, 2].map((k) => particleRandom(12345, k)), [0.9617756559581346, 0.30952230805424547, 0.27417782237265376]);
  assert.equal(playSeed(1, 2, 3), 1066372762);
  const values = RANDOM_KEYS.map((_, k) => particleRandom(12345, k));
  assert.ok(values.every((v) => v >= 0 && v <= 1));
  assert.equal(new Set(values).size, values.length, 'every key draws its own value');
  assert.equal(playSeed(1, 2, 3), mix32(mix32(mix32(1) ^ 2) ^ 3));
  assert.notEqual(playSeed(1, 2, 3), playSeed(1, 2, 4), 'a replayed press draws new particles');
});

test('a particle keeps its values whatever else is drawn; a fixed seed is used as it is, even 0', () => {
  const base = record({ clock: { loop: true }, emission: { rate: 20 }, start: { speed: ['r', 1, 4] }, shape: { type: 'cone' } });
  const more = { ...base, rotation: { curve: ['r', -1, 1] } };
  const velocities = (sim: ParticleSim) => Array.from({ length: sim.count }, (_, i) => [sim.vx[i], sim.vy[i], sim.vz[i]]);
  assert.deepEqual(velocities(run(base, 0.5, 1 / 60, 3)), velocities(run(more, 0.5, 1 / 60, 3)));
  const fixed = record({ clock: { loop: true, seed: 0 }, emission: { rate: 30 }, start: { speed: ['r', 1, 4] } });
  assert.deepEqual(records(run(fixed, 0.5, 1 / 60, 1)), records(run(fixed, 0.5, 1 / 60, 99)));
  // A signed randomSeed (-334000898) is exported as its uint32.
  assert.equal(parsed(record({ clock: { seed: -334000898 >>> 0 } })).data.clock.seed, 3960966398);
});

/* --- prewarm windows and curve bounds (test_particle_oracle Prewarm) ------------------------------ */

test('a windowed prewarm leaves the same live particles as the whole first loop', () => {
  const sys = record({ clock: { loop: true, prewarm: true, prewarmWindow: 2.05, duration: 40 }, start: { lifetime: 2.05, speed: 1 }, emission: { rate: 10 } });
  const full = simOf(sys, { prewarm: 'full' });
  full.play(1);
  const window = simOf(sys);
  window.play(1);
  assert.equal(full.count, window.count);
  const ages = (sim: ParticleSim) => Array.from(sim.age.subarray(0, sim.count)).sort((a, b) => a - b);
  ages(full).forEach((a, i) => assert.ok(Math.abs(a - ages(window)[i]) < 0.1));
  // A prewarmed loop without its window (or a window without one) is not understood: left out, not drawn wrong.
  for (const clock of [{ loop: true, prewarm: true }, { loop: false, prewarm: true, prewarmWindow: 1 }]) {
    const doc = parseParticleDocument(documentOf(record({ clock })), 0);
    assert.equal(doc.systems[0], null);
    assert.match(doc.skipped[0].why, /prewarmWindow/);
  }
});

test('curve bounds include the overshoot between keys', () => {
  const curve = parseCurve(['c', 1, [0, 0, 3, 3, 1, 0, 3, 3]]);
  const [low, high] = keysBounds(curve.max!);
  const sampled = Math.max(...Array.from({ length: 1001 }, (_, i) => evaluateCurve(curve, i / 1000, 1)));
  assert.ok(high >= sampled);
  assert.ok(near(high, Math.sqrt(3) / 6, 12) && near(low, -Math.sqrt(3) / 6, 12));
  assert.deepEqual(curveBounds(parseCurve(['r', 3, -1])), [-1, 3]);
});

/* --- the export's encodings (test_particle_oracle Export) ---------------------------------------- */

test('curve and colour values read back to float32', () => {
  assert.equal(evaluateCurve(parseCurve(2), 0.3, 0.9), 2);
  assert.equal(evaluateCurve(parseCurve(['r', 1, 3]), 0.3, 0.5), 2);
  assert.ok(near(evaluateCurve(parseCurve(['c', 2, [0, 0, 1, 1, 1, 1, 1, 1]]), 0.5, 1), 1));
  assert.equal(evaluateCurve(parseCurve(['c', 1, [0, 3, 0, null, 1, 7, 0, 0]]), 0.9, 1), 3);
  const wrapped = parseCurve(['c', 1, [0, 0, 2, 2, 0.5, 1, 2, 2], ['w', 'clamp', 'repeat']]);
  assert.ok(near(evaluateCurve(wrapped, 0.75, 1), evaluateCurve(wrapped, 0.25, 1)));
  assert.ok(near(evaluateCurve(parseCurve(['cc', 2, [0, 0, 0, 0, 1, 0, 0, 0], [0, 1, 0, 0, 1, 1, 0, 0]]), 0.5, 0.25), 0.5));
  assert.equal(parseCurve(0.1).scalar, Math.fround(0.1), 'read back to float32');
  const out = new Float64Array(4);
  evaluateColor(parseColor([1, 0, 0, 1]), 0.5, 1, out);
  assert.deepEqual(Array.from(out), [1, 0, 0, 1]);
  evaluateColor(parseColor(['g', { c: [0, 0, 0, 0, 1, 1, 1, 1], a: [0, 1, 1, 0] }]), 0.5, 1, out);
  assert.ok(near(out[3], 0.5));
  assert.equal(parseColor(['g', { c: [0, 0, 0, 0], a: [0, 1], fixed: true }]).max?.fixed, true);
});

test('a system reads back with the format\'s defaults; the defaults and keys are the oracle\'s', () => {
  const doc = parseParticleDocument(documentOf({ ...record(), clock: { maxAlive: 50 }, emission: {}, start: {} }), 0);
  const s = doc.systems[0]!;
  assert.deepEqual([s.clock.duration, s.clock.loop, s.clock.maxParticles, s.emission.rate.scalar, s.start.lifetime.scalar, s.start.speed.scalar], [5, true, 1000, 10, 5, 5]);
  assert.deepEqual([s.clock.space, s.clock.scaling, s.clock.seed, s.shape, s.velocity, s.noise, s.sheet, s.custom], ['local', 'local', null, null, null, null, null, null]);
  const pose = poseFrom([1, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0], [0, 0, 0, 1]);
  assert.deepEqual(posePoint(pose, 0, 0, 0), [1, 0, 0]);
  const golden = loadGolden();
  assert.deepEqual(JSON.parse(JSON.stringify(EXPORT_DEFAULTS)), golden.exportDefaults, 'particle_oracle.EXPORT_DEFAULTS');
  assert.deepEqual(RANDOM_KEYS, golden.randomKeys, 'particle_oracle.RANDOM_KEYS');
  assert.deepEqual([0, 1, 0xdeadbeef].map(mix32), golden.mix32);
  assert.deepEqual([0, 1, 2].map((k) => particleRandom(12345, k)), golden.particleRandom);
  assert.equal(playSeed(1, 2, 3), golden.playSeed);
});

test('a skewed emitter moves points through its matrix', () => {
  const pose = poseFrom([1, 0.5, 0, 0, 0, 1, 0, 2, 0, 0, 1, 0], [0, 0, 0, 1]);
  assert.deepEqual(posePoint(pose, 0, 2, 0), [1, 4, 0]);
  assert.deepEqual(poseInverseVector(pose, ...poseVector(pose, 0.3, -1, 2)), [0.3, -1, 2]);
});

/* --- golden fixtures: the oracle's particles, every step ----------------------------------------- */

interface GoldenCase { model: string; system?: number; index: number; name: string; seed: number; steps: number; counts: number[]; tags?: string[];
  sums?: number[][]; samples?: Record<string, { at: number[]; records: number[][] }>; frames?: number[][][] }
interface Golden { exportDefaults: unknown; randomKeys: string[]; mix32: number[]; particleRandom: number[]; playSeed: number; step: number;
  models: Record<string, { first: number; doc: Json }>; cases: GoldenCase[]; excluded: Record<string, string[]> }
let golden: Golden | null = null;
function loadGolden(): Golden {
  golden ??= readGolden<Golden>(GOLDEN);
  return golden;
}
const GROUPS = [[0, 3], [3, 6], [6, 9], [9, 12], [12, 16], [16, 24], [24, 28], [28, 30]];

/** Worst differences seen: absolute, and relative to max(|a|, |b|) where that is above 1e-9. */
interface Worst { abs: number; rel: number; values: number; where: string }
function compare(a: number, b: number, worst: Worst, where: () => string, scale = 1): void {
  const d = Math.abs(a - b);
  worst.values++;
  if (d > worst.abs) worst.abs = d;
  const m = Math.max(Math.abs(a), Math.abs(b));
  if (m > 1e-9 && d / m > worst.rel) { worst.rel = d / m; worst.where = where(); }
  if (!(d <= TOLERANCE * Math.max(scale, Math.abs(a), Math.abs(b)))) assert.fail(`${where()}: ${a} vs ${b} (oracle)`);
}

/** Plays one case on its system and checks it after play() and every step; `frames` (the full fixture) or the compact sums and samples. */
function checkCase(c: GoldenCase, data: ParticleSystemData, doc: ParticleDocument, worst: Worst, precision: 32 | 64 = 64): void {
  const sim = new ParticleSim(data, doc, {}, precision);
  const pose = poseFrom(data.emitter!.matrix, data.emitter!.rotation);
  sim.play(c.seed, pose);
  const r = new Float64Array(30);
  for (let step = 0; step <= c.steps; step++) {
    if (step) sim.step(STEP, pose);
    const label = () => `${c.model} ${c.name} step ${step}`;
    assert.equal(sim.count, c.counts[step], `${label()}: particles`);
    if (c.frames) {
      const frame = c.frames[step];
      for (let i = 0; i < sim.count; i++) {
        sim.record(i, r);
        for (let j = 0; j < 30; j++) compare(r[j], frame[i][j], worst, () => `${label()} particle ${i} value ${j}`);
      }
      continue;
    }
    const sums = new Float64Array(GROUPS.length), magnitude = new Float64Array(GROUPS.length);
    for (let i = 0; i < sim.count; i++) {
      sim.record(i, r);
      GROUPS.forEach(([a, b], g) => { for (let j = a; j < b; j++) { sums[g] += r[j]; magnitude[g] += Math.abs(r[j]); } });
    }
    GROUPS.forEach((_, g) => compare(sums[g], c.sums![step][g], worst, () => `${label()} sum ${g}`, Math.max(1, magnitude[g])));
    const sample = c.samples?.[String(step)];
    if (sample) {
      sample.at.forEach((i, k) => {
        sim.record(i, r);
        sample.records[k].forEach((value, j) => compare(r[j], value, worst, () => `${label()} particle ${i} value ${j}`));
      });
    }
  }
}

test('golden: the committed cases match the oracle particle for particle (Float64, 1e-6 relative)', (t) => {
  const g = loadGolden();
  const docs = new Map(Object.entries(g.models).map(([slug, m]) => {
    const doc = parseParticleDocument(m.doc, m.first);
    assert.deepEqual(doc.skipped, [], `${slug}: every system read`);
    return [slug, doc];
  }));
  const worst: Worst = { abs: 0, rel: 0, values: 0, where: '' };
  const tags = new Set<string>();
  for (const c of g.cases) {
    const doc = docs.get(c.model)!;
    checkCase(c, doc.systems[c.system!]!, doc, worst);
    for (const tag of c.tags ?? []) tags.add(tag);
  }
  assert.ok(g.cases.length >= 30 && tags.size >= 100, `${g.cases.length} cases cover ${tags.size} feature tags`);
  assert.ok(g.cases.some((c) => c.steps === 600), 'with 10 s cases');
  t.diagnostic(`${g.cases.length} cases, ${tags.size} feature tags, ${worst.values} values: max abs ${worst.abs.toExponential(2)}, max rel ${worst.rel.toExponential(2)} (${worst.where})`);
});

const FULL = process.env.PARTICLE_GOLDEN_DIR;
test('golden: the full selection, every particle at every step (PARTICLE_GOLDEN_DIR)', { skip: !FULL && 'PARTICLE_GOLDEN_DIR names no make-golden.py --full folder' }, (t) => {
  const precision = process.env.PARTICLE_GOLDEN_PRECISION === '32' ? 32 : 64;
  const worst: Worst = { abs: 0, rel: 0, values: 0, where: '' };
  let cases = 0, systems = 0, steps = 0, models = 0;
  for (const file of fs.readdirSync(FULL!).filter((name) => name.endsWith('.json.gz')).sort()) {
    const model = readGolden<{ first: number; doc: Json; cases: GoldenCase[] }>(path.join(FULL!, file));
    const doc = parseParticleDocument(model.doc, model.first);
    assert.deepEqual(doc.skipped, [], `${file}: the reader understands every system`);
    models++;
    systems += doc.systems.length;
    for (const c of model.cases) {
      checkCase(c, doc.systems[c.index]!, doc, worst, precision);
      cases++;
      steps += c.steps;
    }
  }
  t.diagnostic(`${models} models (${systems} systems read), ${cases} cases, ${steps} steps, ${worst.values} values (Float${precision}): max abs ${worst.abs.toExponential(2)}, `
    + `max rel ${worst.rel.toExponential(2)} (${worst.where})`);
});

/* --- the reader: strict per system, never the whole file for one system ------------------------- */

test('the reader refuses a file it does not know as a whole, and leaves out only the systems it does not understand', () => {
  const ok = documentOf(record({ emission: { rate: 5 } }));
  assert.equal(parseParticleDocument(ok, 0).systems.length, 1);
  for (const [why, doc] of [
    ['version', { ...ok, version: 2 }],
    ['unknown member', { ...ok, extra: 1 }],
    ['unit', { ...ok, unit: 0 }],
    ['textures', { ...ok, textures: [{ file: 'layer9.webp', width: 4, height: 4, wrap: ['clamp', 'clamp'], phase: 'idle' }] }],
    ['textures', { ...ok, textures: [{ file: 'layer0.webp', width: 4, height: 4, wrap: ['clamp', 'clamp'], phase: 'Battle' }] }],
    ['limits', { ...ok, systems: Array.from({ length: PARTICLE_LIMITS.systems + 1 }, () => record()) }],
  ] as const) assert.throws(() => parseParticleDocument(doc, 0), new RegExp(why));
  assert.throws(() => parseParticleText(' '.repeat(PARTICLE_LIMITS.bytes + 1), 0), /bytes/);
  // Particle textures are numbered on after layers.json's own.
  const textured = { ...ok, textures: [{ file: 'layer3.webp', width: 4, height: 4, wrap: ['clamp', 'clamp'], phase: 'Interact', bytes: 1, sha256: '0' }] };
  assert.equal(parseParticleDocument(textured, 3).textures[0].phase, 'Interact');

  const fine = record({ emission: { rate: 5 } });
  const cases: [string, Json, RegExp][] = [
    ['unknown member', { ...fine, glow: true }, /unknown member glow/],
    ['bad curve', record({ emission: { rate: ['x', 1] } }), /unknown curve/],
    ['keys out of order', record({ start: { lifetime: ['c', 1, [1, 0, 0, 0, 0, 1, 0, 0]] } }), /out of order/],
    ['too fast', record({ emission: { rate: PARTICLE_LIMITS.rate * 2 } }), /rate/],
    ['too many burst fires', record({ emission: { bursts: [burst(0, 1, 0, 1e-6)] } }), /burst/],
    ['noise that turns particles', record({ noise: { strength: 1, rotation: 1 } }), /rotation and size amounts/],
    ['trail data', record({ trail: {} }), /trail/],
    ['an unknown capability', record({ requires: ['wind'] }), /requires wind \(unknown\)/],
    ['a material it left out', record({ material: 1 }), /material/],
    ['a mesh shape without areaCdf', record({ shape: { type: 'mesh', mesh: 0 } }), /shape\.mesh/],
  ];
  for (const [label, system, why] of cases) {
    const doc = parseParticleDocument(documentOf(fine, system, fine), 0);
    assert.ok(doc.systems[0] && doc.systems[2], `${label}: the others still play`);
    assert.equal(doc.systems[1], null, label);
    assert.match(doc.skipped[0].why, why, label);
  }
});

test('requires: a system needing a capability this reader lacks is left out with every system tied to it', () => {
  // A sub-emitter parent (1) and its child (2), and an unrelated system (0) that still plays. Sub-emitters arrive with P4.
  const parent = record({ requires: ['sub'], sub: [[2, 'death', 1]], emission: { rate: 5 } });
  const child = record({ requires: ['sub'], child: true });
  const doc = parseParticleDocument(documentOf(record({ emission: { rate: 5 } }), parent, child), 0);
  assert.ok(doc.systems[0]);
  assert.deepEqual([doc.systems[1], doc.systems[2]], [null, null]);
  assert.deepEqual(doc.skipped.map((s) => s.why), ['requires sub (not simulated yet)', 'requires sub (not simulated yet)']);
  // One understood system tied to one that is not goes too.
  const tied = parseParticleDocument(documentOf(record({ sub: [[1, 'birth', 1]], requires: ['sub'] }), record({ requires: ['sub', 'wind'], child: true })), 0);
  assert.deepEqual(tied.systems, [null, null]);
});

/* --- site additions the oracle does not have yet (mesh shapes, separate noise axes, a world-space limit) --- */

const TRIANGLES = {
  // Two triangles, the second three times the first's area; normals +Z, vertex colours red then blue.
  vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0, 10, 0, 0, 13, 0, 0, 10, 2, 0], uvs: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
  colors: [1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1], triangles: [0, 1, 2, 3, 4, 5],
  normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], areaCdf: [0.25, 1],
};
function meshSamples(shape: Json, n = 2000): ReturnType<typeof shapeStart>[] {
  const doc = parseParticleDocument({ ...documentOf(record({ shape: { type: 'mesh', mesh: 0, ...shape } })), meshes: [TRIANGLES] }, 0);
  assert.deepEqual(doc.skipped, []);
  return Array.from({ length: n }, (_, i) => shapeStart(doc.systems[0]!, doc, mix32(i + 11)));
}

test('mesh shapes: vertices, triangles by area and edges, along the normal, in the vertex colours', () => {
  const vertices = meshSamples({});
  const corners = new Set(TRIANGLES.vertices.reduce<string[]>((out, _, i) => (i % 3 ? out : [...out, TRIANGLES.vertices.slice(i, i + 3).join()]), []));
  assert.ok(vertices.every((s) => corners.has(s.position.join()) && s.direction.join() === '0,0,1'));
  const inSecond = (p: number[]) => p[0] >= 10 - 1e-9;
  const triangles = meshSamples({ placement: 'triangle' });
  const share = triangles.filter((s) => inSecond(s.position)).length / triangles.length;
  assert.ok(share > 0.7 && share < 0.8, `the larger triangle by area: ${share}`);
  for (const { position: [x, y], color } of triangles) {
    if (inSecond([x])) assert.ok(x <= 13 + 1e-9 && y >= -1e-9 && (x - 10) / 3 + y / 2 <= 1 + 1e-9 && near(color[2], 1, 9));
    else assert.ok(x >= -1e-9 && y >= -1e-9 && x + y <= 1 + 1e-9 && near(color[0], 1, 9));
  }
  for (const { position: [x, y] } of meshSamples({ placement: 'edge' })) {
    const onFirst = Math.abs(y) < 1e-9 || Math.abs(x) < 1e-9 || Math.abs(x + y - 1) < 1e-9;
    const onSecond = Math.abs(y) < 1e-9 || Math.abs(x - 10) < 1e-9 || Math.abs((x - 10) / 3 + y / 2 - 1) < 1e-9;
    assert.ok(onFirst || onSecond, `${x}, ${y} lies on an edge`);
  }
  assert.ok(meshSamples({ normalOffset: 2 }).every((s) => near(s.position[2], 2)));
  // useColors (the default) tints the start colour; useColors false leaves it.
  const born = (shape: Json) => {
    const doc = parseParticleDocument({ ...documentOf(record({ shape: { type: 'mesh', mesh: 0, placement: 'triangle', ...shape }, emission: { bursts: [burst(0, 50)] } })), meshes: [TRIANGLES] }, 0);
    const sim = new ParticleSim(doc.systems[0]!, doc, {}, 64);
    sim.play(5);
    sim.step(STEP);
    return Array.from({ length: sim.count }, (_, i) => [sim.cr[i], sim.cb[i]]);
  };
  assert.ok(born({}).every(([r, b]) => r + b === 1));
  assert.ok(born({ useColors: false }).every(([r, b]) => r === 1 && b === 1));
});

test('noise strengthXYZ: per axis with noiseAxes separate, the x strength on every axis as the oracle does', () => {
  const sys = record({ clock: { loop: true }, emission: { rate: 30 }, start: { speed: 1, lifetime: 2 }, shape: { type: 'sphere' }, noise: { strengthXYZ: [1, 0, 0] } });
  const ys = (sim: ParticleSim) => Array.from({ length: sim.count }, (_, i) => sim.ay[i]);
  assert.ok(ys(run(sys, 1, 1 / 60, 3)).some((y) => Math.abs(y) > 1e-6), 'x strength on y too');
  assert.ok(ys(run(sys, 1, 1 / 60, 3, { noiseAxes: 'separate' })).every((y) => y === 0), 'y strength 0');
});

test('a separate-axis limit applies in its own space: the root\'s with world, else the emitter\'s', () => {
  const quarter = Math.SQRT1_2;
  // The emitter turned 90 degrees about Z: its +X is the root's +Y.
  const pose = poseFrom([0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0], [0, 0, quarter, quarter]);
  const speedAfter = (limit: Json) => {
    const sim = simOf(record({ emission: { bursts: [burst()] }, start: { speed: 1 }, shape: { type: 'box', rot: [0, 90, 0], scale: [0, 0, 0] }, limit }));
    sim.play(1, pose);
    for (let i = 0; i < 10; i++) sim.step(STEP, pose);
    return Math.hypot(sim.vx[0], sim.vy[0], sim.vz[0]);
  };
  // Moving along the emitter's +X (the root's +Y): a limit of 0 on x kills it in the emitter's space only.
  assert.ok(near(speedAfter({ xyz: [0, 100, 100], dampen: 1 }), 0));
  assert.ok(near(speedAfter({ xyz: [0, 100, 100], dampen: 1, world: true }), 1));
});

/* --- the director: activation on the layers' clock (section 3.6), the grid, budgets, reduced motion --- */

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 1, 1];
/** An emitter timeline record: frames [t, active, ...extra] at the still identity emitter. */
function timeline(frames: [number, number, ...number[]][], extra: string[] = [], more: Json = {}): Json {
  const row = ([t, active, ...rest]: number[]) => [t, ...IDENTITY, active, ...rest];
  return { columns: ['t', 'matrix', 'rotation', 'scale', 'active', ...extra], length: frames.at(-1)![0], loop: false, loopFrom: 0, frames: frames.map(row), ...more };
}
const clockAt = (time: number, playing: string | null = 'Idle', animationTime = time): ParticleClock => ({ playing, animationTime, time });
function director(systems: Json[], options: ConstructorParameters<typeof ParticleDirector>[1] = {}): ParticleDirector {
  return new ParticleDirector(parseParticleDocument(documentOf(...systems), 0), { precision: 64, degrade: false, warn: () => {}, ...options });
}
/** Frames of `fps` from `from` to `to` seconds on the illustration's clock (Idle playing on its own track time). */
function playFrames(d: ParticleDirector, fps: number, from: number, to: number, clock: (t: number) => ParticleClock = (t) => clockAt(t)): void {
  const first = Math.round(from * fps), last = Math.round(to * fps);
  for (let n = first; n <= last; n++) d.frame(clock(n / fps), n === first ? 0 : 1 / fps);
}

test('director: an always-on system plays at the illustration\'s start exactly as the oracle\'s steps (golden)', () => {
  const g = loadGolden();
  let checked = 0;
  for (const c of g.cases) {
    const raw = g.models[c.model].doc.systems as Json[];
    const system = raw[c.system!];
    if (system.only !== null || system.delay !== 0 || !system.active || c.steps !== 120) continue;
    const doc = parseParticleDocument({ ...g.models[c.model].doc, systems: raw }, g.models[c.model].first);
    // The director seeds each play with playSeed(modelSeed, the system's index in the file, plays): this case's.
    doc.systems[c.system!]!.index = c.index;
    const d = new ParticleDirector({ ...doc, systems: doc.systems.map((s, i) => (i === c.system ? s : null)) }, { precision: 64, degrade: false });
    const run = d.runs[0];
    for (let n = 0; n <= 30; n++) {
      d.frame(clockAt(n * STEP, null), n ? STEP : 0);
      assert.equal(run.sim.count, c.counts[n], `${c.name} frame ${n}`);
    }
    if (++checked >= 8) break;
  }
  assert.ok(checked >= 4, `${checked} systems`);
});

test('director: the state never depends on the display rate (a fixed grid from each system\'s start)', () => {
  const sys = record({ clock: { loop: true, duration: 2 }, emission: { rate: 37, bursts: [burst(0.31, 5)] }, start: { speed: ['r', 1, 3], lifetime: 1.3 }, shape: { type: 'cone' },
    delay: 0.237, noise: { strength: 0.5 } });
  const state = (fps: number) => {
    const d = director([sys]);
    playFrames(d, fps, 0, 3);
    return records(d.runs[0].sim);
  };
  const reference = state(60);
  assert.ok(reference.length > 10);
  for (const fps of [30, 50, 75, 120, 144, 240]) assert.deepEqual(state(fps), reference, `${fps} fps`);
});

test('director: a group\'s system plays from its animation\'s start after its delay, and its action ending clears it (ACTION_END)', () => {
  assert.equal(ACTION_END, 'vanish');
  const sys = record({ only: 'Interact', delay: 0.75, clock: { loop: true }, emission: { rate: 60 }, start: { lifetime: 5 } });
  const d = director([sys]);
  const interact = (t: number) => clockAt(10 + t, 'Interact', t);
  playFrames(d, 60, 0, 0.74, interact);
  assert.equal(d.runs[0].on, false, 'before its delay');
  playFrames(d, 60, 0.75, 1.75, interact);
  assert.equal(d.runs[0].on, true);
  assert.equal(d.runs[0].plays, 1);
  assert.ok(Math.abs(d.runs[0].sim.emittedTotal - 60) <= 1, 'one second of 60/s');
  d.frame(clockAt(11.8, 'Idle', 0.05), 1 / 60);
  assert.equal(d.runs[0].on, false);
  assert.equal(d.runs[0].sim.count, 0, 'vanish: the group is deactivated');
  assert.equal(d.live, 0);
  // 'finish': emission stops and the particles live out their lives.
  const f = director([sys], { actionEnd: 'finish' });
  playFrames(f, 60, 0, 1.75, interact);
  const alive = f.runs[0].sim.count;
  f.frame(clockAt(11.8, 'Idle', 0.05), 1 / 60);
  assert.equal(f.runs[0].sim.count, alive);
  playFrames(f, 60, 0.05, 6, (t) => clockAt(11.8 + t, 'Idle', t));
  assert.equal(f.runs[0].sim.count, 0, 'all lived out');
  assert.equal(f.runs[0].sim.emittedTotal, f.runs[0].sim.deadTotal);
});

test('director: a replayed press restarts its systems with new particles; the entrance hand-over restarts the always-on ones', () => {
  const sys = record({ only: 'Interact', clock: { loop: true }, emission: { rate: 30 }, start: { speed: ['r', 1, 3] }, shape: { type: 'sphere' } });
  const d = director([sys]);
  playFrames(d, 60, 0, 0.5, (t) => clockAt(5 + t, 'Interact', t));
  const first = records(d.runs[0].sim);
  playFrames(d, 60, 0, 0.5, (t) => clockAt(6 + t, 'Interact', t));
  assert.equal(d.runs[0].plays, 2);
  assert.equal(d.runs[0].sim.count, first.length);
  assert.notDeepEqual(records(d.runs[0].sim), first, 'a new seed (playSeed with the next play count)');
  const always = director([record({ clock: { loop: true }, emission: { rate: 30 } })]);
  playFrames(always, 60, 0, 2);
  playFrames(always, 60, 0, 0.1);
  assert.equal(always.runs[0].plays, 2);
  assert.ok(always.runs[0].sim.count <= 4);
});

test('director: an active column plays on its rising edge and clears on its falling one; clips drive speed and emission', () => {
  const lightning = record({ clock: { loop: true }, emission: { rate: 60 }, start: { lifetime: 10 }, active: false,
    emitter: { timeline: timeline([[0, 0], [1, 1], [2, 0], [3, 1]]) } });
  const d = director([lightning]);
  playFrames(d, 60, 0, 0.99);
  assert.equal(d.runs[0].on, false);
  playFrames(d, 60, 1, 1.5);
  assert.deepEqual([d.runs[0].on, d.runs[0].plays], [true, 1]);
  assert.ok(d.runs[0].sim.count >= 29 && d.runs[0].sim.count <= 31);
  playFrames(d, 60, 1.5, 2.5);
  assert.deepEqual([d.runs[0].on, d.runs[0].sim.count], [false, 0], 'a clip switched its GameObject off');
  playFrames(d, 60, 2.5, 3.2);
  assert.deepEqual([d.runs[0].on, d.runs[0].plays], [true, 2], 'and on again: a new play');
  // speed 2 integrated: the system's clock runs twice as fast; emission.enabled 0 stops births only.
  const driven = record({ clock: { loop: true }, emission: { rate: 60 }, start: { lifetime: 10 },
    emitter: { timeline: timeline([[0, 1, 2, 1], [1, 1, 2, 1], [1.0333, 1, 2, 0], [3, 1, 2, 0]], ['speed', 'emission.enabled']) } });
  const e = director([driven]);
  playFrames(e, 60, 0, 1);
  assert.ok(near(e.runs[0].sim.time, 2, 6), `${e.runs[0].sim.time}`);
  const born = e.runs[0].sim.emittedTotal;
  assert.ok(born >= 118 && born <= 121, `${born}`);
  playFrames(e, 60, 1, 2);
  assert.ok(e.runs[0].sim.emittedTotal - born <= 4, 'emission switched off');
  assert.equal(e.runs[0].sim.count, e.runs[0].sim.emittedTotal, 'nobody died: the particles live on');
});

test('director: a state timeline replaces the default while its action plays (Idle restarting the default)', () => {
  const sys = record({ clock: { loop: true }, emission: { rate: 60 }, emitter: { timeline: timeline([[0, 1], [10, 1]], [], { states: { Interact: { length: 2, loop: false, loopFrom: 0,
    frames: [[0, ...IDENTITY, 0], [1, ...IDENTITY, 1]] } } }) } });
  const d = director([sys]);
  playFrames(d, 60, 0, 1);
  assert.equal(d.runs[0].plays, 1);
  playFrames(d, 60, 0, 0.5, (t) => clockAt(1 + t, 'Interact', t));
  assert.equal(d.runs[0].on, false, 'the Interact state starts with it off');
  playFrames(d, 60, 0.5, 1.5, (t) => clockAt(1 + t, 'Interact', t));
  assert.deepEqual([d.runs[0].on, d.runs[0].plays, d.runs[0].key], [true, 2, 'state:Interact']);
  playFrames(d, 60, 0, 0.2, (t) => clockAt(2.5 + t, 'Idle', t));
  assert.deepEqual([d.runs[0].on, d.runs[0].plays, d.runs[0].key], [true, 3, 'Idle']);
});

test('director: reduced motion stands the looping idle systems still at 3 s, and plays a pressed animation live', () => {
  const idle = record({ clock: { loop: true, duration: 2 }, emission: { rate: 20 }, start: { speed: 1, lifetime: 2.5 }, shape: { type: 'cone' } });
  const once = record({ emission: { bursts: [burst(0, 10)] }, start: { lifetime: 10 } });
  const pressed = record({ only: 'Interact', clock: { loop: true }, emission: { rate: 30 } });
  const d = director([idle, once, pressed], { reduced: true });
  const still = { playing: 'Idle', animationTime: 0, time: 0 };
  d.frame(still, 0);
  const sim = d.runs[0].sim;
  assert.ok(near(sim.time, REDUCED_STILL, 9), 'simulated silently to 3 s');
  const frozen = records(sim);
  for (let i = 0; i < 30; i++) d.frame(still, 1 / 60);
  assert.deepEqual(records(sim), frozen, 'and drawn still');
  assert.equal(d.runs[1].on, false, 'a one-shot is not part of the still');
  // The same particles as a live run at 3 s with the default seed.
  const live = director([idle]);
  playFrames(live, 60, 0, REDUCED_STILL);
  assert.deepEqual(records(live.runs[0].sim), frozen);
  // A pressed animation plays on its own clock and stops with it.
  playFrames(d, 60, 0, 1, (t) => ({ playing: 'Interact', animationTime: t, time: 0 }));
  assert.ok(d.runs[2].sim.count >= 29);
  assert.deepEqual(records(d.runs[0].sim), frozen, 'the still is untouched');
  const held = records(d.runs[2].sim);
  for (let i = 0; i < 10; i++) d.frame({ playing: 'Interact', animationTime: 1, time: 0 }, 1 / 60);
  assert.deepEqual(records(d.runs[2].sim), held, 'held at its end');
});

test('director budgets: pools grow to 4,096 a system, the model keeps under the live cap evenly, a failing system goes alone', () => {
  const flood = record({ clock: { loop: true, maxParticles: 100000, maxAlive: 1 }, emission: { rate: 50000 }, start: { lifetime: 100 } });
  const d = director([flood]);
  playFrames(d, 60, 0, 0.5);
  assert.equal(d.runs[0].sim.count, 4096);
  assert.equal(LIVE_CAP, 8192);
  const warnings: string[] = [];
  const two = record({ clock: { loop: true }, emission: { rate: 3000 }, start: { lifetime: 100 } });
  const capped = director([two, two, two], { liveCap: 1000, warn: (m) => warnings.push(m) });
  playFrames(capped, 60, 0, 2);
  assert.ok(capped.live <= 1000);
  const counts = capped.runs.map((r) => r.sim.count);
  assert.ok(counts.every((n) => n > 250), `births dropped evenly: ${counts}`);
  assert.equal(warnings.length, 1, 'one warning');
  const failing = director([record({ clock: { loop: true }, emission: { rate: 30 }, start: { speed: 1 } }), record({ clock: { loop: true }, emission: { rate: 30 } })],
    { warn: (m) => warnings.push(m) });
  failing.runs[0].data.start.speed.scalar = NaN;
  playFrames(failing, 60, 0, 1);
  assert.deepEqual([failing.runs[0].failed, failing.runs[0].sim.count], [true, 0]);
  assert.ok(failing.runs[1].sim.count >= 29, 'the others still play');
  assert.match(warnings.at(-1)!, /switched off/);
});

test('director: a bone follower\'s placement is stepped between frames; slow frames step at 1/30 s', () => {
  const follow = { bone: 'hand', xy: true, rotation: false, localScale: false, mirrored: false, parent: [1, 0, 0, 1], position: [0, 0], angle: 0 };
  const sys = record({ follow, clock: { loop: true, space: 'world' }, emission: { rate: 600 }, start: { lifetime: 10 } });
  const d = director([sys]);
  let x = 0;
  const placement = () => ({ matrix: [1, 0, 0, x, 0, 1, 0, 0, 0, 0, 1, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1], origin: null });
  d.frame(clockAt(0), 0, placement);
  x = 6;
  d.frame(clockAt(0.1), 0.1, placement);
  const xs = Array.from(d.runs[0].sim.px.subarray(0, d.runs[0].sim.count)).sort((a, b) => a - b);
  assert.ok(xs[0] < 1 && xs.at(-1)! > 5, 'world-space births spread along the bone\'s path');
  assert.ok(new Set(xs.map((v) => Math.round(v))).size >= 6, 'not clumped at the frames');
  const slow = director([record({ clock: { loop: true }, emission: { rate: 10 } })], { degrade: true });
  for (let n = 0; n < 80; n++) slow.frame(clockAt(n * 0.04), n ? 0.04 : 0);
  assert.equal(slow.step, 1 / 30);
  for (let n = 0; n < 300; n++) slow.frame(clockAt(3.2 + n * 0.01), 0.01);
  assert.equal(slow.step, STEP);
  assert.equal(MODEL_SEED, 0x5eed);
});
