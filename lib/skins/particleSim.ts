/*
 * The particle systems' simulation (Unity's Shuriken, as the animated illustrations use it), on the CPU, in
 * pure TypeScript: no WebGL here (the renderer is components/skins/particleRenderer.ts's job), so all of it is
 * unit tested against the reference simulator, scripts/tests/particle_oracle.py in arkpedia/arkpedia-l2d-assets
 * (scripts/tests/test-particles.ts: the oracle's tests ported, and golden fixtures it generated from real
 * exports, matched particle for particle).
 *
 * Two layers:
 * - ParticleSim: one system, a port of the oracle's Simulation (play, stop, clear, step, link). Its state is
 *   structure-of-arrays, Float32Array in production and Float64Array under test, from one code path. Every
 *   per-particle random value is hashed from one seed the system draws at the birth (particleRandom), so a
 *   value never depends on which other draws happened, and modules a system lacks cost nothing. A parent's
 *   sub-emitter children (Birth and Death links) are driven by its step: each parent particle keeps its own
 *   link generator and accumulators, so a child's particles never depend on the other parent particles.
 * - ParticleDirector: a model's systems on the layers' clock (dynamicLayers.LayerClock): which play when
 *   (their animation group, delay and `active`, rising and falling edges), a fixed 1/60 s step on a grid
 *   anchored at each system's start, emitter timelines and the values clips drive, the reduced-motion still,
 *   sub-emitter families (children in `runs`, driven by their parents), and the budgets (pools, the live cap,
 *   a failing system switched off alone).
 *
 * Coordinates are Unity's: left-handed, Y up; an orthographic camera looking down +Z sees X right, Y up.
 * A local-space system's particles live in its emitter's space (drawn through the emitter's matrix at draw
 * time); a world-space one's in the prefab root's, the "world" of an illustration.
 */
import {
  ACTIVE_COLUMN, CURVE_CONSTANT, CURVE_CURVE, CURVE_TWO_CONSTANTS, MAX_SUB_LINKS, MULTI_BURST_SPREAD, MULTI_LOOP, MULTI_PINGPONG, MULTI_RANDOM, RANDOM_KEYS, color32, constantCurve, evaluateColor,
  evaluateCurve, evaluateKeys, pingPong, pyMod, randomKey, sampleLine, type Curve, type EmitterLine, type Multi, type ParticleDocument, type ParticleMesh, type ParticleSystemData, type Shape,
} from './particleData';

/* --- random numbers (particle_oracle section "Random numbers") ------------------------------ */

/** Wellons' lowbias32 on uint32 (particle_oracle.mix32). */
export function mix32(value: number): number {
  let x = value >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  x ^= x >>> 16;
  return x >>> 0;
}

/** The seed of one play of a system that draws a new seed every play (a replayed press draws new particles). */
export function playSeed(modelSeed: number, systemIndex: number, playCount: number): number {
  return mix32((mix32((mix32(modelSeed >>> 0) ^ (systemIndex >>> 0)) >>> 0) ^ (playCount >>> 0)) >>> 0);
}

const KEY_HASH = Uint32Array.from(RANDOM_KEYS, (_, i) => mix32(i + 1));

/** A particle's random value for one key (its index in RANDOM_KEYS): the top 23 bits of mix32(seed ^ mix32(key + 1)), in [0, 1]. */
export function particleRandom(seed: number, key: number): number {
  return (mix32((seed ^ KEY_HASH[key]) >>> 0) >>> 9) / 8388607;
}

/** A particle's 32-bit word for one key, mix32(seed ^ mix32(key + 1)) (particle_oracle.particle_word): what a
 *  sub-emitter link's generator is seeded with (the parent particle's `subSeed<i>`). */
export function particleWord(seed: number, key: number): number {
  return mix32((seed ^ KEY_HASH[key]) >>> 0);
}

/** Marsaglia xorshift128 seeded as UnityEngine.Random.InitState is commonly reconstructed (particle_oracle.XorShift128). */
export class XorShift128 {
  private x: number;
  private y: number;
  private z: number;
  private w: number;
  constructor(seed: number) {
    this.x = 0; this.y = 0; this.z = 0; this.w = 0;
    this.reseed(seed);
  }
  /** Starts again from `seed` (as a new generator would). */
  reseed(seed: number): this {
    this.x = seed >>> 0;
    this.y = (Math.imul(this.x, 1812433253) + 1) >>> 0;
    this.z = (Math.imul(this.y, 1812433253) + 1) >>> 0;
    this.w = (Math.imul(this.z, 1812433253) + 1) >>> 0;
    return this;
  }
  nextU32(): number {
    const t = (this.x ^ (this.x << 11)) >>> 0;
    this.x = this.y;
    this.y = this.z;
    this.z = this.w;
    this.w = (this.w ^ (this.w >>> 19) ^ t ^ (t >>> 8)) >>> 0;
    return this.w;
  }
  /** In [0, 1], both ends included (Random.value): the low 23 bits. */
  value(): number {
    return (this.nextU32() & 0x7fffff) / 8388607;
  }
  /** Takes the four words at state[at..at+3] (a parent particle's link generator, kept between steps). */
  load(state: Uint32Array, at: number): this {
    this.x = state[at]; this.y = state[at + 1]; this.z = state[at + 2]; this.w = state[at + 3];
    return this;
  }
  /** Writes its four words to state[at..at+3]. */
  save(state: Uint32Array, at: number): void {
    state[at] = this.x; state[at + 1] = this.y; state[at + 2] = this.z; state[at + 3] = this.w;
  }
}

/** The draws one particle's shape makes: the n-th is particleRandom(seed, shape0 + n), at most 16. */
class KeyedStream {
  seed = 0;
  n = 0;
  private readonly first = randomKey('shape0');
  reset(seed: number): void { this.seed = seed; this.n = 0; }
  value(): number {
    if (this.n >= 16) throw new Error('a shape drew more than its 16 keyed values');
    return particleRandom(this.seed, this.first + this.n++);
  }
  range(a: number, b: number): number { return a + (b - a) * this.value(); }
}

/* --- options: where Unity's exact behaviour is not public (particle_oracle.Options) --------- */

export interface ParticleOptions {
  /** Physics.gravity (the game may change it; unverified). */
  gravity: [number, number, number];
  /** 0: the first rate particle after 1/rate s; 1: one at once. */
  emitAccumulatorStart: number;
  /** 0: limit velocity's dampen applies once a step; R > 0: (1 - dampen)^(dt R) (calibrated in P6). */
  dampenReferenceFps: number;
  /** true: |v| -> L + (|v| - L)(1 - d); false: max(L, |v|(1 - d)). */
  dampenExcessOnly: boolean;
  /** The step a prewarm simulates its window at. */
  prewarmStep: number;
  /** 'window': only the last prewarmWindow of the first loop; 'full': all of it. */
  prewarm: 'window' | 'full';
  /** Spread a step's births over the step (and a world-space emitter's position across it). */
  subframeEmission: boolean;
  noiseEnabled: boolean;
  /** 'evaluate-cycled': frameOverTime(frac(age x cycles)); 'cocos': frac(cycles x frameOverTime(age)). */
  textureFrameMode: 'evaluate-cycled' | 'cocos';
  /** Site addition, not in the oracle yet: 'separate' reads noise strengthXYZ per axis (66 exported systems); 'x' (the
   *  oracle's) the x strength on every axis. */
  noiseAxes: 'x' | 'separate';
}

export const DEFAULT_OPTIONS: Readonly<ParticleOptions> = Object.freeze({
  gravity: [0, -9.81, 0] as [number, number, number], emitAccumulatorStart: 0, dampenReferenceFps: 0, dampenExcessOnly: true, prewarmStep: 1 / 60,
  prewarm: 'window' as const, subframeEmission: true, noiseEnabled: true, textureFrameMode: 'evaluate-cycled' as const, noiseAxes: 'x' as const,
});

/* --- poses: an emitter's placement in the root (particle_oracle.Pose) --------------------------- */

/** [px, py, pz, qx, qy, qz, qw, m00, m01, m02, m10, m11, m12, m20, m21, m22]: the position, the rotation (module
 *  vectors given in the other space turn by it alone), and the 3x3 that moves points and vectors. */
export type Pose = Float64Array;
export const POSE_SIZE = 16;

export function identityPose(): Pose {
  return Float64Array.of(0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 1, 0, 0, 0, 1);
}

/** A still emitter's pose from its 3x4 matrix (row-major) and rotation (Pose.from_export). */
export function poseFrom(matrix: ArrayLike<number>, rotation: ArrayLike<number>, out: Pose = new Float64Array(POSE_SIZE)): Pose {
  out[0] = matrix[3]; out[1] = matrix[7]; out[2] = matrix[11];
  out[3] = rotation[0]; out[4] = rotation[1]; out[5] = rotation[2]; out[6] = rotation[3];
  out[7] = matrix[0]; out[8] = matrix[1]; out[9] = matrix[2];
  out[10] = matrix[4]; out[11] = matrix[5]; out[12] = matrix[6];
  out[13] = matrix[8]; out[14] = matrix[9]; out[15] = matrix[10];
  return out;
}

const v3 = new Float64Array(3);

/** q rotates v (q_rotate), into out. */
function rotate(qx: number, qy: number, qz: number, qw: number, x: number, y: number, z: number, out: Float64Array, at = 0): void {
  const tx = (qy * z - qz * y) * 2, ty = (qz * x - qx * z) * 2, tz = (qx * y - qy * x) * 2;
  out[at] = x + tx * qw + (qy * tz - qz * ty);
  out[at + 1] = y + ty * qw + (qz * tx - qx * tz);
  out[at + 2] = z + tz * qw + (qx * ty - qy * tx);
}

/** The pose's 3x3 times v (Pose.vector), into out. */
function linear(p: Pose, x: number, y: number, z: number, out: Float64Array, at = 0): void {
  out[at] = p[7] * x + p[8] * y + p[9] * z;
  out[at + 1] = p[10] * x + p[11] * y + p[12] * z;
  out[at + 2] = p[13] * x + p[14] * y + p[15] * z;
}

const det3 = (a0: number, a1: number, a2: number, a3: number, a4: number, a5: number, a6: number, a7: number, a8: number) =>
  a0 * (a4 * a8 - a5 * a7) - a1 * (a3 * a8 - a5 * a6) + a2 * (a3 * a7 - a4 * a6);

/** x with (the pose's 3x3) x = v, by Cramer's rule as the oracle's _solve3; 0 for a degenerate matrix. */
function solve(p: Pose, x: number, y: number, z: number, out: Float64Array): void {
  const m0 = p[7], m1 = p[8], m2 = p[9], m3 = p[10], m4 = p[11], m5 = p[12], m6 = p[13], m7 = p[14], m8 = p[15];
  const det = det3(m0, m1, m2, m3, m4, m5, m6, m7, m8);
  if (Math.abs(det) < 1e-30) { out[0] = 0; out[1] = 0; out[2] = 0; return; }
  // Column i replaced by v: [c0, c1, c2] with ci = (m[i], m[3 + i], m[6 + i]).
  out[0] = det3(x, m1, m2, y, m4, m5, z, m7, m8) / det;
  out[1] = det3(m0, x, m2, m3, y, m5, m6, z, m8) / det;
  out[2] = det3(m0, m1, x, m3, m4, y, m6, m7, z) / det;
}

/* --- shapes (particle_oracle.sample_shape, section 5) ----------------------------------------- */

/** Quaternion.Euler(x, y, z) in degrees: about Z, then X, then Y (q = qy qx qz). */
export function eulerQuaternion(x: number, y: number, z: number): [number, number, number, number] {
  const half = (deg: number) => (deg * (Math.PI / 180)) / 2;
  const sx = Math.sin(half(x)), cx = Math.cos(half(x)), sy = Math.sin(half(y)), cy = Math.cos(half(y)), sz = Math.sin(half(z)), cz = Math.cos(half(z));
  const mul = (a: number[], b: number[]) => [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
  const q = mul(mul([0 * sy, 1 * sy, 0 * sy, cy], [1 * sx, 0 * sx, 0 * sx, cx]), [0 * sz, 0 * sz, 1 * sz, cz]);
  return [q[0], q[1], q[2], q[3]];
}

function normalize(x: number, y: number, z: number, fx: number, fy: number, fz: number, out: Float64Array, at = 0): void {
  const n = Math.sqrt(x * x + y * y + z * z);
  if (n < 1e-12) { out[at] = fx; out[at + 1] = fy; out[at + 2] = fz; return; }
  out[at] = x / n; out[at + 1] = y / n; out[at + 2] = z / n;
}

/** Where along an arc, an edge or a mesh a particle starts, 0..1 (_arc_fraction). */
function arcFraction(rng: KeyedStream, multi: Multi, phase: number, burstIndex: number, burstSize: number): number {
  let f: number;
  if (multi.mode === MULTI_RANDOM) f = rng.value();
  else if (multi.mode === MULTI_BURST_SPREAD) f = burstSize ? burstIndex / burstSize : rng.value();
  else if (multi.mode === MULTI_LOOP) f = pyMod(phase, 1);
  else f = pingPong(phase, 1);
  if (multi.spread > 0) f = Math.floor(f / multi.spread) * multi.spread;
  return Math.min(Math.max(f, 0), 1);
}

/** The shape's own rotation and the mesh it emits from, worked out once per system. */
interface ShapeFrame { q: [number, number, number, number]; mesh: Extract<ParticleMesh, { builtin: null }> | null }

const shapeOut = new Float64Array(10); // position, direction, rgba (a mesh's vertex colour)
const rootOut = new Float64Array(6); // a position and a velocity in the root (ParticleSim.toRoot)
const unit = new Float64Array(3);

function unitVector(rng: KeyedStream, out: Float64Array): void {
  const z = rng.range(-1, 1);
  const a = rng.range(0, 2 * Math.PI);
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  out[0] = r * Math.cos(a); out[1] = r * Math.sin(a); out[2] = z;
}

/**
 * A mesh shape's start (particle_oracle._mesh_point): `vertex` picks a vertex, uniformly with the random spawn
 * mode (a draw, no spread), else floor(f V) with f the spawn mode's fraction; `triangle` and `edge` pick a
 * triangle, by area with the random mode (the first whose areaCdf reaches a draw, binary search), else by index
 * floor(f T); then `triangle` a point by barycentric coordinates (r1 = sqrt(draw), r2 = draw: (1 - r1, r1 (1 - r2),
 * r1 r2)) and `edge` an edge floor(3 draw) and a point along it at a draw. Position, the normal there (normalized,
 * +Z if degenerate; the direction) and the mesh colour there (white without colours) go to shapeOut.
 */
function sampleMesh(mesh: Extract<ParticleMesh, { builtin: null }>, shape: Shape, rng: KeyedStream, phase: number, burstIndex: number, burstSize: number): void {
  const vs = mesh.vertices, ns = mesh.normals!, cs = mesh.colors, tris = mesh.triangles;
  const pick = (weights: number[], ids: number[]) => {
    let x = 0, y = 0, z = 0, nx = 0, ny = 0, nz = 0, r = 0, g = 0, b = 0, a = 0;
    for (let k = 0; k < ids.length; k++) {
      const w = weights[k], i = ids[k];
      x += vs[i * 3] * w; y += vs[i * 3 + 1] * w; z += vs[i * 3 + 2] * w;
      nx += ns[i * 3] * w; ny += ns[i * 3 + 1] * w; nz += ns[i * 3 + 2] * w;
      if (cs) { r += cs[i * 4] * w; g += cs[i * 4 + 1] * w; b += cs[i * 4 + 2] * w; a += cs[i * 4 + 3] * w; }
    }
    shapeOut[0] = x; shapeOut[1] = y; shapeOut[2] = z;
    normalize(nx, ny, nz, 0, 0, 1, shapeOut, 3);
    if (cs) { shapeOut[6] = r; shapeOut[7] = g; shapeOut[8] = b; shapeOut[9] = a; } else { shapeOut[6] = 1; shapeOut[7] = 1; shapeOut[8] = 1; shapeOut[9] = 1; }
  };
  const randomSpawn = shape.spawn.mode === MULTI_RANDOM;
  if (shape.placement === 'vertex') {
    const count = vs.length / 3;
    const f = randomSpawn ? rng.value() : arcFraction(rng, shape.spawn, phase, burstIndex, burstSize);
    pick([1], [Math.min(Math.trunc(f * count), count - 1)]);
    return;
  }
  const triangles = tris.length / 3;
  let t: number;
  if (randomSpawn) {
    const u = rng.value(), cdf = mesh.areaCdf!;
    let lo = 0, hi = triangles - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cdf[mid] < u) lo = mid + 1; else hi = mid;
    }
    t = lo;
  } else t = Math.min(Math.trunc(arcFraction(rng, shape.spawn, phase, burstIndex, burstSize) * triangles), triangles - 1);
  const ia = tris[t * 3], ib = tris[t * 3 + 1], ic = tris[t * 3 + 2];
  if (shape.placement === 'triangle') {
    const r1 = Math.sqrt(rng.value()), r2 = rng.value();
    pick([1 - r1, r1 * (1 - r2), r1 * r2], [ia, ib, ic]);
    return;
  }
  const edge = Math.min(Math.trunc(rng.value() * 3), 2);
  const along = rng.value();
  const ends = [[ia, ib], [ib, ic], [ic, ia]][edge];
  pick([1 - along, along], ends);
}

