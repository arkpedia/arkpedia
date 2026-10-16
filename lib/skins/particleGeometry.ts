/*
 * The particle systems' geometry: each live particle of a system (lib/skins/particleSim.ts) expanded on the CPU
 * into the vertices the renderer draws (components/skins/particleRenderer.ts), in skeleton units, the canvas's
 * space. Pure TypeScript, no WebGL: scripts/tests/test-particle-render.ts matches it vertex for vertex against
 * golden dumps a Python expansion of the reference simulator wrote (scripts/particles/make-vertex-golden.py).
 *
 * A particle's position goes through the emitter's whole 3x4 matrix (a local-space system's; a world-space
 * one's particles are in the root already), then the game's orthographic camera drops z: x and y over `unit`
 * are skeleton units. Its quad or mesh is built around it in the root's Unity units (UNITY-PARTICLES section 8):
 * - billboard: `view`, `facing` and `world` face the screen (the camera looks down the root's +Z); `local` lies
 *   in the emitter's XY plane, foreshortened where the emitter turns in depth; `velocity` faces along the
 *   particle's velocity (Unity's LookRotation). The quad is size x the scale on sizes, offset by the pivot and
 *   turned by the particle's rotation (3D rotation: Euler, Z then X then Y), capped at maxSize x the camera's
 *   height (the game's camera, never the site's zoom);
 * - stretched: a screen-facing quad along the screen-space velocity, length = size x lengthScale + speed x
 *   velocityScale (negative flips it), width = size, the texture's U along it from the front;
 * - mesh: the mesh's vertices x size (3D), turned by the particle's rotation, then by the alignment (`local`:
 *   the emitter's rotation; `view`, `facing`, `world`: none; `velocity`: LookRotation), its UVs remapped into the
 *   texture sheet's frame, its vertex colours times the particle's.
 * Where Unity's convention is not public (the rotation and pivot signs, the stretched axis and anchor, the size
 * cap's basis) it is a named member of ParticleConventions, settled against the recording in P6 (one place each).
 *
 * Vertex formats: lean (20 bytes: x, y, u, v as float32, colour as 4 bytes) and custom (52 bytes: lean plus the
 * 8 custom inputs a _HGCUSTOMVERTEXSTREAM_ON shader reads, float32). Quads are 4 vertices (bottom-left,
 * bottom-right, top-left, top-right; Unity's v-up UVs) drawn with QUAD_INDICES; meshes carry their own indices.
 */
import { followParts, type CustomFeature, type FollowedBone, type LayerFollow } from './dynamicLayers';
import type { CustomInput, ParticleMaterial, ParticleMesh, ParticleSystemData } from './particleData';
import type { ParticleSim, Placement } from './particleSim';

/**
 * Where a bone follower puts a particle system now (particleSim's Placement), in the root's Unity units: the
 * follower's frame as a layer's (`parent x R x scale`, then the bone's position; layers.json's `parent` maps
 * follower units to skeleton units, `unit` skeleton units to Unity's). As layerParticles.json says: the emitter's
 * origin goes through that whole placement; its linear part too under Hierarchy and Shape scaling, but only
 * through the follower's turn under Local scaling (Unity's Local ignores every parent's scale); the scale on sizes
 * stays the root's, times the bone's own under Hierarchy with `localScale`. The turn is the parent's and the
 * follower's about Z (a follower lives in the skeleton's plane).
 */
export function followPlacement(follow: LayerFollow, bone: FollowedBone, unit: number, scaling: ParticleSystemData['clock']['scaling']): Placement {
  const { rotation, sx, sy, x, y } = followParts(follow, bone);
  const r = (rotation * Math.PI) / 180, cos = Math.cos(r), sin = Math.sin(r);
  const [pa, pb, pc, pd] = follow.parent;
  const ra = cos * sx, rb = -sin * sy, rc = sin * sx, rd = cos * sy;
  const whole = [unit * (pa * ra + pb * rc), unit * (pa * rb + pb * rd), 0, unit * x, unit * (pc * ra + pd * rc), unit * (pc * rb + pd * rd), 0, unit * y, 0, 0, 1, 0];
  const turn = Math.atan2(pc, pa) + r;
  const rotationQ = [0, 0, Math.sin(turn / 2), Math.cos(turn / 2)];
  if (scaling === 'local') {
    const c = Math.cos(turn), s = Math.sin(turn);
    return { matrix: [c, -s, 0, unit * x, s, c, 0, unit * y, 0, 0, 1, 0], rotation: rotationQ, scale: [1, 1, 1], origin: whole };
  }
  return { matrix: whole, rotation: rotationQ, scale: scaling === 'hierarchy' && follow.localScale ? [sx, sy, 1] : [1, 1, 1], origin: null };
}

