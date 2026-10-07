import type { spine as Spine } from '@/lib/vendor/spine-3.8/spine-webgl';
import {
  animatedShader, combine, dissolveK, followMatrix, layerPose, mapOffset, unityUvMap, wrapUnit,
  type DynamicLayer, type DynamicLayers, type LayerClock, type LayerShader, type LayerTexture, type NoiseShader, type ParticleShader, type ShaderMap,
} from '@/lib/skins/dynamicLayers';

/*
 * Draws an animated outfit's mesh layers (lib/skins/dynamicLayers.ts) into the Spine canvas, the way
 * the game's particle shaders draw them: texture x 2 x vertex colour x tint (the 2 is in the colours
 * layers.json carries), alpha clamped, the texture sampled straight as shipped. The canvas is
 * premultiplied, so the shader writes rgb x alpha and blends (ONE, ONE_MINUS_SRC_ALPHA), or adds with
 * alpha 0 for an additive layer. spine's own batcher cannot do this: it premultiplies before it could
 * clamp, which overbrightens a glow whose tint alpha is above 0.5.
 *
 * A layer with an effect shader (flow distortion, dissolve, ramp, vertex disturbance: the Torappu
 * particle shaders; Disturb2's noise) gets a program of its own, ported from the game's GLSL: one per
 * combination of the features its layers use, built the first time a layer needs it. A program that
 * does not build (or a vertex effect on a GPU that cannot read textures in its vertex shader) leaves
 * the layers that need it out, never the others or the artwork. The shader's clock is the layer's own
 * (layerPose), so under reduced motion an effect stands still unless the reader pressed its animation.
 * A tilted layer (a mesh that turns in depth while it moves) has 3D vertices and its own variant of
 * each program, which projects them with the frame's 2x4 matrix (the game's camera is orthographic);
 * the faces it turns away are culled by their winding on screen, as Unity culls them.
 *
 * Every layer's mesh goes to the GPU once; a frame only sets each layer's matrix, colour, UV map and
 * its shader's offsets. Only DynamicArtwork imports this, after the reader pressed Animated.
 */

const VERTEX = `
attribute vec2 a_position;
attribute vec2 a_uv;
attribute vec4 a_color;
uniform mat4 u_projection;
uniform vec3 u_row0;
uniform vec3 u_row1;
uniform vec4 u_uvMap;
varying vec2 v_uv;
varying vec4 v_color;
void main() {
  vec3 p = vec3(a_position, 1.0);
  v_uv = vec2(a_uv.x * u_uvMap.x + u_uvMap.y, a_uv.y * u_uvMap.z + u_uvMap.w);
  v_color = a_color;
  gl_Position = u_projection * vec4(dot(u_row0, p), dot(u_row1, p), 0.0, 1.0);
}`;

const FRAGMENT = `
precision mediump float;
uniform sampler2D u_texture;
uniform vec4 u_tint;
uniform float u_add;
varying vec2 v_uv;
varying vec4 v_color;
void main() {
  vec4 t = texture2D(u_texture, v_uv);
  vec4 c = v_color * u_tint;
  float a = clamp(t.a * c.a, 0.0, 1.0);
  gl_FragColor = vec4(clamp(t.rgb * c.rgb, 0.0, 1.0) * a, a * (1.0 - u_add));
}`;

const PRECISION = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif`;

/** Unity's v runs up, the uploaded images' rows down: flip only when sampling. */
const SAMPLE = 'vec4 sampleUnity(sampler2D s, vec2 uv) { return texture2D(s, vec2(uv.x, 1.0 - uv.y)); }';

/** The vertex shader of the effect programs: the mesh's own UVs pass through; a vertex effect moves the
 *  vertex by its noise first (Ram/VertexDisturb: (rgb - 0.5) x weight.r x intensity, in mesh units).
 *  `solid`: 3D vertices projected by the frame's 2x4 matrix (rows u_row0, u_row1), the noise added in 3D. */
export function effectVertex(vertexEffect: boolean, solid = false): string {
  return `
