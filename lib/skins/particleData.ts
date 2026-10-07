/*
 * The illustration prefab's particle systems as data: layerParticles.json in arkpedia/arkpedia-l2d-assets
 * (written by its scripts/particles.py; the format is frozen in that repository's README, "layerParticles.json").
 * This module reads and checks the file and compiles each system's curves and gradients for the simulator
 * (lib/skins/particleSim.ts). The reference simulator, scripts/tests/particle_oracle.py in the assets
 * repository, is the specification: `Simulation.from_export` reads the same records with the same defaults
 * (EXPORT_DEFAULTS here and there) and the same float32 re-quantization, and the curve and gradient
 * evaluation below is a line-for-line port of its `evaluate_curve`, `MinMaxCurve`, `Gradient` and
 * `MinMaxGradient` (scripts/tests/test-particles.ts checks them on its golden fixtures).
 *
 * Strict per system: a system this reader does not understand (an unknown member, a value out of range,
 * a capability tag it lacks) is left out and counted, with every system tied to it by sub-emitter links;
 * the others still play. Only a file whose top level is wrong is refused as a whole (it throws, and the
 * artwork plays without its particles). Nothing here touches WebGL.
 */
import { parseShader, type LayerFollow, type LayerShader, type LayerTexture } from './dynamicLayers';

/* --- numbers ------------------------------------------------------------------------------ */

/** Every non-integer number in the file is a float32 (what Unity serializes); a reader takes it back to one. */
const f32 = Math.fround;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const isIndex = (value: unknown, length: number): value is number => Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) < length;

/** GLSL's roundEven, Python's round(): halves go to the even neighbour. */
export function roundHalfEven(x: number): number {
  const floor = Math.floor(x);
  const rest = x - floor;
  if (rest !== 0.5) return Math.round(x) + 0;
  return (floor % 2 === 0 ? floor : floor + 1) + 0;
}

/** Python's float modulo (the result takes the divisor's sign): the oracle's `x % m`. */
export function pyMod(x: number, m: number): number {
  let r = x % m;
  if (r !== 0 && (m < 0) !== (r < 0)) r += m;
  return r + 0;
}

/* --- the format's defaults and tables (particle_oracle.EXPORT_DEFAULTS, RANDOM_KEYS) ------- */

/** The values a field takes when the export leaves it out (scripts/particles.py drops the ones equal to these).
 *  Identical to particle_oracle.EXPORT_DEFAULTS (the golden fixture carries the oracle's table; the test
 *  compares them). */
export const EXPORT_DEFAULTS = {
  clock: { duration: 5, loop: true, prewarm: false, startDelay: 0, speed: 1, maxParticles: 1000, seed: null, space: 'local', scaling: 'local' },
  emission: { enabled: true, rate: 10, distance: 0, bursts: [] as unknown[] },
  start: { lifetime: 5, speed: 5, size: 1, rotation: 0, color: [1, 1, 1, 1], gravity: 0, flip: 0 },
  shape: {
    radius: 1, thickness: 1, arc: 360, angle: 25, length: 5, donutRadius: 0.2, boxThickness: [0, 0, 0], pos: [0, 0, 0], rot: [0, 0, 0], scale: [1, 1, 1],
    randomDir: 0, spherical: 0, randomPos: 0, placement: 'vertex', useColors: true, normalOffset: 0,
  },
  multi: { mode: 'random', spread: 0, speed: 1 },
  velocity: { linear: [0, 0, 0], world: false, orbital: [0, 0, 0], offset: [0, 0, 0], radial: 0, speedModifier: 1 },
  limit: { world: false },
  force: { world: false },
  noise: { frequency: 0.5, damping: true, octaves: 1, octaveMultiplier: 0.5, octaveScale: 2, quality: 'high', scroll: 0, position: 1, rotation: 0, size: 0 },
  inherit: { mode: 'initial' },
  // A texture sheet's `animation` (wholeSheet or singleRow), quoted: scripts/audits/audit-motion.mjs reads an
  // unquoted `animation:` in an object literal as an inline CSS animation.
  sheet: { 'animation': 'wholeSheet', startFrame: 0, cycles: 1 },
  render: { align: 'view', pivot: [0, 0, 0], sort: 'none', lengthScale: 2, velocityScale: 0, freeform: false, minSize: 0, maxSize: 0.5, allowRoll: true },
} as const;

/** The over-lifetime random factors (particle_oracle.RAND_KEYS). */
const RAND_KEYS = ['size', 'sizeY', 'sizeZ', 'rotX', 'rotY', 'rotZ', 'color', 'velX', 'velY', 'velZ', 'orbX', 'orbY', 'orbZ', 'offX', 'offY', 'offZ', 'radial',
  'speedMod', 'limit', 'limitX', 'limitY', 'limitZ', 'forceX', 'forceY', 'forceZ', 'gravity', 'noise', 'noiseY', 'noiseZ', 'noisePos', 'frame', 'startFrame', 'row',
  'custom0_0', 'custom0_1', 'custom0_2', 'custom0_3', 'custom1_0', 'custom1_1', 'custom1_2', 'custom1_3', 'customColor0', 'customColor1', 'inherit', 'noiseOffset',
  'trail'] as const;
const START_KEYS = ['startSpeed', 'startLifetime', 'startSizeX', 'startSizeY', 'startSizeZ', 'startRotationX', 'startRotationY', 'startRotationZ', 'flip',
  'startColor'] as const;
/** Keyed values one particle's shape sampling may draw, shape0 ... shape15 (particle_oracle.SHAPE_DRAWS). */
export const SHAPE_DRAWS = 16;
/** Every per-particle random value, by key: its index here is the key of particleRandom (particle_oracle.RANDOM_KEYS). */
export const RANDOM_KEYS: readonly string[] = [...RAND_KEYS, ...START_KEYS, ...Array.from({ length: SHAPE_DRAWS }, (_, i) => `shape${i}`)];
export type RandomKey = (typeof RAND_KEYS)[number] | (typeof START_KEYS)[number];
const KEY_INDEX = new Map(RANDOM_KEYS.map((name, i) => [name, i]));
/** A random key's index (the `key` of particleRandom). */
export function randomKey(name: RandomKey | `shape${number}`): number {
  const index = KEY_INDEX.get(name);
  if (index === undefined) throw new Error(`no random key ${name}`);
  return index;
}

/* --- curves (particle_oracle evaluate_curve / MinMaxCurve) --------------------------------- */

export const WRAP_PINGPONG = 0;
export const WRAP_REPEAT = 1;
export const WRAP_CLAMP = 2;
const WRAPS: Record<string, number> = { pingPong: WRAP_PINGPONG, repeat: WRAP_REPEAT, clamp: WRAP_CLAMP };

/** An AnimationCurve, with what each segment's cubic Hermite needs worked out once: its length and its two
 *  slopes times that length (m0 = outSlope x dx, m1 = inSlope x dx, as the oracle computes them), and
 *  whether it is stepped (either slope infinite: the left value holds). */
export interface Keys {
  n: number;
  t: Float64Array;
  v: Float64Array;
  dx: Float64Array;
  m0: Float64Array;
  m1: Float64Array;
  stepped: Uint8Array;
  pre: number;
  post: number;
}

export const CURVE_CONSTANT = 0;
export const CURVE_CURVE = 1;
export const CURVE_TWO_CURVES = 2;
export const CURVE_TWO_CONSTANTS = 3;

/** A MinMaxCurve: `scalar` is the constant (Constant), the maximum (TwoConstants) or the multiplier of both
 *  curves (the curve modes, where minScalar is not read). An Animator that drives the value replaces `scalar`
 *  (the emitter timeline's columns, particleSim). */
export interface Curve {
  mode: 0 | 1 | 2 | 3;
  scalar: number;
  minScalar: number;
  max: Keys | null;
  min: Keys | null;
  /** TwoCurves or TwoConstants: the value depends on a random factor. */
  random: boolean;
}

function repeat(t: number, length: number): number {
  if (length <= 0) return 0;
  return Math.min(Math.max(t - Math.floor(t / length) * length, 0), length);
}

/** particle_oracle._ping_pong: t folded back and forth over [0, length]. */
export function pingPong(t: number, length: number): number {
  const r = repeat(t, length * 2);
  return length - Math.abs(r - length);
}

/** Unity's AnimationCurve.Evaluate for unweighted keys (particle_oracle.evaluate_curve, line for line). */
export function evaluateKeys(k: Keys, time: number): number {
  const n = k.n;
  if (n === 0) return 0;
  const v = k.v;
  if (n === 1) return v[0];
  const times = k.t;
  const beg = times[0], end = times[n - 1];
  let t = time;
  if (t < beg) {
    if (k.pre === WRAP_CLAMP) t = beg;
    else if (k.pre === WRAP_PINGPONG) t = beg + pingPong(t - beg, end - beg);
    else t = beg + repeat(t - beg, end - beg);
  } else if (t > end) {
    if (k.post === WRAP_CLAMP) t = end;
    else if (k.post === WRAP_PINGPONG) t = beg + pingPong(t - beg, end - beg);
    else t = beg + repeat(t - beg, end - beg);
  }
  // The last key with time <= t (the right one wins at an exact key time).
  let i = 0;
  while (i + 1 < n - 1 && times[i + 1] <= t) i++;
  if (k.stepped[i]) return v[i];
  const dx = k.dx[i];
  if (dx === 0) return v[i];
  const s = (t - times[i]) / dx;
  const s2 = s * s, s3 = s * s * s;
  return (2 * s3 - 3 * s2 + 1) * v[i] + (s3 - 2 * s2 + s) * k.m0[i] + (s3 - s2) * k.m1[i] + (-2 * s3 + 3 * s2) * v[i + 1];
}