/**
 * Which custom layout a material's shader reads (dynamicLayers.CustomFeature). layerParticles.json does not name
 * the shader: a material with a distortion or a ramp is the Disturb family's (Dissolve(CustomData) has neither);
 * one with neither is read as Dissolve(CustomData). The two differ only in input 5 (the distortion intensities, or
 * the border width) and the noise UV (6, 7), and on such a material none of them can move anything in the
 * Disturb family: there is no distortion. Input 5 is driven on none of the 147 such materials in the 88 models'
 * export (scripts/tests/test-particle-render.ts checks it on every export it is given).
 */
export function customFeature(material: Pick<ParticleMaterial, 'custom' | 'shader'>): CustomFeature {
  if (!material.custom) return 'none';
  const shader = material.shader;
  return shader.family === 'particle' && (shader.distort || shader.ramp) ? 'disturb' : 'dissolve';
}

/** Unity's conventions where they are inferred (UNITY-PARTICLES section 8): each a switch P6 settles. */
export interface ParticleConventions {
  /** A billboard's on-screen turn per radian of rotation: -1 clockwise, 1 anticlockwise. */
  billboardRotation: -1 | 1;
  /** A mesh particle's z rotation: 1 as a Transform's (anticlockwise on screen), -1 clockwise. */
  meshRotation: -1 | 1;
  /** The quad offset by pivot x size: 1 corner + pivot (the quad moves towards its pivot), -1 corner - pivot. */
  pivot: -1 | 1;
  /** Stretched: the texture's U along the stretch ('u') or its V ('v'). */
  stretchAxis: 'u' | 'v';
  /** Stretched: the texture's stretched axis (+U under 'u') and the pivot's along component point along the motion (1)
   *  or against it (-1: the texture's U = 0 edge leads). */
  stretchSense: -1 | 1;
  /** Stretched: the particle at the quad's centre ('centre', then shifted by the pivot) or at its front ('head': the quad trails behind). */
  stretchAnchor: 'centre' | 'head';
  /** Stretched: which pivot component moves the quad along the stretch ('x' or 'y'); the other moves it across. */
  stretchPivotAlong: 'x' | 'y';
  /** maxSize and minSize are fractions of the game camera's height ('camera') or of the view the site shows ('view'). */
  sizeCapBasis: 'camera' | 'view';
}

/**
 * The conventions the site draws with (the golden fixture records the ones it was made with; the test compares),
 * settled in P6 against the user's recordings of the game (Hoshiguma rec1 and rec2, Lin rec3):
 * - billboardRotation -1: Hoshiguma's X8 crossed flares (Local, a -122 degree emitter, a positive spin) show their
 *   arms at 48 and 138 degrees in rec2, turned clockwise from 58 / 148; anticlockwise would put them at 62 / 152;
 * - pivot 1: X3's flare (pivot x -0.02 of 25 units) is centred 0.5 units left of its emitter in rec1 and rec2,
 *   within 15 px of the render where corner - pivot is 90 px off;
 * - stretchAxis 'u', stretchSense -1: Lin's fish (drawn head left, U = 0) swim lengthwise and head first (rec3);
 * - stretchPivotAlong 'y': X6's sparks (pivot y -0.7, lengthScale -2) trail their particles out of the chest flash
 *   in rec1; with the pivot's y across, they run as lines beside the flash;
 * - stretchAnchor 'centre': inferred (Unity documents the pivot about the quad's centre), not contradicted;
 * - meshRotation 1: inferred, unverified (no recorded mesh particle turns visibly: flow_01 is a ring under the cut-in);
 * - sizeCapBasis 'camera': inferred, unverified (no recorded billboard reaches its cap); kept configurable.
 */
