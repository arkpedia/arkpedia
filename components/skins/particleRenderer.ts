import type { spine as Spine } from '@/lib/vendor/spine-3.8/spine-webgl';
import { animatedShader, dissolveK, mapOffset, type CustomFeature, type LayerShader, type LayerTexture, type ShaderMap } from '@/lib/skins/dynamicLayers';
import type { ParticleDocument, ParticleMaterial, ParticleSystemData } from '@/lib/skins/particleData';
import {
  MAX_QUADS, MAX_VERTICES, PARTICLE_CONVENTIONS, VertexArray, customFeature, expandSystem, lerpMatrix, mirrored, quadIndices, type SystemFrame,
} from '@/lib/skins/particleGeometry';
import type { ParticleDirector, SystemRun } from '@/lib/skins/particleSim';
import { noiseFragment, particleFeatures, particleFragment, programKey } from './dynamicLayerRenderer';

/*
 * Draws an animated outfit's particle systems (lib/skins/particleSim.ts runs them, lib/skins/particleGeometry.ts
 * expands them) into the Spine canvas where layers.json's `{particles}` runs stand among the skeleton's parts and
 * the mesh layers (plan section 4). Once a frame, prepare() expands every live particle on the CPU into two
 * vertex arrays (lean, and with the custom inputs), uploads each with one bufferSubData into a buffer it orphans
 * first, and groups each run's systems into draws: adjacent systems with the same material, colour, animated
 * values and time share one drawElements. drawRun() then issues one run's draws between DynamicArtwork's
 * scene.end() and scene.begin().
 *
 * The programs are the layers' (the Torappu particle fragment shaders, ported from the GLSL), with a vertex shader
 * of their own that takes positions already in skeleton units and, for a material with custom vertex streams,
 * passes the 8 inputs its shader reads; one is built the first time a system needs it, and one that does not build
 * here leaves out only its own systems. Blending is the layers': premultiplied output, alpha (ONE,
 * ONE_MINUS_SRC_ALPHA), additive (ONE, ONE) writing alpha 0; only mesh particles whose material culls are culled
 * (Unity's front faces wind clockwise on screen, the other way under an emitter that mirrors them).
 *
 * A material samples layers.json's textures (the layer renderer's, read when drawn) and the particle file's own,
 * uploaded as they arrive (the idle ones with the artwork, an action's in the background): a system whose textures
 * are not all on the GPU yet is simulated but not drawn. Everything is uploaded again after a lost context.
 */

type Context = InstanceType<typeof Spine['webgl']['ManagedWebGLRenderingContext']>;

/** The particle programs' vertex shader: the position is already in skeleton units (the canvas's camera space). */
export function particleVertex(custom: boolean): string {
  return `
attribute vec2 a_position;
attribute vec2 a_uv;
attribute vec4 a_color;
${custom ? 'attribute vec4 a_in0;\nattribute vec4 a_in1;\nvarying vec4 v_in0;\nvarying vec4 v_in1;' : ''}
uniform mat4 u_projection;
varying vec2 v_uv;
varying vec4 v_color;
void main() {
  v_uv = a_uv;
  v_color = a_color;${custom ? '\n  v_in0 = a_in0;\n  v_in1 = a_in1;' : ''}
  gl_Position = u_projection * vec4(a_position, 0.0, 1.0);
}`;
}

/** What a frame's draw needs to know besides the simulation. */
export interface ParticleFrame {
  /** The height the view shows, skeleton units (the size cap's 'view' basis only). */
  viewHeight: number;
  /** 0..1: particles fading in after a late load. */
  fade: number;
  /** Whether a bone follower's system has its bone now (else it is not drawn: its emitter would sit at the root). */
  placed: (data: ParticleSystemData) => boolean;
}

export interface ParticleRenderer {
  /** Expands and uploads this frame's particles; call once a frame after the director stepped, before drawing. */
  prepare(director: ParticleDirector, frame: ParticleFrame): void;
  /** Draws one run (a layers.json `{particles}` entry's systems, the same array) between scene.end() and scene.begin(). */
  drawRun(systems: readonly number[], projection: Float32Array): void;
  /** A particle texture (its index in the union of textures) arrived: it is uploaded, and its systems draw. */
  addTexture(index: number, image: HTMLImageElement): void;
  /** This frame's work: systems drawn, vertices, draws. */
  readonly stats: { systems: number; vertices: number; draws: number };
  dispose(): void;
}