/** One new particle's position, direction (and, from a mesh, colour) in emitter space, into shapeOut. */
function sampleShape(shape: Shape | null, frame: ShapeFrame | null, rng: KeyedStream, phases: Float64Array, burstIndex: number, burstSize: number): void {
  shapeOut[6] = 1; shapeOut[7] = 1; shapeOut[8] = 1; shapeOut[9] = 1;
  if (!shape || !frame) { shapeOut[0] = 0; shapeOut[1] = 0; shapeOut[2] = 0; shapeOut[3] = 0; shapeOut[4] = 0; shapeOut[5] = 1; return; }
  const type = shape.type;
  const radius = shape.radius.value, thickness = shape.thickness;
  const arc = shape.arc.value * (Math.PI / 180);
  let px = 0, py = 0, pz = 0, dx = 0, dy = 0, dz = 1;
  const radial = (power: number) => {
    const inner = (1 - thickness) ** power;
    return (inner + (1 - inner) * rng.value()) ** (1 / power);
  };
  switch (type) {
    case 'sphere': case 'sphereShell': case 'hemisphere': case 'hemisphereShell': {
      unitVector(rng, unit);
      if (type === 'hemisphere' || type === 'hemisphereShell') unit[2] = Math.abs(unit[2]);
      const r = type === 'sphereShell' || type === 'hemisphereShell' ? radius : radius * radial(3);
      px = unit[0] * r; py = unit[1] * r; pz = unit[2] * r; dx = unit[0]; dy = unit[1]; dz = unit[2];
      break;
    }
    case 'circle': case 'circleEdge': {
      const a = arc * arcFraction(rng, shape.arc, phases[0], burstIndex, burstSize);
      const ux = Math.cos(a), uy = Math.sin(a);
      const r = type === 'circleEdge' ? radius : radius * radial(2);
      px = ux * r; py = uy * r; pz = 0 * r; dx = ux; dy = uy; dz = 0;
      break;
    }
    case 'cone': case 'coneShell': case 'coneVolume': case 'coneVolumeShell': {
      const a = arc * arcFraction(rng, shape.arc, phases[0], burstIndex, burstSize);
      const ux = Math.cos(a), uy = Math.sin(a);
      const rn = type === 'coneShell' || type === 'coneVolumeShell' ? 1 : radial(2);
      const tan = Math.tan(Math.min(Math.max(shape.angle, 0), 90) * (Math.PI / 180));
      const bx = ux * (rn * radius), by = uy * (rn * radius), bz = 0 * (rn * radius);
      normalize(ux * rn * tan, uy * rn * tan, 1, 0, 0, 1, v3);
      dx = v3[0]; dy = v3[1]; dz = v3[2];
      px = bx; py = by; pz = bz;
      if (type === 'coneVolume' || type === 'coneVolumeShell') {
        const along = rng.value() * shape.length;
        const k = along / Math.max(dz, 1e-6);
        px = bx + dx * k; py = by + dy * k; pz = bz + dz * k;
      }
      break;
    }
    case 'box': case 'boxShell': case 'boxEdge': {
      const p = [rng.range(-0.5, 0.5), rng.range(-0.5, 0.5), rng.range(-0.5, 0.5)];
      const th = shape.boxThickness;
      const face = (axis: number) => {
        const side = rng.value() >= 0.5 ? 0.5 : -0.5;
        const inset = rng.value() * th[axis] * 0.5;
        p[axis] = side - (side < 0 ? -Math.abs(inset) : Math.abs(inset));
      };
      if (type === 'boxShell') face(Math.trunc(rng.value() * 2.999));
      else if (type === 'boxEdge') {
        const free = Math.trunc(rng.value() * 2.999);
        for (let axis = 0; axis < 3; axis++) if (axis !== free) face(axis);
      }
      px = p[0]; py = p[1]; pz = p[2];
      break;
    }
    case 'rectangle':
      px = rng.range(-0.5, 0.5); py = rng.range(-0.5, 0.5); pz = 0;
      break;
    case 'edge': {
      const f = arcFraction(rng, shape.radius, phases[1], burstIndex, burstSize);
      px = (f * 2 - 1) * radius; py = 0; pz = 0; dx = 0; dy = 1; dz = 0;
      break;
    }
    case 'donut': {
      const a = arc * arcFraction(rng, shape.arc, phases[0], burstIndex, burstSize);
      const rx = Math.cos(a) * radius, ry = Math.sin(a) * radius;
      const tube = rng.range(0, 2 * Math.PI);
      const rr = shape.donutRadius * radial(2);
      const ox = Math.cos(a), oy = Math.sin(a);
      const ct = Math.cos(tube) * rr, offZ = Math.sin(tube) * rr;
      const offX = ox * ct + 0, offY = oy * ct + 0, offZ2 = 0 * ct + offZ;
      px = rx + offX; py = ry + offY; pz = 0 + offZ2;
      normalize(offX, offY, offZ2, ox, oy, 0, v3);
      dx = v3[0]; dy = v3[1]; dz = v3[2];
      break;
    }
    case 'mesh':
      if (frame.mesh) {
        sampleMesh(frame.mesh, shape, rng, phases[2], burstIndex, burstSize);
        px = shapeOut[0]; py = shapeOut[1]; pz = shapeOut[2]; dx = shapeOut[3]; dy = shapeOut[4]; dz = shapeOut[5];
        const k = shape.normalOffset;
        if (k) { px += dx * k; py += dy * k; pz += dz * k; }
      }
      break;
  }
  if (shape.randomDir > 0) {
    unitVector(rng, unit);
    const k = shape.randomDir;
    normalize(dx + (unit[0] - dx) * k, dy + (unit[1] - dy) * k, dz + (unit[2] - dz) * k, 0, 0, 1, v3);
    dx = v3[0]; dy = v3[1]; dz = v3[2];
  }
  if (shape.spherical > 0) {
    normalize(px, py, pz, dx, dy, dz, unit);
    const k = shape.spherical;
    normalize(dx + (unit[0] - dx) * k, dy + (unit[1] - dy) * k, dz + (unit[2] - dz) * k, 0, 0, 1, v3);
    dx = v3[0]; dy = v3[1]; dz = v3[2];
  }
  if (shape.randomPos > 0) {
    unitVector(rng, unit);
    const k = shape.randomPos * rng.value();
    px += unit[0] * k; py += unit[1] * k; pz += unit[2] * k;
  }
  // The shape's own TRS (a box's size is its scale; other shapes scale their direction too).
  const [qx, qy, qz, qw] = frame.q;
  const [sx, sy, sz] = shape.scale;
  rotate(qx, qy, qz, qw, px * sx, py * sy, pz * sz, v3);
  shapeOut[0] = v3[0] + shape.pos[0]; shapeOut[1] = v3[1] + shape.pos[1]; shapeOut[2] = v3[2] + shape.pos[2];
  if (type !== 'box' && type !== 'boxShell' && type !== 'boxEdge' && type !== 'rectangle') { dx *= sx; dy *= sy; dz *= sz; }
  rotate(qx, qy, qz, qw, dx, dy, dz, v3);
  normalize(v3[0], v3[1], v3[2], dx, dy, dz, shapeOut, 3);
}

/** Where one particle of a system would start, for a birth seed (its shape's draws are keyed by it): position,
 *  direction and (from a mesh shape's vertex colours) colour in emitter space. `phase`: the arc's, edge radius' and
 *  mesh spawn order's loop or ping-pong phases. */
export function shapeStart(data: ParticleSystemData, doc: Pick<ParticleDocument, 'meshes'>, seed: number, burstIndex = 0, burstSize = 0, phase: ArrayLike<number> = [0, 0, 0]):
  { position: [number, number, number]; direction: [number, number, number]; color: [number, number, number, number] } {
  const shape = data.shape;
  const mesh = shape && shape.mesh !== null ? doc.meshes[shape.mesh] : null;
  const frame: ShapeFrame | null = shape ? { q: eulerQuaternion(shape.rot[0], shape.rot[1], shape.rot[2]), mesh: mesh && mesh.builtin === null ? mesh : null } : null;
  const stream = new KeyedStream();
  stream.reset(seed >>> 0);
  sampleShape(shape, frame, stream, Float64Array.from(phase), burstIndex, burstSize);
  return { position: [shapeOut[0], shapeOut[1], shapeOut[2]], direction: [shapeOut[3], shapeOut[4], shapeOut[5]], color: [shapeOut[6], shapeOut[7], shapeOut[8], shapeOut[9]] };
}

/** A point through a pose (Pose.point). */
export function posePoint(p: Pose, x: number, y: number, z: number): [number, number, number] {
  linear(p, x, y, z, v3);
  return [v3[0] + p[0], v3[1] + p[1], v3[2] + p[2]];
}

/** A vector through a pose's 3x3 (Pose.vector) and back (Pose.inverse_vector). */
export function poseVector(p: Pose, x: number, y: number, z: number): [number, number, number] {
  linear(p, x, y, z, v3);
  return [v3[0], v3[1], v3[2]];
}
export function poseInverseVector(p: Pose, x: number, y: number, z: number): [number, number, number] {
  solve(p, x, y, z, v3);
  return [v3[0], v3[1], v3[2]];
}