export const PARTICLE_CONVENTIONS: Readonly<ParticleConventions> = Object.freeze({
  billboardRotation: -1, meshRotation: 1, pivot: 1, stretchAxis: 'u', stretchSense: -1, stretchAnchor: 'centre', stretchPivotAlong: 'y', sizeCapBasis: 'camera',
});

/** A built-in quad's corners in draw order and their UVs (Unity's v up). */
const CORNERS = [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]] as const;
const CORNER_UV = [[0, 0], [1, 0], [0, 1], [1, 1]] as const;
/** Unity's built-in Quad: its two triangles wind clockwise on screen (Unity's front faces). */
export const QUAD_TRIANGLES = [0, 3, 1, 3, 0, 2] as const;
/** The most quads one 16-bit index buffer reaches (4 vertices each, below 65,536). */
export const MAX_QUADS = 16383;
/** Vertices one draw may index (16-bit indices). */
export const MAX_VERTICES = 65535;

/** The static index buffer of MAX_QUADS quads. */
export function quadIndices(): Uint16Array {
  const out = new Uint16Array(MAX_QUADS * 6);
  for (let q = 0; q < MAX_QUADS; q++) for (let k = 0; k < 6; k++) out[q * 6 + k] = q * 4 + QUAD_TRIANGLES[k];
  return out;
}

/** Floats per vertex: x, y, u, v, colour (4 bytes in one float's place) [, 8 custom inputs]. */
export const LEAN_FLOATS = 5;
export const CUSTOM_FLOATS = 13;

/** A growing interleaved vertex array of one format, and its indices (mesh particles' own; quads use quadIndices). */
export class VertexArray {
  readonly stride: number;
  f32: Float32Array;
  u8: Uint8Array;
  u32: Uint32Array;
  /** Vertices written. */
  count = 0;
  /** Mesh particles' indices, relative to the first vertex of the expandSystem call that wrote them (32-bit here:
   *  the renderer rebases them to each draw's first vertex in 16 bits). */
  indices: Uint32Array;
  indexCount = 0;
  /** Mesh particles: where each particle's vertices and indices end ([vertices, indices, ...]), so a draw too big
   *  for 16-bit indices splits between particles. */
  readonly ends: number[] = [];
  constructor(custom: boolean, vertices = 1024, indices = 1024) {
    this.stride = custom ? CUSTOM_FLOATS : LEAN_FLOATS;
    this.f32 = new Float32Array(vertices * this.stride);
    this.u8 = new Uint8Array(this.f32.buffer);
    this.u32 = new Uint32Array(this.f32.buffer);
    this.indices = new Uint32Array(indices);
  }
  /** Room for `vertices` more vertices and `indices` more indices. */
  reserve(vertices: number, indices = 0): void {
    const need = (this.count + vertices) * this.stride;
    if (need > this.f32.length) {
      const next = new Float32Array(Math.max(need, this.f32.length * 2));
      next.set(this.f32.subarray(0, this.count * this.stride));
      this.f32 = next;
      this.u8 = new Uint8Array(next.buffer);
      this.u32 = new Uint32Array(next.buffer);
    }
    if (this.indexCount + indices > this.indices.length) {
      const next = new Uint32Array(Math.max(this.indexCount + indices, this.indices.length * 2));
      next.set(this.indices.subarray(0, this.indexCount));
      this.indices = next;
    }
  }
  reset(): void {
    this.count = 0;
    this.indexCount = 0;
    this.ends.length = 0;
  }
  /** Bytes per vertex. */
  get bytes(): number {
    return this.stride * 4;
  }
}

/** What expanding one system needs besides its simulation. */
export interface ExpandContext {
  /** Unity units per skeleton unit (layerParticles.json `unit`). */
  unit: number;
  /** The game camera's full height in skeleton units (`camera.height`): the size cap's basis. */
  cameraHeight: number;
  /** The height the site's view shows, skeleton units (the 'view' cap basis only). */
  viewHeight: number;
  conventions: Readonly<ParticleConventions>;
  /** 0..1, times every vertex's alpha (particles fading in after a late load). */
  fade: number;
}

