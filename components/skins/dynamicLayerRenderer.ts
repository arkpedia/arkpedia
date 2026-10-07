import type { spine as Spine } from '@/lib/vendor/spine-3.8/spine-webgl';
import { combine, followMatrix, layerPose, type DynamicLayer, type DynamicLayers, type LayerClock } from '@/lib/skins/dynamicLayers';

/*
 * Draws an animated outfit's mesh layers (lib/skins/dynamicLayers.ts) into the Spine canvas, the way
 * the game's particle shaders draw them: texture x 2 x vertex colour x tint (the 2 is in the colours
 * layers.json carries), alpha clamped, the texture sampled straight as shipped. The canvas is
 * premultiplied, so the shader writes rgb x alpha and blends (ONE, ONE_MINUS_SRC_ALPHA), or adds with
 * alpha 0 for an additive layer. spine's own batcher cannot do this: it premultiplies before it could
 * clamp, which overbrightens a glow whose tint alpha is above 0.5.
 *
 * Every layer's mesh goes to the GPU once; a frame only sets each layer's matrix, colour and UV map.
 * Only DynamicArtwork imports this, after the reader pressed Animated.
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

export interface LayerRenderer {
  /** Draws one layer at its pose now (nothing when it is hidden). Call between scene.end() and scene.begin(). */
  draw(layer: DynamicLayer, clock: LayerClock, projection: Float32Array): void;
  dispose(): void;
}

type Context = InstanceType<typeof Spine['webgl']['ManagedWebGLRenderingContext']>;
interface Uploaded { vertices: WebGLBuffer; indices: WebGLBuffer; count: number }

const powerOfTwo = (n: number) => (n & (n - 1)) === 0;

/** Uploads the layers' textures and meshes and returns their drawer. Recreates everything when the
 *  context is lost and restored, as spine does for its own textures. */
export function createLayerRenderer(context: Context, layers: DynamicLayers, images: readonly HTMLImageElement[], skeleton: Spine.Skeleton): LayerRenderer {
  const gl = context.gl as WebGLRenderingContext;
  const webgl2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
  let program: WebGLProgram | null = null;
  let textures: (WebGLTexture | null)[] = [];
  let meshes = new Map<DynamicLayer, Uploaded>();
  // A texture that may not repeat in WebGL 1 (not a power of two) clamps, and its layer does not scroll.
  const clamped = new Set<number>();
  let location: {
    position: number; uv: number; color: number; projection: WebGLUniformLocation | null; row0: WebGLUniformLocation | null;
    row1: WebGLUniformLocation | null; uvMap: WebGLUniformLocation | null; tint: WebGLUniformLocation | null; add: WebGLUniformLocation | null;
    texture: WebGLUniformLocation | null;
  } | null = null;

  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type);
    if (!shader) throw new Error('WebGL could not create a shader');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(`Layer shader: ${gl.getShaderInfoLog(shader)}`);
    return shader;
  };

  const release = () => {
    for (const texture of textures) if (texture) gl.deleteTexture(texture);
    for (const mesh of meshes.values()) { gl.deleteBuffer(mesh.vertices); gl.deleteBuffer(mesh.indices); }
    if (program) gl.deleteProgram(program);
    textures = [];
    meshes = new Map();
    program = null;
    location = null;
  };

  const upload = () => {
    const vertexShader = compile(gl.VERTEX_SHADER, VERTEX);
    const fragmentShader = compile(gl.FRAGMENT_SHADER, FRAGMENT);
    program = gl.createProgram();
    if (!program) throw new Error('WebGL could not create a program');
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`Layer program: ${gl.getProgramInfoLog(program)}`);
    location = {
      position: gl.getAttribLocation(program, 'a_position'), uv: gl.getAttribLocation(program, 'a_uv'), color: gl.getAttribLocation(program, 'a_color'),
      projection: gl.getUniformLocation(program, 'u_projection'), row0: gl.getUniformLocation(program, 'u_row0'), row1: gl.getUniformLocation(program, 'u_row1'),
      uvMap: gl.getUniformLocation(program, 'u_uvMap'), tint: gl.getUniformLocation(program, 'u_tint'), add: gl.getUniformLocation(program, 'u_add'),
      texture: gl.getUniformLocation(program, 'u_texture'),
    };
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
    gl.bindTexture(gl.TEXTURE_2D, null);
    for (const entry of layers.draw) {
      if (entry.kind !== 'layer') continue;
      const { layer } = entry;
      const count = layer.vertices.length / 2;
      const interleaved = new Float32Array(count * 8);
      for (let i = 0; i < count; i++) {
        interleaved.set([layer.vertices[i * 2], layer.vertices[i * 2 + 1], layer.uvs[i * 2], layer.uvs[i * 2 + 1]], i * 8);
        if (layer.colors) interleaved.set(layer.colors.subarray(i * 4, i * 4 + 4), i * 8 + 4);
        else interleaved.set([1, 1, 1, 1], i * 8 + 4);
      }
      const vertices = gl.createBuffer()!, indices = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
      gl.bufferData(gl.ARRAY_BUFFER, interleaved, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, layer.triangles, gl.STATIC_DRAW);
      meshes.set(layer, { vertices, indices, count: layer.triangles.length });
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
  };

  const restorable = { restore: () => { textures = []; meshes = new Map(); program = null; upload(); } };
  upload();
  context.addRestorable(restorable);

  return {
    draw(layer, clock, projection) {
      const pose = layerPose(layer, clock);
      const mesh = meshes.get(layer);
      if (!pose || !mesh || !program || !location || pose.color[3] <= 0) return;
      let matrix = pose.matrix;
      if (layer.follow) {
        const bone = skeleton.findBone(layer.follow.bone);
        if (!bone || !bone.active) return;
        matrix = combine(followMatrix(layer.follow, bone), matrix);
      }
      let uv = pose.uv;
      if (clamped.has(layer.texture) && layer.scroll) {
        // Without repeat the scroll would smear the texture's edge: hold it at the start.
        const still = layerPose({ ...layer, scroll: null }, clock);
        if (still) uv = still.uv;
      }
      const l = location;
      gl.useProgram(program);
      gl.uniformMatrix4fv(l.projection, false, projection);
      gl.uniform3f(l.row0, matrix[0], matrix[1], matrix[4]);
      gl.uniform3f(l.row1, matrix[2], matrix[3], matrix[5]);
      gl.uniform4f(l.uvMap, uv[0], uv[1], uv[2], uv[3]);
      gl.uniform4f(l.tint, pose.color[0], pose.color[1], pose.color[2], pose.color[3]);
      gl.uniform1f(l.add, layer.blend === 'add' ? 1 : 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, textures[layer.texture]);
      gl.uniform1i(l.texture, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vertices);
      gl.enableVertexAttribArray(l.position);
      gl.vertexAttribPointer(l.position, 2, gl.FLOAT, false, 32, 0);
      gl.enableVertexAttribArray(l.uv);
      gl.vertexAttribPointer(l.uv, 2, gl.FLOAT, false, 32, 8);
      gl.enableVertexAttribArray(l.color);
      gl.vertexAttribPointer(l.color, 4, gl.FLOAT, false, 32, 16);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.indices);
      gl.enable(gl.BLEND);
      if (layer.blend === 'add') gl.blendFunc(gl.ONE, gl.ONE);
      else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
      gl.disableVertexAttribArray(l.position);
      gl.disableVertexAttribArray(l.uv);
      gl.disableVertexAttribArray(l.color);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
    },
    dispose() {
      context.removeRestorable(restorable);
      release();
    },
  };
}