/* --- noise (particle_oracle.curl_noise: an approximation; Unity's field is not public) --------- */

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
export function curlNoise(x: number, y: number, z: number, octaves: number, octaveMultiplier: number, octaveScale: number, out: Float64Array): void {
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

/* --- one system ------------------------------------------------------------------------------ */

type Floats = Float32Array | Float64Array;

/** The most particles one system keeps (its pool grows on demand up to min(maxParticles, this)). */
export const POOL_CAP = 4096;

/** What a model-wide budget says about one birth (ParticleDirector's live cap). */
export interface BirthBudget {
  /** Live particles across the model; a system adds its births and takes its deaths. */
  live: number;
  allow(): boolean;
}

// Keys of the per-particle values, by index (particleRandom).
const K = Object.fromEntries(RANDOM_KEYS.map((name, i) => [name, i])) as Record<string, number>;
const SUB_KEYS = Array.from({ length: MAX_SUB_LINKS }, (_, i) => K[`sub${i}`]);
const SUB_SEED_KEYS = Array.from({ length: MAX_SUB_LINKS }, (_, i) => K[`subSeed${i}`]);
const COLUMNS = ['px', 'py', 'pz', 'vx', 'vy', 'vz', 'ax', 'ay', 'az', 'qx', 'qy', 'qz', 'age', 'life', 'sx', 'sy', 'sz', 'rx', 'ry', 'rz', 'flip', 'cr', 'cg', 'cb', 'ca',
  'ex', 'ey', 'ez', 'row', 'serial'] as const;
type Column = (typeof COLUMNS)[number];
/** Columns kept in Float64 at either precision: ages and lifetimes (see allocate) and birth numbers. */
const EXACT: ReadonlySet<Column> = new Set<Column>(['age', 'life', 'serial']);

/** A sub-emitter link of a parent system (ParticleSim.link): its child, 'birth' or 'death', and the probability
 *  of a parent particle's link firing. */
export interface SubLink { sim: ParticleSim; kind: 'birth' | 'death'; probability: number }

/**
 * The births one step of a parent gives one link's child (particle_oracle._sub_events), unsorted as they are
 * found: per birth its moment (a fraction of the step), its parent particle's birth number and its order among
 * that particle's births, where it starts and the parent particle's velocity (both in the root, Unity units), the
 * child's normalized system time, its 32-bit seed, and its burst index and size (-1 and 0 outside a burst).
 * `sort()` puts `order` in the oracle's order: by moment, then parent, then order of birth from it.
 */
class SubEvents {
  n = 0;
  readonly frac: number[] = [];
  readonly serial: number[] = [];
  readonly nth: number[] = [];
  readonly origin: number[] = [];
  readonly velocity: number[] = [];
  readonly s01: number[] = [];
  readonly seed: number[] = [];
  readonly burstIndex: number[] = [];
  readonly burstSize: number[] = [];
  readonly order: number[] = [];

  push(frac: number, serial: number, nth: number, ox: number, oy: number, oz: number, vx: number, vy: number, vz: number, s01: number, seed: number,
    burstIndex: number, burstSize: number): void {
    const k = this.n++;
    this.frac[k] = frac; this.serial[k] = serial; this.nth[k] = nth;
    this.origin[k * 3] = ox; this.origin[k * 3 + 1] = oy; this.origin[k * 3 + 2] = oz;
    this.velocity[k * 3] = vx; this.velocity[k * 3 + 1] = vy; this.velocity[k * 3 + 2] = vz;
    this.s01[k] = s01; this.seed[k] = seed; this.burstIndex[k] = burstIndex; this.burstSize[k] = burstSize;
  }

  sort(): void {
    const order = this.order, f = this.frac, s = this.serial, m = this.nth;
    order.length = this.n;
    for (let i = 0; i < this.n; i++) order[i] = i;
    if (this.n > 1) order.sort((a, b) => f[a] - f[b] || s[a] - s[b] || m[a] - m[b]);
  }
}

const lerpOf = (c: Curve, seed: number, key: number) => (c.random ? particleRandom(seed, key) : 1);
/** A speed over the limit, dampened (_dampen): its excess kept by `keep`, or the speed times keep but not below the limit. */
function dampen(speed: number, limit: number, keep: number, excessOnly: boolean): number {
  if (speed <= limit) return speed;
  return excessOnly ? limit + (speed - limit) * keep : Math.max(limit, speed * keep);
}

/** A curve for one particle: a constant without a call; else its random factor hashed from the particle's seed. */
function ev(c: Curve, t: number, seed: number, key: number): number {
  // evaluateCurve, with the random factor drawn only where a mode reads it.
  const mode = c.mode;
  if (mode === CURVE_CONSTANT) return c.scalar;
  if (mode === CURVE_CURVE) return evaluateKeys(c.max!, t) * c.scalar;
  const lerp = particleRandom(seed, key);
  if (mode === CURVE_TWO_CONSTANTS) return c.minScalar + (c.scalar - c.minScalar) * lerp;
  const lo = evaluateKeys(c.min!, t), hi = evaluateKeys(c.max!, t);
  return (lo + (hi - lo) * lerp) * c.scalar;
}
const zero = (c: Curve) => c.mode === CURVE_CONSTANT && c.scalar === 0;
const CUSTOM_KEYS = [0, 1].map((s) => [0, 1, 2, 3].map((j) => K[`custom${s}_${j}`]));
const CUSTOM_COLOR_KEYS = [K.customColor0, K.customColor1];
const scratch4 = new Float64Array(4);
const scratch5 = new Float64Array(5);

/**
 * One ParticleSystem (particle_oracle.Simulation): play() starts it (and prewarms a prewarmed loop),
 * step(dt, pose) advances dt seconds of illustration time (times its simulation speed) with the emitter at
 * `pose` at the step's end, stop() ends emission and lets particles live out their lives, clear() drops them.
 * Particles are kept in birth order: survivors in order, then this step's births.
 */
export class ParticleSim {
  readonly data: ParticleSystemData;
  readonly options: ParticleOptions;
  /** Particles alive, in birth order: index 0 is the oldest. */
  count = 0;
  capacity = 0;
  /** Its own clock: seconds since play, after simulationSpeed. */
  time = 0;
  /** The start delay rolled for this play (0 for a prewarmed loop). */
  delay = 0;
  emitting = true;
  emittedTotal = 0;
  deadTotal = 0;
  /** The values clips drive (emitter timeline columns) replace these copies' scalars, never the parsed data. */
  readonly animated: { rate: Curve; distance: Curve; startSize: Curve; gravity: Curve; noise: Curve; speedModifier: Curve | null; size: Curve | null; startColor: Float64Array;
    enabled: boolean };
  /** The emitter now and at the previous step (Pose). */
  readonly pose: Pose = identityPose();
  readonly prevPose: Pose = identityPose();
  readonly emitterVelocity = new Float64Array(3);
  // State (structure of arrays; qx..qz: each particle's position at the previous step, for drawing between steps;
  // age and life are Float64 at either precision).
  px!: Floats; py!: Floats; pz!: Floats; vx!: Floats; vy!: Floats; vz!: Floats; ax!: Floats; ay!: Floats; az!: Floats; qx!: Floats; qy!: Floats; qz!: Floats;
  age!: Floats; life!: Floats; sx!: Floats; sy!: Floats; sz!: Floats; rx!: Floats; ry!: Floats; rz!: Floats; flip!: Floats; cr!: Floats; cg!: Floats; cb!: Floats; ca!: Floats;
  ex!: Floats; ey!: Floats; ez!: Floats; row!: Floats;
  seeds!: Uint32Array;
  /** Every float column, for compaction and growth. */
  private cols: (Float32Array | Float64Array)[] = [];
  private readonly maxCount: number;
  private readonly make: (n: number) => Floats;
  private rng = new XorShift128(0);
  private seed = 0;
  private accTime = 0;
  private accDistance = 0;
  /** Loop / ping-pong phases of the arc, the edge's radius and a mesh's spawn order. */
  private readonly phases = new Float64Array(3);
  private readonly shapeFrame: ShapeFrame | null;
  private readonly stream = new KeyedStream();
  private readonly budget: BirthBudget | null;
  /** Which parts of velocity over lifetime add anything (a part whose values are all constant 0 adds nothing). */
  private readonly plan: { linear: boolean; orbit: boolean };
  // Emission events of a step: absolute time, burst index, burst size (reused).
  private evT: number[] = [];
  private evI: number[] = [];
  private evN: number[] = [];
  private order: number[] = [];
  /** Sub-emitter links (link()): the children this system's particles drive, in link order. */
  readonly links: SubLink[] = [];
  /** A sub-emitter child (a parent's link() made it one): it never emits on its own, only what its parent's
   *  particles give it; its start delay is not applied. */
  isChild = false;
  /** A child's simulation speed: its parent's step of h illustration seconds advances it h x this (a clip may drive it). */
  childSpeed: number;
  /** A child whose GameObject is on (the director clears it and sets this false while a clip switches it off):
   *  births its parent gives it while off are dropped. */
  childActive = true;
  /** A child whose values went non-finite: its parent cleared it and gives it nothing more. */
  failed = false;
  /** Each particle's birth number in the system (emittedTotal at its birth; sub-emitter births sort by it). */
  serial!: Float64Array;
  // Per particle and link (links.length a particle): the link generator's 4 words, its rate and distance
  // accumulators, and whether the link fires from it (a birth link whose probability passed at its birth).
  private subState = new Uint32Array(0);
  private subAcc = new Float64Array(0);
  private subOn = new Uint8Array(0);
  /** Where in the step each of this step's births was (a fraction), read by its sub-emitter clock. */
  private bornFrac = new Float64Array(0);
  /** This step's deaths, with a death link: 9 numbers each (fraction of the step, serial, seed, position and
   *  velocity in the simulation's space). */
  private readonly dead: number[] = [];
  private deadCount = 0;
  private readonly subEvents: SubEvents[] = [];
  private readonly linkRng = new XorShift128(0);
  // One parent particle's births of this child (schedule()): age, system time, burst index and size; by age.
  private readonly schedAge: number[] = [];
  private readonly schedS01: number[] = [];
  private readonly schedBurst: number[] = [];
  private readonly schedSize: number[] = [];
  private readonly schedOrder: number[] = [];

  constructor(data: ParticleSystemData, doc: Pick<ParticleDocument, 'meshes'>, options: Partial<ParticleOptions> = {}, precision: 32 | 64 = 32, budget: BirthBudget | null = null) {
    this.data = data;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.make = precision === 64 ? (n) => new Float64Array(n) : (n) => new Float32Array(n);
    this.maxCount = Math.min(data.clock.maxParticles, POOL_CAP);
    this.budget = budget;
    this.childSpeed = data.clock.speed;
    const shape = data.shape;
    if (shape) {
      const mesh = shape.mesh === null ? null : doc.meshes[shape.mesh];
      this.shapeFrame = { q: eulerQuaternion(shape.rot[0], shape.rot[1], shape.rot[2]), mesh: mesh && mesh.builtin === null ? mesh : null };
    } else this.shapeFrame = null;
    const copy = (c: Curve): Curve => ({ ...c });
    this.animated = {
      rate: copy(data.emission.rate), distance: copy(data.emission.distance), startSize: copy(data.start.size[0]), gravity: copy(data.start.gravity),
      noise: copy(data.noise?.strength[0] ?? constantCurve(0)), speedModifier: data.velocity ? copy(data.velocity.speedModifier) : null,
      size: data.size ? copy(data.size.xyz[0]) : null, startColor: Float64Array.from(data.start.color.maxColor), enabled: data.emission.enabled,
    };
    const vel = data.velocity;
    this.plan = { linear: !!vel && !vel.linear.every(zero), orbit: !!vel && !(vel.orbital.every(zero) && zero(vel.radial)) };
    this.allocate(Math.min(this.maxCount, Math.max(16, data.clock.maxAlive * 2)));
  }

  private allocate(capacity: number): void {
    const old = this.capacity, n = this.count;
    for (const name of COLUMNS) {
      // Ages and lifetimes stay Float64 at either precision: a float32 age drifts by a few 1e-5 s over a minute,
      // enough to end a particle a step early (then a birth fills its slot); in Float64 lives end where the oracle's do.
      const next = EXACT.has(name) ? new Float64Array(capacity) : this.make(capacity);
      if (old) next.set((this[name] as Floats).subarray(0, n));
      (this as unknown as Record<Column, Floats>)[name] = next;
    }
    const seeds = new Uint32Array(capacity);
    if (old) seeds.set(this.seeds.subarray(0, n));
    this.seeds = seeds;
    const L = this.links.length;
    if (L) {
      // Grown mid-step too (births past the pool), so this step's births keep their fractions.
      const state = new Uint32Array(capacity * L * 4), acc = new Float64Array(capacity * L * 2), on = new Uint8Array(capacity * L), born = new Float64Array(capacity);
      state.set(this.subState.subarray(0, Math.min(this.subState.length, n * L * 4)));
      acc.set(this.subAcc.subarray(0, Math.min(this.subAcc.length, n * L * 2)));
      on.set(this.subOn.subarray(0, Math.min(this.subOn.length, n * L)));
      born.set(this.bornFrac.subarray(0, Math.min(this.bornFrac.length, n)));
      this.subState = state; this.subAcc = acc; this.subOn = on; this.bornFrac = born;
    }
    this.capacity = capacity;
    this.cols = COLUMNS.map((name) => this[name] as Floats);
  }

  /**
   * Makes `child` a sub-emitter of this system (a layerParticles.json `sub` link; particle_oracle.Simulation.link):
   * 'birth', the child emits from each of this system's particles while it lives, with its own rate and bursts
   * timed by the particle's age; 'death', each of the child's bursts fires once where a particle dies.
   * `probability`: of each particle's link firing. Before either plays; a child has one parent and no links.
   */
  link(child: ParticleSim, kind: 'birth' | 'death', probability: number): void {
    if (kind !== 'birth' && kind !== 'death') throw new Error(`a ${String(kind)} sub-emitter`);
    if (this.isChild || child.isChild || child.links.length || child === this) throw new Error('a sub-emitter has one parent and no sub-emitters of its own');
    if (this.links.length >= MAX_SUB_LINKS) throw new Error(`more than ${MAX_SUB_LINKS} sub-emitter links`);
    if (this.count || child.count) throw new Error('sub-emitters are linked before either plays');
    child.isChild = true;
    child.delay = 0;
    this.links.push({ sim: child, kind, probability: Math.fround(probability) });
    this.subEvents.push(new SubEvents());
    this.allocate(this.capacity);
  }

  /** Live particles of this system and its sub-emitter children. */
  get familyCount(): number {
    let n = this.count;
    for (const link of this.links) n += link.sim.count;
    return n;
  }

  /** The seed this play uses: the system's fixed one, else `seed` (playSeed). */
  private reset(seed: number): void {
    const c = this.data.clock;
    this.seed = (c.seed === null ? seed : c.seed) >>> 0;
    this.rng = new XorShift128(this.seed);
    if (this.budget) this.budget.live -= this.count;
    this.count = 0;
    this.time = 0;
    this.emitting = true;
    this.accTime = this.options.emitAccumulatorStart;
    this.accDistance = 0;
    this.phases.fill(0);
    this.pose.set(identityPose());
    this.prevPose.set(this.pose);
    this.emitterVelocity.fill(0);
    this.emittedTotal = 0;
    this.deadTotal = 0;
    this.delay = this.isChild || (c.prewarm && c.loop) ? 0 : evaluateCurve(c.startDelay, 0, this.rng.value());
  }

  /** A system with sub-emitters plays and steps with its children's poses (one each, null keeping its last). */
  private childPosesOf(childPoses: readonly (Pose | null)[] | null): readonly (Pose | null)[] {
    if (!this.links.length) return [];
    if (!childPoses || childPoses.length !== this.links.length) throw new Error(`${this.data.name}: its ${this.links.length} sub-emitters' poses are needed`);
    return childPoses;
  }

  /** Starts a play (the GameObject became active) with the emitter at `pose`: a prewarmed loop first simulates
   *  the last prewarmWindow of its first loop (all of it with the 'full' option), in equal steps of at most
   *  prewarmStep, then its clock restarts. `seed`: this play's (playSeed), unless the system has a fixed one.
   *  Its sub-emitter children start with it (`childPoses`: theirs, in link order) and are prewarmed with it. */
  play(seed: number, pose: Pose | null = null, childPoses: readonly (Pose | null)[] | null = null): void {
    if (this.isChild) throw new Error(`${this.data.name}: a sub-emitter plays only through its parent`);
    const poses = this.childPosesOf(childPoses);
    this.reset(seed);
    if (pose) { this.pose.set(pose); this.prevPose.set(pose); }
    this.links.forEach(({ sim }, k) => {
      sim.reset(0);
      const p = poses[k];
      if (p) { sim.pose.set(p); sim.prevPose.set(p); }
    });
    const c = this.data.clock;
    if (c.prewarm && c.loop) {
      const duration = Math.max(c.duration, 0);
      const window = this.options.prewarm === 'full' || c.prewarmWindow === null ? duration : Math.min(c.prewarmWindow, duration);
      this.time = duration - window;
      const n = Math.max(1, Math.ceil(window / this.options.prewarmStep - 1e-9));
      // Its children run at their own speed: a prewarm step of the parent's time is that over its speed in theirs.
      const game = c.speed > 0 ? window / n / c.speed : 0;
      for (let i = 0; i < n; i++) this.advance(window / n, game);
      this.time = 0;
    }
  }

  /** Ends emission; the particles alive live out their lives. */
  stop(): void {
    this.emitting = false;
  }

  /** Drops every particle, its sub-emitter children's too (a deactivated GameObject draws nothing). */
  clear(): void {
    if (this.budget) this.budget.live -= this.count;
    this.count = 0;
    for (const link of this.links) link.sim.clear();
  }

  /** Advances dt seconds of illustration time (times the simulation speed, or `speed` when a clip drives it),
   *  the emitter at `pose` at the step's end; its sub-emitter children at `childPoses` (in link order, null keeping
   *  one), each at its own speed. Returns false when a value of its own went non-finite (the system failed); a
   *  child that fails is cleared and marked `failed` alone. */
  step(dt: number, pose: Pose | null = null, speed = this.data.clock.speed, childPoses: readonly (Pose | null)[] | null = null): boolean {
    if (this.isChild) throw new Error(`${this.data.name}: a sub-emitter steps only through its parent`);
    const poses = this.childPosesOf(childPoses);
    this.prevPose.set(this.pose);
    if (pose) this.pose.set(pose);
    if (dt > 0) moved(this, dt);
    this.links.forEach(({ sim }, k) => {
      sim.prevPose.set(sim.pose);
      const p = poses[k];
      if (p) sim.pose.set(p);
      if (dt > 0) moved(sim, dt);
    });
    return this.advance(dt * speed, dt);
  }

  /** Normalized loop time at emission time te (system_t01). */
  private systemT01(te: number): number {
    const d = this.data.clock.duration;
    if (d <= 0) return 0;
    return (this.data.clock.loop ? pyMod(te, d) : Math.min(te, d)) / d;
  }

  /** One step of dt seconds of this system's time; `game`: the illustration seconds it is (its sub-emitter
   *  children run at their own speed: h x theirs). particle_oracle.Simulation._advance, section 7.1. */
  private advance(dt: number, game: number): boolean {
    if (dt <= 0) {
      for (const link of this.links) this.drive(link.sim, game * link.sim.childSpeed, null);
      return true;
    }
    const t0 = this.time, t1 = this.time + dt;
    this.time = t1;
    // 1. age, and kill (deaths free their slots before this step's births; a death sub-emitter fires where one died)
    const w = this.kill(dt, this.links.some((link) => link.kind === 'death'));
    // 2. the survivors over the whole step (their position now is where they were)
    this.qx.set(this.px.subarray(0, w)); this.qy.set(this.py.subarray(0, w)); this.qz.set(this.pz.subarray(0, w));
    let sum = this.integrate(0, w, dt);
    // 3. births, each at its own time inside the step, aged to the step's end
    const events = this.emissionEvents(t0, t1, dt);
    const linked = this.links.length > 0;
    for (let e = 0; e < events; e++) {
      const k = this.order[e];
      if (this.count >= this.maxCount) continue; // dropped, not queued
      if (this.count >= this.capacity) this.allocate(Math.min(this.maxCount, this.capacity * 2));
      if (this.budget && !this.budget.allow()) continue;
      const at = this.evT[k];
      const i = this.count;
      const fraction = dt ? (at - t0) / dt : 1;
      this.spawn(i, at, this.evI[k], this.evN[k], fraction);
      const remaining = this.options.subframeEmission ? t1 - at : 0;
      if (remaining > 0) {
        this.age[i] += remaining;
        sum += this.integrate(i, i + 1, remaining);
      }
      if (this.age[i] < this.life[i]) {
        if (linked) this.bornFrac[i] = (at - t0) / dt;
        this.count++;
        if (this.budget) this.budget.live++;
      }
      this.emittedTotal++;
    }
    // 4. Loop / ping-pong arcs move with their speed curves
    const shape = this.data.shape;
    if (shape) {
      const t01 = this.systemT01(t1 - this.delay);
      const advanceMulti = (m: Multi, i: number) => {
        if (m.mode === MULTI_LOOP || m.mode === MULTI_PINGPONG) this.phases[i] += evaluateCurve(m.speed, t01, 1) * dt;
      };
      advanceMulti(shape.arc, 0);
      advanceMulti(shape.radius, 1);
      advanceMulti(shape.spawn, 2);
    }
    // 5. sub-emitters: each child ages and moves its particles, then takes this step's births
    for (let k = 0; k < this.links.length; k++) {
      const link = this.links[k], events = this.subEvents[k];
      events.n = 0;
      if (link.kind === 'birth') this.birthEvents(k, link.sim, dt, w, events); else this.deathEvents(k, link, events);
      events.sort();
      this.drive(link.sim, game * link.sim.childSpeed, events);
    }
    return Number.isFinite(sum);
  }

  /** Ages every particle by dt and drops the ones whose life ends (deaths free their slots); the survivors keep
   *  their order, whole runs of them moved down at once (deaths cluster among the oldest). With `deaths`, each
   *  death is noted first (for a death sub-emitter: its moment in the step, birth number, seed, position and
   *  velocity, before its slot is reused). Returns how many live. */
  private kill(dt: number, deaths: boolean): number {
    const age = this.age, life = this.life, n = this.count, L = this.links.length;
    this.deadCount = 0;
    let w = 0, i = 0;
    while (i < n) {
      while (i < n && !(age[i] + dt < life[i])) {
        if (deaths) this.noteDeath(i, dt);
        i++;
      }
      const start = i;
      while (i < n && age[i] + dt < life[i]) { age[i] += dt; i++; }
      if (i > start) {
        if (start !== w) {
          for (const column of this.cols) column.copyWithin(w, start, i);
          this.seeds.copyWithin(w, start, i);
          if (L) {
            this.subState.copyWithin(w * L * 4, start * L * 4, i * L * 4);
            this.subAcc.copyWithin(w * L * 2, start * L * 2, i * L * 2);
            this.subOn.copyWithin(w * L, start * L, i * L);
          }
        }
        w += i - start;
      }
    }
    this.deadTotal += n - w;
    if (this.budget) this.budget.live -= n - w;
    this.count = w;
    return w;
  }

  /** Particle i dies this step: when (its life's end as a fraction of the step), who, where and how fast. */
  private noteDeath(i: number, dt: number): void {
    const d = this.dead, o = this.deadCount++ * 9;
    d[o] = Math.min(Math.max((this.life[i] - this.age[i]) / dt, 0), 1);
    d[o + 1] = this.serial[i];
    d[o + 2] = this.seeds[i];
    d[o + 3] = this.px[i]; d[o + 4] = this.py[i]; d[o + 5] = this.pz[i];
    d[o + 6] = this.vx[i] + this.ax[i]; d[o + 7] = this.vy[i] + this.ay[i]; d[o + 8] = this.vz[i] + this.az[i];
  }

  /** A position and velocity of this system's simulation space in the root (_root), into rootOut[0..5]. */
  private toRoot(x: number, y: number, z: number, vx: number, vy: number, vz: number): void {
    if (this.data.clock.space === 'world') {
      rootOut[0] = x; rootOut[1] = y; rootOut[2] = z; rootOut[3] = vx; rootOut[4] = vy; rootOut[5] = vz;
      return;
    }
    const p = this.pose;
    linear(p, x, y, z, rootOut);
    rootOut[0] += p[0]; rootOut[1] += p[1]; rootOut[2] += p[2];
    linear(p, vx, vy, vz, rootOut, 3);
  }

  /** Link k's births this step (a birth link, _sub_events): from every live particle the link fires from, over
   *  the age it lived this step (from its birth for one born in it), the child's schedule; each birth placed along
   *  the particle's path through the step, its seed drawn after the schedule's draws, in age order. */
  private birthEvents(k: number, child: ParticleSim, dt: number, firstNew: number, events: SubEvents): void {
    const L = this.links.length, n = this.count, rng = this.linkRng;
    const px = this.px, py = this.py, pz = this.pz, qx = this.qx, qy = this.qy, qz = this.qz;
    for (let i = 0; i < n; i++) {
      const slot = i * L + k;
      if (!this.subOn[slot]) continue;
      const born = i >= firstNew;
      const a1 = this.age[i];
      const a0 = born ? 0 : a1 - dt;
      const f0 = born ? this.bornFrac[i] : 0;
      const mx = px[i] - qx[i], my = py[i] - qy[i], mz = pz[i] - qz[i];
      rng.load(this.subState, slot * 4);
      const count = child.schedule(a0, a1, rng, this.subAcc, slot * 2, Math.sqrt(mx * mx + my * my + mz * mz));
      const vx = this.vx[i] + this.ax[i], vy = this.vy[i] + this.ay[i], vz = this.vz[i] + this.az[i];
      for (let m = 0; m < count; m++) {
        const e = child.schedOrder[m];
        const age = child.schedAge[e];
        const f = a1 > a0 ? (age - a0) / (a1 - a0) : 1;
        this.toRoot(qx[i] + (px[i] - qx[i]) * f, qy[i] + (py[i] - qy[i]) * f, qz[i] + (pz[i] - qz[i]) * f, vx, vy, vz);
        events.push(f0 + (age - a0) / dt, this.serial[i], m, rootOut[0], rootOut[1], rootOut[2], rootOut[3], rootOut[4], rootOut[5], child.schedS01[e], rng.nextU32(),
          child.schedBurst[e], child.schedSize[e]);
      }
      rng.save(this.subState, slot * 4);
    }
  }

  /** Link k's births this step (a death link): where a particle died, if its link fires, each of the child's
   *  bursts once, from a generator seeded by that particle's subSeed<k>: its roll, its count, a seed a particle. */
  private deathEvents(k: number, link: SubLink, events: SubEvents): void {
    const d = this.dead, rng = this.linkRng, child = link.sim;
    const bursts = child.data.emission.bursts, duration = child.data.clock.duration;
    for (let j = 0; j < this.deadCount; j++) {
      const o = j * 9, seed = d[o + 2];
      if (!(link.probability >= 1 || particleRandom(seed, SUB_KEYS[k]) < link.probability)) continue;
      rng.reseed(particleWord(seed, SUB_SEED_KEYS[k]));
      this.toRoot(d[o + 3], d[o + 4], d[o + 5], d[o + 6], d[o + 7], d[o + 8]);
      let m = 0;
      for (const b of bursts) {
        if (!(b.probability >= 1 || rng.value() < b.probability)) continue;
        const value = evaluateCurve(b.count, duration > 0 ? b.time / duration : 0, b.count.random ? rng.value() : 1);
        const count = Math.max(0, Math.floor(value + 0.5));
        for (let i = 0; i < count; i++) {
          events.push(d[o], d[o + 1], m++, rootOut[0], rootOut[1], rootOut[2], rootOut[3], rootOut[4], rootOut[5], 0, rng.nextU32(), i, count);
        }
      }
    }
  }

  /**
   * The births one parent particle gives this child while its age runs over [a0, a1) (_child_schedule): the
   * child's emission with that age for its clock (no start delay; a child that does not loop stops after its
   * duration, one that loops repeats its bursts each duration), rate over time with the particle's own
   * accumulator (acc[at]), rate over distance by how far the particle moved (acc[at + 1]), and its bursts; random
   * values from the particle's link generator `rng`. Into schedAge, schedS01, schedBurst, schedSize, with
   * schedOrder by age (stable); returns how many.
   */
  private schedule(a0: number, a1: number, rng: XorShift128, acc: Float64Array, at: number, moved: number): number {
    const c = this.data.clock, a = this.animated;
    const ages = this.schedAge, s01 = this.schedS01, burst = this.schedBurst, size = this.schedSize;
    let n = 0;
    const d = c.duration;
    if (!a.enabled || d <= 0 || a1 <= a0) return 0;
    const end = c.loop ? a1 : Math.min(a1, d);
    if (end <= a0) return 0;
    const loop = c.loop;
    const rate = evaluateCurve(a.rate, childT01(a0, d, loop), a.rate.random ? rng.value() : 1);
    if (rate > 0) {
      const acc0 = acc[at];
      const acc1 = acc0 + rate * (end - a0);
      const from = Math.floor(acc0);
      const births = Math.floor(acc1) - from;
      for (let k = 1; k <= births; k++) {
        const age = a0 + (from + k - acc0) / rate;
        ages[n] = age; s01[n] = childT01(age, d, loop); burst[n] = -1; size[n] = 0; n++;
      }
      acc[at] = acc1 - Math.floor(acc1);
    }
    const rod = evaluateCurve(a.distance, childT01(a0, d, loop), 1);
    if (rod > 0 && moved > 0) {
      const total = acc[at + 1] + moved * rod;
      const count = Math.floor(total);
      for (let k = 0; k < count; k++) {
        const age = a0 + ((end - a0) * (k + 1)) / (count + 1);
        ages[n] = age; s01[n] = childT01(age, d, loop); burst[n] = -1; size[n] = 0; n++;
      }
      acc[at + 1] = total - count;
    }
    const first = loop ? Math.floor(a0 / d) : 0;
    const last = loop ? Math.floor(end / d) : 0;
    for (let cycle = first; cycle <= last; cycle++) {
      const base = cycle * d;
      for (const b of this.data.emission.bursts) {
        // The cycles before this window draw nothing: start just before it (the same k as stepping from 0).
        let k = b.interval > 0 ? Math.max(0, Math.floor((a0 - base - b.time) / b.interval) - 1) : 0;
        if (b.cycles && k > b.cycles) k = b.cycles;
        while (!(b.cycles && k >= b.cycles)) {
          const bt = b.time + k * b.interval;
          if (bt >= d || base + bt >= end) break;
          if (base + bt >= a0 && (b.probability >= 1 || rng.value() < b.probability)) {
            const value = evaluateCurve(b.count, bt / d, b.count.random ? rng.value() : 1);
            const count = Math.max(0, Math.floor(value + 0.5));
            for (let i = 0; i < count; i++) { ages[n] = base + bt; s01[n] = bt / d; burst[n] = i; size[n] = count; n++; }
          }
          if (b.interval <= 0) break;
          k++;
        }
      }
    }
    const order = this.schedOrder;
    order.length = n;
    for (let i = 0; i < n; i++) order[i] = i;
    if (n > 1) order.sort((x, y) => ages[x] - ages[y]);
    return n;
  }

  /** Steps a child by dt of its own time with its parent's births (none: null); a child that fails is
   *  cleared and given nothing more. */
  private drive(child: ParticleSim, dt: number, events: SubEvents | null): void {
    if (child.failed) return;
    if (!child.advanceDriven(dt, events)) {
      child.failed = true;
      child.clear();
    }
  }

  /** A sub-emitter child's step (_advance_driven): its particles age, die and move over dt (its own time; its
   *  clock reads the step's start meanwhile), then its parent's births of the step, in the oracle's order, each
   *  aged to the step's end; past maxParticles they are dropped. */
  private advanceDriven(dt: number, events: SubEvents | null): boolean {
    const t0 = this.time;
    const w = this.kill(dt, false);
    this.qx.set(this.px.subarray(0, w)); this.qy.set(this.py.subarray(0, w)); this.qz.set(this.pz.subarray(0, w));
    let sum = this.integrate(0, w, dt);
    if (events && this.childActive) {
      for (let m = 0; m < events.n; m++) {
        const e = events.order[m];
        if (this.count >= this.maxCount) continue;
        if (this.count >= this.capacity) this.allocate(Math.min(this.maxCount, this.capacity * 2));
        if (this.budget && !this.budget.allow()) continue;
        const i = this.count;
        const fraction = events.frac[e];
        this.birth(i, events.seed[e], events.s01[e], events.burstIndex[e], events.burstSize[e], fraction, events, e);
        const remaining = this.options.subframeEmission ? (1 - fraction) * dt : 0;
        if (remaining > 0) {
          this.age[i] += remaining;
          sum += this.integrate(i, i + 1, remaining);
        }
        if (this.age[i] < this.life[i]) {
          this.count++;
          if (this.budget) this.budget.live++;
        }
        this.emittedTotal++;
      }
    }
    this.time = t0 + dt;
    return Number.isFinite(sum);
  }

  /** The step's births (_emission_events): times are absolute, windows half-open in emission time [te0, te1).
   *  Sets evT/evI/evN and `order` (by time, stable); returns how many. */
  private emissionEvents(t0: number, t1: number, dt: number): number {
    const evT = this.evT, evI = this.evI, evN = this.evN;
    evT.length = 0; evI.length = 0; evN.length = 0;
    const c = this.data.clock, a = this.animated;
    if (!a.enabled || !this.emitting || c.duration <= 0) return 0;
    const d = c.duration;
    const te0 = Math.max(t0 - this.delay, 0);
    let te1 = t1 - this.delay;
    if (!c.loop) te1 = Math.min(te1, d);
    if (te1 <= te0) {
      if (!c.loop && t1 - this.delay >= d) this.emitting = false;
      return 0;
    }
    // rate over time: every integer the accumulator crosses is one particle, born when it crosses
    const rate = evaluateCurve(a.rate, this.systemT01(te0), a.rate.random ? this.rng.value() : 1);
    if (rate > 0) {
      const acc0 = this.accTime;
      const acc1 = acc0 + rate * (te1 - te0);
      const from = Math.floor(acc0);
      const births = Math.floor(acc1) - from;
      for (let k = 1; k <= births; k++) { evT.push(te0 + (from + k - acc0) / rate + this.delay); evI.push(-1); evN.push(0); }
      this.accTime = acc1 - Math.floor(acc1);
    }
    // rate over distance: how far the emitter moved this step
    const rod = evaluateCurve(a.distance, this.systemT01(te0), 1);
    if (rod > 0) {
      const p = this.pose, q = this.prevPose;
      const ddx = p[0] - q[0], ddy = p[1] - q[1], ddz = p[2] - q[2];
      const acc1 = this.accDistance + Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz) * rod;
      const count = Math.floor(acc1);
      for (let k = 0; k < count; k++) { evT.push(t0 + (dt * (k + 1)) / (count + 1)); evI.push(-1); evN.push(0); }
      this.accDistance = acc1 - count;
    }
    // bursts: in every loop, at time + k interval for k < cycles (0: until the loop ends); each cycle rolls its
    // probability, its count is evaluated at the burst's normalized time and rounded
    const firstLoop = c.loop ? Math.floor(te0 / d) : 0;
    const lastLoop = c.loop ? Math.floor(te1 / d) : 0;
    for (let loop = firstLoop; loop <= lastLoop; loop++) {
      const base = loop * d;
      for (const b of this.data.emission.bursts) {
        // The cycles before this window draw nothing: start just before it (the same k as stepping from 0).
        let k = b.interval > 0 ? Math.max(0, Math.floor((te0 - base - b.time) / b.interval) - 1) : 0;
        if (b.cycles && k > b.cycles) k = b.cycles;
        while (!(b.cycles && k >= b.cycles)) {
          const bt = b.time + k * b.interval;
          if (bt >= d || base + bt >= te1) break;
          if (base + bt >= te0 && (b.probability >= 1 || this.rng.value() < b.probability)) {
            const value = evaluateCurve(b.count, bt / d, b.count.random ? this.rng.value() : 1);
            const count = Math.max(0, Math.floor(value + 0.5));
            for (let i = 0; i < count; i++) { evT.push(base + bt + this.delay); evI.push(i); evN.push(count); }
          }
          if (b.interval <= 0) break;
          k++;
        }
      }
    }
    if (!c.loop && t1 - this.delay >= d) this.emitting = false;
    // By time, stable (insertion sort: a step's events are few and mostly in order already).
    const order = this.order;
    order.length = evT.length;
    for (let i = 0; i < evT.length; i++) {
      let j = i;
      while (j > 0 && evT[order[j - 1]] > evT[i]) { order[j] = order[j - 1]; j--; }
      order[j] = i;
    }
    return evT.length;
  }

  /** A new particle in slot i at time `at` (_spawn): its seed is the one draw a birth makes from the system's generator. */
  private spawn(i: number, at: number, burstIndex: number, burstSize: number, frameFraction: number): void {
    this.birth(i, this.rng.nextU32(), this.systemT01(at - this.delay), burstIndex, burstSize, frameFraction, null, 0);
  }

  /** A new particle in slot i from its seed, its start values at normalized system time s01 (_spawn). `from`: a
   *  sub-emitter's births, this one event e of them: it starts at its parent particle's position (the child's
   *  shape turned and scaled by the child's emitter; a local child's that position seen from its emitter) and
   *  inherits its parent particle's velocity. */
  private birth(i: number, seed: number, s01: number, burstIndex: number, burstSize: number, frameFraction: number, from: SubEvents | null, e: number): void {
    const data = this.data, st = data.start, a = this.animated;
    this.seeds[i] = seed;
    this.serial[i] = this.emittedTotal;
    this.stream.reset(seed);
    sampleShape(data.shape, this.shapeFrame, this.stream, this.phases, burstIndex < 0 ? 0 : burstIndex, burstSize);
    let px = shapeOut[0], py = shapeOut[1], pz = shapeOut[2];
    const speed = evaluateCurve(st.speed, s01, particleRandom(seed, K.startSpeed));
    let vx = shapeOut[3] * speed, vy = shapeOut[4] * speed, vz = shapeOut[5] * speed;
    const lifetime = evaluateCurve(st.lifetime, s01, particleRandom(seed, K.startLifetime));
    const sx = evaluateCurve(a.startSize, s01, particleRandom(seed, K.startSizeX));
    let sy = sx, sz = sx;
    if (st.size3d) { sy = evaluateCurve(st.size[1], s01, particleRandom(seed, K.startSizeY)); sz = evaluateCurve(st.size[2], s01, particleRandom(seed, K.startSizeZ)); }
    let rx = 0, ry = 0;
    if (st.rotation3d) { rx = evaluateCurve(st.rotation[0], s01, particleRandom(seed, K.startRotationX)); ry = evaluateCurve(st.rotation[1], s01, particleRandom(seed, K.startRotationY)); }
    const rz = evaluateCurve(st.rotation[2], s01, particleRandom(seed, K.startRotationZ));
    const flip = st.flip > 0 && particleRandom(seed, K.flip) < st.flip ? -1 : 1;
    const color = st.color;
    if (color.mode === 0) for (let j = 0; j < 4; j++) scratch4[j] = a.startColor[j];
    else {
      const saved = color.maxColor;
      color.maxColor = a.startColor;
      evaluateColor(color, s01, particleRandom(seed, K.startColor), scratch4);
      color.maxColor = saved;
    }
    // A mesh shape's vertex colours tint the start colour (shapeOut[6..9] is white otherwise).
    if (data.shape?.useColors) for (let j = 0; j < 4; j++) scratch4[j] *= shapeOut[6 + j];
    let ex = this.emitterVelocity[0], ey = this.emitterVelocity[1], ez = this.emitterVelocity[2];
    if (from) {
      const p = this.pose, o = from.origin, at = e * 3;
      if (data.clock.space === 'world') {
        linear(p, px, py, pz, v3);
        px = o[at] + v3[0]; py = o[at + 1] + v3[1]; pz = o[at + 2] + v3[2];
        linear(p, vx, vy, vz, v3);
        vx = v3[0]; vy = v3[1]; vz = v3[2];
      } else {
        solve(p, o[at] - p[0], o[at + 1] - p[1], o[at + 2] - p[2], v3);
        px = v3[0] + px; py = v3[1] + py; pz = v3[2] + pz;
      }
      ex = from.velocity[at]; ey = from.velocity[at + 1]; ez = from.velocity[at + 2];
    } else if (data.clock.space === 'world') {
      // Into the root at the birth instant: the emitter's position interpolated across the step.
      const p = this.pose, q = this.prevPose;
      const f = this.options.subframeEmission ? frameFraction : 1;
      const ox = this.options.subframeEmission ? q[0] + (p[0] - q[0]) * f : p[0];
      const oy = this.options.subframeEmission ? q[1] + (p[1] - q[1]) * f : p[1];
      const oz = this.options.subframeEmission ? q[2] + (p[2] - q[2]) * f : p[2];
      linear(p, px, py, pz, v3);
      px = v3[0] + ox; py = v3[1] + oy; pz = v3[2] + oz;
      linear(p, vx, vy, vz, v3);
      vx = v3[0]; vy = v3[1]; vz = v3[2];
    }
    this.px[i] = px; this.py[i] = py; this.pz[i] = pz;
    this.qx[i] = px; this.qy[i] = py; this.qz[i] = pz;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.ax[i] = 0; this.ay[i] = 0; this.az[i] = 0;
    this.age[i] = 0;
    this.life[i] = Math.max(lifetime, 0);
    this.sx[i] = sx; this.sy[i] = sy; this.sz[i] = sz;
    this.rx[i] = rx * flip; this.ry[i] = ry * flip; this.rz[i] = rz * flip;
    this.flip[i] = flip;
    this.cr[i] = color32(scratch4[0]); this.cg[i] = color32(scratch4[1]); this.cb[i] = color32(scratch4[2]); this.ca[i] = color32(scratch4[3]);
    this.ex[i] = ex; this.ey[i] = ey; this.ez[i] = ez;
    const sheet = data.sheet;
    this.row[i] = sheet && sheet.singleRow ? (sheet.row === 'random' ? Math.trunc(particleRandom(seed, K.row) * Math.max(1, sheet.tiles[1]) * 0.99999) : sheet.row) : 0;
    // Which of its sub-emitter links fire from it, each with its own generator (seeded by its subSeed<k>).
    const L = this.links.length;
    for (let k = 0; k < L; k++) {
      const link = this.links[k], slot = i * L + k;
      const on = link.kind === 'birth' && (link.probability >= 1 || particleRandom(seed, SUB_KEYS[k]) < link.probability);
      this.subOn[slot] = on ? 1 : 0;
      if (on) {
        this.linkRng.reseed(particleWord(seed, SUB_SEED_KEYS[k])).save(this.subState, slot * 4);
        this.subAcc[slot * 2] = 0;
        this.subAcc[slot * 2 + 1] = 0;
      }
    }
  }

  /** A module vector given in the root's space (inWorld) or the emitter's, expressed in the simulation's
   *  space: turned by the emitter's rotation alone (_to_sim_space), into v3. */
  private toSim(x: number, y: number, z: number, inWorld: boolean): void {
    const world = this.data.clock.space === 'world', p = this.pose;
    if (world && !inWorld) rotate(p[3], p[4], p[5], p[6], x, y, z, v3);
    else if (!world && inWorld) rotate(-p[3], -p[4], -p[5], p[6], x, y, z, v3);
    else { v3[0] = x; v3[1] = y; v3[2] = z; }
  }

  /** Particles [from, to) over dt (_integrate, section 7.1): gravity and force into the persistent velocity,
   *  the animated velocity recomputed (velocity over lifetime, inherit, noise), the limit, then position and
   *  rotation. Returns the sum of the new positions (non-finite when anything failed). Modules whose values are
   *  all constant zero are skipped (they add nothing). */
  private integrate(from: number, to: number, dt: number): number {
    const data = this.data, o = this.options, pose = this.pose, a = this.animated, plan = this.plan;
    const world = data.clock.space === 'world';
    const px = this.px, py = this.py, pz = this.pz, vx = this.vx, vy = this.vy, vz = this.vz, ax = this.ax, ay = this.ay, az = this.az;
    const age = this.age, life = this.life, seeds = this.seeds, flip = this.flip;
    const gravityT = this.systemT01(this.time - this.delay);
    const gravity = a.gravity;
    const gravityStill = gravity.random ? 0 : evaluateCurve(gravity, gravityT, 1);
    const og0 = o.gravity[0], og1 = o.gravity[1], og2 = o.gravity[2];
    // The same modifier for every particle: its vector in the emitter's space worked out once.
    let sgx = og0 * gravityStill, sgy = og1 * gravityStill, sgz = og2 * gravityStill;
    if (!world && gravityStill && !gravity.random) { solve(pose, sgx, sgy, sgz, v3); sgx = v3[0]; sgy = v3[1]; sgz = v3[2]; }
    const force = data.force, vel = data.velocity, inherit = world ? data.inherit : null, noise = o.noiseEnabled ? data.noise : null;
    const limit = data.limit, rotation = data.rotation;
    const qr0 = pose[3], qr1 = pose[4], qr2 = pose[5], qr3 = pose[6];
    const noiseScrollStill = noise !== null && noise.scroll.mode === CURVE_CONSTANT;
    const noiseScroll = noise ? noise.scroll.scalar : 0;
    const separateNoise = noise !== null && noise.separate && o.noiseAxes === 'separate';
    const keep = limit ? this.keep(limit.dampen, dt) : 1;
    const excess = o.dampenExcessOnly;
    let sum = 0;
    for (let i = from; i < to; i++) {
      const seed = seeds[i];
      const l = life[i];
      const t = l > 0 ? Math.min(Math.max(age[i] / l, 0), 1) : 1;
      // gravity: the root's -Y times the modifier, into the simulation's space
      if (!gravity.random) {
        if (gravityStill) { vx[i] = vx[i] + sgx * dt; vy[i] = vy[i] + sgy * dt; vz[i] = vz[i] + sgz * dt; }
      } else {
        const g = evaluateCurve(gravity, gravityT, particleRandom(seed, K.gravity));
        if (g) {
          const gx = og0 * g, gy = og1 * g, gz = og2 * g;
          if (world) { vx[i] = vx[i] + gx * dt; vy[i] = vy[i] + gy * dt; vz[i] = vz[i] + gz * dt; } else {
            solve(pose, gx, gy, gz, v3);
            vx[i] = vx[i] + v3[0] * dt; vy[i] = vy[i] + v3[1] * dt; vz[i] = vz[i] + v3[2] * dt;
          }
        }
      }
      if (force) {
        const f = force.xyz;
        this.toSim(ev(f[0], t, seed, K.forceX), ev(f[1], t, seed, K.forceY), ev(f[2], t, seed, K.forceZ), force.world);
        vx[i] = vx[i] + v3[0] * dt; vy[i] = vy[i] + v3[1] * dt; vz[i] = vz[i] + v3[2] * dt;
      }
      // the animated velocity: recomputed, never accumulated
      let mx = 0, my = 0, mz = 0, speedMod = 1;
      if (vel) {
        if (plan.linear) {
          const lin = vel.linear;
          this.toSim(ev(lin[0], t, seed, K.velX), ev(lin[1], t, seed, K.velY), ev(lin[2], t, seed, K.velZ), vel.world);
          mx = 0 + v3[0]; my = 0 + v3[1]; mz = 0 + v3[2];
        }
        if (plan.orbit) {
          const orb = vel.orbital, off = vel.offset;
          const ox = ev(orb[0], t, seed, K.orbX), oy = ev(orb[1], t, seed, K.orbY), oz = ev(orb[2], t, seed, K.orbZ);
          let cx = ev(off[0], t, seed, K.offX), cy = ev(off[1], t, seed, K.offY), cz = ev(off[2], t, seed, K.offZ);
          const radial = ev(vel.radial, t, seed, K.radial);
          if (world) { linear(pose, cx, cy, cz, v3); cx = v3[0] + pose[0]; cy = v3[1] + pose[1]; cz = v3[2] + pose[2]; }
          const relX = px[i] - cx, relY = py[i] - cy, relZ = pz[i] - cz;
          if (ox || oy || oz) { mx += oy * relZ - oz * relY; my += oz * relX - ox * relZ; mz += ox * relY - oy * relX; }
          if (radial) { normalize(relX, relY, relZ, 0, 0, 0, v3); mx += v3[0] * radial; my += v3[1] * radial; mz += v3[2] * radial; }
        }
        speedMod = ev(a.speedModifier!, t, seed, K.speedMod);
      }
      if (inherit) {
        const k = ev(inherit.curve, t, seed, K.inherit);
        if (inherit.mode === 'initial') { mx += this.ex[i] * k; my += this.ey[i] * k; mz += this.ez[i] * k; } else {
          mx += this.emitterVelocity[0] * k; my += this.emitterVelocity[1] * k; mz += this.emitterVelocity[2] * k;
        }
      }
      if (noise) {
        const freq = noise.frequency;
        let strength = ev(a.noise, t, seed, K.noise);
        let strengthY = strength, strengthZ = strength;
        if (separateNoise) { strengthY = ev(noise.strength[1], t, seed, K.noiseY); strengthZ = ev(noise.strength[2], t, seed, K.noiseZ); }
        if (noise.damping) { const f = Math.max(freq, 1e-6); strength /= f; strengthY /= f; strengthZ /= f; }
        const scroll = (noiseScrollStill ? noiseScroll : evaluateCurve(noise.scroll, t, 1)) * this.time;
        curlNoise(px[i] * freq + scroll, py[i] * freq + scroll, pz[i] * freq + scroll, noise.octaves, noise.octaveMultiplier, noise.octaveScale, v3);
        const amount = ev(noise.position, t, seed, K.noisePos);
        mx += v3[0] * (strength * amount); my += v3[1] * (strengthY * amount); mz += v3[2] * (strengthZ * amount);
      }
      // limit velocity: dampen the speed above the limit, written back into the persistent velocity
      if (limit) {
        const tx = vx[i] + mx, ty = vy[i] + my, tz = vz[i] + mz;
        let nx: number, ny: number, nz: number;
        if (limit.xyz) {
          const lim = limit.xyz;
          // Each axis in the limit's own space (the emitter's, or the root's with `world`): into it, and back.
          const turn = limit.world !== world;
          if (!turn) { unit[0] = tx; unit[1] = ty; unit[2] = tz; } else if (world) rotate(-qr0, -qr1, -qr2, qr3, tx, ty, tz, unit); else rotate(qr0, qr1, qr2, qr3, tx, ty, tz, unit);
          const lx = Math.abs(ev(lim[0], t, seed, K.limitX)), ly = Math.abs(ev(lim[1], t, seed, K.limitY)), lz = Math.abs(ev(lim[2], t, seed, K.limitZ));
          const cx = Math.sign(unit[0]) * dampen(Math.abs(unit[0]), lx, keep, excess) || 0;
          const cy = Math.sign(unit[1]) * dampen(Math.abs(unit[1]), ly, keep, excess) || 0;
          const cz = Math.sign(unit[2]) * dampen(Math.abs(unit[2]), lz, keep, excess) || 0;
          if (turn) { this.toSim(cx, cy, cz, limit.world); nx = v3[0]; ny = v3[1]; nz = v3[2]; } else { nx = cx; ny = cy; nz = cz; }
        } else {
          const lim = ev(limit.magnitude, t, seed, K.limit);
          const speed = Math.sqrt(tx * tx + ty * ty + tz * tz);
          const next = dampen(speed, Math.abs(lim), keep, excess);
          // v_norm(total) * next: the same length the speed is.
          if (speed < 1e-12) { nx = 0; ny = 0; nz = 0; } else { nx = (tx / speed) * next; ny = (ty / speed) * next; nz = (tz / speed) * next; }
        }
        vx[i] = nx - mx; vy[i] = ny - my; vz[i] = nz - mz;
      }
      ax[i] = mx; ay[i] = my; az[i] = mz;
      const k = dt * speedMod;
      const nx = px[i] + (vx[i] + mx) * k, ny = py[i] + (vy[i] + my) * k, nz = pz[i] + (vz[i] + mz) * k;
      px[i] = nx; py[i] = ny; pz[i] = nz;
      sum += nx + ny + nz;
      // rotation over lifetime: an angular velocity, flipped with the particle
      if (rotation) {
        const r = rotation.xyz;
        const fl = flip[i];
        const wz = ev(r[2], t, seed, K.rotZ) * fl;
        if (rotation.separate) {
          const wx = ev(r[0], t, seed, K.rotX) * fl, wy = ev(r[1], t, seed, K.rotY) * fl;
          this.rx[i] = this.rx[i] + wx * dt; this.ry[i] = this.ry[i] + wy * dt;
        }
        this.rz[i] = this.rz[i] + wz * dt;
      }
    }
    return sum;
  }

  /** What limit velocity keeps of a speed's excess over a step: (1 - dampen) once a step, or (1 - dampen)^(dt R). */
  private keep(d: number, dt: number): number {
    const R = this.options.dampenReferenceFps;
    return R > 0 ? (1 - d) ** (dt * R) : 1 - d;
  }

  /* --- what a renderer reads, per particle (section 8) ------------------------------------------ */

  /** Age over lifetime, 0..1. */
  age01(i: number): number {
    const l = this.life[i];
    return l > 0 ? Math.min(Math.max(this.age[i] / l, 0), 1) : 1;
  }

  /** Size x, y, z (start size times size over lifetime; the emitter's size scale is the renderer's), into out. */
  sizeOf(i: number, out: Float64Array, at = 0): void {
    const size = this.data.size;
    let kx = 1, ky = 1, kz = 1;
    if (size) {
      const t = this.age01(i), seed = this.seeds[i], c = size.xyz, first = this.animated.size!;
      kx = evaluateCurve(first, t, lerpOf(first, seed, K.size));
      if (size.separate) { ky = evaluateCurve(c[1], t, lerpOf(c[1], seed, K.sizeY)); kz = evaluateCurve(c[2], t, lerpOf(c[2], seed, K.sizeZ)); } else { ky = kx; kz = kx; }
    }
    out[at] = this.sx[i] * kx; out[at + 1] = this.sy[i] * ky; out[at + 2] = this.sz[i] * kz;
  }

  /** Colour (the Color32 start colour times colour over lifetime), into out. */
  colorOf(i: number, out: Float64Array, at = 0): void {
    out[at] = this.cr[i]; out[at + 1] = this.cg[i]; out[at + 2] = this.cb[i]; out[at + 3] = this.ca[i];
    const color = this.data.color;
    if (color) {
      evaluateColor(color, this.age01(i), color.random ? particleRandom(this.seeds[i], K.color) : 1, scratch4);
      for (let j = 0; j < 4; j++) out[at + j] *= scratch4[j];
    }
  }

  /** The texture sheet's frame index and its UV rect [u0, v0, u1, v1] (Unity v-up; frame 0 the top-left tile),
   *  into out (-1 and the whole texture without a sheet). */
  frameOf(i: number, out: Float64Array, at = 0): void {
    this.frameAt(i, this.age01(i), this.seeds[i], out, at);
  }

  private frameAt(i: number, a: number, seed: number, out: Float64Array, at: number): void {
    const sheet = this.data.sheet;
    if (!sheet) { out[at] = -1; out[at + 1] = 0; out[at + 2] = 0; out[at + 3] = 1; out[at + 4] = 1; return; }
    const tx = Math.max(1, sheet.tiles[0]), ty = Math.max(1, sheet.tiles[1]);
    const n = sheet.singleRow ? tx : tx * ty;
    const start = ev(sheet.startFrame, 0, seed, K.startFrame);
    const fot = sheet.frameOverTime, r = lerpOf(fot, seed, K.frame);
    let f: number;
    if (this.options.textureFrameMode === 'cocos') f = sheet.cycles * (evaluateCurve(fot, a, r) + start);
    else f = evaluateCurve(fot, a < 1 ? pyMod(a * sheet.cycles, 1) : 1, r) + start;
    if (f >= 1 || f < 0) f -= Math.floor(f);
    let index = Math.min(Math.trunc(f * n), n - 1);
    if (sheet.singleRow) index = this.row[i] * tx + index;
    const col = index % tx, row = Math.trunc(index / tx);
    const v1 = 1 - row / ty;
    out[at] = index; out[at + 1] = col / tx; out[at + 2] = v1 - 1 / ty; out[at + 3] = (col + 1) / tx; out[at + 4] = v1;
  }

  /** What the renderer reads of particle i, at once (one age and seed for all): size x, y, z; colour r, g, b, a;
   *  sheet frame and its UV rect [u0, v0, u1, v1]; then, with `custom`, Custom1.xyzw and Custom2.xyzw. Into
   *  out[0..12] (out[0..20] with custom). The same values as sizeOf, colorOf, frameOf and customOf. */
  attributes(i: number, out: Float64Array, custom: boolean): void {
    const data = this.data, seed = this.seeds[i];
    const l = this.life[i];
    const t = l > 0 ? Math.min(Math.max(this.age[i] / l, 0), 1) : 1;
    const size = data.size;
    if (size) {
      const first = this.animated.size!;
      const kx = ev(first, t, seed, K.size);
      if (size.separate) {
        out[0] = this.sx[i] * kx; out[1] = this.sy[i] * ev(size.xyz[1], t, seed, K.sizeY); out[2] = this.sz[i] * ev(size.xyz[2], t, seed, K.sizeZ);
      } else { out[0] = this.sx[i] * kx; out[1] = this.sy[i] * kx; out[2] = this.sz[i] * kx; }
    } else { out[0] = this.sx[i]; out[1] = this.sy[i]; out[2] = this.sz[i]; }
    out[3] = this.cr[i]; out[4] = this.cg[i]; out[5] = this.cb[i]; out[6] = this.ca[i];
    const color = data.color;
    if (color) {
      evaluateColor(color, t, color.random ? particleRandom(seed, K.color) : 1, scratch4);
      out[3] *= scratch4[0]; out[4] *= scratch4[1]; out[5] *= scratch4[2]; out[6] *= scratch4[3];
    }
    this.frameAt(i, t, seed, out, 7);
    if (custom) this.customAt(t, seed, out, 12);
  }

  /** Particle i as the oracle's render record, flat (30 numbers): position, velocity (persistent + animated),
   *  size, rotation (3 each), colour, Custom1, Custom2, UV rect (4 each), age over lifetime and sheet frame (-1
   *  without a sheet). */
  record(i: number, out: Float64Array): void {
    out[0] = this.px[i]; out[1] = this.py[i]; out[2] = this.pz[i];
    out[3] = this.vx[i] + this.ax[i]; out[4] = this.vy[i] + this.ay[i]; out[5] = this.vz[i] + this.az[i];
    this.sizeOf(i, out, 6);
    out[9] = this.rx[i]; out[10] = this.ry[i]; out[11] = this.rz[i];
    this.colorOf(i, out, 12);
    this.customOf(i, out, 16);
    this.frameOf(i, scratch5);
    out[24] = scratch5[1]; out[25] = scratch5[2]; out[26] = scratch5[3]; out[27] = scratch5[4];
    out[28] = this.age01(i);
    out[29] = scratch5[0];
  }

  /** Custom data Custom1.xyzw then Custom2.xyzw, into out[at..at+7]. */
  customOf(i: number, out: Float64Array, at = 0): void {
    this.customAt(this.age01(i), this.seeds[i], out, at);
  }

  private customAt(t: number, seed: number, out: Float64Array, at: number): void {
    const custom = this.data.custom;
    for (let s = 0; s < 2; s++) {
      const slot = custom ? custom[s] : null;
      const o = at + s * 4;
      if (!slot) { out[o] = 0; out[o + 1] = 0; out[o + 2] = 0; out[o + 3] = 0; continue; }
      if (slot.kind === 'vector') {
        const keys = CUSTOM_KEYS[s];
        for (let j = 0; j < 4; j++) out[o + j] = j < slot.count ? ev(slot.vector[j], t, seed, keys[j]) : 0;
      } else evaluateColor(slot.color, t, slot.color.random ? particleRandom(seed, CUSTOM_COLOR_KEYS[s]) : 1, out, o);
    }
  }
}