/** One system at the display time. */
export interface SystemFrame {
  data: ParticleSystemData;
  sim: ParticleSim;
  /** Its emitter (3x4, row-major, root Unity units) at the display time. */
  matrix: ArrayLike<number>;
  /** The scale on particle sizes. */
  scale: ArrayLike<number>;
  /** Where the display is between the previous step and the last (0..1): positions are drawn between them. */
  alpha: number;
  /** Its render meshes (mesh particles), resolved: 'quad' for Unity's built-in one. */
  meshes: readonly (Extract<ParticleMesh, { builtin: null }> | 'quad')[];
  /** The material's 8 custom input sources, or null (lean vertices). */
  inputs: readonly CustomInput[] | null;
}

/** The 3x4 between two (row-major), by k. */
export function lerpMatrix(a: ArrayLike<number>, b: ArrayLike<number>, k: number, out: Float64Array): Float64Array {
  for (let i = 0; i < 12; i++) out[i] = a[i] + (b[i] - a[i]) * k;
  return out;
}

/** Which particles to draw, back to front (render.sort): None and YoungestInFront oldest first, OldestInFront the
 *  reverse, Distance and Depth farther first (larger root z: the camera looks down +Z), ties oldest first. `z`:
 *  each particle's root z at `stride`. */
export function drawOrder(sort: NonNullable<ParticleSystemData['render']>['sort'], count: number, z: ArrayLike<number>, stride: number, out: number[]): number[] {
  out.length = count;
  if (sort === 'oldestInFront') {
    for (let i = 0; i < count; i++) out[i] = count - 1 - i;
    return out;
  }
  for (let i = 0; i < count; i++) out[i] = i;
  if (sort === 'distance' || sort === 'depth') out.sort((a, b) => z[b * stride] - z[a * stride] || a - b);
  return out;
}

/** The next texture-sheet frame's index (the UV2 stream): one on, wrapping in its row (SingleRow) or the sheet. */
export function nextFrame(sheet: NonNullable<ParticleSystemData['sheet']>, index: number): number {
  const tx = Math.max(1, sheet.tiles[0]), ty = Math.max(1, sheet.tiles[1]);
  if (sheet.singleRow) {
    const row = Math.floor(index / tx);
    return row * tx + ((index - row * tx + 1) % tx);
  }
  return (index + 1) % (tx * ty);
}

/** A sheet frame's UV rect [u0, v0, u1, v1] (Unity's v up; frame 0 the top-left tile), into out at `at`. */
export function frameRect(sheet: NonNullable<ParticleSystemData['sheet']>, index: number, out: Float64Array, at: number): void {
  const tx = Math.max(1, sheet.tiles[0]), ty = Math.max(1, sheet.tiles[1]);
  const col = index % tx, row = Math.floor(index / tx);
  const v1 = 1 - row / ty;
  out[at] = col / tx; out[at + 1] = v1 - 1 / ty; out[at + 2] = (col + 1) / tx; out[at + 3] = v1;
}

/** Rotation matrix (row-major 3x3) of Euler angles in radians, Z then X then Y (Quaternion.Euler: Ry Rx Rz). */
export function eulerMatrix(x: number, y: number, z: number, out: Float64Array): Float64Array {
  const cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y), cz = Math.cos(z), sz = Math.sin(z);
  // Ry * Rx * Rz
  out[0] = cy * cz + sy * sx * sz; out[1] = -cy * sz + sy * sx * cz; out[2] = sy * cx;
  out[3] = cx * sz; out[4] = cx * cz; out[5] = -sx;
  out[6] = -sy * cz + cy * sx * sz; out[7] = sy * sz + cy * sx * cz; out[8] = cy * cx;
  return out;
}

/** The rotation (row-major 3x3) whose z axis is `forward` and whose y axis is nearest the root's up (LookRotation),
 *  into out; false (out untouched) for a forward too short to aim by. */
