/** Original Unity UI curves and GLES3 programs, in a reviewed data-only scene. */
import { fetchAsset } from '../assets/githubRetry.mjs';

type Vec = number[];
type Key = [number, number, number | null, number | null, number, number, number];
type ImageData = {
  texture: number | null; rect: { x: number; y: number; width: number; height: number };
  offset: { x: number; y: number }; spriteSize: Vec; border: Vec; color: Vec;
  material: number | null; type: number; preserveAspect: boolean;
  fill: number; fillMethod: number; clockwise: boolean; origin: number; arc?: Vec; rotated?: boolean; uvRect?: Vec;
};
type Node = { name: string; parent: number | null; active: boolean; alpha: number; position: Vec;
  z: number; size: Vec; pivot: Vec; anchorMin: Vec; anchorMax: Vec; scale: Vec; rotation: Vec; euler?: Vec; localPosition?: Vec; image?: ImageData; uniforms?: Record<string, number | Vec>; rectMask?: boolean; maskSoftness?: Vec; maskPadding?: Vec; ignoreParentAlpha?: boolean;
  stencil?: { compare: number; operation: number; readMask: number; writeMask: number; colorMask: number } };
type Shader = { name: string; vertex: string; fragment: string; defaults: Record<string, Vec>;
  samplers: Record<string, string>; blend: { val: number; name: string }[] };
type Material = { name: string; shader: number; values: Record<string, number | Vec>; textures: Record<string, number | null> };
export type GameUiScene = { schemaVersion: 1; width: number; height: number; duration: number; clip: string;
  nodes: Node[]; textures: { file: string; width: number; height: number; wrapU: number; wrapV: number }[]; shaders: Shader[]; materials: Material[];
  curves: { node: number; property: string; keys: Key[] }[];
  sound?: { file: string; offset: number; duration: number } };

/** Unity's weighted cubic curves, including infinite-slope step keys. */
export function curveValue(keys: Key[], time: number): number {
  if (time <= keys[0][0]) return keys[0][1];
  if (time >= keys[keys.length - 1][0]) return keys[keys.length - 1][1];
  let lo = 0, hi = keys.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (keys[mid][0] <= time) lo = mid; else hi = mid; }
  const a = keys[lo], b = keys[hi], duration = b[0] - a[0];
  if (a[3] === null || b[2] === null) return a[1];
  const x = (time - a[0]) / duration;
  const wa = a[4] & 2 ? a[6] : 1 / 3, wb = b[4] & 1 ? b[5] : 1 / 3;
  let t = x;
  if ((a[4] & 2) || (b[4] & 1)) {
    let left = 0, right = 1;
    for (let i = 0; i < 22; i++) {
      const v = 3 * (1 - t) ** 2 * t * wa + 3 * (1 - t) * t * t * (1 - wb) + t ** 3;
      if (v < x) left = t; else right = t;
      t = (left + right) / 2;
    }
  }
  const y1 = a[1] + duration * wa * a[3], y2 = b[1] - duration * wb * b[2];
  return (1 - t) ** 3 * a[1] + 3 * (1 - t) ** 2 * t * y1 + 3 * (1 - t) * t * t * y2 + t ** 3 * b[1];
}

function multiply(a: Vec, b: Vec): Vec {
  return Array.from({ length: 16 }, (_, i) => {
    const row = i % 4, col = Math.floor(i / 4);
    return a[row] * b[col * 4] + a[row + 4] * b[col * 4 + 1] + a[row + 8] * b[col * 4 + 2] + a[row + 12] * b[col * 4 + 3];
  });
}
function matrix(position: Vec, rotation: Vec, scale: Vec): Vec {
  const length = Math.hypot(...rotation) || 1, [x, y, z, w] = rotation.map(v => v / length);
  return [(1 - 2 * (y * y + z * z)) * scale[0], 2 * (x * y + z * w) * scale[0], 2 * (x * z - y * w) * scale[0], 0,
    2 * (x * y - z * w) * scale[1], (1 - 2 * (x * x + z * z)) * scale[1], 2 * (y * z + x * w) * scale[1], 0,
    2 * (x * z + y * w) * scale[2], 2 * (y * z - x * w) * scale[2], (1 - 2 * (x * x + y * y)) * scale[2], 0,
    ...position, 1];
}
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** Unity's authored Euler channels apply Z, then X, then Y. */
export function eulerQuaternion(angles: Vec): Vec {
  const [x, y, z] = angles.map(v => v * Math.PI / 360);
  const [sx, sy, sz] = [Math.sin(x), Math.sin(y), Math.sin(z)], [cx, cy, cz] = [Math.cos(x), Math.cos(y), Math.cos(z)];
  return [sx * cy * cz + cx * sy * sz, cx * sy * cz - sx * cy * sz, cx * cy * sz - sx * sy * cz, cx * cy * cz + sx * sy * sz];
}