/** A sub-emitter child's normalized system time at age x of its parent particle (its duration d; looping or not). */
function childT01(x: number, d: number, loop: boolean): number {
  return loop ? pyMod(x, d) / d : Math.min(x, d) / d;
}

/** The emitter's velocity over the last step (its pose now less before, over dt), into sim.emitterVelocity. */
function moved(sim: ParticleSim, dt: number): void {
  const p = sim.pose, q = sim.prevPose, v = sim.emitterVelocity;
  v[0] = (p[0] - q[0]) * (1 / dt);
  v[1] = (p[1] - q[1]) * (1 / dt);
  v[2] = (p[2] - q[2]) * (1 / dt);
}

/* --- a model's systems on the layers' clock (section 3.2, 3.6-3.8) ----------------------------- */

/** The fixed step (illustration seconds) and the degraded one (when the 2-second median frame time stays above 24 ms). */
export const STEP = 1 / 60;
export const DEGRADED_STEP = 1 / 30;
/** A frame's delta (DynamicArtwork caps it at 0.1 s) is at most 6 steps, 7 with the fraction carried over. */
export const MAX_STEPS = 7;
/** Live particles a model may have; births past it are dropped evenly, with one warning. */
export const LIVE_CAP = 8192;
/** The seed every play of a model derives from by default (playSeed); the harness may set another. */
export const MODEL_SEED = 0x5eed;
/** Under reduced motion, looping idle systems stand at this much particle time, drawn still. */
export const REDUCED_STILL = 3;
/** When the controller's action ends while its systems play: 'vanish' (the group is deactivated: its particles
 *  go) or 'finish' (emission stops, the particles live out their lives). The one unknown of section 3.6,
 *  settled in P6 from the recording (frames 43.5-44.5 s). */