/** A MinMaxCurve at x with the random factor `lerp` (MinMaxCurve.evaluate). */
export function evaluateCurve(c: Curve, x: number, lerp: number): number {
  switch (c.mode) {
    case CURVE_CONSTANT: return c.scalar;
    case CURVE_TWO_CONSTANTS: return c.minScalar + (c.scalar - c.minScalar) * lerp;
    case CURVE_CURVE: return evaluateKeys(c.max!, x) * c.scalar;
    default: {
      const lo = evaluateKeys(c.min!, x), hi = evaluateKeys(c.max!, x);
      return (lo + (hi - lo) * lerp) * c.scalar;
    }
  }
}

/** (lowest, highest) a curve takes between its first and last key, every overshoot of a segment's cubic
 *  included (particle_oracle.curve_bounds). */
export function keysBounds(k: Keys): [number, number] {
  if (!k.n) return [0, 0];
  let low = Infinity, high = -Infinity;
  for (let i = 0; i < k.n; i++) { low = Math.min(low, k.v[i]); high = Math.max(high, k.v[i]); }
  for (let i = 0; i + 1 < k.n; i++) {
    const dx = k.t[i + 1] - k.t[i];
    if (dx <= 0 || k.stepped[i]) continue;
    const p0 = k.v[i], p1 = k.v[i + 1], m0 = k.m0[i], m1 = k.m1[i];
    const a = 2 * p0 + m0 + m1 - 2 * p1, b = -3 * p0 - 2 * m0 - m1 + 3 * p1, c = m0;
    const roots: number[] = [];
    if (Math.abs(a) > 1e-12) {
      const disc = b * b - 3 * a * c;
      if (disc >= 0) { const r = Math.sqrt(disc); roots.push((-b - r) / (3 * a), (-b + r) / (3 * a)); }
    } else if (Math.abs(b) > 1e-12) roots.push(-c / (2 * b));
    for (const root of roots) {
      if (root > 0 && root < 1) { const value = ((a * root + b) * root + c) * root + p0; low = Math.min(low, value); high = Math.max(high, value); }
    }
  }
  return [low, high];
}

/** (lowest, highest) value a MinMaxCurve takes over any x and random factor (MinMaxCurve.bounds). */
export function curveBounds(c: Curve): [number, number] {
  if (c.mode === CURVE_CONSTANT) return [c.scalar, c.scalar];
  if (c.mode === CURVE_TWO_CONSTANTS) return [Math.min(c.scalar, c.minScalar), Math.max(c.scalar, c.minScalar)];
  const parts = [keysBounds(c.max!), ...(c.mode === CURVE_TWO_CURVES ? [keysBounds(c.min!)] : [])];
  const a = Math.min(...parts.map((p) => p[0])) * c.scalar, b = Math.max(...parts.map((p) => p[1])) * c.scalar;
  return [Math.min(a, b), Math.max(a, b)];
}

export function constantCurve(value: number): Curve {
  return { mode: CURVE_CONSTANT, scalar: value, minScalar: value, max: null, min: null, random: false };
}

/* --- gradients (particle_oracle Gradient / MinMaxGradient) --------------------------------- */

/** A Gradient: colour keys [t, r, g, b, ...] and alpha keys [t, a, ...], times float32(time / 65535). */
export interface Gradient { colors: Float64Array; alphas: Float64Array; fixed: boolean }

export const GRAD_COLOR = 0;
export const GRAD_GRADIENT = 1;
export const GRAD_TWO_COLORS = 2;
export const GRAD_TWO_GRADIENTS = 3;
export const GRAD_RANDOM_COLOR = 4;

/** A MinMaxGradient. An Animator that drives the start colour replaces `maxColor`. */
export interface ColorValue {
  mode: 0 | 1 | 2 | 3 | 4;
  minColor: Float64Array;
  maxColor: Float64Array;
  min: Gradient | null;
  max: Gradient | null;
  random: boolean;
}

/** Colour keys [t, r, g, b, ...] at t into out[at..at+2] (Gradient._eval: Fixed, the first key after t; Blend,
 *  linear between the keys around t, the end keys held outside). */
function colorKeys(keys: Float64Array, t: number, fixed: boolean, out: Float64Array, at: number): void {
  const last = keys.length - 4;
  let k = last;
  if (fixed) {
    for (let i = 0; i <= last; i += 4) if (keys[i] > t) { k = i; break; }
  } else if (t <= keys[0]) k = 0;
  else if (t < keys[last]) {
    for (let i = 0; i < last; i += 4) {
      const t0 = keys[i], t1 = keys[i + 4];
      if (t0 <= t && t <= t1) {
        const f = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
        const r = keys[i + 1], g = keys[i + 2], b = keys[i + 3];
        out[at] = r + (keys[i + 5] - r) * f; out[at + 1] = g + (keys[i + 6] - g) * f; out[at + 2] = b + (keys[i + 7] - b) * f;
        return;
      }
    }
  }
  out[at] = keys[k + 1]; out[at + 1] = keys[k + 2]; out[at + 2] = keys[k + 3];
}

/** Alpha keys [t, a, ...] at t (Gradient._eval, as colorKeys). */
function alphaKeys(keys: Float64Array, t: number, fixed: boolean): number {
  const last = keys.length - 2;
  if (fixed) {
    for (let i = 0; i <= last; i += 2) if (keys[i] > t) return keys[i + 1];
    return keys[last + 1];
  }
  if (t <= keys[0]) return keys[1];
  if (t >= keys[last]) return keys[last + 1];
  for (let i = 0; i < last; i += 2) {
    const t0 = keys[i], t1 = keys[i + 2];
    if (t0 <= t && t <= t1) {
      const f = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
      return keys[i + 1] + (keys[i + 3] - keys[i + 1]) * f;
    }
  }
  return keys[last + 1];
}

/** A gradient at t (clamped to 0..1) into out[at..at+3]. */
export function evaluateGradient(g: Gradient, t: number, out: Float64Array, at = 0): void {
  const x = Math.min(Math.max(t, 0), 1);
  colorKeys(g.colors, x, g.fixed, out, at);
  out[at + 3] = alphaKeys(g.alphas, x, g.fixed);
}

const scratchA = new Float64Array(4);
const scratchB = new Float64Array(4);

/** A MinMaxGradient at t with the random factor `lerp`, into out[at..at+3] (MinMaxGradient.evaluate). */
export function evaluateColor(c: ColorValue, t: number, lerp: number, out: Float64Array, at = 0): void {
  switch (c.mode) {
    case GRAD_COLOR:
      for (let j = 0; j < 4; j++) out[at + j] = c.maxColor[j];
      return;
    case GRAD_GRADIENT:
      evaluateGradient(c.max!, t, out, at);
      return;
    case GRAD_TWO_COLORS:
      for (let j = 0; j < 4; j++) out[at + j] = c.minColor[j] + (c.maxColor[j] - c.minColor[j]) * lerp;
      return;
    case GRAD_TWO_GRADIENTS:
      evaluateGradient(c.min!, t, scratchA);
      evaluateGradient(c.max!, t, scratchB);
      for (let j = 0; j < 4; j++) out[at + j] = scratchA[j] + (scratchB[j] - scratchA[j]) * lerp;
      return;
    default:
      evaluateGradient(c.max!, lerp, out, at); // RandomColor: the gradient at a random time
  }
}

/** Particle.startColor is a Color32: 8 bits per channel, rounded half to even as Python's round (color32). */
export function color32(x: number): number {
  return Math.min(255, Math.max(0, roundHalfEven(x * 255))) / 255;
}

/* --- the compiled records ---------------------------------------------------------------- */

export type ShapeType = 'sphere' | 'sphereShell' | 'hemisphere' | 'hemisphereShell' | 'cone' | 'box' | 'mesh' | 'coneShell' | 'coneVolume' | 'coneVolumeShell'
  | 'circle' | 'circleEdge' | 'edge' | 'boxShell' | 'boxEdge' | 'donut' | 'rectangle';
export const MULTI_RANDOM = 0;
export const MULTI_LOOP = 1;
export const MULTI_PINGPONG = 2;
export const MULTI_BURST_SPREAD = 3;
const MULTI_MODES: Record<string, number> = { random: MULTI_RANDOM, loop: MULTI_LOOP, pingPong: MULTI_PINGPONG, burstSpread: MULTI_BURST_SPREAD };

/** An arc, an edge's radius or a mesh's spawn order: where along it a particle starts (shape `arcMode`, ...). */
export interface Multi { value: number; mode: number; spread: number; speed: Curve }