export function lookRotation(fx: number, fy: number, fz: number, out: Float64Array): boolean {
  const n = Math.hypot(fx, fy, fz);
  if (n < 1e-9) return false;
  const zx = fx / n, zy = fy / n, zz = fz / n;
  // right = up x forward (Unity's), up = (0, 1, 0); along up itself: right = (1, 0, 0).
  let rx = zz, ry = 0, rz = -zx;
  const r = Math.hypot(rx, ry, rz);
  if (r < 1e-9) { rx = 1; ry = 0; rz = 0; } else { rx /= r; ry /= r; rz /= r; }
  // up' = forward x right
  const ux = zy * rz - zz * ry, uy = zz * rx - zx * rz, uz = zx * ry - zy * rx;
  out[0] = rx; out[1] = ux; out[2] = zx;
  out[3] = ry; out[4] = uy; out[5] = zy;
  out[6] = rz; out[7] = uz; out[8] = zz;
  return true;
}

/** The emitter's axes with its scale taken out (row-major 3x3, columns normalized; a mirrored axis keeps its sign). */
function emitterAxes(m: ArrayLike<number>, out: Float64Array): Float64Array {
  for (let c = 0; c < 3; c++) {
    const x = m[c], y = m[4 + c], z = m[8 + c];
    const n = Math.hypot(x, y, z);
    const k = n > 1e-12 ? 1 / n : 0;
    out[c] = x * k; out[3 + c] = y * k; out[6 + c] = z * k;
  }
  if (out[0] === 0 && out[3] === 0 && out[6] === 0) out[0] = 1;
  if (out[1] === 0 && out[4] === 0 && out[7] === 0) out[4] = 1;
  if (out[2] === 0 && out[5] === 0 && out[8] === 0) out[8] = 1;
  return out;
}

/** a x b, both row-major 3x3, into out. */
function mul3(a: ArrayLike<number>, b: ArrayLike<number>, out: Float64Array): Float64Array {
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) out[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  }
  return out;
}

const attributes = new Float64Array(20);
const rects = new Float64Array(8);
const axes = new Float64Array(9);
const turn = new Float64Array(9);
const frame3 = new Float64Array(9);
const look = new Float64Array(9);
const inputs = new Float32Array(8);
// Encode custom stream sources once per system expansion, then copy the particle's common
// values to each vertex. Only UV sources need per-vertex substitution.
const uvInputs = new Int8Array(8);
const LITTLE_ENDIAN = new Uint8Array(Uint32Array.of(1).buffer)[0] === 1;
function packedColor(r: number, g: number, b: number, a: number): number {
  return LITTLE_ENDIAN ? (r | (g << 8) | (b << 16) | (a << 24)) : ((r << 24) | (g << 16) | (b << 8) | a);
}
const order: number[] = [];
let positions = new Float64Array(0);

/** A colour channel as a byte (Color32: clamped, rounded). */
const byte = (x: number) => Math.round(Math.min(Math.max(x, 0), 1) * 255);

/**
 * Appends one system's live particles to `out` (vertices in draw order, back to front; a mesh system's indices
 * too) and returns how many vertices it wrote. Quads (billboards, stretched) are 4 vertices each for quadIndices();
 * a mesh system's indices are relative to the first vertex this call wrote, and `out.ends` marks each particle.
 */
