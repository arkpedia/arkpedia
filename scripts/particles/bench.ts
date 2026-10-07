/*
 * CPU cost of one particle frame in Node (V8), production precision (Float32 state): ParticleDirector.frame
 * at 60 fps (one 1/60 s step) plus a stub of the renderer's expansion (P5): every particle's position drawn
 * between its last two steps, through its emitter's 3x4 into skeleton units, its size, rotation, colour, sheet
 * frame and custom data, written as 4 billboard corners into one interleaved buffer (the lean 20-byte vertex:
 * x, y, u, v as float32 and RGBA as bytes; the custom one adds 8 float32).
 *
 * Reported per batch of frames, the median and the best: on a shared machine, load lands in some batches.
 *
 * The mix Design 1 timed (design-data-sim/bench.mjs: 0.72 ms for 3,000): gravity, velocity over lifetime, limit
 * velocity, rotation over lifetime, size curve, colour gradient, a 2x2 sheet, custom data, noise on a quarter of
 * the particles, a cone shape and steady births (lifetime 1-2 s). Then the real thing: a model's exported systems
 * (by default Hoshiguma's P1 export) on the illustration's clock.
 *
 *   npx tsx scripts/particles/bench.ts [path/to/layerParticles.json layerTextures]
 */
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { parseParticleDocument, type ParticleDocument } from '../../lib/skins/particleData';
import { ParticleDirector, STEP, type SystemRun } from '../../lib/skins/particleSim';

const FRAMES = 200;
const BATCHES = 9;

/** The renderer stub: every live particle of every run as 4 corners. Returns the vertices written. */
function expand(runs: readonly SystemRun[], doc: ParticleDocument, buffer: ArrayBuffer): number {
  const f32 = new Float32Array(buffer), u32 = new Uint32Array(buffer);
  const at20 = new Float64Array(20);
  const inv = 1 / doc.unit;
  let at = 0, vertices = 0;
  for (const run of runs) {
    const sim = run.sim, data = run.data;
    if (!run.on || !data.render || !sim.count) continue;
    const m = run.matrix, k = run.alpha, sc = run.scale;
    const local = data.clock.space === 'local';
    const customised = doc.materials[data.material!]?.custom !== null;
    const stride = customised ? 13 : 5; // floats per vertex: x, y, u, v, rgba (4 bytes) [+ 8 custom]
    for (let i = 0; i < sim.count; i++) {
      const lx = sim.qx[i] + (sim.px[i] - sim.qx[i]) * k, ly = sim.qy[i] + (sim.py[i] - sim.qy[i]) * k, lz = sim.qz[i] + (sim.pz[i] - sim.qz[i]) * k;
      const x = (local ? m[0] * lx + m[1] * ly + m[2] * lz + m[3] : lx) * inv;
      const y = (local ? m[4] * lx + m[5] * ly + m[6] * lz + m[7] : ly) * inv;
      sim.attributes(i, at20, customised);
      const hx = at20[0] * sc[0] * inv * 0.5, hy = at20[1] * sc[1] * inv * 0.5;
      const c = Math.cos(-sim.rz[i]), s = Math.sin(-sim.rz[i]);
      const r = (at20[3] * 255 + 0.5) | 0, g = (at20[4] * 255 + 0.5) | 0, b = (at20[5] * 255 + 0.5) | 0, a = (at20[6] * 255 + 0.5) | 0;
      // The four corners, unrolled: (-, -), (+, -), (-, +), (+, +).
      const ax = hx * c, ay = hx * s, bx = hy * s, by = hy * c;
      const rgba = (r | (g << 8) | (b << 16) | (a << 24)) >>> 0;
      const u0 = at20[8], v0 = at20[9], u1 = at20[10], v1 = at20[11];
      f32[at] = x - ax + bx; f32[at + 1] = y - ay - by; f32[at + 2] = u0; f32[at + 3] = v0; u32[at + 4] = rgba;
      f32[at + stride] = x + ax + bx; f32[at + stride + 1] = y + ay - by; f32[at + stride + 2] = u1; f32[at + stride + 3] = v0; u32[at + stride + 4] = rgba;
      f32[at + 2 * stride] = x - ax - bx; f32[at + 2 * stride + 1] = y - ay + by; f32[at + 2 * stride + 2] = u0; f32[at + 2 * stride + 3] = v1; u32[at + 2 * stride + 4] = rgba;
      f32[at + 3 * stride] = x + ax - bx; f32[at + 3 * stride + 1] = y + ay + by; f32[at + 3 * stride + 2] = u1; f32[at + 3 * stride + 3] = v1; u32[at + 3 * stride + 4] = rgba;
      if (customised) {
        for (let j = 0; j < 8; j++) {
          const value = at20[12 + j];
          f32[at + 5 + j] = value; f32[at + stride + 5 + j] = value; f32[at + 2 * stride + 5 + j] = value; f32[at + 3 * stride + 5 + j] = value;
        }
      }
      at += 4 * stride;
      vertices += 4;
    }
  }
  return vertices;
}

/** Frames of 1/60 s in BATCHES batches of FRAMES: per batch the average ms of director.frame (one step) and of the
 *  expansion; the median and the best batch (a shared machine's load lands in some batches, not all). */