attribute ${solid ? 'vec3' : 'vec2'} a_position;
attribute vec2 a_uv;
attribute vec4 a_color;
uniform mat4 u_projection;
uniform ${solid ? 'vec4' : 'vec3'} u_row0;
uniform ${solid ? 'vec4' : 'vec3'} u_row1;
varying vec2 v_uv;
varying vec4 v_color;
${vertexEffect ? `uniform sampler2D u_v;
uniform vec4 u_vST;
uniform vec2 u_vOff;
uniform sampler2D u_vw;
uniform vec4 u_vwST;
uniform vec2 u_vwOff;
uniform vec3 u_vI;
uniform vec3 u_vRow0;
uniform vec3 u_vRow1;
vec4 sampleLod(sampler2D s, vec2 uv) { return texture2DLod(s, vec2(uv.x, 1.0 - uv.y), 0.0); }` : ''}
void main() {
  ${solid ? 'vec3' : 'vec2'} p = a_position;
${vertexEffect ? `  vec3 n = sampleLod(u_v, a_uv * u_vST.xy + u_vST.zw + u_vOff).rgb - 0.5;
  float w = sampleLod(u_vw, a_uv * u_vwST.xy + u_vwST.zw + u_vwOff).r;
  vec3 d = n * (w * u_vI);
  ${solid ? 'p += d;' : 'p += vec2(dot(u_vRow0, d), dot(u_vRow1, d));'}` : ''}
  v_uv = a_uv;
  v_color = a_color;
  ${solid ? 'vec4 q = vec4(p, 1.0);' : 'vec3 q = vec3(p, 1.0);'}
  gl_Position = u_projection * vec4(dot(u_row0, q), dot(u_row1, q), 0.0, 1.0);
}`;
}

/** What a particle program has to do, as the switches its source is built from. */
export interface ParticleFeatures { maps: number; distort: boolean; raw: boolean; weight: boolean; dissolves: number; edge: 0 | 1 | 2; ramp: boolean; vertex: boolean }

export function particleFeatures(shader: ParticleShader): ParticleFeatures {
  return {
    maps: shader.distort?.maps.length ?? 0, distort: !!shader.distort, raw: shader.distort?.space === 'raw', weight: !!shader.distort?.weight,
    dissolves: shader.dissolve.length, edge: shader.edge ? (shader.edge.epsilon ? 2 : 1) : 0, ramp: !!shader.ramp, vertex: !!shader.vertex,
  };
}

const featureKey = (f: ParticleFeatures) => `p${f.maps}${+f.distort}${+f.raw}${+f.weight}${f.dissolves}${f.edge}${+f.ramp}${+f.vertex}`;

/** The fragment shader of the Torappu particle family (Disturb, Ram/Disturb, VertexDisturb, Disturb
 *  Anchor, the Dissolve shaders), with only the stages `f` uses. */
export function particleFragment(f: ParticleFeatures): string {
  const lines: string[] = [PRECISION, 'uniform sampler2D u_main;', 'uniform vec4 u_mainST;', 'uniform vec2 u_mainOff;', 'uniform vec4 u_uvMap;',
    'uniform float u_mainFract;', 'uniform vec4 u_tint;', 'uniform float u_add;', 'varying vec2 v_uv;', 'varying vec4 v_color;', SAMPLE];
  for (let i = 0; i < f.maps; i++) lines.push(`uniform sampler2D u_d${i};`, `uniform vec4 u_d${i}ST;`, `uniform vec2 u_d${i}Off;`, `uniform vec4 u_d${i}AI;`);
  if (f.weight) lines.push('uniform sampler2D u_w;', 'uniform vec4 u_wST;', 'uniform vec2 u_wOff;');
  if (f.distort) lines.push('uniform vec2 u_dConst;', 'uniform vec2 u_dInfluence;');
  for (let i = 0; i < f.dissolves; i++) {
    lines.push(`uniform sampler2D u_s${i};`, `uniform vec4 u_s${i}ST;`, `uniform vec2 u_s${i}Off;`, `uniform vec3 u_s${i}AKB;`, `uniform float u_s${i}Fract;`);
  }
  if (f.ramp) lines.push('uniform sampler2D u_r;', 'uniform vec4 u_rST;', 'uniform vec2 u_rOff;');
  if (f.edge) lines.push('uniform vec4 u_edge;', 'uniform float u_pow;');
  const body: string[] = ['vec2 uv = v_uv;', 'vec2 d = vec2(0.0);'];
  // The noise: (texture.r - anchor) x intensity per map, times the weight's red and green.
  for (let i = 0; i < f.maps; i++) {
    body.push(`d += (vec2(sampleUnity(u_d${i}, uv * u_d${i}ST.xy + u_d${i}ST.zw + u_d${i}Off).r) - u_d${i}AI.xy) * u_d${i}AI.zw;`);
  }
  if (f.weight) body.push('d *= sampleUnity(u_w, uv * u_wST.xy + u_wST.zw + u_wOff).rg;');
  if (f.distort) body.push('d += u_dConst;');
  // The main UV: distorted before its tiling (Disturb Anchor, old Disturb) or after it (the others).
  const raw = f.distort && f.raw;
  body.push(`vec2 base = ${raw ? 'uv + d' : 'uv'};`);
  body.push('vec2 m = base * u_mainST.xy + u_mainST.zw;', 'm = vec2(m.x * u_uvMap.x + u_uvMap.y, m.y * u_uvMap.z + u_uvMap.w) + u_mainOff;');
  if (f.distort && !f.raw) body.push('m += d * u_dInfluence.x;');
  body.push('m = mix(m, fract(m), u_mainFract);', 'vec4 c = sampleUnity(u_main, m) * u_tint * v_color;');
  if (f.ramp) body.push('c *= sampleUnity(u_r, uv * u_rST.xy + u_rST.zw + u_rOff);');
  body.push('float f = 1.0;');
  for (let i = 0; i < f.dissolves; i++) {
    // Only the first dissolve is distorted: no shader has a distortion and two dissolves.
    const moved = i === 0 && f.distort ? (f.raw ? '' : ' + d * u_dInfluence.y') : '';
    body.push(`vec2 s${i} = ${i === 0 ? 'base' : 'uv'} * u_s${i}ST.xy + u_s${i}ST.zw + u_s${i}Off${moved};`);
    body.push(`s${i} = mix(s${i}, fract(s${i}), u_s${i}Fract);`);
    body.push(`f *= clamp((sampleUnity(u_s${i}, s${i}).r - u_s${i}AKB.x + u_s${i}AKB.z * u_s${i}AKB.y) / u_s${i}AKB.z, 0.0, 1.0);`);
  }
  if (f.edge) {
    // The Dissolve Double edge shaders: an edge colour where the dissolve thins out.
    const eps = f.edge === 2 ? '0.001' : '0.0';
    body.push(`float x = clamp((f + ${eps}) / (u_edge.a + ${eps}), 0.0, 1.0);`, 'float e = 1.0 - x * x * (3.0 - 2.0 * x);',
      'e = e > 0.0 ? pow(e, u_pow) : (u_pow > 0.0 ? 0.0 : 1.0);');
    if (f.edge === 2) body.push('e = max(e, 0.001);');
    body.push('c.rgb = c.rgb + e * (u_edge.rgb - c.rgb);', 'c.a = c.a + e * (u_edge.a * c.a - c.a);');
  }
  body.push('float a = clamp(c.a * f, 0.0, 1.0);', 'gl_FragColor = vec4(clamp(c.rgb, 0.0, 1.0) * a, a * (1.0 - u_add));');
  return `${lines.join('\n')}\nvoid main() {\n  ${body.join('\n  ')}\n}`;
}

/** Disturb2's fragment shader: two noise channels move the main UV by 0.1 x their intensities. */
export function noiseFragment(mode: NoiseShader['mode']): string {
  const colour = mode === 'glow' ? 'vec4 c = clamp(t.r * u_tint + t.g * u_glow, 0.0, 1.0);'
    : mode === 'add' ? 'vec4 c = vec4(clamp(t.a * t.rgb * u_tint.rgb, 0.0, 1.0), clamp(t.a * u_tint.a * v_color.a, 0.0, 1.0));'
      : 'vec4 c = clamp(t * u_tint * vec4(1.0, 1.0, 1.0, v_color.a), 0.0, 1.0);';
  return `${PRECISION}