export const ACTION_END: 'vanish' | 'finish' = 'vanish';
/** How far past a grid point a timeline is read for the values clips switch there: the export writes a stepped
 *  column's switch to 1e-4 s (a switch at 13.0666... s is written 13.0667), so a grid point on the switch takes it. */
export const SWITCH_SLACK = 1e-4;
const DEGRADE_ABOVE = 0.024;
const RECOVER_BELOW = 0.018;

/** What the director reads each frame: the animation on track 0, its track time, and the illustration's time
 *  since it took over (dynamicLayers.LayerClock: the same object fits). */
export interface ParticleClock { playing: string | null; animationTime: number; time: number }

/** Where a bone follower puts its systems this frame: a 3x4 (row-major, Unity units in the root), a rotation
 *  quaternion and a size scale, composed before each system's own emitter (`follow` systems only). `origin`: a
 *  3x4 the emitter's origin goes through instead of `matrix` (a Local-scaling system: its linear part turns by
 *  the follower's rotation alone, its origin by the follower's whole placement), or null: `matrix` places both. */
export interface Placement { matrix: ArrayLike<number>; rotation: ArrayLike<number>; scale: ArrayLike<number>; origin: ArrayLike<number> | null }

/** One system as the director runs it, and what the renderer reads of it. */
export interface SystemRun {
  data: ParticleSystemData;
  sim: ParticleSim;
  /** Playing (its GameObject is active). A sub-emitter child: while its parent plays and its own GameObject is on. */
  on: boolean;
  /** Plays so far (playSeed's count: a replay draws new particles). */
  plays: number;
  /** Switched off for the session after it failed. */
  failed: boolean;
  /** Finishing after its action ended (ACTION_END 'finish'). */
  finishing: boolean;
  /** Which clock governs it ('time', an animation, or a state timeline's) and its grid: steps done since that clock's origin plus delay. */
  key: string | null;
  steps: number;
  /** How far the display is past the last step, 0..1 of a step (draw positions between q and p). */
  alpha: number;
  /** The emitter (3x4, root Unity units) at the last step and the one before, its size scale, for drawing. */
  matrix: Float64Array;
  prevMatrix: Float64Array;
  scale: Float64Array;
  /** The timeline's frame at the display time (tint and material columns), or null without a timeline. */
  row: Float64Array | null;
  /** Governing time minus delay at the last frame, and the follower placement then (stepped between). */
  lastTau: number;
  lastPlacement: Float64Array | null;
  /** A sub-emitter child's parent: the child is in `runs` (it draws where it sorts) but only its parent's steps
   *  move it, and its clock fields (on, key, steps, alpha, plays...) mirror its parent's. Null for any other. */
  parent: SystemRun | null;
  /** Its sub-emitter children, in link order. */
  children: SystemRun[];
  /** The emitter's pose (Pose) at the last step: what the simulation placed particles by. */
  pose: Pose;
}

