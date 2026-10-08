import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import {
  EXPORT_DEFAULTS, PARTICLE_LIMITS, RANDOM_KEYS, SUPPORTED_REQUIRES, color32, curveBounds, evaluateColor, evaluateCurve, keysBounds, parseColor, parseCurve,
  parseParticleDocument, parseParticleText, sampleLine, type ParticleDocument, type ParticleSystemData,
} from '../../lib/skins/particleData';
import {
  ACTION_END, LIVE_CAP, MODEL_SEED, ParticleDirector, ParticleSim, REDUCED_STILL, STEP, SWITCH_SLACK, identityPose, mix32, particleRandom, particleWord, playSeed, poseFrom,
  curlNoise, poseInverseVector, posePoint, poseVector, shapeStart, type ParticleClock, type ParticleOptions, type Pose,
} from '../../lib/skins/particleSim';
import { followPlacement } from '../../lib/skins/particleGeometry';
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
const FAMILIES = 'scripts/tests/fixtures/particles/families.json.gz';
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
const burst = (time = 0, count: number | unknown[] = 1, cycles = 1, interval = 0.01, probability = 1) => [time, count, cycles, interval, probability];

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

test('emission: the accumulator start is the way to the first birth (0 after 1/rate, 0.5 half way, 1 on the first step)', () => {
  const first = (start: number) => {
    const sim = simOf(record({ emission: { rate: 2 } }), { emitAccumulatorStart: start });
    sim.play(1);
    for (let n = 1; n < 120; n++) { sim.step(1 / 64); if (sim.emittedTotal) return [n, sim.emittedTotal]; } // 1/64: exact in binary
    return null;
  };
  assert.deepEqual(first(0), [32, 1]);
  assert.deepEqual(first(0.5), [16, 1]);
  assert.deepEqual(first(1), [1, 1], 'a start of 1 is one at once, not the same as 0');
  assert.equal(run(record({ emission: { rate: 10 } }), 6, 1 / 60, 1, { emitAccumulatorStart: 1 }).emittedTotal, 51);
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

test('motion: orbital velocity turns a particle exactly each step, so its radius holds (Hoshiguma\'s fire rings)', () => {
  // 3 units from the centre, orbiting about Z at up to 10 rad/s over a 3 s life (fire_ring_ctrl): at any step and speed
  // modifier the radius holds, and the particle turns by the integral of the speed (10 a^2 / 6 rad x the modifier).
  for (const [dt, speedModifier] of [[1 / 60, 1], [1 / 30, 1], [1 / 60, 2]]) {
    const sim = simOf(record({
      emission: { bursts: [burst()] }, start: { lifetime: 3 }, shape: { type: 'circleEdge', radius: 3, arc: 0.0001 },
      velocity: { orbital: [0, 0, ['c', 10, [0, 0, 1, 1, 1, 1, 1, 1]]], speedModifier },
    }));
    sim.play(1);
    let turned = 0, last: number | null = null;
    for (let i = 0; i < Math.round(2.9 / dt); i++) {
      sim.step(dt);
      assert.ok(near(Math.hypot(sim.px[0], sim.py[0]), 3, 9), `radius ${Math.hypot(sim.px[0], sim.py[0])} at step ${i}`);
      const angle = Math.atan2(sim.py[0], sim.px[0]);
      if (last !== null) turned += ((angle - last + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
      last = angle;
    }
    const age = sim.age[0], expected = (speedModifier * 10 * age * age) / 6;
    assert.ok(Math.abs(turned - expected) <= 0.05 * expected, `turned ${turned}, expected ${expected}`);
  }
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
  assert.ok(tags.has('shape.mesh'), 'with a mesh shape (sampled as the oracle samples one)');
  t.diagnostic(`${g.cases.length} cases, ${tags.size} feature tags, ${worst.values} values: max abs ${worst.abs.toExponential(2)}, max rel ${worst.rel.toExponential(2)} (${worst.where})`);
});

const FULL = process.env.PARTICLE_GOLDEN_DIR;
/** What a full export's reader leaves out: only what carries trails (v2), and what is tied to it. */
const notTrails = (doc: ParticleDocument) => doc.skipped.filter((s) => !/^(requires trail|trail \(not drawn yet\)|tied to .* \((requires trail|trail \(not drawn yet\)))/.test(s.why));
test('golden: the full selection, every particle at every step (PARTICLE_GOLDEN_DIR)', { skip: !FULL && 'PARTICLE_GOLDEN_DIR names no make-golden.py --full folder' }, (t) => {
  const precision = process.env.PARTICLE_GOLDEN_PRECISION === '32' ? 32 : 64;
  const worst: Worst = { abs: 0, rel: 0, values: 0, where: '' };
  let cases = 0, systems = 0, steps = 0, models = 0;
  for (const file of fs.readdirSync(FULL!).filter((name) => name.endsWith('.json.gz') && !name.endsWith('.families.json.gz')).sort()) {
    const model = readGolden<{ first: number; doc: Json; cases: GoldenCase[] }>(path.join(FULL!, file));
    const doc = parseParticleDocument(model.doc, model.first);
    assert.deepEqual(notTrails(doc), [], `${file}: the reader understands every system but those with trails`);
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

/* --- sub-emitter families: a parent and its children against the oracle's ---------------------- */

interface FamilyCase {
  model: string; parent: number; members: number[]; names: string[]; seeds: number[]; poses: number[][]; tags: string[]; counts: number[][];
  first?: number; doc?: Json; at?: number[]; sums?: number[][][]; samples?: Record<string, { at: number[]; records: number[][] }>[]; frames?: number[][][][];
}

/** Plays one family (its parent's links in the export's order, the fixture's poses and seeds) and checks every
 *  member after play() and every step: `frames` (the full fixture), or the compact sums and samples. */
function checkFamily(c: FamilyCase, doc: ParticleDocument, at: readonly number[], steps: number, worst: Worst, precision: 32 | 64 = 64): void {
  const datas = at.map((k) => doc.systems[k]!);
  const sims = datas.map((data) => new ParticleSim(data, doc, {}, precision));
  const parent = sims[0];
  assert.equal(datas[0].sub.length, sims.length - 1);
  datas[0].sub.forEach(([index, kind, probability], j) => {
    assert.equal(index, at[j + 1]);
    parent.link(sims[j + 1], kind, probability);
  });
  const poses = c.poses.map((p) => Float64Array.from(p));
  const childPoses = poses.slice(1);
  parent.play(c.seeds[0], poses[0], childPoses);
  const r = new Float64Array(30);
  for (let step = 0; step <= steps; step++) {
    if (step) parent.step(STEP, poses[0], datas[0].clock.speed, childPoses);
    sims.forEach((sim, j) => {
      const label = () => `${c.model} ${c.names[j]} (family of ${c.names[0]}) step ${step}`;
      assert.equal(sim.count, c.counts[step][j], `${label()}: particles`);
      if (c.frames) {
        const frame = c.frames[step][j];
        for (let i = 0; i < sim.count; i++) {
          sim.record(i, r);
          for (let k = 0; k < 30; k++) compare(r[k], frame[i][k], worst, () => `${label()} particle ${i} value ${k}`);
        }
        return;
      }
      const sums = new Float64Array(GROUPS.length), magnitude = new Float64Array(GROUPS.length);
      for (let i = 0; i < sim.count; i++) {
        sim.record(i, r);
        GROUPS.forEach(([a, b], g) => { for (let k = a; k < b; k++) { sums[g] += r[k]; magnitude[g] += Math.abs(r[k]); } });
      }
      GROUPS.forEach((_, g) => compare(sums[g], c.sums![step][j][g], worst, () => `${label()} sum ${g}`, Math.max(1, magnitude[g])));
      const sample = c.samples?.[j]?.[String(step)];
      if (sample) {
        sample.at.forEach((i, k) => {
          sim.record(i, r);
          sample.records[k].forEach((value, v) => compare(r[v], value, worst, () => `${label()} particle ${i} value ${v}`));
        });
      }
    });
  }
}

test('golden families: committed sub-emitter families match the oracle particle for particle, parents and children (Float64, 1e-6)', (t) => {
  const g = readGolden<{ steps: number; families: FamilyCase[] }>(FAMILIES);
  const worst: Worst = { abs: 0, rel: 0, values: 0, where: '' };
  const tags = new Set<string>();
  let children = 0;
  for (const c of g.families) {
    const doc = parseParticleDocument(c.doc, c.first!);
    assert.deepEqual(doc.skipped, [], `${c.model} ${c.names[0]}: every member read`);
    checkFamily(c, doc, c.at!, g.steps, worst);
    for (const tag of c.tags) tags.add(tag);
    children += c.members.length - 1;
  }
  for (const tag of ['link.birth', 'link.death', 'child.space=world', 'child.space=local', 'child.bursts', 'child.distance', 'parent.spawner', 'parent.prewarm', 'parent.follow']) {
    assert.ok(tags.has(tag), `the committed families cover ${tag}`);
  }
  assert.ok(g.families.some((c) => c.model === 'char_1044_hsgma2_2'), 'Hoshiguma\'s among them');
  assert.ok(g.families.every((c) => c.counts.some((step) => step.slice(1).some((n) => n > 0))), 'every family\'s children emit');
  t.diagnostic(`${g.families.length} families (${children} children), ${tags.size} tags, ${worst.values} values: max abs ${worst.abs.toExponential(2)}, `
    + `max rel ${worst.rel.toExponential(2)} (${worst.where})`);
});

test('golden families: through the director (its gate, its grid, its child poses) a family plays exactly as the oracle\'s', (t) => {
  const g = readGolden<{ steps: number; families: FamilyCase[] }>(FAMILIES);
  const worst: Worst = { abs: 0, rel: 0, values: 0, where: '' };
  let played = 0;
  for (const c of g.families) {
    const doc = parseParticleDocument(c.doc, c.first!);
    const members = c.at!.map((k) => doc.systems[k]!);
    if (members.some((m) => m.follow || m.timeline)) continue; // the fixture's poses are the still emitters' only there
    const d = new ParticleDirector(doc, { precision: 64, degrade: false, warn: () => {} });
    const runs = c.at!.map((k) => d.runs.find((run) => run.data.index === k)!);
    // The fixture's seeds are playSeed(0x5EED, the full export's index, 1): give each system its index there.
    members.forEach((m, j) => { m.index = c.members[j]; });
    assert.deepEqual(runs.slice(1).map((run) => run.parent), runs.slice(1).map(() => runs[0]));
    const parent = members[0];
    const r = new Float64Array(30);
    for (let step = 0; step <= g.steps; step++) {
      const time = parent.delay + step / 60;
      d.frame(parent.only ? { playing: parent.only, animationTime: time, time } : { playing: 'Idle', animationTime: time, time }, step ? 1 / 60 : 0);
      runs.forEach((run, j) => {
        const label = () => `${c.model} ${c.names[j]} (director) step ${step}`;
        assert.equal(run.sim.count, c.counts[step][j], `${label()}: particles`);
        const sums = new Float64Array(GROUPS.length), magnitude = new Float64Array(GROUPS.length);
        for (let i = 0; i < run.sim.count; i++) {
          run.sim.record(i, r);
          GROUPS.forEach(([a, b], k) => { for (let v = a; v < b; v++) { sums[k] += r[v]; magnitude[k] += Math.abs(r[v]); } });
        }
        GROUPS.forEach((_, k) => compare(sums[k], c.sums![step][j][k], worst, () => `${label()} sum ${k}`, Math.max(1, magnitude[k])));
      });
    }
    played++;
  }
  assert.ok(played >= 5, `${played} families through the director`);
  t.diagnostic(`${played} families, ${worst.values} values: max abs ${worst.abs.toExponential(2)}, max rel ${worst.rel.toExponential(2)}`);
});

test('golden families: every selected family, every particle at every step (PARTICLE_GOLDEN_DIR)', { skip: !FULL && 'PARTICLE_GOLDEN_DIR names no make-golden.py --full folder' }, (t) => {
  const precision = process.env.PARTICLE_GOLDEN_PRECISION === '32' ? 32 : 64;
  const worst: Worst = { abs: 0, rel: 0, values: 0, where: '' };
  let families = 0, members = 0, models = 0;
  const hoshiguma: string[] = [];
  for (const file of fs.readdirSync(FULL!).filter((name) => name.endsWith('.families.json.gz')).sort()) {
    const model = readGolden<{ first: number; doc: Json; steps: number; families: FamilyCase[] }>(path.join(FULL!, file));
    const doc = parseParticleDocument(model.doc, model.first);
    models++;
    for (const c of model.families) {
      checkFamily(c, doc, c.members, model.steps, worst, precision);
      families++;
      members += c.members.length;
      if (c.model === 'char_1044_hsgma2_2') hoshiguma.push(c.names[0]);
    }
  }
  t.diagnostic(`${models} models, ${families} families (${members} systems; Hoshiguma's ${hoshiguma.length}), ${worst.values} values (Float${precision}): `
    + `max abs ${worst.abs.toExponential(2)}, max rel ${worst.rel.toExponential(2)} (${worst.where})`);
});

/* --- sub-emitters on records (the oracle's semantics, README "Sub-emitters") ---------------------- */

/** A parent (system 0) and its children (1...), linked in order with `kinds`; Float64 simulations of them. */
function familyOf(parent: Json, children: Json[], kinds: ('birth' | 'death')[], probability = 1) {
  const doc = parseParticleDocument(documentOf({ ...parent, requires: ['sub'], sub: children.map((_, j) => [j + 1, kinds[j], probability]) },
    ...children.map((c) => ({ ...c, requires: ['sub'], child: true }))), 0);
  assert.deepEqual(doc.skipped, []);
  const sims = doc.systems.map((data) => new ParticleSim(data!, doc, {}, 64));
  sims.slice(1).forEach((child, j) => sims[0].link(child, kinds[j], probability));
  return { parent: sims[0], children: sims.slice(1) };
}
const at = (x: number, y: number, z: number): Pose => poseFrom([1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z], [0, 0, 0, 1]);
function runFamily(f: ReturnType<typeof familyOf>, seconds: number, pose: Pose = identityPose(), childPoses: Pose[] = f.children.map(() => identityPose())): void {
  f.parent.play(7, pose, childPoses);
  for (let i = 0; i < Math.round(seconds * 60); i++) f.parent.step(1 / 60, pose, undefined, childPoses);
}
const positions = (sim: ParticleSim) => Array.from({ length: sim.count }, (_, i) => [sim.px[i], sim.py[i], sim.pz[i]]);

test('sub-emitters: a birth link emits from each parent particle on that particle\'s clock; a child never plays alone', () => {
  // Three still parents on a sphere's surface, alive 2 s; a child at 10/s from each, as long as each lives.
  const f = familyOf(record({ emission: { bursts: [burst(0, 3)] }, start: { lifetime: 2, speed: 0 }, shape: { type: 'sphere', thickness: 0 } }),
    [record({ clock: { loop: true }, emission: { rate: 10 }, start: { lifetime: 100, speed: 0 } })], ['birth']);
  runFamily(f, 1);
  const [child] = f.children;
  assert.ok(child.count >= 28 && child.count <= 30, `${child.count} from 3 parents at 10/s over 1 s`);
  const parents = positions(f.parent);
  for (const p of positions(child)) assert.ok(parents.some((q) => q.every((v, k) => Math.abs(v - p[k]) < 1e-9)), 'each born where its parent is');
  runFamily(f, 3);
  assert.equal(child.emittedTotal, 57, 'none after the parents die at 2 s: 19 each (0.1 ... 1.9 s)');
  assert.throws(() => child.play(1), /plays only through its parent/);
  assert.throws(() => child.step(1 / 60), /steps only through its parent/);
  assert.throws(() => f.parent.step(1 / 60), /sub-emitters' poses are needed/);
  assert.throws(() => f.parent.link(child, 'birth', 1), /one parent/);
});

test('sub-emitters: a death link fires each of its bursts once where a parent particle dies, placed in the root', () => {
  // Two parents moving +Z at 2 u/s for 0.5 s from an emitter at x = 10; a world child bursts 4 and 1 x 3 cycles.
  const f = familyOf(record({ emission: { bursts: [burst(0, 2)] }, start: { lifetime: 0.5, speed: 2 } }),
    [record({ clock: { space: 'world' }, emission: { bursts: [burst(0, 4), burst(0.1, 1, 3, 0.01)] }, start: { lifetime: 10, speed: 0 } })], ['death']);
  runFamily(f, 1, at(10, 0, 0));
  const [child] = f.children;
  assert.equal(child.count, 10, 'each burst once a death (cycles are a loop\'s, not a death\'s): 5 for each of 2');
  for (const [x, y, z] of positions(child)) assert.ok(Math.abs(x - 10) < 1e-9 && Math.abs(y) < 1e-9 && z > 0.9 && z <= 1.0 + 1e-9, `${x} ${y} ${z}`);
});

test('sub-emitters: a link fires with its probability per parent particle; a non-looping child stops after its duration; maxParticles drops', () => {
  const parent = record({ emission: { bursts: [burst(0, 3)] }, start: { lifetime: 2, speed: 0 } });
  const never = familyOf(parent, [record({ clock: { loop: true }, emission: { rate: 10 } })], ['birth'], 0);
  runFamily(never, 1);
  assert.equal(never.children[0].emittedTotal, 0);
  const short = familyOf(parent, [record({ clock: { loop: false, duration: 0.3 }, emission: { rate: 10 }, start: { lifetime: 100 } })], ['birth']);
  runFamily(short, 1.5);
  assert.equal(short.children[0].emittedTotal, 9, '3 a parent: its 0.3 s at 10/s, though the parents live on');
  const capped = familyOf(parent, [record({ clock: { loop: true, maxParticles: 5 }, emission: { rate: 10 }, start: { lifetime: 100 } })], ['birth']);
  runFamily(capped, 1);
  assert.equal(capped.children[0].count, 5);
});

test('sub-emitters: rate over distance counts the parent particle\'s own path; a child prewarms with its parent', () => {
  const mover = familyOf(record({ emission: { bursts: [burst(0, 1)] }, start: { lifetime: 10, speed: 4 } }),
    [record({ clock: { loop: true }, emission: { rate: 0, distance: 5 }, start: { lifetime: 100 } })], ['birth']);
  runFamily(mover, 1);
  assert.ok(Math.abs(mover.children[0].count - 20) <= 1, `${mover.children[0].count}: 4 u at 5 a unit`);
  const warm = familyOf(record({ clock: { loop: true, prewarm: true, prewarmWindow: 2, duration: 2 }, emission: { rate: 5 }, start: { lifetime: 1, speed: 0 } }),
    [record({ clock: { loop: true }, emission: { rate: 10 }, start: { lifetime: 0.5 } })], ['birth']);
  warm.parent.play(1, identityPose(), [identityPose()]);
  assert.ok(warm.parent.count >= 4 && warm.children[0].count >= 15, `${warm.parent.count} parents and ${warm.children[0].count} children, prewarmed`);
});

test('sub-emitters: a local child sees its parent particle from its own emitter; a world child takes the root position', () => {
  const f = familyOf(record({ emission: { bursts: [burst(0, 1)] }, start: { lifetime: 10, speed: 0 } }),
    [record({ emission: { bursts: [burst(0, 1)] }, start: { lifetime: 10 } }), record({ clock: { space: 'world' }, emission: { bursts: [burst(0, 1)] }, start: { lifetime: 10 } })],
    ['birth', 'birth']);
  runFamily(f, 0.1, at(1, 2, 0), [at(5, 0, 0), at(5, 0, 0)]);
  assert.deepEqual(positions(f.children[0]).map((p) => p.map((v) => Math.round(v * 1e9) / 1e9)), [[-4, 2, 0]]);
  assert.deepEqual(positions(f.children[1]).map((p) => p.map((v) => Math.round(v * 1e9) / 1e9)), [[1, 2, 0]]);
});

test('sub-emitters: a child\'s particles never depend on other parent particles (each draws from its own link generator)', () => {
  const child = record({ clock: { loop: true }, emission: { rate: ['r', 5, 15], bursts: [burst(0, ['r', 1, 4])] }, start: { lifetime: 100, speed: ['r', 1, 2] }, shape: { type: 'sphere' } });
  const three = familyOf(record({ emission: { bursts: [burst(0, 3)] }, start: { lifetime: 10, speed: 0 } }), [child], ['birth']);
  const four = familyOf(record({ emission: { bursts: [burst(0, 4)] }, start: { lifetime: 10, speed: 0 } }), [child], ['birth']);
  runFamily(three, 1);
  runFamily(four, 1);
  const key = (r: number[]) => r.map((v) => v.toFixed(9)).join(',');
  const more = new Set(records(four.children[0]).map(key));
  assert.ok(records(three.children[0]).every((r) => more.has(key(r))), 'the first three parents\' children, unchanged by a fourth');
  assert.ok(four.children[0].count > three.children[0].count);
  assert.equal(particleWord(12345, 0) >>> 9, Math.round(particleRandom(12345, 0) * 8388607));
});

test('sub-emitter families: the reader keeps a family whole or leaves all of it out', () => {
  const child = record({ requires: ['sub'], child: true });
  const parent = (links: number[][]) => record({ requires: ['sub'], sub: links.map(([c]) => [c, 'birth', 1]) });
  const why = (...systems: Json[]) => parseParticleDocument(documentOf(...systems), 0).skipped.map((s) => s.why);
  assert.deepEqual(why(parent([[1]]), child), []);
  assert.match(why(parent([[2]]), parent([[2]]), child).join(), /a sub-emitter with 2 parents/);
  assert.match(why(parent([[1]]), record({ requires: ['sub'] })).join(), /not marked child/);
  assert.match(why(parent([[1]]), { ...child, sub: [[2, 'birth', 1]] }, child).join(), /sub-emitters of its own/);
  assert.match(why(parent(Array.from({ length: 9 }, (_, i) => [i + 1])), ...Array.from({ length: 9 }, () => child)).join(), /more than 8/);
  assert.equal(parseParticleDocument(documentOf(parent([[2]]), parent([[2]]), child), 0).systems.filter(Boolean).length, 0, 'every system tied to it goes');
});

test('director: children sit in runs with their parent, play and clear with it, and fail alone', () => {
  const parent = record({ only: 'Interact', delay: 0.5, requires: ['sub'], sub: [[1, 'birth', 1]], render: null, material: null,
    emission: { bursts: [burst(0, 2)] }, start: { lifetime: 3, speed: 0 } });
  const child = record({ only: 'Interact', delay: 0.5, requires: ['sub'], child: true, clock: { loop: true }, emission: { rate: 30 }, start: { lifetime: 100, speed: 0 } });
  const warnings: string[] = [];
  const d = director([parent, child], { warn: (m) => warnings.push(m) });
  assert.deepEqual([d.runs.length, d.runs[1].parent, d.runs[0].children[0], d.runs[0].sim.links.length], [2, d.runs[0], d.runs[1], 1]);
  playFrames(d, 60, 0, 1);
  assert.deepEqual([d.runs[0].on, d.runs[1].on, d.live], [false, false, 0]);
  playFrames(d, 60, 0, 1.5, (t) => clockAt(1 + t, 'Interact', t));
  assert.deepEqual([d.runs[0].on, d.runs[1].on, d.runs[1].plays], [true, true, 1]);
  assert.ok(Math.abs(d.runs[1].sim.count - 60) <= 2, `${d.runs[1].sim.count}: 2 parents at 30/s for 1 s`);
  assert.equal(d.live, d.runs[0].sim.count + d.runs[1].sim.count);
  playFrames(d, 60, 0, 0.1, (t) => clockAt(2.6 + t, 'Idle', t));
  assert.deepEqual([d.runs[0].on, d.runs[1].on, d.live], [false, false, 0], 'the action ended: the family vanishes (ACTION_END)');
  // A child that goes non-finite is switched off alone; its parent plays on.
  const e = director([parent, child], { warn: (m) => warnings.push(m) });
  e.runs[1].data.start.speed.scalar = NaN;
  playFrames(e, 60, 0, 1.5, (t) => clockAt(t, 'Interact', t));
  assert.deepEqual([e.runs[1].failed, e.runs[1].on, e.runs[1].sim.count, e.runs[0].failed, e.runs[0].on], [true, false, 0, false, true]);
  assert.match(warnings.at(-1)!, /switched off: a value went non-finite/);
});

test('director: with ACTION_END finish, a family whose action ended lives out its particles, its children still driven', () => {
  const parent = record({ only: 'Interact', requires: ['sub'], sub: [[1, 'birth', 1]], clock: { loop: true }, emission: { rate: 10 }, start: { lifetime: 1, speed: 0 } });
  const child = record({ only: 'Interact', requires: ['sub'], child: true, clock: { loop: true }, emission: { rate: 20 }, start: { lifetime: 0.5, speed: 0 } });
  const d = director([parent, child], { actionEnd: 'finish' });
  playFrames(d, 60, 0, 2, (t) => clockAt(t, 'Interact', t));
  playFrames(d, 60, 0, 0.5, (t) => clockAt(2 + t, 'Idle', t));
  assert.deepEqual([d.runs[0].finishing, d.runs[1].finishing, d.runs[1].on], [true, true, true]);
  const born = d.runs[1].sim.emittedTotal;
  playFrames(d, 60, 0.5, 0.8, (t) => clockAt(2 + t, 'Idle', t));
  assert.ok(d.runs[1].sim.emittedTotal > born, 'the parents still alive still emit children');
  playFrames(d, 60, 0.8, 3, (t) => clockAt(2 + t, 'Idle', t));
  assert.deepEqual([d.runs[0].sim.familyCount, d.runs[0].on, d.runs[1].on, d.live], [0, false, false, 0], 'until the family is empty');
});

test('director: a child whose own GameObject a clip switches off is cleared and its births dropped', () => {
  const parent = record({ requires: ['sub'], sub: [[1, 'birth', 1]], clock: { loop: true }, emission: { rate: 5 }, start: { lifetime: 10, speed: 0 } });
  const child = record({ requires: ['sub'], child: true, clock: { loop: true }, emission: { rate: 10 }, start: { lifetime: 100, speed: 0 },
    emitter: { timeline: timeline([[0, 1], [1, 0], [2, 1], [3, 1]]) } });
  const d = director([parent, child]);
  playFrames(d, 60, 0, 0.9);
  assert.ok(d.runs[1].sim.count > 0 && d.runs[1].on);
  playFrames(d, 60, 0.9, 1.5);
  const dropped = d.runs[1].sim.emittedTotal;
  playFrames(d, 60, 1.5, 1.95);
  assert.deepEqual([d.runs[1].sim.count, d.runs[1].on, d.runs[1].sim.emittedTotal], [0, false, dropped], 'cleared, and nothing born while off');
  playFrames(d, 60, 1.95, 2.5);
  assert.ok(d.runs[1].sim.count > 0 && d.runs[1].on && d.runs[0].plays === 1, 'on again, its parent never restarted');
});

test('director: a follower places a Local-scaling emitter turned by its rotation alone, a Hierarchy one through all of it', () => {
  // The bone at (300, 400), turned 90 degrees and scaled 2 (localScale); 100 skeleton units a follower unit.
  const follow = { bone: 'hand', xy: true, rotation: true, localScale: true, mirrored: false, parent: [100, 0, 0, 100] as [number, number, number, number],
    position: [0, 0] as [number, number], angle: 0 };
  const bone = { worldX: 300, worldY: 400, scaleX: 2, scaleY: 2, getWorldRotationX: () => 90 };
  const emitter = { matrix: [1, 0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] };
  const placed = (scaling: 'local' | 'hierarchy') => {
    const d = director([record({ follow, emitter, clock: { loop: true, scaling }, emission: { rate: 10 } })]);
    for (let n = 0; n <= 12; n++) d.frame(clockAt(n / 60), n ? 1 / 60 : 0, (data) => followPlacement(data.follow!, bone, 0.01, data.clock.scaling));
    return { matrix: Array.from(d.runs[0].matrix).map((v) => Math.round(v * 1e9) / 1e9), scale: Array.from(d.runs[0].scale) };
  };
  // The origin (1, 0, 0) through the whole placement either way: (3 + 0, 4 + 2, 0); sizes take the bone's scale under Hierarchy.
  assert.deepEqual(placed('local'), { matrix: [0, -1, 0, 3, 1, 0, 0, 6, 0, 0, 1, 0], scale: [1, 1, 1] });
  assert.deepEqual(placed('hierarchy'), { matrix: [0, -2, 0, 3, 2, 0, 0, 6, 0, 0, 1, 0], scale: [2, 2, 1] });
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
  // A sub-emitter parent (1) and its child (2) whose child carries trails (v2), and an unrelated system (0) that still plays.
  const parent = record({ requires: ['sub'], sub: [[2, 'death', 1]], emission: { rate: 5 } });
  const child = record({ requires: ['sub', 'trail'], child: true });
  const doc = parseParticleDocument(documentOf(record({ emission: { rate: 5 } }), parent, child), 0);
  assert.ok(doc.systems[0]);
  assert.deepEqual([doc.systems[1], doc.systems[2]], [null, null]);
  assert.deepEqual(doc.skipped.map((s) => s.why), ['tied to test (requires trail (not simulated yet))', 'requires trail (not simulated yet)']);
  // One understood system tied to one that is not goes too; `sub` itself is understood (P4).
  const tied = parseParticleDocument(documentOf(record({ sub: [[1, 'birth', 1]], requires: ['sub'] }), record({ requires: ['sub', 'wind'], child: true })), 0);
  assert.deepEqual(tied.systems, [null, null]);
  assert.ok(SUPPORTED_REQUIRES.has('sub') && !SUPPORTED_REQUIRES.has('trail'));
  const family = parseParticleDocument(documentOf(record({ sub: [[1, 'birth', 1]], requires: ['sub'] }), record({ requires: ['sub'], child: true })), 0);
  assert.deepEqual(family.skipped, []);
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

test('director: a state timeline replaces the default while its action plays; moving between them never restarts a system', () => {
  const sys = record({ clock: { loop: true }, emission: { rate: 60 }, start: { lifetime: 100 }, emitter: { timeline: timeline([[0, 1], [10, 1]], [],
    { states: { Interact: { length: 2, loop: false, loopFrom: 0, frames: [[0, ...IDENTITY, 0], [1, ...IDENTITY, 1]] } } }) } });
  const d = director([sys]);
  playFrames(d, 60, 0, 1);
  assert.equal(d.runs[0].plays, 1);
  playFrames(d, 60, 0, 0.5, (t) => clockAt(1 + t, 'Interact', t));
  assert.deepEqual([d.runs[0].on, d.runs[0].sim.count], [false, 0], 'the Interact state switches its GameObject off from its start');
  playFrames(d, 60, 0.5, 1.5, (t) => clockAt(1 + t, 'Interact', t));
  assert.deepEqual([d.runs[0].on, d.runs[0].plays, d.runs[0].key], [true, 2, 'state:Interact'], 'and on again: a new play');
  const born = d.runs[0].sim.emittedTotal;
  // Back to Idle (its track time from 0): the Animator changed state, the GameObject stayed on: it plays on.
  playFrames(d, 60, 0, 0.5, (t) => clockAt(2.5 + t, 'Idle', t));
  assert.deepEqual([d.runs[0].on, d.runs[0].plays, d.runs[0].key], [true, 2, 'Idle']);
  assert.ok(d.runs[0].sim.emittedTotal >= born + 28 && d.runs[0].sim.count === d.runs[0].sim.emittedTotal, 'nothing cleared');
  // And into a state that keeps it on: the same.
  const lit = record({ clock: { loop: true }, emission: { rate: 60 }, start: { lifetime: 100 }, emitter: { timeline: timeline([[0, 1], [10, 1]], [],
    { states: { Interact: { length: 2, loop: false, loopFrom: 0, frames: [[0, ...IDENTITY, 1], [2, ...IDENTITY, 1]] } } }) } });
  const e = director([lit]);
  playFrames(e, 60, 0, 1);
  const before = e.runs[0].sim.count;
  playFrames(e, 60, 0, 1, (t) => clockAt(1 + t, 'Interact', t));
  assert.deepEqual([e.runs[0].plays, e.runs[0].key], [1, 'state:Interact']);
  assert.ok(e.runs[0].sim.count >= before + 58, `${before} -> ${e.runs[0].sim.count}`);
  // A clip's switch is written to 1e-4 s (61/60 s as 1.0167): the grid point on it takes it.
  const switched = record({ clock: { loop: true }, emission: { rate: 60 }, active: false, emitter: { timeline: timeline([[0, 0], [1.0167, 1], [3, 1]]) } });
  const f = director([switched]);
  playFrames(f, 60, 0, 61 / 60);
  assert.deepEqual([f.runs[0].on, SWITCH_SLACK], [true, 1e-4]);
});

test('timelines: `emission.enabled` is stepped like `active` (a value holds until its next frame)', () => {
  const sys = record({ clock: { loop: true }, emission: { rate: 60 }, emitter: { timeline: timeline([[0, 1, 1], [1, 1, 0], [2, 1, 0]], ['emission.enabled']) } });
  const data = parsed(sys).data;
  const out = new Float64Array(data.timeline!.width);
  sampleLine(data.timeline!, data.timeline!.width, 0.9, out);
  assert.equal(out[data.timeline!.at['emission.enabled']], 1);
  sampleLine(data.timeline!, data.timeline!.width, 1, out);
  assert.equal(out[data.timeline!.at['emission.enabled']], 0);
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

/* Independent scalar central differences: preserve the field at cell boundaries and across octaves. */
test('curl noise: direct gradients preserve finite differences inside and across cells', () => {
  function hash3(ix: number, iy: number, iz: number): number {
    let h = (((Math.imul(ix, 374761393) + Math.imul(iy, 668265263)) | 0) + Math.imul(iz, 2147483647)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return (((h ^ (h >>> 16)) & 0xffff) / 65535) * 2 - 1;
  }

  // The 8 corner hashes of the cell each field (k = 0, 1, 2) last sampled: a curl samples each field at four points
  // 2e-3 apart, almost always in one cell, so its hashes are worked out once (the same values, the same sums).
  const cellKey = new Float64Array(9).fill(NaN);
  const cellHash = new Float64Array(24);

  function valueNoise(k: number, x: number, y: number, z: number): number {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    const fx = x - ix, fy = y - iy, fz = z - iz;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz);
    const key = k * 3, h = k * 8;
    if (cellKey[key] !== ix || cellKey[key + 1] !== iy || cellKey[key + 2] !== iz) {
      cellKey[key] = ix; cellKey[key + 1] = iy; cellKey[key + 2] = iz;
      for (let c = 0; c < 8; c++) cellHash[h + c] = hash3(ix + (c >> 2), iy + ((c >> 1) & 1), iz + (c & 1));
    }
    // The corners in the oracle's order (dx, then dy, then dz), each weight the same product, summed in turn.
    const ox = 1 - sx, oy = 1 - sy, oz = 1 - sz;
    let out = 0;
    out += ox * oy * oz * cellHash[h];
    out += ox * oy * sz * cellHash[h + 1];
    out += ox * sy * oz * cellHash[h + 2];
    out += ox * sy * sz * cellHash[h + 3];
    out += sx * oy * oz * cellHash[h + 4];
    out += sx * oy * sz * cellHash[h + 5];
    out += sx * sy * oz * cellHash[h + 6];
    out += sx * sy * sz * cellHash[h + 7];
    return out;
  }

  const field = (k: number, x: number, y: number, z: number) => valueNoise(k, x + 31.7 * k, y + 17.3 * k, z + 11.1 * k);

  /** The curl of three offset value-noise fields by central differences, octaves summed (roughly unit amplitude). */
  function referenceCurlNoise(x: number, y: number, z: number, octaves: number, octaveMultiplier: number, octaveScale: number, out: Float64Array): void {
    const e = 1e-3, e2 = 2 * e;
    let ox = 0, oy = 0, oz = 0, amp = 1, freq = 1;
    for (let o = 0; o < Math.max(1, octaves); o++) {
      const q0 = x * freq, q1 = y * freq, q2 = z * freq;
      const dfzDy = (field(2, q0, q1 + e, q2) - field(2, q0, q1 - e, q2)) / e2;
      const dfyDz = (field(1, q0, q1, q2 + e) - field(1, q0, q1, q2 - e)) / e2;
      const dfxDz = (field(0, q0, q1, q2 + e) - field(0, q0, q1, q2 - e)) / e2;
      const dfzDx = (field(2, q0 + e, q1, q2) - field(2, q0 - e, q1, q2)) / e2;
      const dfyDx = (field(1, q0 + e, q1, q2) - field(1, q0 - e, q1, q2)) / e2;
      const dfxDy = (field(0, q0, q1 + e, q2) - field(0, q0, q1 - e, q2)) / e2;
      const k = amp * 0.25;
      ox += (dfzDy - dfyDz) * k; oy += (dfxDz - dfzDx) * k; oz += (dfyDx - dfxDy) * k;
      amp *= octaveMultiplier;
      freq *= octaveScale;
    }
    out[0] = ox; out[1] = oy; out[2] = oz;
  }


  const actual = new Float64Array(3), expected = new Float64Array(3);
  const points: number[][] = [];
  for (let i = 0; i < 256; i++) points.push([mix32(i + 1) / 1e8 - 20, mix32(i + 257) / 1e8 - 20, mix32(i + 513) / 1e8 - 20]);
  for (let field = 0; field < 3; field++) for (const cell of [-2, -1, 0, 1]) for (const offset of [-0.0011, -0.001, -0.0005, 0, 0.0005, 0.001, 0.0011]) {
    points.push([cell + offset - 31.7 * field, 0.37, 0.62]);
    points.push([0.24, cell + offset - 17.3 * field, -0.43]);
    points.push([-0.36, 0.58, cell + offset - 11.1 * field]);
  }
  for (const [x, y, z] of points) for (const octaves of [1, 4]) {
    curlNoise(x, y, z, octaves, 0.5, 2, actual);
    referenceCurlNoise(x, y, z, octaves, 0.5, 2, expected);
    for (let axis = 0; axis < 3; axis++) assert.ok(Math.abs(actual[axis] - expected[axis]) < 1e-10, `${x},${y},${z}, octave ${octaves}, axis ${axis}: ${actual[axis]} vs ${expected[axis]}`);
  }
});


test('director: staged prewarm preserves particles, budgets, replay and driven shape on every frame', () => {
  const system = record({ active: false, clock: { loop: true, prewarm: true, prewarmWindow: 1.5, duration: 5 },
    emission: { rate: 30 }, start: { lifetime: 1.5, speed: ['r', 0.2, 0.5] }, shape: { type: 'sphere' }, noise: { strength: 0.1 },
    emitter: { timeline: timeline([[0, 0, 1], [2, 1, 2], [3, 0, 3], [5, 1, 4], [6, 0, 1]], ['shape.radius']) } });
  for (const cap of [8192, 10]) for (const fps of [30, 60, 120]) {
    const ahead = director([system], { liveCap: cap }), sync = director([system], { liveCap: cap, prewarmAhead: false });
    let adopted = false;
    const initial = ahead.runs[0].sim;
    for (let replay = 0; replay < 2; replay++) for (let frame = 0; frame <= 6.5 * fps; frame++) {
      const t = frame / fps;
      ahead.frame(clockAt(t), 1 / fps); sync.frame(clockAt(t), 1 / fps);
      assert.equal(ahead.live, sync.live, `live at ${fps}fps, cap ${cap}, t ${t}`);
      assert.equal(ahead.runs[0].plays, sync.runs[0].plays);
      assert.deepEqual(records(ahead.runs[0].sim), records(sync.runs[0].sim), `particles at ${fps}fps, cap ${cap}, t ${t}, replay ${replay}`);
      adopted ||= ahead.runs[0].sim !== initial;
    }
    if (cap === 8192) assert.ok(adopted, 'a completed prewarm was adopted');
    else assert.ok(!adopted, 'capped births use the synchronous path');
  }
});