uniform sampler2D u_main;
uniform vec4 u_mainST;
uniform vec4 u_uvMap;
uniform sampler2D u_n;
uniform vec4 u_n1;
uniform vec4 u_n2;
uniform vec2 u_nOff;
uniform vec4 u_tint;
uniform vec4 u_glow;
uniform float u_add;
varying vec2 v_uv;
varying vec4 v_color;
${SAMPLE}
void main() {
  vec2 m = v_uv * u_mainST.xy + u_mainST.zw;
  m = vec2(m.x * u_uvMap.x + u_uvMap.y, m.y * u_uvMap.z + u_uvMap.w);
  float r = sampleUnity(u_n, m * u_n1.x + vec2(u_nOff.x, 0.0)).r;
  float g = sampleUnity(u_n, m * u_n2.x + vec2(u_nOff.y, 0.0)).g;
  vec4 t = sampleUnity(u_main, m + (r * u_n1.zw + g * u_n2.zw) * 0.1);
  ${colour}
  gl_FragColor = vec4(c.rgb * c.a, c.a * (1.0 - u_add));
}`;
}

export interface LayerRenderer {
  /** Draws one layer at its pose now (nothing when it is hidden). Call between scene.end() and scene.begin(). */
  draw(layer: DynamicLayer, clock: LayerClock, projection: Float32Array): void;
  dispose(): void;
}

type Context = InstanceType<typeof Spine['webgl']['ManagedWebGLRenderingContext']>;
interface Uploaded { vertices: WebGLBuffer; indices: WebGLBuffer; count: number; stride: number; size: number }
interface Program {
  program: WebGLProgram;
  position: number; uv: number; color: number;
  uniform: (name: string) => WebGLUniformLocation | null;
}

const powerOfTwo = (n: number) => (n & (n - 1)) === 0;

/** The key of the program a shader layer needs (a tilted layer's own variant ends in 3). */
export function programKey(shader: LayerShader, solid = false): string {
  return (shader.family === 'noise' ? `n${shader.mode}` : featureKey(particleFeatures(shader))) + (solid ? '3' : '');
}

/** A tilted layer's 2x4 projection [a, b, e, tx, c, d, f, ty] under a bone follower's 2x3 [a, b, c, d, tx, ty]. */
export function followProjection(outer: readonly number[], matrix: readonly number[], depth: readonly number[]): number[] {
  const [a, b, c, d, tx, ty] = outer;
  return [a * matrix[0] + b * matrix[2], a * matrix[1] + b * matrix[3], a * depth[0] + b * depth[1], a * matrix[4] + b * matrix[5] + tx,
    c * matrix[0] + d * matrix[2], c * matrix[1] + d * matrix[3], c * depth[0] + d * depth[1], c * matrix[4] + d * matrix[5] + ty];
}

/** Uploads the layers' textures and meshes and returns their drawer. Recreates everything when the
 *  context is lost and restored, as spine does for its own textures. */
export function createLayerRenderer(context: Context, layers: DynamicLayers, images: readonly HTMLImageElement[], skeleton: Spine.Skeleton): LayerRenderer {
  const gl = context.gl as WebGLRenderingContext;
  const webgl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
  let plain: Program | null = null;
  // Effect programs by key, built when first needed; null: it would not build here.
  let programs = new Map<string, Program | null>();
  let textures: (WebGLTexture | null)[] = [];
  let black: WebGLTexture | null = null;
  let white: WebGLTexture | null = null;
  let meshes = new Map<DynamicLayer, Uploaded>();
  // A texture that may not repeat in WebGL 1 (not a power of two) clamps, and its layer does not scroll.
  const clamped = new Set<number>();
  const warned = new Set<string>();

  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type);
    if (!shader) throw new Error('WebGL could not create a shader');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Layer shader: ${log}`);
    }
    return shader;
  };

  const link = (vertexSource: string, fragmentSource: string): Program => {
    const vertexShader = compile(gl.VERTEX_SHADER, vertexSource);
    let fragmentShader: WebGLShader;
    try {
      fragmentShader = compile(gl.FRAGMENT_SHADER, fragmentSource);
    } catch (error) {
      gl.deleteShader(vertexShader);
      throw error;
    }
    const program = gl.createProgram();
    if (!program) throw new Error('WebGL could not create a program');
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`Layer program: ${log}`);
    }
    const locations = new Map<string, WebGLUniformLocation | null>();
    return {
      program, position: gl.getAttribLocation(program, 'a_position'), uv: gl.getAttribLocation(program, 'a_uv'), color: gl.getAttribLocation(program, 'a_color'),
      uniform: (name) => {
        if (!locations.has(name)) locations.set(name, gl.getUniformLocation(program, name));
        return locations.get(name)!;
      },
    };
  };

  /** The program a shader layer needs, built on first use; null when it cannot be built here. */
  const effectProgram = (shader: LayerShader, solid: boolean): Program | null => {
    const key = programKey(shader, solid);
    if (programs.has(key)) return programs.get(key)!;
    let built: Program | null = null;
    try {
      const vertexEffect = shader.family === 'particle' && !!shader.vertex;
      if (vertexEffect && (gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS) as number) < 2) throw new Error('no textures in the vertex shader');
      built = link(effectVertex(vertexEffect, solid), shader.family === 'noise' ? noiseFragment(shader.mode) : particleFragment(particleFeatures(shader)));
    } catch (error) {
      if (!warned.has(key)) {
        warned.add(key);
        console.warn('[dynamic art] an effect shader could not be built here; its layers are left out', key, error);
      }
    }
    programs.set(key, built);
    return built;
  };

  const release = () => {
    for (const texture of textures) if (texture) gl.deleteTexture(texture);
    if (black) gl.deleteTexture(black);
    if (white) gl.deleteTexture(white);
    for (const mesh of meshes.values()) { gl.deleteBuffer(mesh.vertices); gl.deleteBuffer(mesh.indices); }
    if (plain) gl.deleteProgram(plain.program);
    for (const program of programs.values()) if (program) gl.deleteProgram(program.program);
    textures = [];
    black = white = null;
    meshes = new Map();
    plain = null;
    programs = new Map();
  };

  const solid = (value: number) => {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([value, value, value, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    return texture;
  };

  const upload = () => {
    plain = link(VERTEX, FRAGMENT);
    // Straight alpha, top row first: layers.json's UVs are already in image space.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    textures = layers.textures.map((info, index) => {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, images[index]);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      const repeatable = webgl2 || (powerOfTwo(info.width) && powerOfTwo(info.height));
      if (!repeatable) clamped.add(index);
      const mode = (wrap: string) => (!repeatable || wrap === 'clamp' ? gl.CLAMP_TO_EDGE : wrap === 'mirror' ? gl.MIRRORED_REPEAT : gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, mode(info.wrap[0]));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, mode(info.wrap[1]));
      return texture;
    });
    black = solid(0);
    white = solid(255);
    gl.bindTexture(gl.TEXTURE_2D, null);
    for (const entry of layers.draw) {
      if (entry.kind !== 'layer') continue;
      const { layer } = entry;
      // [x, y (, z), u, v, r, g, b, a] per vertex.
      const size = layer.solid ? 3 : 2;
      const floats = size + 6;
      const count = layer.vertices.length / size;
      const interleaved = new Float32Array(count * floats);
      for (let i = 0; i < count; i++) {
        interleaved.set(layer.vertices.subarray(i * size, i * size + size), i * floats);
        interleaved.set([layer.uvs[i * 2], layer.uvs[i * 2 + 1]], i * floats + size);
        if (layer.colors) interleaved.set(layer.colors.subarray(i * 4, i * 4 + 4), i * floats + size + 2);
        else interleaved.set([1, 1, 1, 1], i * floats + size + 2);
      }
      const vertices = gl.createBuffer()!, indices = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
      gl.bufferData(gl.ARRAY_BUFFER, interleaved, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, layer.triangles, gl.STATIC_DRAW);
      meshes.set(layer, { vertices, indices, count: layer.triangles.length, stride: floats * 4, size });
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
  };

  const restorable = { restore: () => { textures = []; meshes = new Map(); plain = null; programs = new Map(); black = white = null; upload(); } };
  upload();
  context.addRestorable(restorable);

  const wrapOf = (index: number | null): LayerTexture['wrap'] => (index === null ? ['repeat', 'repeat'] : layers.textures[index]?.wrap ?? ['repeat', 'repeat']);

  /** Sets one effect program's textures and uniforms for a layer at its time t. */
  const bindEffect = (program: Program, shader: LayerShader, layer: DynamicLayer, t: number, uvMap: readonly number[]) => {
    let unit = 0;
    const bind = (name: string, index: number | null, fallback: WebGLTexture | null) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, index === null ? fallback : textures[index]);
      gl.uniform1i(program.uniform(name), unit);
      unit++;
    };
    const map = (prefix: string, value: ShaderMap, fallback: WebGLTexture | null = black) => {
      bind(`u_${prefix}`, value.texture, fallback);
      gl.uniform4f(program.uniform(`u_${prefix}ST`), value.st[0], value.st[1], value.st[2], value.st[3]);
      const offset = mapOffset(value, t, wrapOf(value.texture));
      gl.uniform2f(program.uniform(`u_${prefix}Off`), offset[0], offset[1]);
    };
    bind('u_main', layer.texture, white);
    const main = shader.main;
    gl.uniform4f(program.uniform('u_mainST'), main.st[0], main.st[1], main.st[2], main.st[3]);
    const m = unityUvMap(uvMap);
    gl.uniform4f(program.uniform('u_uvMap'), m[0], m[1], m[2], m[3]);
    if (shader.family === 'noise') {
      map('n', shader.noise);
      gl.uniform4f(program.uniform('u_n1'), shader.noise1[0], shader.noise1[1], shader.noise1[2], shader.noise1[3]);
      gl.uniform4f(program.uniform('u_n2'), shader.noise2[0], shader.noise2[1], shader.noise2[2], shader.noise2[3]);
      // Disturb2 scrolls its noise with _Time.x: seconds / 20 (or by the integrated offset of an animated speed).
      const integrated = shader.noise.offset;
      gl.uniform2f(program.uniform('u_nOff'), integrated ? wrapUnit(integrated[0]) : mapOffset({ speed: [shader.noise1[1] / 20, 0], scroll: [0, 0] }, t)[0],
        integrated ? wrapUnit(integrated[1]) : mapOffset({ speed: [shader.noise2[1] / 20, 0], scroll: [0, 0] }, t)[0]);
      const glow = shader.glow ?? [0, 0, 0, 0];
      gl.uniform4f(program.uniform('u_glow'), glow[0], glow[1], glow[2], glow[3]);
      return;
    }
    const offset = mapOffset(main, t, wrapOf(layer.texture));
    gl.uniform2f(program.uniform('u_mainOff'), offset[0], offset[1]);
    gl.uniform1f(program.uniform('u_mainFract'), main.fract ? 1 : 0);
    const distort = shader.distort;
    if (distort) {
      distort.maps.forEach((d, i) => {
        map(`d${i}`, d);
        gl.uniform4f(program.uniform(`u_d${i}AI`), d.anchor[0], d.anchor[1], d.intensity[0], d.intensity[1]);
      });
      if (distort.weight) map('w', distort.weight, white);
      gl.uniform2f(program.uniform('u_dConst'), distort.constant[0], distort.constant[1]);
      gl.uniform2f(program.uniform('u_dInfluence'), distort.main, distort.dissolve);
    }
    shader.dissolve.forEach((s, i) => {
      map(`s${i}`, s, white);
      gl.uniform3f(program.uniform(`u_s${i}AKB`), s.amount, dissolveK(s.amount), s.border);
      gl.uniform1f(program.uniform(`u_s${i}Fract`), s.fract ? 1 : 0);
    });
    if (shader.ramp) map('r', shader.ramp, white);
    if (shader.edge) {
      const e = shader.edge.color;
      gl.uniform4f(program.uniform('u_edge'), e[0], e[1], e[2], e[3]);
      gl.uniform1f(program.uniform('u_pow'), shader.edge.pow);
    }
    const vertex = shader.vertex;
    if (vertex) {
      map('v', vertex);
      if (vertex.weight) map('vw', vertex.weight, white);
      else {
        bind('u_vw', null, white);
        gl.uniform4f(program.uniform('u_vwST'), 1, 1, 0, 0);
        gl.uniform2f(program.uniform('u_vwOff'), 0, 0);
      }
      gl.uniform3f(program.uniform('u_vI'), vertex.intensity[0], vertex.intensity[1], vertex.intensity[2]);
      const k = vertex.matrix;
      gl.uniform3f(program.uniform('u_vRow0'), k[0], k[1], k[2]);
      gl.uniform3f(program.uniform('u_vRow1'), k[3], k[4], k[5]);
    }
  };

  return {
    draw(layer, clock, projection) {
      const pose = layerPose(layer, clock);
      const mesh = meshes.get(layer);
      if (!pose || !mesh || !plain || pose.color[3] <= 0) return;
      const program = layer.shader ? effectProgram(layer.shader, layer.solid) : plain;
      if (!program) return;
      let matrix = pose.matrix;
      let rows = [pose.matrix[0], pose.matrix[1], pose.depth[0], pose.matrix[4], pose.matrix[2], pose.matrix[3], pose.depth[1], pose.matrix[5]];
      // Unity culls the other faces of a mirrored object; a bone that mirrors its follower mirrors the layer.
      let cull = layer.cull;
      if (layer.follow) {
        const bone = skeleton.findBone(layer.follow.bone);
        if (!bone || !bone.active) return;
        const follow = followMatrix(layer.follow, bone);
        matrix = combine(follow, matrix);
        rows = followProjection(follow, pose.matrix, pose.depth);
        if (cull && follow[0] * follow[3] - follow[1] * follow[2] < 0) cull = cull === 1 ? 2 : 1;
      }
      gl.useProgram(program.program);
      gl.uniformMatrix4fv(program.uniform('u_projection'), false, projection);
      if (layer.solid) {
        gl.uniform4f(program.uniform('u_row0'), rows[0], rows[1], rows[2], rows[3]);
        gl.uniform4f(program.uniform('u_row1'), rows[4], rows[5], rows[6], rows[7]);
      } else {
        gl.uniform3f(program.uniform('u_row0'), matrix[0], matrix[1], matrix[4]);
        gl.uniform3f(program.uniform('u_row1'), matrix[2], matrix[3], matrix[5]);
      }
      gl.uniform4f(program.uniform('u_tint'), pose.color[0], pose.color[1], pose.color[2], pose.color[3]);
      gl.uniform1f(program.uniform('u_add'), layer.blend === 'add' ? 1 : 0);
      if (layer.shader) {
        bindEffect(program, animatedShader(layer.shader, pose.extra), layer, pose.t, pose.uv);
      } else {
        const texture = layer.texture ?? 0;
        let uv = pose.uv;
        if (clamped.has(texture) && layer.scroll) {
          // Without repeat the scroll would smear the texture's edge: hold it at the start.
          const still = layerPose({ ...layer, scroll: null }, clock);
          if (still) uv = still.uv;
        }
        gl.uniform4f(program.uniform('u_uvMap'), uv[0], uv[1], uv[2], uv[3]);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, textures[texture]);
        gl.uniform1i(program.uniform('u_texture'), 0);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vertices);
      gl.enableVertexAttribArray(program.position);
      gl.vertexAttribPointer(program.position, mesh.size, gl.FLOAT, false, mesh.stride, 0);
      gl.enableVertexAttribArray(program.uv);
      gl.vertexAttribPointer(program.uv, 2, gl.FLOAT, false, mesh.stride, mesh.size * 4);
      if (program.color >= 0) {
        gl.enableVertexAttribArray(program.color);
        gl.vertexAttribPointer(program.color, 4, gl.FLOAT, false, mesh.stride, mesh.size * 4 + 8);
      }
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indices);
      gl.enable(gl.BLEND);
      if (layer.blend === 'add') gl.blendFunc(gl.ONE, gl.ONE);
      else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      if (cull) {
        // Unity's front faces wind clockwise on screen; the canvas keeps y up, so its winding is the same.
        gl.enable(gl.CULL_FACE);
        gl.frontFace(gl.CW);
        gl.cullFace(cull === 2 ? gl.BACK : gl.FRONT);
      }
      gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
      if (cull) {
        gl.disable(gl.CULL_FACE);
        gl.frontFace(gl.CCW);
      }
      gl.disableVertexAttribArray(program.position);
      gl.disableVertexAttribArray(program.uv);
      if (program.color >= 0) gl.disableVertexAttribArray(program.color);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
      // spine's batcher binds its pages on unit 0 and assumes it is the active one.
      gl.activeTexture(gl.TEXTURE0);
    },
    dispose() {
      context.removeRestorable(restorable);
      release();
    },
  };
}
