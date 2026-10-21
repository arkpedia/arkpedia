/**
 * A Spine texture page uploaded PREMULTIPLIED, so every skeleton is drawn with
 * premultipliedAlpha = true (drawSkeleton(skeleton, true)).
 *
 * Why: spine-ts 3.8's WebGL blend table writes Screen as (ONE, ONE_MINUS_SRC_ALPHA) and Multiply
 * as (DST_COLOR, ONE_MINUS_SRC_ALPHA) for either kind of texture -- both assume premultiplied
 * colour. Many of the game's chibi and artwork pages are straight alpha, and keep colour in their
 * fully transparent pixels. Drawn straight, a Screen slot paints that colour too: Mudrock's
 * Silent Night DN06 candle light (slot F_Light_01) drew as a solid yellow blob with jagged edges
 * (2026-10-20). Premultiplied, those pixels are nothing, as in the game; Normal and Additive slots
 * look the same either way.
 *
 * Whether a page still needs premultiplying is read from the page's own texels, never from a
 * manifest flag. On 2026-10-21 the SD manifest called 239 website chibi models premultiplied whose
 * pages are straight (it flipped Kal'tsit the Esperanta's battle models to premultiplied with the
 * files unchanged), so those pages went up straight and drew every transparent pixel's colour: an
 * opaque yellow-white patch behind her (slot F_G_Light) and white fringes on the bird's feathers.
 * It called 753 others straight whose pages are premultiplied, darkened twice at every soft edge.
 * A premultiplied page cannot hold colour where alpha is 0; a straight export does. Over all 2846
 * website SD pages that day, at most 0.25% of a premultiplied page's transparent texels held
 * colour, and at least 4.4% of a straight page's.
 *
 * UNPACK_PREMULTIPLY_ALPHA_WEBGL is set around every straight page's upload, including the one a lost-and-restored WebGL context makes
 * (GLTexture.restore calls update), and put back after, so no other texture is affected.
 * scripts/tests/test-spine-premultiplied.ts holds every skeleton renderer to this, and the
 * classifier to both kinds of page.
 */
import type { spine as SpineRuntime } from '@/lib/vendor/spine-3.8/spine-webgl';

type Spine = typeof SpineRuntime;
type Context = InstanceType<Spine['webgl']['ManagedWebGLRenderingContext']>;

/** A transparent texel "holds colour" above this channel value (a little above compression noise). */
const COLOURED = 16;
/** Straight when more than this share of the transparent texels holds colour (see above: 0.25% vs 4.4%). */
const STRAIGHT_SHARE = 0.025;
/** At most this many texels are read back to decide; larger pages are sampled in evenly spaced bands. */
const SAMPLE_TEXELS = 1 << 20;
const BANDS = 8;

/**
 * Whether RGBA texels (4 bytes each, as WebGL reads them back, unpremultiplied by nothing) are
 * already premultiplied. A page with no transparent texel is called premultiplied: premultiplying
 * it would change nothing a reader could see.
 */
export function texelsPremultiplied(texels: Uint8Array): boolean {
  let transparent = 0, coloured = 0;
  for (let i = 0; i + 3 < texels.length; i += 4) {
    if (texels[i + 3] !== 0) continue;
    transparent++;
    if (texels[i] > COLOURED || texels[i + 1] > COLOURED || texels[i + 2] > COLOURED) coloured++;
  }
  return coloured <= transparent * STRAIGHT_SHARE;
}

/** The rows read back from a page: all of it up to SAMPLE_TEXELS, else BANDS evenly spaced bands
 *  as [first row, row count]. A straight page's coloured transparent texels are spread over it. */
export function sampledBands(width: number, height: number): [number, number][] {
  const rows = Math.max(1, Math.min(height, Math.floor(SAMPLE_TEXELS / width)));
  if (rows === height) return [[0, height]];
  const bandRows = Math.max(1, Math.floor(rows / BANDS));
  return Array.from({ length: BANDS }, (_, band): [number, number] => [Math.floor((height - bandRows) * band / (BANDS - 1)), bandRows]);
}

/** The texture's texels as uploaded, read back through a framebuffer (a 2D canvas would drop the
 *  colour of transparent pixels, the very thing this looks for). Null when the driver cannot. */
function readTexels(gl: WebGLRenderingContext, texture: WebGLTexture, width: number, height: number): Uint8Array | null {
  const previous = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
  const framebuffer = gl.createFramebuffer();
  if (!framebuffer) return null;
  try {
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) return null;
    const bands = sampledBands(width, height);
    const texels = new Uint8Array(bands.reduce((sum, [, rows]) => sum + rows, 0) * width * 4);
    // Clear older errors, so one here means this read failed (its texels would read as zeros).
    for (let i = 0; i < 16 && gl.getError() !== gl.NO_ERROR; i++);
    let offset = 0;
    for (const [y, rows] of bands) {
      gl.readPixels(0, y, width, rows, gl.RGBA, gl.UNSIGNED_BYTE, texels.subarray(offset, offset + rows * width * 4));
      offset += rows * width * 4;
    }
    return gl.getError() === gl.NO_ERROR ? texels : null;
  } finally {
    gl.bindFramebuffer(gl.FRAMEBUFFER, previous);
    gl.deleteFramebuffer(framebuffer);
  }
}

export function premultipliedTexture(spine: Spine, context: Context, image: HTMLImageElement) {
  // No mipmaps, as every renderer here creates its pages. The constructor uploads the page as the
  // file holds it.
  const texture = new spine.webgl.GLTexture(context, image);
  const gl = context.gl;
  const width = image.naturalWidth || image.width, height = image.naturalHeight || image.height;
  // A page that cannot be read back is premultiplied on upload: most of the game's pages are straight.
  texture.bind();
  const handle = gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null;
  const texels = handle && width && height ? readTexels(gl, handle, width, height) : null;
  if (texels && texelsPremultiplied(texels)) return texture;
  const upload = texture.update.bind(texture);
  texture.update = (useMipMaps: boolean) => {
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    try {
      upload(useMipMaps);
    } finally {
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    }
  };
  // The constructor uploaded the page as the file holds it, straight; upload it again, premultiplied.
  texture.update(false);
  return texture;
}