export interface Shape {
  type: ShapeType;
  radius: Multi;
  thickness: number;
  arc: Multi;
  angle: number;
  length: number;
  donutRadius: number;
  boxThickness: [number, number, number];
  pos: [number, number, number];
  /** Degrees, applied Z, then X, then Y (Quaternion.Euler). */
  rot: [number, number, number];
  scale: [number, number, number];
  randomDir: number;
  spherical: number;
  randomPos: number;
  /** A mesh shape: its mesh (with normals and areaCdf), placement, spawn order, colours and normal offset. */
  mesh: number | null;
  placement: 'vertex' | 'edge' | 'triangle';
  spawn: Multi;
  useColors: boolean;
  normalOffset: number;
}

export interface Burst { time: number; count: Curve; cycles: number; interval: number; probability: number }

export type Curve3 = [Curve, Curve, Curve];

export interface EmitterStill {
  /** 3x4, row-major: emitter space to the prefab root (Unity units), the scaling mode applied. */
  matrix: Float64Array;
  /** Its rotation relative to the root, x, y, z, w: module vectors given in the other space turn by it. */
  rotation: Float64Array;
  /** The scale on particle sizes. */
  scale: Float64Array;
}

/** An emitter timeline (from the second export): named columns, frames at 30 fps, linear, `active` stepped. */
export interface EmitterLine { length: number; loop: boolean; loopFrom: number; frames: Float64Array; count: number }
export interface EmitterTimeline extends EmitterLine {
  columns: string[];
  /** Where each named column starts in a frame (t at 0, matrix at 1, rotation 13, scale 17, active 20). */
  at: Record<string, number>;
  width: number;
  states: Partial<Record<'Interact' | 'Special' | 'Start', EmitterLine>> | null;
}

export type RenderMode = 'billboard' | 'stretched' | 'mesh';
export interface Render {
  mode: RenderMode;
  align: 'view' | 'world' | 'local' | 'facing' | 'velocity';
  pivot: [number, number, number];
  sort: 'none' | 'distance' | 'oldestInFront' | 'youngestInFront' | 'depth';
  lengthScale: number;
  velocityScale: number;
  freeform: boolean;
  minSize: number;
  /** A fraction of the camera's height (ParticleDocument.camera.height). */
  maxSize: number;
  meshes: number[];
  allowRoll: boolean;
}

export type ParticleAnimation = 'Idle' | 'Interact' | 'Special' | 'Start';

export interface ParticleSystemData {
  index: number;
  name: string;
  requires: string[];
  only: ParticleAnimation | null;
  delay: number;
  active: boolean;
  follow: LayerFollow | null;
  child: boolean;
  emitter: EmitterStill | null;
  timeline: EmitterTimeline | null;
  clock: {
    duration: number;
    loop: boolean;
    prewarm: boolean;
    /** The last part of the first loop a prewarm simulates (written exactly when it prewarms and loops). */
    prewarmWindow: number | null;
    startDelay: Curve;
    speed: number;
    maxParticles: number;
    /** A fixed seed (uint32), or null: a new seed every play. */
    seed: number | null;
    space: 'local' | 'world';
    scaling: 'hierarchy' | 'local' | 'shape';
    maxAlive: number;
  };
  emission: { enabled: boolean; rate: Curve; distance: Curve; bursts: Burst[] };
  start: {
    lifetime: Curve;
    speed: Curve;
    /** x, y, z (one curve three times without 3D size). */
    size: Curve3;
    size3d: boolean;
    /** x, y, z in radians; z is the 2D rotation. */
    rotation: Curve3;
    rotation3d: boolean;
    color: ColorValue;
    gravity: Curve;
    flip: number;
  };
  shape: Shape | null;
  velocity: { linear: Curve3; world: boolean; orbital: Curve3; offset: Curve3; radial: Curve; speedModifier: Curve } | null;
  limit: { magnitude: Curve; xyz: Curve3 | null; world: boolean; dampen: number } | null;
  force: { xyz: Curve3; world: boolean } | null;
  noise: {
    strength: Curve3;
    separate: boolean;
    frequency: number;
    damping: boolean;
    octaves: number;
    octaveMultiplier: number;
    octaveScale: number;
    quality: 'low' | 'medium' | 'high';
    scroll: Curve;
    position: Curve;
  } | null;
  inherit: { mode: 'initial' | 'current'; curve: Curve } | null;
  size: { xyz: Curve3; separate: boolean } | null;
  rotation: { xyz: Curve3; separate: boolean } | null;
  color: ColorValue | null;
  sheet: { tiles: [number, number]; singleRow: boolean; row: number | 'random'; frameOverTime: Curve; startFrame: Curve; cycles: number } | null;
  /** Custom data slots 1 and 2: null, a vector of 4 curves (those past its count read 0) or a colour. */
  custom: [CustomSlot, CustomSlot] | null;
  /** Sub-emitter links [child, 'birth' | 'death', probability] (simulated from P4). */
  sub: [number, 'birth' | 'death', number][];
  render: Render | null;
  material: number | null;
}
export type CustomSlot = null | { kind: 'vector'; vector: Curve[]; count: number } | { kind: 'color'; color: ColorValue };

/** One of the 8 custom vertex inputs a material's shader reads (TEXCOORD0.zw, TEXCOORD1.xyzw, TEXCOORD2.xy). */
export type CustomInput = 0 | 'uv.x' | 'uv.y' | 'uv2.x' | 'uv2.y' | `c${1 | 2}.${'x' | 'y' | 'z' | 'w'}`;
export interface ParticleMaterial {
  blend: 'alpha' | 'add';
  /** The main texture (an index into layers.json's textures, effectTextures, then these), null: Unity's white. */
  texture: number | null;
  color: [number, number, number, number];
  shader: LayerShader;
  custom: CustomInput[] | null;
  cull: 0 | 1 | 2;
}

export type ParticleMesh = { builtin: 'quad' } | {
  builtin: null;
  vertices: Float32Array;
  uvs: Float32Array;
  colors: Float32Array | null;
  triangles: Uint16Array;
  normals: Float32Array | null;
  areaCdf: Float64Array | null;
};

export interface ParticleTexture extends LayerTexture { phase: 'idle' | 'Start' | 'Interact' | 'Special' }

export interface ParticleDocument {
  /** Unity units per skeleton unit. */
  unit: number;
  camera: { size: number; height: number };
  controller: { fixFxDelay: number; animTimeFixed: number };
  textures: ParticleTexture[];
  materials: (ParticleMaterial | null)[];
  meshes: (ParticleMesh | null)[];
  /** Indexed as in the file (draw runs index them); null where a system is left out. */
  systems: (ParticleSystemData | null)[];
  /** Systems left out, each with why. */
  skipped: { name: string; why: string }[];
}

/* --- reader limits and capabilities -------------------------------------------------------- */

/** What one file may ask of the browser. The 88 Global models stay inside them (largest seen: 117 KB, 77
 *  particle textures, 280 systems, curves of 24 keys, 8 bursts, a 10,000/s rate, 1,600 burst fires a loop). */
export const PARTICLE_LIMITS = {
  bytes: 1024 * 1024, textures: 128, systems: 2048, meshes: 512, materials: 2048, keys: 64, bursts: 64, burstFires: 10000, rate: 100000,
  burstCount: 100000, duration: 3600, prewarmWindow: 300, frames: 20000, vertices: 65535,
};
/** Capability tags (`requires`) this reader simulates. Sub-emitters ('sub') arrive with P4, trails ('trail') in v2. */
export const SUPPORTED_REQUIRES: ReadonlySet<string> = new Set<string>();
const KNOWN_REQUIRES = new Set(['sub', 'trail']);
const ONLY = new Set(['Idle', 'Interact', 'Special', 'Start']);
const PHASES = new Set(['idle', 'Start', 'Interact', 'Special']);
const WRAP_MODES = new Set(['repeat', 'clamp', 'mirror']);
const SHAPE_FIELDS: Record<ShapeType, readonly string[]> = {
  sphere: ['radius', 'thickness'], sphereShell: ['radius'], hemisphere: ['radius', 'thickness'], hemisphereShell: ['radius'],
  cone: ['radius', 'thickness', 'arc', 'arcMode', 'angle'], coneShell: ['radius', 'arc', 'arcMode', 'angle'],
  coneVolume: ['radius', 'thickness', 'arc', 'arcMode', 'angle', 'length'], coneVolumeShell: ['radius', 'arc', 'arcMode', 'angle', 'length'],
  circle: ['radius', 'thickness', 'arc', 'arcMode'], circleEdge: ['radius', 'arc', 'arcMode'], edge: ['radius', 'radiusMode'],
  donut: ['radius', 'thickness', 'arc', 'arcMode', 'donutRadius'], box: [], boxShell: ['boxThickness'], boxEdge: ['boxThickness'], rectangle: [],
  mesh: ['mesh', 'placement', 'spawn', 'useColors', 'normalOffset'],
};
const SHAPE_COMMON = ['type', 'pos', 'rot', 'scale', 'randomDir', 'spherical', 'randomPos'];
const INPUT = /^(uv|uv2)\.[xy]$|^c[12]\.[xyzw]$/;
/** Emitter timeline columns and their widths (the head first; scripts/particles.mjs TIMELINE_COLUMNS). */
export const TIMELINE_COLUMNS: Record<string, number> = {
  t: 1, matrix: 12, rotation: 4, scale: 3, active: 1, tint: 4, speed: 1, 'emission.rate': 1, 'emission.enabled': 1, 'emission.distance': 1,
  'main.startColor': 4, 'main.startSize': 1, 'main.gravity': 1, 'noise.strength': 1, 'velocity.speedModifier': 1, 'shape.radius': 1, 'size.multiplier': 1,
};
const TIMELINE_HEAD = ['t', 'matrix', 'rotation', 'scale', 'active'];
/** The active column's index in a frame. */
export const ACTIVE_COLUMN = 20;
/** Material parameters a timeline may carry, as layers.json's effects name them. */
const SHADER_COLUMN = /^(main\.(st|offset)|dissolve\.\d\.(amount|border|st|offset)|distort\.(main|dissolve|weight\.st)|distort\.maps\.\d\.(st|offset|intensity)|ramp\.st|edge\.color)$/;
const SHADER_WIDTH: Record<string, number> = { amount: 1, border: 1, main: 1, dissolve: 1, st: 4, offset: 4, intensity: 2, color: 4 };