export interface DirectorOptions {
  /** playSeed's model seed (MODEL_SEED). */
  modelSeed: number;
  reduced: boolean;
  /** Float32Array state in production, Float64Array under test. */
  precision: 32 | 64;
  options: Partial<ParticleOptions>;
  liveCap: number;
  /** Step at 1/30 s while frames are slow (never in tests). */
  degrade: boolean;
  actionEnd: 'vanish' | 'finish';
  warn: (message: string) => void;
}

const STATES = new Set(['Interact', 'Special', 'Start']);

/**
 * A model's particle systems on the layers' clock. Each frame, `frame(clock, delta)`:
 * - finds each system's governing clock, as a layer's: a controller group's system only while its animation
 *   plays (from that animation's start), a system with a state timeline on that state while its action plays
 *   (Idle's clock for the default again after), any other on the illustration's time; less its delay;
 * - steps it on a fixed grid from that clock's origin (k x STEP), at most MAX_STEPS a frame, so its births
 *   and onsets never depend on the display rate; between steps the renderer draws at `alpha`;
 * - plays it on a rising edge (its gate holds, its delay has passed and its `active` column is 1: cleared,
 *   playSeed with the next play count, prewarmed), clears it when `active` falls (a clip switched its
 *   GameObject off), ends it by ACTION_END when its action ends, and restarts it when its clock jumps back
 *   (a replayed press, the entrance handing over). A system outside the groups that moves from one of its
 *   timelines to another (a state's while its action plays, the default's after) plays on: the Animator
 *   changed state, its GameObjects stayed on, so only its `active` edges start or clear it;
 * - samples its emitter timeline at each step's end (the pose), and the values clips drive at its start
 *   (`active`, the simulation speed integrated over the step, emission, start values, modifiers);
 * - drives its sub-emitter children with it (`sub`): a child never plays on its own; its parent's step moves it,
 *   at the child's speed, with the child's emitter (its own timeline and follower) at that step, and its own
 *   `active` column switching it off (cleared, its births dropped) and on.
 */
