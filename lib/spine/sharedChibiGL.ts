/**
 * One WebGL context for every chibi on the page.
 *
 * A browser gives a page about 16 WebGL contexts and drops the oldest past that: each chibi had
 * its own, so the 16th roaming chibi took the first one's away, and readers who put more than 15
 * on the page saw white boxes with broken-image icons where chibis had been (2026-10-20). Now
 * every chibi draws through this one hidden context and copies its frame into its own 2D
 * canvas (ChibiCanvas), so there is no count at which a chibi loses its picture.
 *
 * The hidden canvas only grows, to the largest chibi frame asked for; each draw uses the
 * bottom-left corner its size needs (WebGL's origin), and the copy reads that corner back.
 * Its textures belong to this context: a chibi loads its atlas here and disposes it on unmount.
 * The context, renderer and canvas go away when the last chibi does.
 */
import type { spine as SpineRuntime } from '@/lib/vendor/spine-3.8/spine-webgl';

type Spine = typeof SpineRuntime;
type Context = InstanceType<Spine['webgl']['ManagedWebGLRenderingContext']>;
type Renderer = InstanceType<Spine['webgl']['SceneRenderer']>;

interface Shared { canvas: HTMLCanvasElement; context: Context; renderer: Renderer; users: number }
let shared: Shared | null = null;

export interface ChibiGL {
  context: Context;
  renderer: Renderer;
  /** Draws one frame `width` x `height` device pixels with `draw`, then copies it into `target`. */
  frame(target: HTMLCanvasElement, width: number, height: number, draw: (renderer: Renderer) => void): void;
  release(): void;
}

export function acquireChibiGL(spine: Spine): ChibiGL {
  if (!shared) {
    const canvas = document.createElement('canvas');
    canvas.width = 1; canvas.height = 1;
    // preserveDrawingBuffer: the frame is read back with drawImage after drawing, not at compositing.
    const context = new spine.webgl.ManagedWebGLRenderingContext(canvas, { alpha: true, premultipliedAlpha: true, antialias: true, preserveDrawingBuffer: true });
    shared = { canvas, context, renderer: new spine.webgl.SceneRenderer(canvas, context, true), users: 0 };
  }
  const own = shared;
  own.users++;
  let released = false;
  return {
    context: own.context,
    renderer: own.renderer,
    frame(target, width, height, draw) {
      const w = Math.max(1, Math.round(width)), h = Math.max(1, Math.round(height));
      // Grow only: resizing reallocates the drawing buffer, and every chibi would do it each frame.
      if (own.canvas.width < w || own.canvas.height < h) {
        own.canvas.width = Math.max(own.canvas.width, w);
        own.canvas.height = Math.max(own.canvas.height, h);
      }
      const gl = own.context.gl;
      gl.viewport(0, 0, w, h);
      gl.enable(gl.SCISSOR_TEST); gl.scissor(0, 0, w, h);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      draw(own.renderer);
      gl.disable(gl.SCISSOR_TEST);
      if (target.width !== w || target.height !== h) { target.width = w; target.height = h; }
      const ctx = target.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);
      // WebGL draws from the bottom-left; in the canvas's own (top-left) coordinates that corner starts at height - h.
      ctx.drawImage(own.canvas, 0, own.canvas.height - h, w, h, 0, 0, w, h);
    },
    release() {
      if (released) return;
      released = true;
      own.users--;
      if (own.users > 0 || shared !== own) return;
      own.renderer.dispose();
      own.context.gl.getExtension('WEBGL_lose_context')?.loseContext();
      shared = null;
    },
  };
}