export function expandSystem(system: SystemFrame, ctx: ExpandContext, out: VertexArray): number {
  const { data, sim, matrix: m, scale, alpha } = system;
  const render = data.render;
  const n = sim.count;
  if (!render || !n) return 0;
  const conv = ctx.conventions;
  const unit = ctx.unit;
  const local = data.clock.space === 'local';
  const custom = system.inputs !== null;
  if (custom !== (out.stride === CUSTOM_FLOATS)) throw new Error('vertex format does not match the material');
  // Positions at the display time, in the root (Unity units): between the last two steps.
  if (positions.length < n * 3) positions = new Float64Array(n * 6);
  const { px, py, pz, qx, qy, qz } = sim;
  for (let i = 0; i < n; i++) {
    const x = qx[i] + (px[i] - qx[i]) * alpha, y = qy[i] + (py[i] - qy[i]) * alpha, z = qz[i] + (pz[i] - qz[i]) * alpha;
    if (local) {
      positions[i * 3] = m[0] * x + m[1] * y + m[2] * z + m[3];
      positions[i * 3 + 1] = m[4] * x + m[5] * y + m[6] * z + m[7];
      positions[i * 3 + 2] = m[8] * x + m[9] * y + m[10] * z + m[11];
    } else {
      positions[i * 3] = x; positions[i * 3 + 1] = y; positions[i * 3 + 2] = z;
    }
  }
  const drawn = drawOrder(render.sort, n, positions.subarray(2), 3, order);
  emitterAxes(m, axes);
  // The scale on sizes, unsigned: an emitter that mirrors turns its particles over through its axes (Local
  // alignment, meshes), never twice.
  const sx0 = Math.abs(scale[0]), sy0 = Math.abs(scale[1]), sz0 = Math.abs(scale[2]);
  const capBasis = conv.sizeCapBasis === 'camera' ? ctx.cameraHeight : ctx.viewHeight;
  const capped = render.mode === 'billboard';
  const maxSize = render.maxSize * capBasis * unit, minSize = render.minSize * capBasis * unit;
  const [pivotX, pivotY, pivotZ] = render.pivot;
  const pivotSign = conv.pivot;
  const sheet = data.sheet;
  const mesh = render.mode === 'mesh';
  const first = out.count;
  const stride = out.stride;
  const fade = ctx.fade;
  const inv = 1 / unit;
  if (custom) for (let j = 0; j < 8; j++) {
    const source = system.inputs![j];
    uvInputs[j] = source !== 0 && source[0] === 'u' ? (source[2] === '2' ? 2 : 0) + (source[source.length - 1] === 'x' ? 0 : 1) : -1;
  }
  if (!mesh) out.reserve(n * 4);
  for (let k = 0; k < drawn.length; k++) {
    const i = drawn[k];
    sim.attributes(i, attributes, custom);
    const cx = positions[i * 3], cy = positions[i * 3 + 1];
    // Size on each axis, Unity units: the particle's times the scale on sizes.
    let sx = attributes[0] * sx0, sy = attributes[1] * sy0, sz = attributes[2] * sz0;
    if (capped) {
      const big = Math.max(Math.abs(sx), Math.abs(sy));
      if (big > maxSize && big > 0) { const f = maxSize / big; sx *= f; sy *= f; sz *= f; }
      const small = Math.min(Math.abs(sx), Math.abs(sy));
      if (small < minSize && small > 0) { const f = minSize / small; sx *= f; sy *= f; sz *= f; }
    }
    const r = byte(attributes[3]), g = byte(attributes[4]), b = byte(attributes[5]);
    const a = attributes[6] * fade;
    const color = packedColor(r, g, b, byte(a));
    // The frame's UV rect, and the next frame's (UV2).
    rects[0] = attributes[8]; rects[1] = attributes[9]; rects[2] = attributes[10]; rects[3] = attributes[11];
    if (sheet && attributes[7] >= 0) frameRect(sheet, nextFrame(sheet, attributes[7]), rects, 4);
    else { rects[4] = rects[0]; rects[5] = rects[1]; rects[6] = rects[2]; rects[7] = rects[3]; }
    if (custom) {
      const src = system.inputs!;
      for (let j = 0; j < 8; j++) {
        const s = src[j];
        inputs[j] = s === 0 ? 0 : s[0] === 'c' ? attributes[12 + (s[1] === '1' ? 0 : 4) + 'xyzw'.indexOf(s[3])] : NaN; // uv sources: per vertex, below
      }
    }
    const rx = sim.rx[i], ry = sim.ry[i], rz = sim.rz[i];
    if (mesh) {
      const meshes = system.meshes;
      const chosen = meshes[meshes.length > 1 ? sim.seeds[i] % meshes.length : 0];
      // The particle's turn: Euler (3D rotation) or z alone, then the alignment's.
      const zTurn = conv.meshRotation * rz;
      if (data.start.rotation3d) eulerMatrix(rx, ry, zTurn, turn); else eulerMatrix(0, 0, zTurn, turn);
      const align = render.align;
      if (align === 'local') mul3(axes, turn, frame3);
      else if (align === 'velocity' && velocityFrame(sim, i, local, m, look)) mul3(look, turn, frame3);
      else frame3.set(turn);
      const verts = chosen === 'quad' ? null : chosen;
      const count = verts ? verts.vertices.length / 3 : 4;
      const tris = verts ? verts.triangles : QUAD_TRIANGLES;
      out.reserve(count, tris.length);
      const base = out.count - first;
      for (let v = 0; v < count; v++) {
        const mx = (verts ? verts.vertices[v * 3] : CORNERS[v][0]) + pivotSign * pivotX;
        const my = (verts ? verts.vertices[v * 3 + 1] : CORNERS[v][1]) + pivotSign * pivotY;
        const mz = (verts ? verts.vertices[v * 3 + 2] : 0) + pivotSign * pivotZ;
        const lx = mx * sx, ly = my * sy, lz = mz * sz;
        const x = cx + frame3[0] * lx + frame3[1] * ly + frame3[2] * lz;
        const y = cy + frame3[3] * lx + frame3[4] * ly + frame3[5] * lz;
        const mu = verts ? verts.uvs[v * 2] : CORNER_UV[v][0], mv = verts ? verts.uvs[v * 2 + 1] : CORNER_UV[v][1];
        const colors = verts?.colors;
        writeVertex(out, stride, x * inv, y * inv, mu, mv, colors ? packedColor(byte(attributes[3] * colors[v * 4]), byte(attributes[4] * colors[v * 4 + 1]),
          byte(attributes[5] * colors[v * 4 + 2]), byte(a * colors[v * 4 + 3])) : color, custom);
      }
      for (let t = 0; t < tris.length; t++) out.indices[out.indexCount++] = base + tris[t];
      out.ends.push(out.count, out.indexCount);
      continue;
    }
    if (render.mode === 'stretched') {
      // Along the screen-space velocity; the speed is the root's, in Unity units.
      let vx = sim.vx[i] + sim.ax[i], vy = sim.vy[i] + sim.ay[i], vz = sim.vz[i] + sim.az[i];
      if (local) {
        const wx = m[0] * vx + m[1] * vy + m[2] * vz, wy = m[4] * vx + m[5] * vy + m[6] * vz, wz = m[8] * vx + m[9] * vy + m[10] * vz;
        vx = wx; vy = wy; vz = wz;
      }
      const speed = Math.hypot(vx, vy, vz), flat = Math.hypot(vx, vy);
      const dx = flat > 1e-6 ? vx / flat : 0, dy = flat > 1e-6 ? vy / flat : 1;
      const length = sy * render.lengthScale + speed * render.velocityScale, width = sx;
      // 'head': the quad shifted half a length back along the motion, the particle at its front.
      const head = conv.stretchAnchor === 'head' ? -0.5 * length : 0;
      // Which pivot component moves the quad along the stretch (the other moves it across).
      const pivotAlong = conv.stretchPivotAlong === 'x' ? pivotX : pivotY, pivotAcross = conv.stretchPivotAlong === 'x' ? pivotY : pivotX;
      // e: where the texture's stretched axis and the pivot's along component point (the motion, or against it);
      // the other axis is a quarter turn from it (the quad turned, never mirrored).
      const ex = dx * conv.stretchSense, ey = dy * conv.stretchSense;
      for (let c = 0; c < 4; c++) {
        const [kx, ky] = CORNERS[c];
        let along: number, across: number, nx: number, ny: number;
        if (conv.stretchAxis === 'u') {
          along = (kx + pivotSign * pivotAlong) * length; across = (ky + pivotSign * pivotAcross) * width; nx = -ey; ny = ex;
        } else {
          along = (ky + pivotSign * pivotAlong) * length; across = (kx + pivotSign * pivotAcross) * width; nx = ey; ny = -ex;
        }
        writeQuadCorner(out, stride, (cx + ex * along + dx * head + nx * across) * inv, (cy + ey * along + dy * head + ny * across) * inv, c, color, custom);
      }
      continue;
    }
    // Billboards: the corner offset by the pivot, scaled, turned by the particle's rotation, then aligned.
    const zTurn = conv.billboardRotation * rz;
    const align = render.align;
    let frame: Float64Array | null = null;
    if (align === 'local') frame = axes;
    else if (align === 'velocity' && velocityFrame(sim, i, local, m, look)) frame = look;
    if (data.start.rotation3d) {
      eulerMatrix(rx, ry, zTurn, turn);
      if (frame) mul3(frame, turn, frame3); else frame3.set(turn);
      frame = frame3;
    }
    const cos = Math.cos(zTurn), sin = Math.sin(zTurn);
    for (let c = 0; c < 4; c++) {
      const lx = (CORNERS[c][0] + pivotSign * pivotX) * sx, ly = (CORNERS[c][1] + pivotSign * pivotY) * sy;
      let x: number, y: number;
      if (data.start.rotation3d) {
        x = cx + frame![0] * lx + frame![1] * ly; y = cy + frame![3] * lx + frame![4] * ly;
      } else {
        const tx = lx * cos - ly * sin, ty = lx * sin + ly * cos;
        if (frame) { x = cx + frame[0] * tx + frame[1] * ty; y = cy + frame[3] * tx + frame[4] * ty; } else { x = cx + tx; y = cy + ty; }
      }
      writeQuadCorner(out, stride, x * inv, y * inv, c, color, custom);
    }
  }
  return out.count - first;

  /** One vertex: position, UV, colour, the custom inputs (a uv source reads this vertex's own UV or UV2). */
  function writeVertex(o: VertexArray, s: number, x: number, y: number, u0: number, v0: number, color: number, withCustom: boolean): void {
    // The UV within the frame: a mesh's own UV remapped into the sheet's rect.
    const u = rects[0] + u0 * (rects[2] - rects[0]), v = rects[1] + v0 * (rects[3] - rects[1]);
    const at = o.count * s;
    o.f32[at] = x; o.f32[at + 1] = y; o.f32[at + 2] = u; o.f32[at + 3] = v;
    o.u32[at + 4] = color;
    if (withCustom) {
      for (let j = 0; j < 8; j++) {
        const source = uvInputs[j];
        o.f32[at + 5 + j] = source < 0 ? inputs[j] : source === 0 ? u : source === 1 ? v : source === 2 ? rects[4] + u0 * (rects[6] - rects[4]) : rects[5] + v0 * (rects[7] - rects[5]);
      }
    }
    o.count++;
  }

  function writeQuadCorner(o: VertexArray, s: number, x: number, y: number, c: number, color: number, withCustom: boolean): void {
    writeVertex(o, s, x, y, CORNER_UV[c][0], CORNER_UV[c][1], color, withCustom);
  }
}