/** Rectangular, sliced and angular UI geometry; UVs stay in the native atlas. */
function imageMesh(im: ImageData, size: Vec, pivot: Vec, texture: { width: number; height: number }): Vec {
  const box = [...size];
  if (im.preserveAspect) {
    const ratio = im.rotated ? im.spriteSize[1] / im.spriteSize[0] : im.spriteSize[0] / im.spriteSize[1];
    if (box[0] / box[1] > ratio) box[0] = box[1] * ratio; else box[1] = box[0] / ratio;
  }
  const x = -pivot[0] * box[0] + box[0] * im.offset.x / im.spriteSize[0], y = -pivot[1] * box[1] + box[1] * im.offset.y / im.spriteSize[1];
  const w = box[0] * im.rect.width / im.spriteSize[0], h = box[1] * im.rect.height / im.spriteSize[1];
  const u0 = im.rect.x / texture.width, v0 = im.rect.y / texture.height;
  const du = im.rect.width / texture.width, dv = im.rect.height / texture.height;
  const point = (px: number, py: number): Vec => {
    const u = (px - x) / w, v = (py - y) / h;
    return [px, py, u0 + (im.rotated ? v : u) * du, v0 + (im.rotated ? 1 - u : v) * dv];
  };
  const out: Vec = [];
  const triangle = (a: Vec, b: Vec, c: Vec) => out.push(...a, ...b, ...c);
  let arc = im.arc;
  if (!arc && im.type === 3 && im.fillMethod === 4) arc = [-90 + im.origin * 90, (im.clockwise ? -1 : 1) * im.fill * 360];
  if (arc && Math.abs(arc[1]) < 359.9999) {
    const span = Math.min(360, Math.abs(arc[1]));
    if (span < .00001 || !w || !h) return [];
    const sign = Math.sign(arc[1]), start = arc[0], angles = [0, span];
    for (const corner of [45, 135, 225, 315]) {
      const progress = ((corner - start) * sign % 360 + 360) % 360;
      if (progress > 0 && progress < span) angles.push(progress);
    }
    angles.sort((a, b) => a - b);
    const center = point(x + w / 2, y + h / 2);
    const edge = (progress: number) => {
      const a = (start + sign * progress) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), f = .5 / Math.max(Math.abs(c), Math.abs(s));
      return point(x + w * (.5 + c * f), y + h * (.5 + s * f));
    };
    for (let i = 1; i < angles.length; i++) triangle(center, edge(angles[i - 1]), edge(angles[i]));
  } else if (im.type === 1 && im.border.some(v => v > 0) && !im.rotated) {
    const [left, bottom, right, top] = im.border;
    const sx = Math.min(1, w / (left + right || 1)), sy = Math.min(1, h / (bottom + top || 1));
    const xs = [x, x + left * sx, x + w - right * sx, x + w], ys = [y, y + bottom * sy, y + h - top * sy, y + h];
    const us = [u0, u0 + left / texture.width, u0 + du - right / texture.width, u0 + du], vs = [v0, v0 + bottom / texture.height, v0 + dv - top / texture.height, v0 + dv];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const a = [xs[i], ys[j], us[i], vs[j]], b = [xs[i + 1], ys[j], us[i + 1], vs[j]], c = [xs[i + 1], ys[j + 1], us[i + 1], vs[j + 1]], d = [xs[i], ys[j + 1], us[i], vs[j + 1]];
      triangle(a, b, c); triangle(a, c, d);
    }
  } else {
    let right = x + w, top = y + h, left = x, bottom = y;
    if (im.type === 3 && im.fillMethod === 0) { if (im.origin) left = right - w * im.fill; else right = left + w * im.fill; }
    if (im.type === 3 && im.fillMethod === 1) { if (im.origin) bottom = top - h * im.fill; else top = bottom + h * im.fill; }
    const a = point(left, bottom), b = point(right, bottom), c = point(right, top), d = point(left, top);
    triangle(a, b, c); triangle(a, c, d);
  }
  return out;
}
const VERTEX = `#version 300 es
in vec4 in_POSITION0; in vec4 in_COLOR0; in vec2 in_TEXCOORD0;
uniform vec4 hlslcc_mtx4x4unity_ObjectToWorld[4]; uniform vec4 hlslcc_mtx4x4unity_MatrixVP[4];
out vec4 color; out vec2 uv;
void main() { mat4 world=mat4(hlslcc_mtx4x4unity_ObjectToWorld[0],hlslcc_mtx4x4unity_ObjectToWorld[1],hlslcc_mtx4x4unity_ObjectToWorld[2],hlslcc_mtx4x4unity_ObjectToWorld[3]);
mat4 vp=mat4(hlslcc_mtx4x4unity_MatrixVP[0],hlslcc_mtx4x4unity_MatrixVP[1],hlslcc_mtx4x4unity_MatrixVP[2],hlslcc_mtx4x4unity_MatrixVP[3]);
gl_Position=vp*world*in_POSITION0; color=in_COLOR0; uv=in_TEXCOORD0; }`;
const FRAGMENT = `#version 300 es
precision highp float; in vec4 color; in vec2 uv; uniform sampler2D _MainTex; out vec4 result;
void main() { result=texture(_MainTex,uv)*color; if(result.a<0.001)discard; }`;
type Program = { handle: WebGLProgram; attributes: number[]; uniforms: { name: string; type: number; size: number; location: WebGLUniformLocation }[] };