/* --- reading ------------------------------------------------------------------------------- */

class Refused extends Error {}
const refuse = (why: string): never => { throw new Refused(why); };

/** Every key of `value` among `allowed`, every one of `required` present. */
function only(value: unknown, label: string, allowed: readonly string[], required: readonly string[] = []): Record<string, unknown> {
  if (!isObject(value)) return refuse(`${label} is not an object`);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) refuse(`${label}: unknown member ${key}`);
  for (const key of required) if (!Object.hasOwn(value, key)) refuse(`${label}: ${key} missing`);
  return value;
}

const get = <T>(record: Record<string, unknown>, key: string, fallback: T): unknown => (Object.hasOwn(record, key) ? record[key] : fallback);

function float(value: unknown, label: string): number {
  if (!finite(value)) return refuse(`${label} is not a number`);
  return f32(value);
}

function bool(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') return refuse(`${label} is not true or false`);
  return value;
}

function vec3(value: unknown, label: string): [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3) return refuse(`${label} is not [x, y, z]`);
  return [float(value[0], label), float(value[1], label), float(value[2], label)];
}

function keys(value: unknown, label: string, pre: number, post: number): Keys {
  if (!Array.isArray(value) || value.length % 4) return refuse(`${label}: keys are [t, v, in, out, ...]`);
  const n = value.length / 4;
  if (n > PARTICLE_LIMITS.keys) refuse(`${label}: ${n} keys`);
  const t = new Float64Array(n), v = new Float64Array(n), inSlope = new Float64Array(n), outSlope = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const [kt, kv, ki, ko] = value.slice(i * 4, i * 4 + 4);
    t[i] = float(kt, label);
    v[i] = float(kv, label);
    inSlope[i] = ki === null ? Infinity : float(ki, label);
    outSlope[i] = ko === null ? Infinity : float(ko, label);
    if (i && t[i] < t[i - 1]) refuse(`${label}: keys out of order`);
  }
  const segments = Math.max(n - 1, 0);
  const dx = new Float64Array(segments), m0 = new Float64Array(segments), m1 = new Float64Array(segments), stepped = new Uint8Array(segments);
  for (let i = 0; i < segments; i++) {
    stepped[i] = !Number.isFinite(outSlope[i]) || !Number.isFinite(inSlope[i + 1]) ? 1 : 0;
    dx[i] = t[i + 1] - t[i];
    m0[i] = outSlope[i] * dx[i];
    m1[i] = inSlope[i + 1] * dx[i];
  }
  return { n, t, v, dx, m0, m1, stepped, pre, post };
}

function wraps(tail: unknown[], count: number, label: string): number[] {
  if (!tail.length) return Array.from({ length: count }, () => WRAP_CLAMP);
  const w = tail[0];
  if (tail.length !== 1 || !Array.isArray(w) || w[0] !== 'w' || w.length !== count + 1) return refuse(`${label}: a curve ends with ["w", ...] or nothing`);
  return w.slice(1).map((name) => WRAPS[name as string] ?? refuse(`${label}: unknown wrap ${String(name)}`));
}

/** A curve value: a number, ["r", min, max], ["c", scalar, keys(, wrap)] or ["cc", scalar, minKeys, maxKeys(, wraps)]. */
export function parseCurve(value: unknown, label = 'curve'): Curve {
  if (finite(value)) return constantCurve(f32(value));
  if (!Array.isArray(value)) return refuse(`${label} is not a curve`);
  const tag = value[0];
  if (tag === 'r' && value.length === 3) {
    return { mode: CURVE_TWO_CONSTANTS, scalar: float(value[2], label), minScalar: float(value[1], label), max: null, min: null, random: true };
  }
  if (tag === 'c' && value.length >= 3 && value.length <= 4) {
    const w = wraps(value.slice(3), 2, label);
    const scalar = float(value[1], label);
    return { mode: CURVE_CURVE, scalar, minScalar: scalar, max: keys(value[2], label, w[0], w[1]), min: null, random: false };
  }
  if (tag === 'cc' && value.length >= 4 && value.length <= 5) {
    const w = wraps(value.slice(4), 4, label);
    const scalar = float(value[1], label);
    return { mode: CURVE_TWO_CURVES, scalar, minScalar: scalar, max: keys(value[3], label, w[2], w[3]), min: keys(value[2], label, w[0], w[1]), random: true };
  }
  return refuse(`${label}: unknown curve`);
}

function curves3(value: unknown, label: string): Curve3 {
  if (!Array.isArray(value) || value.length !== 3) return refuse(`${label} is not three curves`);
  return [parseCurve(value[0], label), parseCurve(value[1], label), parseCurve(value[2], label)];
}

function gradient(value: unknown, label: string): Gradient {
  const g = only(value, label, ['c', 'a', 'fixed'], ['c', 'a']);
  const c = g.c, a = g.a;
  if (!Array.isArray(c) || !c.length || c.length % 4 || c.length > 32) return refuse(`${label}: c must be 1-8 [t, r, g, b]`);
  if (!Array.isArray(a) || !a.length || a.length % 2 || a.length > 16) return refuse(`${label}: a must be 1-8 [t, a]`);
  if (Object.hasOwn(g, 'fixed') && g.fixed !== true) refuse(`${label}: fixed is written only when true`);
  return { colors: Float64Array.from(c, (x) => float(x, label)), alphas: Float64Array.from(a, (x) => float(x, label)), fixed: g.fixed === true };
}

function color4(value: unknown, label: string): Float64Array {
  if (!Array.isArray(value) || value.length !== 4) return refuse(`${label} is not [r, g, b, a]`);
  return Float64Array.from(value, (x) => float(x, label));
}

/** A colour value: [r, g, b, a], ["r", c0, c1], ["g", G], ["gg", G0, G1] or ["rg", G]. */
export function parseColor(value: unknown, label = 'colour'): ColorValue {
  if (!Array.isArray(value)) return refuse(`${label} is not a colour`);
  const white = () => Float64Array.of(1, 1, 1, 1);
  const tag = value[0];
  if (typeof tag !== 'string') return { mode: GRAD_COLOR, minColor: white(), maxColor: color4(value, label), min: null, max: null, random: false };
  if (tag === 'r' && value.length === 3) return { mode: GRAD_TWO_COLORS, minColor: color4(value[1], label), maxColor: color4(value[2], label), min: null, max: null, random: true };
  if (tag === 'g' && value.length === 2) { const g = gradient(value[1], label); return { mode: GRAD_GRADIENT, minColor: white(), maxColor: white(), min: g, max: g, random: false }; }
  if (tag === 'gg' && value.length === 3) return { mode: GRAD_TWO_GRADIENTS, minColor: white(), maxColor: white(), min: gradient(value[1], label), max: gradient(value[2], label), random: true };
  if (tag === 'rg' && value.length === 2) { const g = gradient(value[1], label); return { mode: GRAD_RANDOM_COLOR, minColor: white(), maxColor: white(), min: g, max: g, random: true }; }
  return refuse(`${label}: unknown colour`);
}

function multi(value: unknown, base: number, label: string): Multi {
  const record = value === undefined ? {} : only(value, label, ['mode', 'spread', 'speed']);
  const mode = get(record, 'mode', EXPORT_DEFAULTS.multi.mode) as string;
  if (!Object.hasOwn(MULTI_MODES, mode)) refuse(`${label}: unknown mode ${mode}`);
  return { value: f32(base), mode: MULTI_MODES[mode], spread: float(get(record, 'spread', EXPORT_DEFAULTS.multi.spread), label), speed: parseCurve(get(record, 'speed', EXPORT_DEFAULTS.multi.speed), label) };
}