export class ParticleDirector {
  readonly runs: SystemRun[];
  readonly options: DirectorOptions;
  /** The step in use (STEP, or DEGRADED_STEP while frames are slow). */
  step = STEP;
  private readonly budget: BirthBudget & { ratio: number; carry: number; demand: number; warned: boolean };
  private readonly frameTimes: number[] = [];
  private readonly sample: Float64Array;
  private readonly sample2: Float64Array;
  private readonly childSample: Float64Array;
  private readonly childSample2: Float64Array;
  private readonly pose = new Float64Array(POSE_SIZE);
  private readonly composed = new Float64Array(12);
  private readonly quat = new Float64Array(4);
  /** The frame's span for followers (between()): the last frame's governing time and this one's. */
  private spanFrom = 0;
  private spanTo = 0;

  constructor(doc: ParticleDocument, options: Partial<DirectorOptions> = {}) {
    this.options = {
      modelSeed: MODEL_SEED, reduced: false, precision: 32, options: {}, liveCap: LIVE_CAP, degrade: true, actionEnd: ACTION_END,
      warn: (message) => console.warn(`[particles] ${message}`), ...options,
    };
    const cap = this.options.liveCap;
    const budget = {
      live: 0, ratio: 1, carry: 0, demand: 0, warned: false,
      allow: () => {
        budget.demand++;
        if (budget.live >= cap) return this.dropped();
        if (budget.ratio >= 1) return true;
        budget.carry += budget.ratio;
        if (budget.carry >= 1) { budget.carry -= 1; return true; }
        return this.dropped();
      },
    };
    this.budget = budget;
    let width = 1;
    for (const data of doc.systems) if (data?.timeline) width = Math.max(width, data.timeline.width);
    this.sample = new Float64Array(width);
    this.sample2 = new Float64Array(width);
    this.childSample = new Float64Array(width);
    this.childSample2 = new Float64Array(width);
    // Every system the reader kept, sub-emitter children included (they draw where they sort), in draw order.
    this.runs = doc.systems.flatMap((data) => (data ? [{
      data, sim: new ParticleSim(data, doc, this.options.options, this.options.precision, this.budget), on: false, plays: 0, failed: false, finishing: false,
      key: null, steps: 0, alpha: 0, matrix: Float64Array.from(data.emitter?.matrix ?? IDENTITY_3X4), prevMatrix: Float64Array.from(data.emitter?.matrix ?? IDENTITY_3X4),
      scale: Float64Array.from(data.emitter?.scale ?? [1, 1, 1]), row: data.timeline ? new Float64Array(data.timeline.width) : null, lastTau: 0, lastPlacement: null,
      parent: null, children: [], pose: identityPose(),
    } satisfies SystemRun] : []));
    // Each parent's links, in its order (the reader keeps a family whole, or leaves all of it out).
    const byIndex = new Map(this.runs.map((run) => [run.data.index, run]));
    for (const run of this.runs) {
      if (run.data.child) continue;
      for (const [index, kind, probability] of run.data.sub) {
        const child = byIndex.get(index);
        if (!child || !child.data.child || child.parent) continue;
        run.sim.link(child.sim, kind, probability);
        child.parent = run;
        run.children.push(child);
      }
    }
  }

  private dropped(): boolean {
    if (!this.budget.warned) {
      this.budget.warned = true;
      this.options.warn(`more than ${this.options.liveCap} live particles: births dropped evenly`);
    }
    return false;
  }

  /** Live particles across the model. */
  get live(): number {
    return this.budget.live;
  }

  /** The system's governing clock now: its key (null: its gate is shut), time less its delay, and timeline. */
  private governing(data: ParticleSystemData, clock: ParticleClock): { key: string | null; tau: number; line: EmitterLine | null } {
    const reduced = this.options.reduced;
    // Under reduced motion the resting clocks stand still at REDUCED_STILL; a pressed animation runs live.
    const still = (live: number) => (reduced ? REDUCED_STILL : live);
    const tl = data.timeline;
    if (data.only) {
      if (clock.playing !== data.only) return { key: null, tau: 0, line: tl };
      return { key: data.only, tau: (data.only === 'Idle' ? still(clock.animationTime) : clock.animationTime) - data.delay, line: tl };
    }
    const state = tl?.states && clock.playing && STATES.has(clock.playing) ? tl.states[clock.playing as 'Interact'] ?? null : null;
    if (state) return { key: `state:${clock.playing}`, tau: clock.animationTime - data.delay, line: state };
    if (tl?.states && clock.playing === 'Idle') return { key: 'Idle', tau: still(clock.animationTime) - data.delay, line: tl };
    return { key: 'time', tau: still(clock.time) - data.delay, line: tl };
  }

  /** A system's emitter at governing time tau into `pose` and `composed` (and run.scale), its timeline frame into
   *  `into` (particle_oracle.emitter_pose). On a follower: the emitter through the placement's matrix, its origin
   *  through `origin` when the placement has one (a Local-scaling system: the caller turns its linear part by the
   *  follower's rotation alone, Unity's Local ignoring every parent's scale; particleGeometry.followPlacement).
   *  A timeline's interpolated quaternion is normalized. */
  private emitterAt(run: SystemRun, line: EmitterLine | null, tau: number, into: Float64Array | null, placement: Float64Array | null, pose: Pose, composed: Float64Array): void {
    const data = run.data, tl = data.timeline;
    let matrix: ArrayLike<number>, rotation: ArrayLike<number>, scale: ArrayLike<number>;
    if (tl && line && into) {
      sampleLine(line, tl.width, tau, into);
      matrix = into.subarray(tl.at.matrix, tl.at.matrix + 12);
      const r = tl.at.rotation, q = this.quat;
      const norm = Math.sqrt(into[r] * into[r] + into[r + 1] * into[r + 1] + into[r + 2] * into[r + 2] + into[r + 3] * into[r + 3]) || 1;
      for (let j = 0; j < 4; j++) q[j] = into[r + j] / norm;
      rotation = q;
      scale = into.subarray(tl.at.scale, tl.at.scale + 3);
    } else {
      matrix = data.emitter!.matrix; rotation = data.emitter!.rotation; scale = data.emitter!.scale;
    }
    if (placement) {
      compose(placement, matrix, composed);
      if (placement.length >= 31) {
        // The origin through the follower's whole placement (Placement.origin: a Local-scaling system, whose
        // linear part `matrix` turns by the follower's rotation alone; particleGeometry.followPlacement).
        const o = placement;
        for (let r = 0; r < 3; r++) composed[r * 4 + 3] = o[19 + r * 4] * matrix[3] + o[20 + r * 4] * matrix[7] + o[21 + r * 4] * matrix[11] + o[22 + r * 4];
      }
      const q = quatMul(placement.subarray(12, 16), rotation);
      poseFrom(composed, q, pose);
      run.scale[0] = placement[16] * scale[0]; run.scale[1] = placement[17] * scale[1]; run.scale[2] = placement[18] * scale[2];
    } else {
      composed.set(matrix);
      poseFrom(matrix, rotation, pose);
      run.scale[0] = scale[0]; run.scale[1] = scale[1]; run.scale[2] = scale[2];
    }
  }