interface Program {
  program: WebGLProgram;
  position: number; uv: number; color: number; in0: number; in1: number;
  uniform: (name: string) => WebGLUniformLocation | null;
}

/** One material, worked out once: its shader's program switches and the textures it samples. */
interface Material {
  index: number;
  material: ParticleMaterial;
  feature: CustomFeature;
  /** Every texture it samples (union indices), main first. */
  textures: number[];
  /** Whether anything in it moves with time (its offsets then depend on each system's clock). */
  scrolls: boolean;
}

/** A draw: a range of one vertex array, the state of its first system (the others in it share it). */
interface Batch {
  custom: boolean;
  quads: boolean;
  first: number;
  count: number;
  /** Mesh draws: their 16-bit indices in the upload array. */
  firstIndex: number;
  indexCount: number;
  key: string;
  material: Material;
  shader: LayerShader;
  tint: ArrayLike<number>;
  t: number;
  cull: 0 | 1 | 2;
}

const powerOfTwo = (n: number) => (n & (n - 1)) === 0;
const SHADER_COLUMN = /^(main\.(st|offset)|dissolve\.|distort\.|ramp\.|edge\.|vertex\.)/;
const IDENTITY_UV = [1, 0, 1, 0] as const;

/** Every texture a shader samples (union indices; null maps read their fallback). */
function shaderTextures(material: ParticleMaterial): number[] {
  const out: number[] = [];
  const add = (index: number | null) => { if (index !== null && !out.includes(index)) out.push(index); };
  add(material.texture);
  const s = material.shader;
  if (s.family === 'noise') add(s.noise.texture);
  else {
    for (const m of s.distort?.maps ?? []) add(m.texture);
    add(s.distort?.weight?.texture ?? null);
    for (const d of s.dissolve) add(d.texture);
    add(s.ramp?.texture ?? null);
    add(s.vertex?.texture ?? null);
    add(s.vertex?.weight?.texture ?? null);
  }
  return out;
}

function moves(shader: LayerShader): boolean {
  const map = (m: Pick<ShaderMap, 'speed' | 'scroll'> | null | undefined) => !!m && (m.speed.some((v) => v !== 0) || m.scroll.some((v) => v !== 0));
  if (map(shader.main)) return true;
  if (shader.family === 'noise') return true;
  return [...(shader.distort?.maps ?? []), shader.distort?.weight, ...shader.dissolve, shader.ramp, shader.vertex, shader.vertex?.weight].some(map);
}

/** Creates the renderer for one document; `runs` are layers.json's `{particles}` entries' system lists (the
 *  arrays drawRun is called with), `layerTexture` the layer renderer's textures (indices below `layerTextures`). */