function parseShape(value: unknown, meshes: readonly (ParticleMesh | null)[]): Shape {
  if (!isObject(value) || typeof value.type !== 'string' || !Object.hasOwn(SHAPE_FIELDS, value.type)) return refuse('shape.type unknown');
  const type = value.type as ShapeType;
  const sh = only(value, 'shape', [...SHAPE_COMMON, ...SHAPE_FIELDS[type]], ['type']);
  const d = EXPORT_DEFAULTS.shape;
  const g = (key: keyof typeof d) => get(sh, key, d[key]);
  let mesh: number | null = null;
  const placement = g('placement');
  if (type === 'mesh') {
    if (!isIndex(sh.mesh, meshes.length)) refuse('shape.mesh is not a mesh');
    const m = meshes[sh.mesh as number];
    if (!m || m.builtin !== null || !m.areaCdf || !m.normals) refuse('shape.mesh has no normals and areaCdf');
    mesh = sh.mesh as number;
    if (placement !== 'vertex' && placement !== 'edge' && placement !== 'triangle') refuse('shape.placement unknown');
    if (Object.hasOwn(sh, 'useColors') && sh.useColors !== false) refuse('shape.useColors is written only when false');
  }
  return {
    type,
    radius: multi(sh.radiusMode, float(g('radius'), 'shape.radius'), 'shape.radiusMode'),
    thickness: float(g('thickness'), 'shape.thickness'),
    arc: multi(sh.arcMode, float(g('arc'), 'shape.arc'), 'shape.arcMode'),
    angle: float(g('angle'), 'shape.angle'),
    length: float(g('length'), 'shape.length'),
    donutRadius: float(g('donutRadius'), 'shape.donutRadius'),
    boxThickness: vec3(g('boxThickness'), 'shape.boxThickness'),
    pos: vec3(g('pos'), 'shape.pos'),
    rot: vec3(g('rot'), 'shape.rot'),
    scale: vec3(g('scale'), 'shape.scale'),
    randomDir: float(g('randomDir'), 'shape.randomDir'),
    spherical: float(g('spherical'), 'shape.spherical'),
    randomPos: float(g('randomPos'), 'shape.randomPos'),
    mesh,
    placement: placement as Shape['placement'],
    spawn: multi(sh.spawn, 0, 'shape.spawn'),
    useColors: g('useColors') !== false,
    normalOffset: float(g('normalOffset'), 'shape.normalOffset'),
  };
}

function line(value: unknown, width: number, label: string): EmitterLine {
  const l = only(value, label, ['length', 'loop', 'loopFrom', 'frames', 'columns', 'states'], ['length', 'loop', 'loopFrom', 'frames']);
  if (!finite(l.length) || l.length < 0 || typeof l.loop !== 'boolean' || !finite(l.loopFrom) || l.loopFrom < 0) return refuse(`${label} is not { length, loop, loopFrom, frames }`);
  const frames = l.frames;
  if (!Array.isArray(frames) || !frames.length || frames.length > PARTICLE_LIMITS.frames) return refuse(`${label}: frames`);
  const out = new Float64Array(frames.length * width);
  frames.forEach((frame, i) => {
    if (!Array.isArray(frame) || frame.length !== width || !frame.every(finite)) refuse(`${label}: frames[${i}] is not ${width} numbers`);
    if (i === 0 ? frame[0] !== 0 : !(frame[0] > (frames[i - 1] as number[])[0])) refuse(`${label}: frames out of order`);
    if (frame[ACTIVE_COLUMN] !== 0 && frame[ACTIVE_COLUMN] !== 1) refuse(`${label}: active is 0 or 1`);
    for (let j = 0; j < width; j++) out[i * width + j] = f32(frame[j]);
  });
  return { length: l.length, loop: l.loop, loopFrom: l.loopFrom, frames: out, count: frames.length };
}

function parseTimeline(value: unknown): EmitterTimeline {
  const tl = only(value, 'timeline', ['columns', 'length', 'loop', 'loopFrom', 'frames', 'states'], ['columns', 'length', 'loop', 'loopFrom', 'frames']);
  const columns = tl.columns;
  if (!Array.isArray(columns) || TIMELINE_HEAD.some((name, i) => columns[i] !== name) || new Set(columns).size !== columns.length) {
    return refuse(`timeline columns must start ${TIMELINE_HEAD.join(', ')}`);
  }
  const at: Record<string, number> = {};
  let width = 0;
  for (const name of columns) {
    if (typeof name !== 'string') return refuse('timeline column is not a name');
    const shader = SHADER_COLUMN.test(name);
    if (!shader && !Object.hasOwn(TIMELINE_COLUMNS, name)) refuse(`unknown timeline column ${name}`);
    at[name] = width;
    width += shader ? SHADER_WIDTH[name.split('.').at(-1)!] : TIMELINE_COLUMNS[name];
  }
  const main = line({ ...tl, columns: undefined, states: undefined }, width, 'timeline');
  let states: EmitterTimeline['states'] = null;
  if (Object.hasOwn(tl, 'states')) {
    if (!isObject(tl.states) || !Object.keys(tl.states).length) return refuse('timeline states');
    states = {};
    for (const [name, state] of Object.entries(tl.states)) {
      if (name !== 'Interact' && name !== 'Special' && name !== 'Start') return refuse(`timeline states.${name}`);
      only(state, `states.${name}`, ['length', 'loop', 'loopFrom', 'frames'], ['length', 'loop', 'loopFrom', 'frames']);
      states[name] = line(state, width, `states.${name}`);
    }
  }
  return { ...main, columns: columns as string[], at, width, states };
}

function parseFollow(f: unknown): LayerFollow {
  if (!isObject(f) || typeof f.bone !== 'string' || !f.bone || !['xy', 'rotation', 'localScale', 'mirrored'].every((k) => typeof f[k] === 'boolean')
    || !Array.isArray(f.parent) || f.parent.length !== 4 || !f.parent.every(finite) || !Array.isArray(f.position) || f.position.length !== 2
    || !f.position.every(finite) || !finite(f.angle)) return refuse('follow');
  return {
    bone: f.bone, xy: f.xy as boolean, rotation: f.rotation as boolean, localScale: f.localScale as boolean, mirrored: f.mirrored as boolean,
    parent: [f.parent[0], f.parent[1], f.parent[2], f.parent[3]], position: [f.position[0], f.position[1]], angle: f.angle,
  };
}

const SYSTEM_MEMBERS = ['name', 'requires', 'only', 'delay', 'active', 'follow', 'child', 'emitter', 'clock', 'emission', 'start', 'shape', 'velocity', 'limit',
  'force', 'noise', 'inherit', 'size', 'rotation', 'color', 'sheet', 'custom', 'sub', 'render', 'material', 'trail'];
const SYSTEM_REQUIRED = ['name', 'requires', 'only', 'delay', 'active', 'follow', 'child', 'emitter', 'clock', 'emission', 'start', 'render', 'material'];

/** How many times a burst fires in one loop (particle_oracle.burst_fires). */
export function burstFires(b: Burst, duration: number): number {
  let fires = 0;
  for (let k = 0; !(b.cycles && k >= b.cycles); k++) {
    if (b.time + k * b.interval >= duration) break;
    fires++;
    if (b.interval <= 0 || fires > PARTICLE_LIMITS.burstFires) break;
  }
  return fires;
}

