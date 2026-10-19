/**
 * A Spine texture page uploaded PREMULTIPLIED, whatever the file holds, so every skeleton is drawn
 * with premultipliedAlpha = true (drawSkeleton(skeleton, true)).
 *
 * Why: spine-ts 3.8's WebGL blend table writes Screen as (ONE, ONE_MINUS_SRC_ALPHA) and Multiply
 * as (DST_COLOR, ONE_MINUS_SRC_ALPHA) for either kind of texture -- both assume premultiplied
 * colour. Many of the game's chibi and artwork pages are straight alpha, and keep colour in their
 * fully transparent pixels. Drawn straight, a Screen slot paints that colour too: Mudrock's
 * Silent Night DN06 candle light (slot F_Light_01) drew as a solid yellow blob with jagged edges
 * (2026-10-20). Premultiplied, those pixels are nothing, as in the game; Normal and Additive slots
 * look the same either way.
 *
 * The flag is set around every upload, including the one a lost-and-restored WebGL context makes
 * (GLTexture.restore calls update), and put back after, so no other texture is affected.
 * scripts/tests/test-spine-premultiplied.ts holds every skeleton renderer to this.
 */
import type { spine as SpineRuntime } from '@/lib/vendor/spine-3.8/spine-webgl';

type Spine = typeof SpineRuntime;
type Context = InstanceType<Spine['webgl']['ManagedWebGLRenderingContext']>;

export function premultipliedTexture(spine: Spine, context: Context, image: HTMLImageElement, filePremultiplied: boolean) {
  // No mipmaps, as every renderer here creates its pages.
  const texture = new spine.webgl.GLTexture(context, image);
  if (filePremultiplied) return texture;
  const upload = texture.update.bind(texture);
  texture.update = (useMipMaps: boolean) => {
    const gl = context.gl;
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    try {
      upload(useMipMaps);
    } finally {
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    }
  };
  // The constructor uploaded the page straight; upload it again, premultiplied.
  texture.update(false);
  return texture;
}