function measure(doc: ParticleDocument, warmup: number): { live: number; median: Split; best: Split } {
  const director = new ParticleDirector(doc, { precision: 32, degrade: false });
  const buffer = new ArrayBuffer(16384 * 4 * 13 * 4);
  let n = 0;
  const clock = () => ({ playing: 'Idle', animationTime: n * STEP, time: n * STEP });
  for (; n < warmup; n++) { director.frame(clock(), n ? STEP : 0); expand(director.runs, doc, buffer); }
  const batches: Split[] = [];
  let live = 0;
  for (let b = 0; b < BATCHES; b++) {
    let stepMs = 0, expandMs = 0;
    for (let f = 0; f < FRAMES; f++, n++) {
      const t0 = performance.now();
      director.frame(clock(), STEP);
      const t1 = performance.now();
      expand(director.runs, doc, buffer);
      const t2 = performance.now();
      stepMs += t1 - t0;
      expandMs += t2 - t1;
      live += director.live;
    }
    batches.push({ step: stepMs / FRAMES, expand: expandMs / FRAMES, total: (stepMs + expandMs) / FRAMES });
  }
  batches.sort((a, b) => a.total - b.total);
  return { live: Math.round(live / (FRAMES * BATCHES)), median: batches[batches.length >> 1], best: batches[0] };
}
interface Split { step: number; expand: number; total: number }
const show = (r: Split) => `step ${r.step.toFixed(3)} + expand ${r.expand.toFixed(3)} = ${r.total.toFixed(3)} ms`;

const MATERIAL = (custom: boolean) => ({
  blend: 'add', texture: null, color: [1, 1, 1, 1], cull: 0, custom: custom ? { inputs: ['c1.x', 'c1.y', 'c1.z', 'c1.w', 'c2.x', 'c2.y', 0, 0] } : null,
  shader: { family: 'particle', main: { st: [1, 1, 0, 0], speed: [0, 0], scroll: [0, 0], fract: false }, distort: null, dissolve: [], edge: null, ramp: null, vertex: null, animated: [] },
});

/** Design 1's mix for `count` live particles: three quarters without noise, a quarter with. */
function mixFor(count: number): ParticleDocument {
  const system = (share: number, noise: boolean, index: number) => ({
    name: `mix${index}`, requires: [], only: null, delay: 0, active: true, follow: null, child: false,
    emitter: { matrix: [1, 0, 0, index, 0, 1, 0, 0, 0, 0, 1, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    clock: { maxParticles: 10000, maxAlive: Math.ceil(share * 1.2) },
    emission: { rate: share / 1.5 },
    start: { lifetime: ['r', 1, 2], speed: ['r', 0.5, 2], size: ['r', 0.3, 0.5], rotation: ['r', 0, 6.28], gravity: ['r', 0.02, 0.08], color: ['r', [1, 0.8, 0.6, 1], [1, 1, 1, 1]] },
    shape: { type: 'cone', radius: 0.5, angle: 30 },
    velocity: { linear: [['c', 1, [0, 0, 0, 1, 0.5, 0.6, 1, -1, 1, 0.2, -1, 0]], ['r', -0.3, 0.3], 0] },
    limit: { magnitude: 1.5, dampen: 0.1 },
    ...(noise ? { noise: { strength: 0.5, frequency: 0.8, scroll: 0.2 } } : {}),
    rotation: { curve: ['r', -0.5, 0.5] },
    size: { curve: ['c', 1, [0, 0.74, 0, 2, 0.3, 1, 0, 0, 1, 0.085, -3, 0]] },
    color: { gradient: ['g', { c: [0, 1, 1, 1, 0.5, 0.8, 0.9, 1, 1, 0.6, 0.7, 1], a: [0, 0, 0.28, 1, 0.79, 1, 1, 0] }] },
    sheet: { tiles: [2, 2], frameOverTime: ['r', 0, 0.9999] },
    custom: [{ vector: [['c', 1, [0, 1, 0, -10, 0.1, -0.11, 0, 0]], ['r', 0, 1]] }, null],
    render: { mode: 'billboard' }, material: index % 2,
  });
  return parseParticleDocument({
    version: 1, unit: 0.01, camera: { size: 10, height: 2000 }, controller: { fixFxDelay: 1, animTimeFixed: 0 }, textures: [], materials: [MATERIAL(true), MATERIAL(false)], meshes: [],
    systems: [system(count * 0.375, false, 0), system(count * 0.375, false, 1), system(count * 0.25, true, 2)],
  }, 0);
}

console.log(`node ${process.version}, ${BATCHES} batches of ${FRAMES} frames, Float32 state; a frame: median batch (best batch)`);
for (const count of [1000, 3000, 6000]) {
  const r = measure(mixFor(count), 240);
  console.log(`mix ${String(count).padStart(5)} (live ${r.live}): ${show(r.median)} (${show(r.best)})`);
}
const [file, first] = process.argv.slice(2);
if (file) {
  const doc = parseParticleDocument(JSON.parse(fs.readFileSync(file, 'utf8')), Number(first ?? 0));
  const r = measure(doc, 240);
  console.log(`${file.split('/').slice(-3, -1).join('/')}: ${doc.systems.filter(Boolean).length} systems, live ${r.live}: ${show(r.median)} (${show(r.best)})`);
}