/** One record of `systems`, read with the format's defaults; throws Refused with why when it is not understood. */
function parseSystem(value: unknown, index: number, counts: { systems: number; materials: readonly (ParticleMaterial | null)[]; meshes: readonly (ParticleMesh | null)[] }): ParticleSystemData {
  const s = only(value, 'system', SYSTEM_MEMBERS, SYSTEM_REQUIRED);
  if (typeof s.name !== 'string' || !s.name) return refuse('name');
  const requires = s.requires;
  if (!Array.isArray(requires) || !requires.every((tag) => typeof tag === 'string') || new Set(requires).size !== requires.length) return refuse('requires');
  for (const tag of requires) if (!SUPPORTED_REQUIRES.has(tag as string)) refuse(KNOWN_REQUIRES.has(tag as string) ? `requires ${tag} (not simulated yet)` : `requires ${tag} (unknown)`);
  if (s.only !== null && !ONLY.has(s.only as string)) refuse('only');
  if (!finite(s.delay) || s.delay < 0) refuse('delay');
  const active = bool(s.active, 'active'), child = bool(s.child, 'child');
  const follow = s.follow === null ? null : parseFollow(s.follow);

  let emitter: EmitterStill | null = null;
  let timeline: EmitterTimeline | null = null;
  if (isObject(s.emitter) && Object.hasOwn(s.emitter, 'timeline')) {
    only(s.emitter, 'emitter', ['timeline'], ['timeline']);
    timeline = parseTimeline(s.emitter.timeline);
  } else {
    const e = only(s.emitter, 'emitter', ['matrix', 'rotation', 'scale'], ['matrix', 'rotation', 'scale']);
    if (!Array.isArray(e.matrix) || e.matrix.length !== 12 || !Array.isArray(e.rotation) || e.rotation.length !== 4 || !Array.isArray(e.scale) || e.scale.length !== 3) {
      refuse('emitter is not { matrix: 12, rotation: 4, scale: 3 }');
    }
    emitter = {
      matrix: Float64Array.from(e.matrix as unknown[], (x) => float(x, 'emitter.matrix')),
      rotation: Float64Array.from(e.rotation as unknown[], (x) => float(x, 'emitter.rotation')),
      scale: Float64Array.from(e.scale as unknown[], (x) => float(x, 'emitter.scale')),
    };
  }

  const c = only(s.clock, 'clock', ['duration', 'loop', 'prewarm', 'prewarmWindow', 'startDelay', 'speed', 'maxParticles', 'seed', 'space', 'scaling', 'maxAlive'], ['maxAlive']);
  const cd = EXPORT_DEFAULTS.clock;
  const duration = float(get(c, 'duration', cd.duration), 'clock.duration');
  const loop = bool(get(c, 'loop', cd.loop), 'clock.loop'), prewarm = bool(get(c, 'prewarm', cd.prewarm), 'clock.prewarm');
  if (!(duration <= PARTICLE_LIMITS.duration)) refuse('clock.duration');
  let prewarmWindow: number | null = null;
  if ((prewarm && loop) !== Object.hasOwn(c, 'prewarmWindow')) refuse('clock.prewarmWindow is written exactly when the system prewarms and loops');
  if (Object.hasOwn(c, 'prewarmWindow')) {
    prewarmWindow = float(c.prewarmWindow, 'clock.prewarmWindow');
    if (prewarmWindow < 0 || prewarmWindow > PARTICLE_LIMITS.prewarmWindow) refuse('clock.prewarmWindow');
  }
  const maxParticles = get(c, 'maxParticles', cd.maxParticles);
  if (!Number.isSafeInteger(maxParticles) || (maxParticles as number) < 0) refuse('clock.maxParticles');
  const seed = Object.hasOwn(c, 'seed') ? c.seed : null;
  if (seed !== null && !(Number.isSafeInteger(seed) && (seed as number) >= 0 && (seed as number) <= 0xffffffff)) refuse('clock.seed');
  const space = get(c, 'space', cd.space), scaling = get(c, 'scaling', cd.scaling);
  if (space !== 'local' && space !== 'world') refuse('clock.space');
  if (scaling !== 'hierarchy' && scaling !== 'local' && scaling !== 'shape') refuse('clock.scaling');
  if (!(Number.isSafeInteger(c.maxAlive) && (c.maxAlive as number) >= 1)) refuse('clock.maxAlive');
  const clock: ParticleSystemData['clock'] = {
    duration, loop, prewarm, prewarmWindow, startDelay: parseCurve(get(c, 'startDelay', cd.startDelay), 'clock.startDelay'),
    speed: float(get(c, 'speed', cd.speed), 'clock.speed'), maxParticles: maxParticles as number, seed: seed as number | null,
    space: space as 'local' | 'world', scaling: scaling as 'hierarchy' | 'local' | 'shape', maxAlive: c.maxAlive as number,
  };

  const em = only(s.emission, 'emission', ['enabled', 'rate', 'distance', 'bursts']);
  const ed = EXPORT_DEFAULTS.emission;
  if (Object.hasOwn(em, 'enabled') && em.enabled !== false) refuse('emission.enabled is written only when false');
  const rawBursts = get(em, 'bursts', ed.bursts);
  if (!Array.isArray(rawBursts) || rawBursts.length > PARTICLE_LIMITS.bursts) return refuse('emission.bursts');
  const bursts = rawBursts.map((b): Burst => {
    if (!Array.isArray(b) || b.length !== 5 || !Number.isSafeInteger(b[2]) || b[2] < 0) return refuse('emission.bursts: [time, count, cycles, interval, probability]');
    const burst = { time: float(b[0], 'burst time'), count: parseCurve(b[1], 'burst count'), cycles: b[2] as number, interval: float(b[3], 'burst interval'), probability: float(b[4], 'burst probability') };
    if (burstFires(burst, duration) > PARTICLE_LIMITS.burstFires || curveBounds(burst.count)[1] > PARTICLE_LIMITS.burstCount) refuse('a burst fires too often');
    return burst;
  });
  const emission = { enabled: em.enabled !== false, rate: parseCurve(get(em, 'rate', ed.rate), 'emission.rate'), distance: parseCurve(get(em, 'distance', ed.distance), 'emission.distance'), bursts };
  if (curveBounds(emission.rate)[1] > PARTICLE_LIMITS.rate || curveBounds(emission.distance)[1] > PARTICLE_LIMITS.rate) refuse('emission rate');

  const st = only(s.start, 'start', ['lifetime', 'speed', 'size', 'sizeXYZ', 'rotation', 'rotationXYZ', 'color', 'gravity', 'flip']);
  const sd = EXPORT_DEFAULTS.start;
  if (Object.hasOwn(st, 'size') && Object.hasOwn(st, 'sizeXYZ')) refuse('start has size or sizeXYZ');
  if (Object.hasOwn(st, 'rotation') && Object.hasOwn(st, 'rotationXYZ')) refuse('start has rotation or rotationXYZ');
  const size1 = Object.hasOwn(st, 'sizeXYZ') ? null : parseCurve(get(st, 'size', sd.size), 'start.size');
  const start: ParticleSystemData['start'] = {
    lifetime: parseCurve(get(st, 'lifetime', sd.lifetime), 'start.lifetime'),
    speed: parseCurve(get(st, 'speed', sd.speed), 'start.speed'),
    size: size1 ? [size1, size1, size1] : curves3(st.sizeXYZ, 'start.sizeXYZ'),
    size3d: !size1,
    rotation: Object.hasOwn(st, 'rotationXYZ') ? curves3(st.rotationXYZ, 'start.rotationXYZ')
      : [constantCurve(0), constantCurve(0), parseCurve(get(st, 'rotation', sd.rotation), 'start.rotation')],
    rotation3d: Object.hasOwn(st, 'rotationXYZ'),
    color: parseColor(get(st, 'color', sd.color), 'start.color'),
    gravity: parseCurve(get(st, 'gravity', sd.gravity), 'start.gravity'),
    flip: float(get(st, 'flip', sd.flip), 'start.flip'),
  };

  const shape = Object.hasOwn(s, 'shape') ? parseShape(s.shape, counts.meshes) : null;

  let velocity: ParticleSystemData['velocity'] = null;
  if (Object.hasOwn(s, 'velocity')) {
    const v = only(s.velocity, 'velocity', ['linear', 'world', 'orbital', 'offset', 'radial', 'speedModifier']);
    const vd = EXPORT_DEFAULTS.velocity;
    if (Object.hasOwn(v, 'world') && v.world !== true) refuse('velocity.world is written only when true');
    velocity = {
      linear: curves3(get(v, 'linear', vd.linear), 'velocity.linear'), world: v.world === true, orbital: curves3(get(v, 'orbital', vd.orbital), 'velocity.orbital'),
      offset: curves3(get(v, 'offset', vd.offset), 'velocity.offset'), radial: parseCurve(get(v, 'radial', vd.radial), 'velocity.radial'),
      speedModifier: parseCurve(get(v, 'speedModifier', vd.speedModifier), 'velocity.speedModifier'),
    };
  }
  let limit: ParticleSystemData['limit'] = null;
  if (Object.hasOwn(s, 'limit')) {
    const l = only(s.limit, 'limit', ['magnitude', 'xyz', 'world', 'dampen'], ['dampen']);
    if (Object.hasOwn(l, 'magnitude') === Object.hasOwn(l, 'xyz')) refuse('limit has magnitude or xyz');
    if (Object.hasOwn(l, 'world') && !(l.world === true && Object.hasOwn(l, 'xyz'))) refuse('limit.world is written only when true, with xyz');
    limit = {
      magnitude: parseCurve(get(l, 'magnitude', 0), 'limit.magnitude'), xyz: Object.hasOwn(l, 'xyz') ? curves3(l.xyz, 'limit.xyz') : null,
      world: l.world === true, dampen: float(l.dampen, 'limit.dampen'),
    };
  }
  let force: ParticleSystemData['force'] = null;
  if (Object.hasOwn(s, 'force')) {
    const f = only(s.force, 'force', ['xyz', 'world'], ['xyz']);
    if (Object.hasOwn(f, 'world') && f.world !== true) refuse('force.world is written only when true');
    force = { xyz: curves3(f.xyz, 'force.xyz'), world: f.world === true };
  }
  let noise: ParticleSystemData['noise'] = null;
  if (Object.hasOwn(s, 'noise')) {
    const n = only(s.noise, 'noise', ['strength', 'strengthXYZ', 'frequency', 'damping', 'octaves', 'octaveMultiplier', 'octaveScale', 'quality', 'scroll', 'position', 'rotation', 'size']);
    const nd = EXPORT_DEFAULTS.noise;
    if (Object.hasOwn(n, 'strength') === Object.hasOwn(n, 'strengthXYZ')) refuse('noise has strength or strengthXYZ');
    // Noise that turns or scales particles (Unity's rotation and size amounts): not simulated, so never drawn
    // approximately. No exported system has either (census of the 88 models' 4,072 systems).
    if (Object.hasOwn(n, 'rotation') || Object.hasOwn(n, 'size')) refuse('noise rotation and size amounts (not simulated)');
    if (Object.hasOwn(n, 'damping') && n.damping !== false) refuse('noise.damping is written only when false');
    const octaves = get(n, 'octaves', nd.octaves);
    if (!Number.isSafeInteger(octaves) || (octaves as number) < 1 || (octaves as number) > 8) refuse('noise.octaves');
    const quality = get(n, 'quality', nd.quality);
    if (quality !== 'low' && quality !== 'medium' && quality !== 'high') refuse('noise.quality');
    const strength = Object.hasOwn(n, 'strengthXYZ') ? curves3(n.strengthXYZ, 'noise.strengthXYZ') : ((one) => [one, one, one] as Curve3)(parseCurve(n.strength, 'noise.strength'));
    noise = {
      strength, separate: Object.hasOwn(n, 'strengthXYZ'), frequency: float(get(n, 'frequency', nd.frequency), 'noise.frequency'), damping: n.damping !== false,
      octaves: octaves as number, octaveMultiplier: float(get(n, 'octaveMultiplier', nd.octaveMultiplier), 'noise.octaveMultiplier'),
      octaveScale: float(get(n, 'octaveScale', nd.octaveScale), 'noise.octaveScale'), quality: quality as 'low' | 'medium' | 'high',
      scroll: parseCurve(get(n, 'scroll', nd.scroll), 'noise.scroll'), position: parseCurve(get(n, 'position', nd.position), 'noise.position'),
    };
  }
  let inherit: ParticleSystemData['inherit'] = null;
  if (Object.hasOwn(s, 'inherit')) {
    const h = only(s.inherit, 'inherit', ['mode', 'curve'], ['curve']);
    if (Object.hasOwn(h, 'mode') && h.mode !== 'current') refuse('inherit.mode is written only as current');
    inherit = { mode: h.mode === 'current' ? 'current' : 'initial', curve: parseCurve(h.curve, 'inherit.curve') };
  }
  const axes = (key: 'size' | 'rotation') => {
    if (!Object.hasOwn(s, key)) return null;
    const m = s[key];
    if (!isObject(m) || Object.keys(m).length !== 1 || !(Object.hasOwn(m, 'curve') || Object.hasOwn(m, 'xyz'))) return refuse(`${key} is { curve } or { xyz }`);
    if (Object.hasOwn(m, 'xyz')) return { xyz: curves3(m.xyz, `${key}.xyz`), separate: true };
    const one = parseCurve(m.curve, `${key}.curve`);
    // Size: one curve for every axis; rotation: the curve turns z only (x and y read 0).
    return { xyz: (key === 'size' ? [one, one, one] : [constantCurve(0), constantCurve(0), one]) as Curve3, separate: false };
  };
  const size = axes('size'), rotation = axes('rotation');
  let color: ColorValue | null = null;
  if (Object.hasOwn(s, 'color')) color = parseColor(only(s.color, 'color', ['gradient'], ['gradient']).gradient, 'color.gradient');
  let sheet: ParticleSystemData['sheet'] = null;
  if (Object.hasOwn(s, 'sheet')) {
    const m = only(s.sheet, 'sheet', ['tiles', 'animation', 'row', 'frameOverTime', 'startFrame', 'cycles'], ['tiles', 'frameOverTime']);
    const tiles = m.tiles;
    if (!Array.isArray(tiles) || tiles.length !== 2 || !tiles.every((t) => Number.isSafeInteger(t) && t >= 1 && t <= 4096)) return refuse('sheet.tiles');
    if (Object.hasOwn(m, 'animation') && m.animation !== 'singleRow') refuse('sheet.animation is written only as singleRow');
    const singleRow = m.animation === 'singleRow';
    if (singleRow !== Object.hasOwn(m, 'row') || (Object.hasOwn(m, 'row') && !(m.row === 'random' || isIndex(m.row, tiles[1])))) refuse('sheet.row');
    sheet = {
      tiles: [tiles[0], tiles[1]], singleRow, row: singleRow ? (m.row as number | 'random') : 'random', frameOverTime: parseCurve(m.frameOverTime, 'sheet.frameOverTime'),
      startFrame: parseCurve(get(m, 'startFrame', EXPORT_DEFAULTS.sheet.startFrame), 'sheet.startFrame'), cycles: float(get(m, 'cycles', EXPORT_DEFAULTS.sheet.cycles), 'sheet.cycles'),
    };
  }
  let custom: ParticleSystemData['custom'] = null;
  if (Object.hasOwn(s, 'custom')) {
    const slots = s.custom;
    if (!Array.isArray(slots) || slots.length !== 2) return refuse('custom is [slot 1, slot 2]');
    const slot = (value: unknown, i: number): CustomSlot => {
      if (value === null) return null;
      if (isObject(value) && Object.keys(value).length === 1 && Array.isArray(value.vector) && value.vector.length >= 1 && value.vector.length <= 4) {
        const vector = value.vector.map((v, k) => parseCurve(v, `custom[${i}].vector[${k}]`));
        while (vector.length < 4) vector.push(constantCurve(0));
        return { kind: 'vector', vector, count: (value.vector as unknown[]).length };
      }
      if (isObject(value) && Object.keys(value).length === 1 && Object.hasOwn(value, 'color')) return { kind: 'color', color: parseColor(value.color, `custom[${i}].color`) };
      return refuse(`custom[${i}] is null, { vector } or { color }`);
    };
    custom = [slot(slots[0], 0), slot(slots[1], 1)];
  }
  const sub: ParticleSystemData['sub'] = [];
  if (Object.hasOwn(s, 'sub')) {
    if (!Array.isArray(s.sub) || !s.sub.length) return refuse('sub');
    for (const link of s.sub) {
      if (!Array.isArray(link) || link.length !== 3 || !isIndex(link[0], counts.systems) || (link[1] !== 'birth' && link[1] !== 'death') || !finite(link[2])) return refuse('sub link');
      sub.push([link[0], link[1], f32(link[2])]);
    }
  }
  if (Object.hasOwn(s, 'trail')) refuse('trail (not drawn yet)');

  let render: Render | null = null;
  let material: number | null = null;
  if (s.render === null) {
    if (s.material !== null) refuse('a system that draws nothing has no material');
  } else {
    const r = only(s.render, 'render', ['mode', 'align', 'pivot', 'sort', 'lengthScale', 'velocityScale', 'freeform', 'minSize', 'maxSize', 'meshes', 'allowRoll'], ['mode']);
    const rd = EXPORT_DEFAULTS.render;
    const mode = r.mode;
    if (mode !== 'billboard' && mode !== 'stretched' && mode !== 'mesh') return refuse('render.mode');
    const align = get(r, 'align', rd.align), sort = get(r, 'sort', rd.sort);
    if (!['view', 'world', 'local', 'facing', 'velocity'].includes(align as string)) refuse('render.align');
    if (!['none', 'distance', 'oldestInFront', 'youngestInFront', 'depth'].includes(sort as string)) refuse('render.sort');
    for (const key of ['lengthScale', 'velocityScale', 'freeform']) if (Object.hasOwn(r, key) && mode !== 'stretched') refuse(`render.${key} is for stretched particles`);
    if (Object.hasOwn(r, 'freeform') && r.freeform !== true) refuse('render.freeform is written only when true');
    if (Object.hasOwn(r, 'allowRoll') && r.allowRoll !== false) refuse('render.allowRoll is written only when false');
    if ((mode === 'mesh') !== Object.hasOwn(r, 'meshes')) refuse('render.meshes exactly for mesh particles');
    const meshes = (r.meshes ?? []) as unknown[];
    if (!Array.isArray(meshes) || meshes.length > 4 || (mode === 'mesh' && !meshes.length) || !meshes.every((m) => isIndex(m, counts.meshes.length) && counts.meshes[m] !== null)) {
      refuse('render.meshes');
    }
    render = {
      mode, align: align as Render['align'], pivot: vec3(get(r, 'pivot', rd.pivot), 'render.pivot'), sort: sort as Render['sort'],
      lengthScale: float(get(r, 'lengthScale', rd.lengthScale), 'render.lengthScale'), velocityScale: float(get(r, 'velocityScale', rd.velocityScale), 'render.velocityScale'),
      freeform: r.freeform === true, minSize: float(get(r, 'minSize', rd.minSize), 'render.minSize'), maxSize: float(get(r, 'maxSize', rd.maxSize), 'render.maxSize'),
      meshes: meshes as number[], allowRoll: r.allowRoll !== false,
    };
    if (!isIndex(s.material, counts.materials.length)) refuse('material is not in materials');
    if (!counts.materials[s.material as number]) refuse('its material was left out');
    material = s.material as number;
  }

  return {
    index, name: s.name, requires: requires as string[], only: s.only as ParticleAnimation | null, delay: s.delay as number, active, follow, child, emitter, timeline,
    clock, emission, start, shape, velocity, limit, force, noise, inherit, size, rotation, color, sheet, custom, sub, render, material,
  };
}