export function createParticleRenderer(context: Context, doc: ParticleDocument, runs: readonly (readonly number[])[], layerTextures: readonly LayerTexture[],
  layerTexture: (index: number) => WebGLTexture | null): ParticleRenderer {
  const gl = context.gl as WebGLRenderingContext;
  const webgl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
  const first = layerTextures.length;
  // GPU state (recreated after a lost context).
  let programs = new Map<string, Program | null>();
  let own = new Map<number, WebGLTexture>();
  let black: WebGLTexture | null = null, white: WebGLTexture | null = null;
  let leanBuffer: WebGLBuffer | null = null, customBuffer: WebGLBuffer | null = null, meshIndexBuffer: WebGLBuffer | null = null, quadBuffer: WebGLBuffer | null = null;
  const images = new Map<number, HTMLImageElement>();
  const warned = new Set<string>();
  const materials = doc.materials.map((material, index): Material | null => (material ? {
    index, material, feature: customFeature(material), textures: shaderTextures(material), scrolls: moves(material.shader),
  } : null));
  // CPU side.
  const lean = new VertexArray(false), custom = new VertexArray(true);
  let meshIndices = new Uint16Array(4096);
  let meshIndexCount = 0;
  const batches = new Map<readonly number[], Batch[]>(runs.map((run) => [run, []]));
  const matrix = new Float64Array(12);
  const stats = { systems: 0, vertices: 0, draws: 0 };
  // The timeline columns that drive each system's material (its shader parameters, by name), with where each
  // starts in a frame and how many numbers it has (up to the next column).
  const animatedColumns = new Map<number, { names: string[]; at: number[]; width: number[] }>();
  for (const data of doc.systems) {
    const tl = data?.timeline;
    if (!tl) continue;
    const starts = tl.columns.map((c) => tl.at[c]);
    const names: string[] = [], at: number[] = [], width: number[] = [];
    tl.columns.forEach((name, k) => {
      if (!SHADER_COLUMN.test(name)) return;
      names.push(name); at.push(starts[k]); width.push((k + 1 < starts.length ? starts[k + 1] : tl.width) - starts[k]);
    });
    if (names.length) animatedColumns.set(data.index, { names, at, width });
  }

  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type);
    if (!shader) throw new Error('WebGL could not create a shader');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(`Particle shader: ${log}`);
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
      throw new Error(`Particle program: ${log}`);
    }
    const locations = new Map<string, WebGLUniformLocation | null>();
    return {
      program, position: gl.getAttribLocation(program, 'a_position'), uv: gl.getAttribLocation(program, 'a_uv'), color: gl.getAttribLocation(program, 'a_color'),
      in0: gl.getAttribLocation(program, 'a_in0'), in1: gl.getAttribLocation(program, 'a_in1'),
      uniform: (name) => {
        if (!locations.has(name)) locations.set(name, gl.getUniformLocation(program, name));
        return locations.get(name)!;
      },
    };
  };

  /** The program a material needs, built on first use; null when it cannot be built here. */
  const programOf = (m: Material): Program | null => {
    const shader = m.material.shader;
    const key = `${programKey(shader, m.feature)}P`;
    if (programs.has(key)) return programs.get(key)!;
    let built: Program | null = null;
    try {
      // Vertex noise (Ram/VertexDisturb) never reaches a particle in v1 (the export leaves those systems out).
      if (shader.family === 'particle' && shader.vertex) throw new Error('vertex noise on particles');
      built = link(particleVertex(m.feature !== 'none'), shader.family === 'noise' ? noiseFragment(shader.mode) : particleFragment(particleFeatures(shader, m.feature)));
    } catch (error) {
      if (!warned.has(key)) {
        warned.add(key);
        console.warn('[dynamic art] a particle shader could not be built here; its systems are left out', key, error);
      }
    }
    programs.set(key, built);
    return built;
  };

  const solid = (value: number) => {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([value, value, value, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    return texture;
  };

  const uploadTexture = (index: number, image: HTMLImageElement) => {
    const info = doc.textures[index - first];
    if (!info) return;
    const texture = gl.createTexture();
    if (!texture) return;
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const repeatable = webgl2 || (powerOfTwo(info.width) && powerOfTwo(info.height));
    const mode = (wrap: string) => (!repeatable || wrap === 'clamp' ? gl.CLAMP_TO_EDGE : wrap === 'mirror' ? gl.MIRRORED_REPEAT : gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, mode(info.wrap[0]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, mode(info.wrap[1]));
    gl.bindTexture(gl.TEXTURE_2D, null);
    own.set(index, texture);
  };

  const upload = () => {
    black = solid(0);
    white = solid(255);
    gl.bindTexture(gl.TEXTURE_2D, null);
    for (const [index, image] of images) uploadTexture(index, image);
    leanBuffer = gl.createBuffer();
    customBuffer = gl.createBuffer();
    meshIndexBuffer = gl.createBuffer();
    quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, quadBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, quadIndices(), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
  };
  const release = () => {
    for (const texture of own.values()) gl.deleteTexture(texture);
    if (black) gl.deleteTexture(black);
    if (white) gl.deleteTexture(white);
    for (const buffer of [leanBuffer, customBuffer, meshIndexBuffer, quadBuffer]) if (buffer) gl.deleteBuffer(buffer);
    for (const program of programs.values()) if (program) gl.deleteProgram(program.program);
    own = new Map();
    programs = new Map();
    black = white = leanBuffer = customBuffer = meshIndexBuffer = quadBuffer = null;
  };
  const restorable = { restore: () => { own = new Map(); programs = new Map(); upload(); } };
  upload();
  context.addRestorable(restorable);

  const textureOf = (index: number): WebGLTexture | null => (index < first ? layerTexture(index) : own.get(index) ?? null);
  const ready = (m: Material) => m.textures.every((index) => textureOf(index) !== null);

  /** Mesh indices for a draw: rebased from a system's first vertex to the draw's, into the 16-bit upload array. */
  const pushIndices = (source: Uint32Array, from: number, to: number, shift: number) => {
    if (meshIndexCount + (to - from) > meshIndices.length) {
      const next = new Uint16Array(Math.max(meshIndexCount + (to - from), meshIndices.length * 2));
      next.set(meshIndices.subarray(0, meshIndexCount));
      meshIndices = next;
    }
    for (let k = from; k < to; k++) meshIndices[meshIndexCount++] = source[k] - shift;
  };

  function prepare(director: ParticleDirector, frame: ParticleFrame): void {
    lean.reset();
    custom.reset();
    meshIndexCount = 0;
    stats.systems = 0; stats.vertices = 0; stats.draws = 0;
    const byIndex = runsByIndex(director);
    const ctx = { unit: doc.unit, cameraHeight: doc.camera.height, viewHeight: frame.viewHeight, conventions: PARTICLE_CONVENTIONS, fade: frame.fade };
    for (const systems of runs) {
      const list = batches.get(systems)!;
      list.length = 0;
      for (const index of systems) {
        const run = byIndex.get(index);
        if (!run || run.failed || !run.sim.count) continue;
        const data = run.data;
        if (!data.render || data.material === null) continue;
        if (data.follow && !frame.placed(data)) continue;
        const m = materials[data.material];
        if (!m || !ready(m) || !programOf(m)) continue;
        const state = stateOf(run, m);
        const target = m.feature !== 'none' ? custom : lean;
        const startVertex = target.count, startIndex = target.indexCount, startEnd = target.ends.length;
        lerpMatrix(run.prevMatrix, run.matrix, run.alpha, matrix);
        const system: SystemFrame = {
          data, sim: run.sim, matrix, scale: run.scale, alpha: run.alpha, inputs: m.material.custom,
          meshes: data.render.meshes.map((k) => { const mesh = doc.meshes[k]!; return mesh.builtin === 'quad' ? 'quad' as const : mesh; }),
        };
        let written = 0;
        try {
          written = expandSystem(system, ctx, target);
        } catch (error) {
          if (!warned.has(data.name)) { warned.add(data.name); console.warn('[particles] a system could not be drawn', data.name, error); }
          target.count = startVertex; target.indexCount = startIndex; target.ends.length = startEnd;
          continue;
        }
        if (!written) continue;
        stats.systems++;
        stats.vertices += written;
        const cull = data.render.mode === 'mesh' && m.material.cull ? (mirrored(matrix, run.scale) ? (m.material.cull === 1 ? 2 : 1) : m.material.cull) : 0;
        const key = `${m.index}|${cull}|${Array.from(state.tint).join()}|${state.extra}|${m.scrolls ? state.t : ''}`;
        const make = (quads: boolean, from: number, count: number, firstIndex: number, indexCount: number): Batch => ({
          custom: target === custom, quads, first: from, count, firstIndex, indexCount, key, material: m, shader: state.shader, tint: state.tint, t: state.t, cull,
        });
        const last = list[list.length - 1];
        const joins = (quads: boolean, count: number) => !!last && last.key === key && last.custom === (target === custom) && last.quads === quads
          && last.first + last.count === startVertex && last.count + count <= (quads ? MAX_QUADS * 4 : MAX_VERTICES);
        if (data.render.mode !== 'mesh') {
          if (joins(true, written)) { last.count += written; continue; }
          for (let from = startVertex; from < startVertex + written; from += MAX_QUADS * 4) list.push(make(true, from, Math.min(MAX_QUADS * 4, startVertex + written - from), 0, 0));
          continue;
        }
        if (joins(false, written)) {
          pushIndices(target.indices, startIndex, target.indexCount, -(startVertex - last.first));
          last.count += written;
          last.indexCount += target.indexCount - startIndex;
          continue;
        }
        // Split between particles wherever a draw would pass 65,535 vertices.
        let chunk = startVertex, chunkIndex = startIndex, prevVertex = startVertex, prevIndex = startIndex;
        const close = (endVertex: number, endIndex: number) => {
          if (endVertex === chunk) return;
          list.push(make(false, chunk, endVertex - chunk, meshIndexCount, endIndex - chunkIndex));
          pushIndices(target.indices, chunkIndex, endIndex, chunk - startVertex);
          chunk = endVertex; chunkIndex = endIndex;
        };
        for (let e = startEnd; e < target.ends.length; e += 2) {
          const endVertex = target.ends[e], endIndex = target.ends[e + 1];
          if (endVertex - chunk > MAX_VERTICES) close(prevVertex, prevIndex);
          prevVertex = endVertex; prevIndex = endIndex;
        }
        close(target.count, target.indexCount);
      }
    }
    // One upload per array: the buffer orphaned, then filled.
    const fill = (buffer: WebGLBuffer | null, array: VertexArray) => {
      if (!buffer || !array.count) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, array.f32.byteLength, gl.DYNAMIC_DRAW);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, array.f32.subarray(0, array.count * array.stride));
    };
    fill(leanBuffer, lean);
    fill(customBuffer, custom);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    if (meshIndexBuffer && meshIndexCount) {
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, meshIndexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, meshIndices.byteLength, gl.DYNAMIC_DRAW);
      gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, meshIndices.subarray(0, meshIndexCount));
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    }
  }

  /** A system's material state now: its colour (the timeline's tint, else the material's), its shader with the
   *  values clips drive, its clock (the shader's _Time: the system's own time). */
  function stateOf(run: SystemRun, m: Material): { tint: ArrayLike<number>; shader: LayerShader; t: number; extra: string } {
    const tl = run.data.timeline, row = run.row;
    let tint: ArrayLike<number> = m.material.color;
    let shader = m.material.shader;
    let extra = '';
    if (tl && row) {
      if (Object.hasOwn(tl.at, 'tint')) tint = row.subarray(tl.at.tint, tl.at.tint + 4);
      const columns = animatedColumns.get(run.data.index);
      if (columns) {
        const values: number[] = [];
        columns.names.forEach((_, c) => { for (let k = 0; k < columns.width[c]; k++) values.push(row[columns.at[c] + k]); });
        shader = animatedShader({ ...shader, animated: columns.names } as LayerShader, values);
        extra = values.join();
      }
    }
    return { tint, shader, t: run.sim.time, extra };
  }

  /** Sets one draw's textures and uniforms (the layers' bindEffect, for a particle: no UV map, its own clock). */
  function bind(program: Program, batch: Batch): void {
    const shader = batch.shader;
    let unit = 0;
    const texture = (name: string, index: number | null, fallback: WebGLTexture | null) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, index === null ? fallback : textureOf(index));
      gl.uniform1i(program.uniform(name), unit);
      unit++;
    };
    const wrapOf = (index: number | null): LayerTexture['wrap'] => (index === null ? ['repeat', 'repeat'] : (index < first ? layerTextures[index]?.wrap : doc.textures[index - first]?.wrap) ?? ['repeat', 'repeat']);
    const map = (prefix: string, value: ShaderMap, fallback: WebGLTexture | null = black) => {
      texture(`u_${prefix}`, value.texture, fallback);
      gl.uniform4f(program.uniform(`u_${prefix}ST`), value.st[0], value.st[1], value.st[2], value.st[3]);
      const offset = mapOffset(value, batch.t, wrapOf(value.texture));
      gl.uniform2f(program.uniform(`u_${prefix}Off`), offset[0], offset[1]);
    };
    gl.uniform4f(program.uniform('u_tint'), batch.tint[0], batch.tint[1], batch.tint[2], batch.tint[3]);
    gl.uniform1f(program.uniform('u_add'), batch.material.material.blend === 'add' ? 1 : 0);
    texture('u_main', batch.material.material.texture, white);
    const main = shader.main;
    gl.uniform4f(program.uniform('u_mainST'), main.st[0], main.st[1], main.st[2], main.st[3]);
    gl.uniform4f(program.uniform('u_uvMap'), IDENTITY_UV[0], IDENTITY_UV[1], IDENTITY_UV[2], IDENTITY_UV[3]);
    if (shader.family === 'noise') {
      map('n', shader.noise);
      gl.uniform4f(program.uniform('u_n1'), shader.noise1[0], shader.noise1[1], shader.noise1[2], shader.noise1[3]);
      gl.uniform4f(program.uniform('u_n2'), shader.noise2[0], shader.noise2[1], shader.noise2[2], shader.noise2[3]);
      const n1 = mapOffset({ speed: [shader.noise1[1] / 20, 0], scroll: [0, 0] }, batch.t)[0], n2 = mapOffset({ speed: [shader.noise2[1] / 20, 0], scroll: [0, 0] }, batch.t)[0];
      gl.uniform2f(program.uniform('u_nOff'), n1, n2);
      const glow = shader.glow ?? [0, 0, 0, 0];
      gl.uniform4f(program.uniform('u_glow'), glow[0], glow[1], glow[2], glow[3]);
      return;
    }
    const offset = mapOffset(main, batch.t, wrapOf(batch.material.material.texture));
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
  }

  function drawRun(systems: readonly number[], projection: Float32Array): void {
    const list = batches.get(systems);
    if (!list?.length) return;
    gl.enable(gl.BLEND);
    for (const batch of list) {
      const program = programOf(batch.material);
      if (!program) continue;
      gl.useProgram(program.program);
      gl.uniformMatrix4fv(program.uniform('u_projection'), false, projection);
      bind(program, batch);
      const array = batch.custom ? custom : lean;
      const stride = array.bytes, base = batch.first * stride;
      gl.bindBuffer(gl.ARRAY_BUFFER, batch.custom ? customBuffer : leanBuffer);
      gl.enableVertexAttribArray(program.position);
      gl.vertexAttribPointer(program.position, 2, gl.FLOAT, false, stride, base);
      gl.enableVertexAttribArray(program.uv);
      gl.vertexAttribPointer(program.uv, 2, gl.FLOAT, false, stride, base + 8);
      if (program.color >= 0) {
        gl.enableVertexAttribArray(program.color);
        gl.vertexAttribPointer(program.color, 4, gl.UNSIGNED_BYTE, true, stride, base + 16);
      }
      const inputs = batch.custom ? [program.in0, program.in1].filter((at) => at >= 0) : [];
      if (batch.custom) {
        if (program.in0 >= 0) { gl.enableVertexAttribArray(program.in0); gl.vertexAttribPointer(program.in0, 4, gl.FLOAT, false, stride, base + 20); }
        if (program.in1 >= 0) { gl.enableVertexAttribArray(program.in1); gl.vertexAttribPointer(program.in1, 4, gl.FLOAT, false, stride, base + 36); }
      }
      if (batch.material.material.blend === 'add') gl.blendFunc(gl.ONE, gl.ONE);
      else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      if (batch.cull) {
        // Unity's front faces wind clockwise on screen; the canvas keeps y up, so its winding is the same.
        gl.enable(gl.CULL_FACE);
        gl.frontFace(gl.CW);
        gl.cullFace(batch.cull === 2 ? gl.BACK : gl.FRONT);
      }
      if (batch.quads) {
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, quadBuffer);
        gl.drawElements(gl.TRIANGLES, (batch.count / 4) * 6, gl.UNSIGNED_SHORT, 0);
      } else {
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, meshIndexBuffer);
        gl.drawElements(gl.TRIANGLES, batch.indexCount, gl.UNSIGNED_SHORT, batch.firstIndex * 2);
      }
      stats.draws++;
      if (batch.cull) {
        gl.disable(gl.CULL_FACE);
        gl.frontFace(gl.CCW);
      }
      gl.disableVertexAttribArray(program.position);
      gl.disableVertexAttribArray(program.uv);
      if (program.color >= 0) gl.disableVertexAttribArray(program.color);
      for (const at of inputs) gl.disableVertexAttribArray(at);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    // spine's batcher binds its pages on unit 0 and assumes it is the active one.
    gl.activeTexture(gl.TEXTURE0);
  }

  return {
    prepare,
    drawRun,
    addTexture(index, image) {
      if (index < first || images.has(index)) return;
      images.set(index, image);
      uploadTexture(index, image);
    },
    stats,
    dispose() {
      context.removeRestorable(restorable);
      release();
      images.clear();
    },
  };
}

/** The director's runs by system index (built again whenever the director has another number of runs). */
const indexes = new WeakMap<ParticleDirector, Map<number, SystemRun>>();
function runsByIndex(director: ParticleDirector): Map<number, SystemRun> {
  let map = indexes.get(director);
  if (!map || map.size !== director.runs.length) {
    map = new Map(director.runs.map((run) => [run.data.index, run]));
    indexes.set(director, map);
  }
  return map;
}