  /** The values a clip drives at a frame, onto the system's simulation (the column's binding replaces the scalar). */
  private applyColumns(run: SystemRun, frame: Float64Array): void {
    const at = run.data.timeline!.at, a = run.sim.animated;
    // (Plain lookups, no closures: this runs every step of every system on a timeline.)
    if (hasColumn(at, 'emission.rate')) a.rate.scalar = frame[at['emission.rate']];
    if (hasColumn(at, 'emission.enabled')) a.enabled = frame[at['emission.enabled']] >= 0.5;
    if (hasColumn(at, 'emission.distance')) a.distance.scalar = frame[at['emission.distance']];
    if (hasColumn(at, 'main.startSize')) a.startSize.scalar = frame[at['main.startSize']];
    if (hasColumn(at, 'main.gravity')) a.gravity.scalar = frame[at['main.gravity']];
    if (hasColumn(at, 'noise.strength')) a.noise.scalar = frame[at['noise.strength']];
    if (hasColumn(at, 'velocity.speedModifier') && a.speedModifier) a.speedModifier.scalar = frame[at['velocity.speedModifier']];
    if (hasColumn(at, 'size.multiplier') && a.size) a.size.scalar = frame[at['size.multiplier']];
    // The shape is read where particles are born; its radius is the system's own (no other system shares it).
    if (hasColumn(at, 'shape.radius') && run.data.shape) run.data.shape.radius.value = frame[at['shape.radius']];
    if (hasColumn(at, 'main.startColor')) for (let j = 0; j < 4; j++) a.startColor[j] = frame[at['main.startColor'] + j];
  }

  private fail(run: SystemRun, why: string): void {
    run.failed = true;
    run.on = false;
    run.sim.clear();
    for (const child of run.children) { child.failed = true; child.on = false; }
    this.options.warn(`${run.data.name}${run.children.length ? ' and its sub-emitters' : ''} switched off: ${why}`);
  }

  /** A child its parent's step found failing (a value went non-finite) is switched off alone. */
  private childFailures(run: SystemRun): void {
    for (const child of run.children) {
      if (child.sim.failed && !child.failed) {
        child.failed = true;
        child.on = false;
        this.options.warn(`${child.data.name} switched off: a value went non-finite`);
      }
    }
  }

  /** A follower's placement at grid time t, linear between the last frame's (`from`, at spanFrom) and this frame's (`to`, at spanTo). */
  private between(from: Float64Array | null, to: Float64Array | null, t: number): Float64Array | null {
    const a = this.spanFrom, b = this.spanTo;
    return to && from && b > a ? lerpPlacement(from, to, (t - a) / (b - a)) : to;
  }

  /** A follower's placement now as one array (Placement: matrix 12, rotation 4, scale 3, then origin 12 when it
   *  has one), or null. */
  private placementOf(data: ParticleSystemData, placements: ((data: ParticleSystemData) => Placement | null) | null): Float64Array | null {
    if (!data.follow || !placements) return null;
    const p = placements(data);
    return p ? Float64Array.from([...Array.from(p.matrix), ...Array.from(p.rotation), ...Array.from(p.scale), ...(p.origin ? Array.from(p.origin) : [])]) : null;
  }

  /**
   * The children of a parent at its step from t0 to t1 (or at its rise, t0 = t1): each child's `active` at t0
   * (switched off: cleared, its births dropped), the values its clips drive then (its speed among them), and its
   * emitter at t1 (its own timeline and follower), into its run's pose and matrices. Returns their poses.
   */
  private childrenAt(run: SystemRun, lines: readonly (EmitterLine | null)[], t0: number, t1: number, placements: readonly (Float64Array | null)[], rising: boolean): Pose[] {
    return run.children.map((child, k) => {
      const data = child.data, tl = data.timeline, line = lines[k];
      let active = data.active;
      if (tl && line) {
        sampleLine(line, tl.width, t0 + SWITCH_SLACK, this.childSample);
        active = this.childSample[ACTIVE_COLUMN] >= 0.5;
        this.applyColumns(child, this.childSample);
        if (Object.hasOwn(tl.at, 'speed')) child.sim.childSpeed = this.childSample[tl.at.speed];
      }
      if (!active && child.sim.childActive) child.sim.clear();
      child.sim.childActive = active;
      this.emitterAt(child, line, t1, tl ? this.childSample2 : null, this.between(child.lastPlacement ?? placements[k], placements[k], t1), child.pose, this.composed);
      if (!rising) child.prevMatrix.set(child.matrix);
      child.matrix.set(this.composed);
      if (rising) child.prevMatrix.set(this.composed);
      return child.pose;
    });
  }

  /** Clears and starts a play at governing time tau (its children with it). */
  private rise(run: SystemRun, line: EmitterLine | null, tau: number, placement: Float64Array | null, childLines: readonly (EmitterLine | null)[],
    childPlacements: readonly (Float64Array | null)[]): void {
    run.sim.clear();
    run.plays++;
    this.emitterAt(run, line, tau, run.data.timeline ? this.sample : null, placement, this.pose, this.composed);
    if (run.data.timeline) this.applyColumns(run, this.sample);
    run.matrix.set(this.composed);
    run.prevMatrix.set(this.composed);
    run.pose.set(this.pose);
    const childPoses = this.childrenAt(run, childLines, tau, tau, childPlacements, true);
    run.sim.play(playSeed(this.options.modelSeed, run.data.index, run.plays), run.pose, childPoses);
    run.on = true;
    run.finishing = false;
  }

  /** A parent's children mirror its clock; their timeline frames (tint) at the display time. */
  private syncChildren(run: SystemRun, lines: readonly (EmitterLine | null)[], tau: number): void {
    run.children.forEach((child, k) => {
      child.on = run.on && child.sim.childActive && !child.failed;
      child.finishing = run.finishing;
      child.plays = run.plays;
      child.key = run.key;
      child.steps = run.steps;
      child.alpha = run.alpha;
      child.lastTau = run.lastTau;
      const tl = child.data.timeline, line = lines[k];
      if (child.row && line && tl) sampleLine(line, tl.width, Math.max(tau, 0), child.row);
    });
  }

  /**
   * One display frame. `delta`: the frame's seconds (DynamicArtwork caps it at 0.1). `placements`: for a system
   * on a bone follower, where the follower puts it now (Placement), else null; stepped between frames linearly.
   */
  frame(clock: ParticleClock, delta: number, placements: ((data: ParticleSystemData) => Placement | null) | null = null): void {
    this.degrade(delta);
    const h = this.step;
    const budget = this.budget;
    // Births past the live cap are dropped evenly: the share of last frame's demand that fits.
    budget.ratio = budget.demand ? Math.min(1, Math.max(0, (this.options.liveCap - budget.live) / budget.demand)) : 1;
    budget.demand = 0;
    for (const run of this.runs) {
      if (run.failed || run.data.child) continue;
      const data = run.data;
      let childLines: readonly (EmitterLine | null)[] = NO_LINES;
      try {
        const placement = this.placementOf(data, placements);
        const family = run.children.length > 0;
        const childPlacements = family ? run.children.map((child) => this.placementOf(child.data, placements)) : NO_PLACEMENTS;
        const { key, tau, line } = this.governing(data, clock);
        if (family) childLines = run.children.map((child) => this.governing(child.data, clock).line);
        if (key === null) {
          // Its gate shut: the controller's action ended (or never began).
          if (run.on && !run.finishing) {
            if (this.options.actionEnd === 'finish') { run.sim.stop(); run.finishing = true; } else { run.sim.clear(); run.on = false; }
          }
          if (run.finishing) this.finish(run, delta);
          run.key = null;
          this.syncChildren(run, childLines, tau);
          continue;
        }
        const reducedStill = this.options.reduced && (key === 'time' || key === 'Idle');
        if (key !== run.key || tau < run.lastTau - 1e-9) {
          if (run.on && key !== run.key && run.key !== null && data.only === null && !this.options.reduced && tau >= 0) {
            // The same GameObjects on another of its timelines (an action's state, the default's after it): it plays
            // on, on the new clock's grid; its `active` there may clear or restart it.
            run.key = key;
            run.steps = Math.floor(tau / h + 1e-9);
          } else {
            // A new clock, or this one jumped back: start over on its grid (from its origin; a clock first met far
            // past it, the still under reduced motion aside, joins its last few steps).
            if (run.on) { run.sim.clear(); run.on = false; }
            run.finishing = false;
            run.key = key;
            run.steps = reducedStill ? 0 : Math.max(0, Math.floor(tau / h) - MAX_STEPS);
          }
          run.lastTau = tau;
          run.lastPlacement = placement;
          run.children.forEach((child, k) => { child.lastPlacement = childPlacements[k]; });
        }
        const most = reducedStill ? Math.ceil(REDUCED_STILL / h) + 1 : MAX_STEPS;
        // Followers are stepped linearly from the last frame's placement (at its time) to this one's.
        this.spanFrom = run.lastTau;
        this.spanTo = tau;
        const fromPlacement = run.lastPlacement ?? placement;
        let done = 0;
        // Each grid point the clock has reached: its edges (is it on: its delay passed, `active`), then the step
        // after it if the clock has passed that too. A rising edge plays at once, so a prewarmed loop shows on the
        // frame its clock starts.
        for (;;) {
          const t0 = run.steps * h, t1 = (run.steps + 1) * h;
          if (t0 > tau + 1e-9) break;
          let active = data.active;
          if (data.timeline && line) {
            sampleLine(line, data.timeline.width, t0 + SWITCH_SLACK, this.sample2);
            active = this.sample2[ACTIVE_COLUMN] >= 0.5;
          }
          const on = active && !(reducedStill && !data.clock.loop);
          if (on && !run.on) this.rise(run, line, t0, this.between(fromPlacement, placement, t0), childLines, childPlacements);
          else if (!on && run.on) { run.sim.clear(); run.on = false; }
          if (t1 > tau + 1e-9 || done >= most) break;
          if (run.on) {
            // What clips drive, at the step's start; the simulation speed integrated over it (trapezoid).
            let speed = data.clock.speed;
            if (data.timeline) {
              this.applyColumns(run, this.sample2);
              if (Object.hasOwn(data.timeline.at, 'speed')) speed = this.sample2[data.timeline.at.speed];
            }
            this.emitterAt(run, line, t1, data.timeline ? this.sample : null, this.between(fromPlacement, placement, t1), this.pose, this.composed);
            if (data.timeline && Object.hasOwn(data.timeline.at, 'speed')) speed = (speed + this.sample[data.timeline.at.speed]) / 2;
            run.prevMatrix.set(run.matrix);
            run.matrix.set(this.composed);
            run.pose.set(this.pose);
            const childPoses = this.childrenAt(run, childLines, t0, t1, childPlacements, false);
            if (!run.sim.step(h, run.pose, speed, childPoses)) { this.fail(run, 'a value went non-finite'); break; }
            this.childFailures(run);
          }
          run.steps++;
          done++;
        }
        if (run.failed) { this.syncChildren(run, childLines, tau); continue; }
        // Behind by more than a frame may take (a clock that jumped ahead): skip to it.
        if ((run.steps + 1) * h <= tau) run.steps = Math.floor(tau / h);
        run.alpha = Math.min(Math.max((tau - run.steps * h) / h, 0), 1);
        run.lastTau = tau;
        run.lastPlacement = placement;
        run.children.forEach((child, k) => { child.lastPlacement = childPlacements[k]; });
        if (run.row && line && data.timeline) sampleLine(line, data.timeline.width, Math.max(tau, 0), run.row);
        this.syncChildren(run, childLines, tau);
      } catch (error) {
        this.fail(run, error instanceof Error ? error.message : String(error));
        this.syncChildren(run, childLines, 0);
      }
    }
  }

  /** A system finishing after its action ended: stepped on the frame's delta until its particles (and its
   *  children's) are gone. */
  private finish(run: SystemRun, delta: number): void {
    run.alpha = 0;
    let steps = Math.min(MAX_STEPS, Math.round(delta / this.step));
    const keep = run.children.map(() => null);
    while (steps-- > 0 && run.sim.familyCount) {
      if (!run.sim.step(this.step, null, run.data.clock.speed, keep)) { this.fail(run, 'a value went non-finite'); return; }
      this.childFailures(run);
    }
    if (!run.sim.familyCount) { run.on = false; run.finishing = false; }
  }

  /** The degraded step while the 2-second median frame time stays above 24 ms (and back below 18 ms). */
  private degrade(delta: number): void {
    if (!this.options.degrade || !(delta > 0)) return;
    const times = this.frameTimes;
    times.push(delta);
    let total = times.reduce((a, b) => a + b, 0);
    while (times.length > 1 && total - times[0] >= 2) total -= times.shift()!;
    if (total < 2) return;
    const median = times.slice().sort((a, b) => a - b)[times.length >> 1];
    const next = median > DEGRADE_ABOVE ? DEGRADED_STEP : median < RECOVER_BELOW ? STEP : this.step;
    if (next !== this.step) {
      for (const run of this.runs) run.steps = Math.floor((run.steps * this.step) / next + 1e-9);
      this.step = next;
    }
  }
}

const IDENTITY_3X4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
const hasColumn = (at: Record<string, number>, name: string) => at[name] !== undefined;
const NO_LINES: readonly (EmitterLine | null)[] = [];
const NO_PLACEMENTS: readonly (Float64Array | null)[] = [];

/** outer (3x4) x inner (3x4), both row-major, into out. */
function compose(outer: ArrayLike<number>, inner: ArrayLike<number>, out: Float64Array): void {
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      out[r * 4 + c] = outer[r * 4] * inner[c] + outer[r * 4 + 1] * inner[4 + c] + outer[r * 4 + 2] * inner[8 + c] + (c === 3 ? outer[r * 4 + 3] : 0);
    }
  }
}

function quatMul(a: ArrayLike<number>, b: ArrayLike<number>): number[] {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

/** Two follower placements (matrix 12, quaternion 4, scale 3 [, origin 12]) mixed by k: linear, the quaternion renormalized. */
function lerpPlacement(a: Float64Array, b: Float64Array, k: number): Float64Array {
  if (a.length !== b.length) return b;
  const f = Math.min(Math.max(k, 0), 1);
  const out = new Float64Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] + (b[i] - a[i]) * f;
  const n = Math.hypot(out[12], out[13], out[14], out[15]) || 1;
  for (let i = 12; i < 16; i++) out[i] /= n;
  return out;
}