function parseMaterial(value: unknown, textures: number): ParticleMaterial {
  const m = only(value, 'material', ['blend', 'texture', 'color', 'shader', 'custom', 'cull'], ['blend', 'texture', 'color', 'shader', 'custom', 'cull']);
  if (m.blend !== 'alpha' && m.blend !== 'add') return refuse('material.blend');
  if (m.texture !== null && !isIndex(m.texture, textures)) refuse('material.texture');
  if (!Array.isArray(m.color) || m.color.length !== 4 || !m.color.every((c) => finite(c) && c >= 0)) return refuse('material.color');
  const shader = parseShader(m.shader, textures);
  if (!shader || shader.animated.length) return refuse('material.shader');
  let custom: CustomInput[] | null = null;
  if (m.custom !== null) {
    const cu = m.custom;
    if (!isObject(cu) || Object.keys(cu).length !== 1 || !Array.isArray(cu.inputs) || cu.inputs.length !== 8
      || !cu.inputs.every((source) => source === 0 || (typeof source === 'string' && INPUT.test(source)))) return refuse('material.custom');
    custom = (cu.inputs as CustomInput[]).slice();
  }
  if (m.cull !== 0 && m.cull !== 1 && m.cull !== 2) refuse('material.cull');
  return { blend: m.blend, texture: m.texture as number | null, color: [f32(m.color[0]), f32(m.color[1]), f32(m.color[2]), f32(m.color[3])], shader, custom, cull: m.cull as 0 | 1 | 2 };
}