/** A particle's LookRotation along its velocity in the root (Velocity alignment), into out; false when it barely moves. */
function velocityFrame(sim: ParticleSim, i: number, local: boolean, m: ArrayLike<number>, out: Float64Array): boolean {
  let vx = sim.vx[i] + sim.ax[i], vy = sim.vy[i] + sim.ay[i], vz = sim.vz[i] + sim.az[i];
  if (local) {
    const wx = m[0] * vx + m[1] * vy + m[2] * vz, wy = m[4] * vx + m[5] * vy + m[6] * vz, wz = m[8] * vx + m[9] * vy + m[10] * vz;
    vx = wx; vy = wy; vz = wz;
  }
  return lookRotation(vx, vy, vz, out);
}

/** Whether a system's mesh faces turn over on screen (its emitter mirrors them): its culling then swaps sides, as
 *  Unity's does for a mirrored transform. */
export function mirrored(matrix: ArrayLike<number>, scale: ArrayLike<number>): boolean {
  const m = matrix;
  const det = m[0] * (m[5] * m[10] - m[6] * m[9]) - m[1] * (m[4] * m[10] - m[6] * m[8]) + m[2] * (m[4] * m[9] - m[5] * m[8]);
  return det * Math.sign(scale[0] * scale[1] * scale[2] || 1) < 0;
}