export class GameUiPlayer {
  private gl: WebGL2RenderingContext;
  private programs: Program[] = [];
  private textures: WebGLTexture[] = [];
  private white: WebGLTexture;
  private defaults = new Map<string, WebGLTexture>();
  private buffer: WebGLBuffer;
  private nodes: Node[];
  private assignments: { target: Record<string, unknown>; key: string; keys: Key[] }[];
  private disposed = false;
  constructor(private canvas: HTMLCanvasElement, readonly scene: GameUiScene) {
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: true, stencil: true, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL2 unavailable');
    this.gl = gl;
    this.white = this.solid('white');
    this.buffer = gl.createBuffer()!;
    try {
      this.programs.push(this.program(VERTEX, FRAGMENT));
      for (const shader of scene.shaders) this.programs.push(this.program(shader.vertex, shader.fragment));
    } catch (error) {
      for (const p of this.programs) gl.deleteProgram(p.handle);
      gl.deleteBuffer(this.buffer); for (const t of this.defaults.values()) gl.deleteTexture(t);
      throw error;
    }
    this.nodes = structuredClone(scene.nodes);
    this.assignments = scene.curves.map(c => {
      const path = c.property.split('.'), key = path.pop()!;
      let target: unknown = this.nodes[c.node];
      for (const part of path) target = (target as Record<string, unknown>)[part];
      if (!target) throw new Error(`Missing animated property ${c.property}`);
      return { target: target as Record<string, unknown>, key, keys: c.keys };
    });
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.enable(gl.BLEND);
  }
  private solid(name: string): WebGLTexture {
    const cached = this.defaults.get(name);
    if (cached) return cached;
    const gl = this.gl, texture = gl.createTexture()!, value = name === 'black' ? 0 : ['gray', 'grey'].includes(name) ? 128 : 255;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([value, value, value, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    this.defaults.set(name, texture); return texture;
  }
  async load(base: URL, signal: AbortSignal, blobs?: Blob[]): Promise<void> {
    const gl = this.gl;
    await Promise.all(this.scene.textures.map(async (t, index) => {
      let blob = blobs?.[index];
      if (!blob) {
        const response = await fetchAsset(new URL(t.file, base).href, { signal });
        if (!response.ok) throw new Error('Event texture unavailable');
        blob = await response.blob();
      }
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
      if (this.disposed || signal.aborted) { bitmap.close(); return; }
      const texture = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      const wrap = (mode: number) => mode === 0 ? gl.REPEAT : mode === 2 ? gl.MIRRORED_REPEAT : gl.CLAMP_TO_EDGE;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap(t.wrapU)); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap(t.wrapV));
      bitmap.close(); this.textures[index] = texture;
    }));
  }
  private program(vertex: string, fragment: string): Program {
    const gl = this.gl;
    if (this.scene.nodes.some(n => n.maskSoftness?.some(value => value > 0))) {
      const output = fragment.match(/\bout\s+(?:(?:lowp|mediump|highp)\s+)?vec4\s+(\w+)\s*;/)?.[1];
      if (!output) throw new Error('Unsupported soft-mask shader output');
      fragment = fragment.replace(/void\s+main\s*\(/, 'void arkNativeMain(') + `
precision highp float; precision highp int;
uniform vec4 arkMaskRects[8]; uniform vec4 arkMaskWidths[8]; uniform int arkMaskCount; uniform float arkPremultiplied;
void main() { arkNativeMain(); float coverage=1.0;
for(int i=0;i<8;i++){if(i>=arkMaskCount)break;
vec2 edge=min(gl_FragCoord.xy-arkMaskRects[i].xy,arkMaskRects[i].zw-gl_FragCoord.xy);
vec2 mask=clamp(edge/max(arkMaskWidths[i].xy,vec2(0.00001)),0.0,1.0); coverage*=mask.x*mask.y;}
${output}.a*=coverage; ${output}.rgb*=mix(1.0,coverage,arkPremultiplied); }`;
    }
    const compile = (kind: number, source: string) => {
      // Select the original program's loose-uniform path; Unity's per-camera
      // buffers do not exist in the browser player.
      source = source.replace('#define HLSLCC_ENABLE_UNIFORM_BUFFERS 1', '#define HLSLCC_ENABLE_UNIFORM_BUFFERS 0');
      source = source.replace(/^(#version[^\n]*\n)/, '$1precision highp float; precision highp int;\n');
      const s = gl.createShader(kind)!; gl.shaderSource(s, source); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { const error = gl.getShaderInfoLog(s); gl.deleteShader(s); throw new Error(error ?? 'Event shader compile failed'); }
      return s;
    };
    const v = compile(gl.VERTEX_SHADER, vertex), f = compile(gl.FRAGMENT_SHADER, fragment), handle = gl.createProgram()!;
    gl.attachShader(handle, v); gl.attachShader(handle, f); gl.linkProgram(handle); gl.deleteShader(v); gl.deleteShader(f);
    if (!gl.getProgramParameter(handle, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(handle) ?? 'Event shader link failed');
    const uniforms: Program['uniforms'] = [];
    for (let i = 0; i < gl.getProgramParameter(handle, gl.ACTIVE_UNIFORMS); i++) {
      const u = gl.getActiveUniform(handle, i)!; uniforms.push({ name: u.name.replace(/\[0\]$/, ''), type: u.type, size: u.size, location: gl.getUniformLocation(handle, u.name)! });
    }
    return { handle, uniforms, attributes: ['in_POSITION0', 'in_COLOR0', 'in_TEXCOORD0'].map(n => gl.getAttribLocation(handle, n)) };
  }
  draw(time: number): void {
    if (this.disposed) return;
    const gl = this.gl, scene = this.scene, nodes = this.nodes;
    const bounds = this.canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    // Match the visible, transformed frame while it docks; CSS can resize the
    // frame's aspect without stretching the artwork rendered inside it.
    const width = Math.max(1, Math.round(bounds.width * dpr)), height = Math.max(1, Math.round(bounds.height * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) { this.canvas.width = width; this.canvas.height = height; }
    gl.viewport(0, 0, width, height); gl.disable(gl.SCISSOR_TEST); gl.colorMask(true, true, true, true); gl.stencilMask(255);
    gl.clearColor(0, 0, 0, 1); gl.clearStencil(0); gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
    for (const c of this.assignments) c.target[c.key] = curveValue(c.keys, Math.min(scene.duration, time));
    // Full-bleed artwork: crop the native scene at unusual viewport aspects,
    // never stretch the character art. Docking naturally reveals the full 16:9 frame.
    const fit = Math.max(width / scene.width, height / scene.height);
    const vp = [2 * fit / width, 0, 0, 0, 0, 2 * fit / height, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1];
    const poses: { world: Vec; size: Vec; pivot: Vec; alpha: number; active: boolean; clip: Vec | null; masks: { rect: Vec; widths: Vec }[] }[] = [];
    for (const n of nodes) {
      const parent = n.parent === null ? { world: IDENTITY, size: [scene.width, scene.height], pivot: [.5, .5], alpha: 1, active: true, clip: null, masks: [] } : poses[n.parent];
      const size = n.size.map((v, i) => v + parent.size[i] * (n.anchorMax[i] - n.anchorMin[i]));
      const position = n.position.map((v, i) => v + parent.size[i] * (n.anchorMin[i] + (n.anchorMax[i] - n.anchorMin[i]) * n.pivot[i] - parent.pivot[i]));
      const pose = { world: multiply(parent.world, matrix(n.localPosition ?? [...position, n.z], n.euler ? eulerQuaternion(n.euler) : n.rotation, n.scale)), size, pivot: n.pivot, alpha: (n.ignoreParentAlpha ? 1 : parent.alpha) * n.alpha, active: parent.active && !!n.active, clip: parent.clip, masks: parent.masks };
      if (n.rectMask) {
        const padding = n.maskPadding ?? [0, 0, 0, 0];
        const corners = [[-n.pivot[0] * size[0] + padding[0], -n.pivot[1] * size[1] + padding[1]], [(1 - n.pivot[0]) * size[0] - padding[2], (1 - n.pivot[1]) * size[1] - padding[3]]];
        const points = corners.map(([x, y]) => [(pose.world[0] * x + pose.world[4] * y + pose.world[12]) * fit + width / 2, (pose.world[1] * x + pose.world[5] * y + pose.world[13]) * fit + height / 2]);
        const box = [Math.min(points[0][0], points[1][0]), Math.min(points[0][1], points[1][1]), Math.max(points[0][0], points[1][0]), Math.max(points[0][1], points[1][1])];
        pose.clip = parent.clip ? [Math.max(box[0], parent.clip[0]), Math.max(box[1], parent.clip[1]), Math.min(box[2], parent.clip[2]), Math.min(box[3], parent.clip[3])] : box;
        if (n.maskSoftness?.some(value => value > 0)) {
          pose.masks = [...parent.masks, { rect: box, widths: [n.maskSoftness[0] * Math.hypot(pose.world[0], pose.world[1]) * fit / 2 + 1, n.maskSoftness[1] * Math.hypot(pose.world[4], pose.world[5]) * fit / 2 + 1, 0, 0] }];
          if (pose.masks.length > 8) throw new Error('Too many nested native soft masks');
        }
      }
      poses.push(pose);
      if (!pose.active || !n.image || pose.alpha < .0001 || n.image.color[3] < .0001 || size[0] <= 0 || size[1] <= 0) continue;
      if (pose.clip) {
        gl.enable(gl.SCISSOR_TEST);
        gl.scissor(Math.floor(pose.clip[0]), Math.floor(pose.clip[1]), Math.max(0, Math.ceil(pose.clip[2] - pose.clip[0])), Math.max(0, Math.ceil(pose.clip[3] - pose.clip[1])));
      } else gl.disable(gl.SCISSOR_TEST);
      const stencil = n.stencil;
      if (stencil) {
        gl.enable(gl.STENCIL_TEST);
        gl.stencilMask(stencil.writeMask);
        gl.stencilFunc([gl.ALWAYS, gl.EQUAL, gl.NOTEQUAL][stencil.compare], stencil.readMask | stencil.writeMask, stencil.readMask || 255);
        gl.stencilOp(gl.KEEP, gl.KEEP, [gl.KEEP, gl.ZERO, gl.REPLACE][stencil.operation]);
        gl.colorMask(!!(stencil.colorMask & 8), !!(stencil.colorMask & 4), !!(stencil.colorMask & 2), !!(stencil.colorMask & 1));
      } else { gl.disable(gl.STENCIL_TEST); gl.colorMask(true, true, true, true); }
      const im = n.image, mat = im.material === null ? null : scene.materials[im.material], shader = mat ? scene.shaders[mat.shader] : null;
      const program = this.programs[mat ? mat.shader + 1 : 0]; gl.useProgram(program.handle);
      const state = (s: { name: string; val: number }) => s.name && s.name !== '<noninit>' ? Number(mat?.values[s.name] ?? shader?.defaults[s.name]?.[0] ?? s.val) : s.val;
      const factors = [gl.ZERO, gl.ONE, gl.DST_COLOR, gl.SRC_COLOR, gl.ONE_MINUS_DST_COLOR, gl.SRC_ALPHA, gl.ONE_MINUS_SRC_COLOR, gl.DST_ALPHA, gl.ONE_MINUS_DST_ALPHA, gl.SRC_ALPHA_SATURATE, gl.ONE_MINUS_SRC_ALPHA];
      gl.blendFunc(factors[shader ? state(shader.blend[0]) : 5], factors[shader ? state(shader.blend[1]) : 10]);
      let unit = 0;
      for (const u of program.uniforms) {
        if (u.type === gl.SAMPLER_2D) {
          const index = u.name === '_MainTex' ? im.texture : mat?.textures[u.name];
          const texture = index == null ? this.solid(shader?.samplers[u.name] ?? 'white') : this.textures[index];
          gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, texture ?? this.white); gl.uniform1i(u.location, unit++); continue;
        }
        const value = u.name === 'hlslcc_mtx4x4unity_ObjectToWorld' ? pose.world : u.name === 'hlslcc_mtx4x4unity_MatrixVP' ? vp
          : u.name === 'arkMaskRects' ? [...pose.masks.flatMap(mask => mask.rect), ...Array((8 - pose.masks.length) * 4).fill(0)]
          : u.name === 'arkMaskWidths' ? [...pose.masks.flatMap(mask => mask.widths), ...Array((8 - pose.masks.length) * 4).fill(0)]
          : u.name === 'arkMaskCount' ? pose.masks.length : u.name === 'arkPremultiplied' ? Number((shader ? state(shader.blend[0]) : 5) === 1)
          : u.name === '_ScreenParams' ? [width, height, 1 + 1 / width, 1 + 1 / height]
          : u.name === '_SinTime' ? [Math.sin(time / 8), Math.sin(time / 4), Math.sin(time / 2), Math.sin(time)]
          : u.name === '_CosTime' ? [Math.cos(time / 8), Math.cos(time / 4), Math.cos(time / 2), Math.cos(time)]
          : u.name === '_Time' ? [time / 20, time, time * 2, time * 3] : n.uniforms?.[u.name] ?? mat?.values[u.name] ?? shader?.defaults[u.name] ?? (u.name.endsWith('_ST') ? [1, 1, 0, 0] : [1, 1, 1, 1]);
        if (u.type === gl.FLOAT) gl.uniform1f(u.location, Array.isArray(value) ? value[0] : value);
        else if (u.type === gl.FLOAT_VEC4) gl.uniform4fv(u.location, Array.isArray(value) ? value.slice(0, u.size * 4) : [value, value, value, value]);
        else if (u.type === gl.FLOAT_VEC3) gl.uniform3fv(u.location, Array.isArray(value) ? value.slice(0, u.size * 3) : [value, value, value]);
        else if (u.type === gl.FLOAT_VEC2) gl.uniform2fv(u.location, Array.isArray(value) ? value.slice(0, u.size * 2) : [value, value]);
        else if (u.type === gl.FLOAT_MAT4 && Array.isArray(value)) gl.uniformMatrix4fv(u.location, false, value);
        else if (u.type === gl.INT || u.type === gl.BOOL) gl.uniform1i(u.location, Array.isArray(value) ? value[0] : value);
      }
      const color = [...im.color]; color[3] *= pose.alpha;
      const tex = im.texture === null ? { width: 1, height: 1 } : scene.textures[im.texture];
      const mesh = imageMesh(im, size, n.pivot, tex), vertices: number[] = [];
      const uv = im.uvRect ?? [0, 0, 1, 1];
      for (let i = 0; i < mesh.length; i += 4) vertices.push(mesh[i], mesh[i + 1], 0, 1, ...color, uv[0] + mesh[i + 2] * uv[2], uv[1] + mesh[i + 3] * uv[3]);
      if (!vertices.length) continue;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW);
      for (const [i, loc] of program.attributes.entries()) if (loc >= 0) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, i === 2 ? 2 : 4, gl.FLOAT, false, 40, [0, 16, 32][i]); }
      gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 10);
    }
  }
  dispose(): void {
    if (this.disposed) return; this.disposed = true;
    const gl = this.gl; for (const p of this.programs) gl.deleteProgram(p.handle);
    for (const t of [...this.textures, ...this.defaults.values()]) if (t) gl.deleteTexture(t);
    gl.deleteBuffer(this.buffer);
  }
}

export async function loadGameUiPlayer(canvas: HTMLCanvasElement, url: string, signal: AbortSignal): Promise<GameUiPlayer> {
  const response = await fetchAsset(url, { signal });
  if (!response.ok) throw new Error('Event entrance unavailable');
  const scene: GameUiScene = await response.json();
  if (scene.schemaVersion !== 1) throw new Error('Unsupported event entrance');
  const player = new GameUiPlayer(canvas, scene);
  try { await player.load(new URL('.', url), signal); return player; }
  catch (error) { player.dispose(); throw error; }
}