function parseMesh(value: unknown): ParticleMesh {
  if (isObject(value) && Object.keys(value).length === 1 && value.builtin === 'quad') return { builtin: 'quad' };
  const m = only(value, 'mesh', ['vertices', 'uvs', 'colors', 'triangles', 'normals', 'areaCdf'], ['vertices', 'uvs', 'colors', 'triangles', 'normals', 'areaCdf']);
  const { vertices, uvs, colors, triangles, normals, areaCdf } = m;
  if (!Array.isArray(vertices) || !vertices.length || vertices.length % 3 || !vertices.every(finite)) return refuse('mesh.vertices');
  const count = vertices.length / 3;
  if (count > PARTICLE_LIMITS.vertices) refuse('mesh: too many vertices');
  if (!Array.isArray(uvs) || uvs.length !== count * 2 || !uvs.every(finite)) refuse('mesh.uvs');
  if (colors !== null && !(Array.isArray(colors) && colors.length === count * 4 && colors.every(finite))) refuse('mesh.colors');
  if (!Array.isArray(triangles) || !triangles.length || triangles.length % 3 || !triangles.every((t) => isIndex(t, count))) return refuse('mesh.triangles');
  if ((normals === null) !== (areaCdf === null)) refuse('mesh: normals and areaCdf come together');
  if (normals !== null && !(Array.isArray(normals) && normals.length === count * 3 && normals.every(finite))) refuse('mesh.normals');
  if (areaCdf !== null) {
    if (!Array.isArray(areaCdf) || areaCdf.length !== triangles.length / 3 || !areaCdf.every(finite) || areaCdf.some((v, i) => v < (i ? (areaCdf[i - 1] as number) : 0)) || areaCdf.at(-1) !== 1) {
      refuse('mesh.areaCdf');
    }
  }
  return {
    builtin: null, vertices: Float32Array.from(vertices as number[]), uvs: Float32Array.from(uvs as number[]), colors: colors === null ? null : Float32Array.from(colors as number[]),
    triangles: Uint16Array.from(triangles as number[]), normals: normals === null ? null : Float32Array.from(normals as number[]),
    areaCdf: areaCdf === null ? null : Float64Array.from(areaCdf as number[], f32),
  };
}

/** The systems tied to `start` by sub-emitter links, in either direction (start included); `adjacent` lists
 *  each system's parents and children. */
function linked(start: number, adjacent: readonly number[][]): Set<number> {
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    for (const n of adjacent[queue.pop()!]) if (!seen.has(n)) { seen.add(n); queue.push(n); }
  }
  return seen;
}

/**
 * A layerParticles.json as read from the network. `layerTextures` is how many textures layers.json lists
 * (`textures` and `effectTextures`): the particle textures are numbered on from there (layer<N>.webp), and a
 * material indexes all of them. Throws when the file as a whole is not one this reader knows; a system it does
 * not understand is left out (null) and listed in `skipped` with every system tied to it.
 */
export function parseParticleDocument(value: unknown, layerTextures: number): ParticleDocument {
  const fail = (why: string): never => { throw new Error(`Unsupported layerParticles.json: ${why}`); };
  if (!isObject(value) || value.version !== 1) return fail(`version ${String(isObject(value) ? value.version : value)}`);
  for (const key of Object.keys(value)) if (!['version', 'unit', 'camera', 'controller', 'textures', 'materials', 'meshes', 'systems', 'trails'].includes(key)) fail(`unknown member ${key}`);
  if (!(finite(value.unit) && value.unit > 0)) fail('unit');
  const camera = value.camera, controller = value.controller;
  if (!isObject(camera) || !finite(camera.size) || !finite(camera.height) || camera.size < 0 || camera.height < 0) fail('camera');
  if (!isObject(controller) || !Number.isSafeInteger(controller.fixFxDelay) || !Number.isSafeInteger(controller.animTimeFixed)) fail('controller');
  const { textures, materials, meshes, systems } = value;
  if (!Array.isArray(textures) || !Array.isArray(materials) || !Array.isArray(meshes) || !Array.isArray(systems)) return fail('textures, materials, meshes and systems');
  if (!Number.isSafeInteger(layerTextures) || layerTextures < 0) fail('layer textures');
  if (textures.length > PARTICLE_LIMITS.textures || systems.length > PARTICLE_LIMITS.systems || meshes.length > PARTICLE_LIMITS.meshes || materials.length > PARTICLE_LIMITS.materials) fail('limits');
  const parsedTextures = textures.map((texture, i): ParticleTexture => {
    if (!isObject(texture) || texture.file !== `layer${layerTextures + i}.webp` || !finite(texture.width) || !finite(texture.height) || !Array.isArray(texture.wrap)
      || texture.wrap.length !== 2 || !texture.wrap.every((w) => WRAP_MODES.has(w as string)) || !PHASES.has(texture.phase as string)) return fail(`textures[${i}]`);
    return { file: texture.file as string, width: texture.width as number, height: texture.height as number, wrap: [texture.wrap[0], texture.wrap[1]] as LayerTexture['wrap'],
      phase: texture.phase as ParticleTexture['phase'] };
  });
  const textureCount = layerTextures + parsedTextures.length;
  const attempt = <T>(fn: () => T): T | null => {
    try { return fn(); } catch (error) { if (error instanceof Refused) return null; throw error; }
  };
  const parsedMaterials = materials.map((m) => attempt(() => parseMaterial(m, textureCount)));
  const parsedMeshes = meshes.map((m) => attempt(() => parseMesh(m)));
  const counts = { systems: systems.length, materials: parsedMaterials, meshes: parsedMeshes };
  const parsed: (ParticleSystemData | null)[] = [];
  const why: (string | null)[] = [];
  for (let i = 0; i < systems.length; i++) {
    try {
      parsed.push(parseSystem(systems[i], i, counts));
      why.push(null);
    } catch (error) {
      if (!(error instanceof Refused)) throw error;
      parsed.push(null);
      why.push(error.message);
    }
  }
  // A system left out takes every system tied to it by sub-emitter links with it.
  const adjacent: number[][] = systems.map(() => []);
  systems.forEach((s, i) => {
    if (!isObject(s) || !Array.isArray(s.sub)) return;
    for (const link of s.sub) {
      if (Array.isArray(link) && isIndex(link[0], systems.length)) { adjacent[i].push(link[0] as number); adjacent[link[0] as number].push(i); }
    }
  });
  for (let i = 0; i < systems.length; i++) {
    if (why[i] === null || why[i]!.startsWith('tied to ')) continue;
    for (const j of linked(i, adjacent)) {
      if (j !== i && parsed[j]) { parsed[j] = null; why[j] = `tied to ${String((systems[i] as Record<string, unknown>)?.name ?? i)} (${why[i]})`; }
    }
  }
  const skipped = why.flatMap((w, i) => (w === null ? [] : [{ name: isObject(systems[i]) && typeof systems[i].name === 'string' ? systems[i].name as string : `systems[${i}]`, why: w }]));
  return {
    unit: value.unit as number, camera: { size: (camera as Record<string, number>).size, height: (camera as Record<string, number>).height },
    controller: { fixFxDelay: (controller as Record<string, number>).fixFxDelay, animTimeFixed: (controller as Record<string, number>).animTimeFixed },
    textures: parsedTextures, materials: parsedMaterials, meshes: parsedMeshes, systems: parsed, skipped,
  };
}

/** The file's text, size-checked before it is parsed (PARTICLE_LIMITS.bytes; the file is ASCII). */
export function parseParticleText(text: string, layerTextures: number): ParticleDocument {
  if (text.length > PARTICLE_LIMITS.bytes) throw new Error(`Unsupported layerParticles.json: ${text.length} bytes`);
  return parseParticleDocument(JSON.parse(text), layerTextures);
}

/* --- emitter timelines --------------------------------------------------------------------- */

/** A timeline's frame at time t into `out` (its width; out[0] the time): linear between frames, `active`
 *  stepped (the earlier frame's); after its length a looping one wraps to loopFrom, else holds its last frame
 *  (dynamicLayers.frameAt's rules). */
export function sampleLine(line: EmitterLine, width: number, t: number, out: Float64Array): void {
  const frames = line.frames, count = line.count;
  let time = Math.max(t, 0);
  if (line.loop && line.length > line.loopFrom && time > line.length) time = line.loopFrom + ((time - line.loopFrom) % (line.length - line.loopFrom));
  const copy = (k: number) => { for (let j = 0; j < width; j++) out[j] = frames[k * width + j]; };
  if (count === 1 || time <= frames[0]) return copy(0);
  if (time >= frames[(count - 1) * width]) return copy(count - 1);
  let lo = 0, hi = count - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (frames[mid * width] <= time) lo = mid; else hi = mid;
  }
  const a = lo * width, b = hi * width;
  const k = (time - frames[a]) / (frames[b] - frames[a]);
  for (let j = 0; j < width; j++) out[j] = j === ACTIVE_COLUMN ? frames[a + j] : frames[a + j] + (frames[b + j] - frames[a + j]) * k;
}
