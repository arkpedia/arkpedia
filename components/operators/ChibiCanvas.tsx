import { useEffect, useRef, useState } from 'react';
import type { PointerEventHandler } from 'react';
import type { ChibiModel } from '@/lib/operators/chibi';
import type { ChibiActivity } from '@/lib/operators/chibiRoutine';
import { chibiIdleAnimation, isChibiTap } from '@/lib/operators/chibiRoutine';
interface ChibiCanvasProps {
  model: ChibiModel; label: string; animation: string; onAnimationChange: (value: string) => void;
  onAnimationsChange: (values: string[], durations?: Record<string, number>) => void; paused: boolean; moving: boolean; flipped: boolean;
  onPointerDown: PointerEventHandler<HTMLCanvasElement>; roaming: boolean;
  activity?: ChibiActivity;
  animationSequence?: number; once?: boolean; playWhilePaused?: boolean;
}
export default function ChibiCanvas({ model, label, animation, onAnimationChange, onAnimationsChange, paused, moving, flipped, onPointerDown, roaming, activity, animationSequence = 0, once = false, playWhilePaused = false }: ChibiCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const control = useRef({ animation, paused, moving, roaming, activity, animationSequence, once, playWhilePaused });
  control.current = { animation, paused, moving, roaming, activity, animationSequence, once, playWhilePaused };
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const abort = new AbortController(); let stopped = false, frame = 0;
    let cleanup: (() => void) | undefined;
    setError(''); setLoading(true);
    (async () => {
      const [{ spine }, skeletonBytes, atlasText, images] = await Promise.all([
        import('@/lib/vendor/spine-3.8/spine-webgl'),
        fetch(model.skeleton, { signal: abort.signal }).then(res => { if (!res.ok) throw Error('Skeleton unavailable'); return res.arrayBuffer(); }),
        fetch(model.atlas, { signal: abort.signal }).then(res => { if (!res.ok) throw Error('Atlas unavailable'); return res.text(); }),
        Promise.all(Object.entries(model.textures).map(([name, url]) => new Promise<[string, HTMLImageElement]>((resolve, reject) => { const image = new Image(); image.crossOrigin = 'anonymous'; image.onload = () => resolve([name, image]); image.onerror = () => reject(Error('Texture unavailable')); image.src = url; abort.signal.addEventListener('abort', () => { image.src = ''; reject(Error('Aborted')); }, { once: true }); }))),
      ]);
      if (stopped) return;
      const context = new spine.webgl.ManagedWebGLRenderingContext(canvas, { alpha: true, antialias: true });
      cleanup = () => context.gl.getExtension('WEBGL_lose_context')?.loseContext();
      const textures = new Map(images);
      const atlas = new spine.TextureAtlas(atlasText, name => { const image = textures.get(name); if (!image) throw Error(`Missing texture ${name}`); return new spine.webgl.GLTexture(context, image); });
      cleanup = () => { atlas.dispose(); context.gl.getExtension('WEBGL_lose_context')?.loseContext(); };
      const data = new spine.SkeletonBinary(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(new Uint8Array(skeletonBytes));
      const skeleton = new spine.Skeleton(data); skeleton.setToSetupPose(); skeleton.updateWorldTransform();
      const stateData = new spine.AnimationStateData(data); stateData.defaultMix = .15;
      const state = new spine.AnimationState(stateData);
      const names = data.animations.map(value => value.name); const initial = names.includes('Idle') ? 'Idle' : names[0];
      onAnimationsChange(names, Object.fromEntries(data.animations.map(value => [value.name, value.duration]))); setLoading(false);
      // Frame Idle, but retain the selected animation across facing/model changes.
      if (!control.current.roaming && !names.includes(control.current.animation)) onAnimationChange(initial);
      state.setAnimation(0, initial, true);
      const walkAnimation = names.find(name => /^(move|walk)$/i.test(name)) ?? names.find(name => /walk|move/i.test(name));
      const idleAnimation = chibiIdleAnimation(data.animations);
      const renderer = new spine.webgl.SceneRenderer(canvas, context, true);
      // Frame the visible idle pose. Invisible effect slots can be much larger than
      // the character in the setup pose; including them makes bard chibis tiny.
      state.apply(skeleton); skeleton.updateWorldTransform();
      const drawOrder = skeleton.drawOrder;
      skeleton.drawOrder = drawOrder.filter(slot => slot.color.a >= .01);
      const origin = new spine.Vector2(), size = new spine.Vector2(); skeleton.getBounds(origin, size, []);
      skeleton.drawOrder = drawOrder;
      if (!Number.isFinite(size.x) || !Number.isFinite(size.y)) { origin.set(-100, 0); size.set(200, 300); }
      let previous = performance.now(), current = initial, sequence = 0, wasTap = false;
      cleanup = () => { atlas.dispose(); renderer.dispose(); context.gl.getExtension('WEBGL_lose_context')?.loseContext(); };
      const render = (now: number) => {
        if (stopped) return;
        const dt = Math.min(.05, (now - previous) / 1000); previous = now;
        const fallback = control.current.roaming ? idleAnimation ?? initial : initial;
        const requested = control.current.moving ? walkAnimation ?? fallback
          : control.current.roaming && !control.current.activity ? fallback
          : names.includes(control.current.animation) ? control.current.animation : fallback;
        const tap = isChibiTap(control.current.activity);
        if ((requested !== current || sequence !== control.current.animationSequence) && names.includes(requested)) {
          current = requested; sequence = control.current.animationSequence;
          const entry = state.setAnimation(0, current, !tap && !control.current.once && !/die|retreat|start|begin|end/i.test(current));
          // A paused routine cannot advance a blend back from the completed reaction.
          if (wasTap && control.current.paused && !tap) entry.mixDuration = 0;
          wasTap = tap;
        }
        if (canvas.dataset.animation !== current) canvas.dataset.animation = current;
        // An explicit tap plays once even with automatic movement paused.
        if ((!control.current.paused || control.current.playWhilePaused) && !document.hidden) state.update(dt);
        // Native Sit lowers the hips below standing ground; lift the pose onto the seat.
        // Sleep stays horizontal above the mattress, with the same camera and scale.
        skeleton.y = control.current.roaming ? size.y * (control.current.activity === 'sit' ? .25 : control.current.activity === 'sleep' ? .13 : 0) : 0;
        state.apply(skeleton); skeleton.updateWorldTransform();
        const width = Math.max(1, canvas.clientWidth), height = Math.max(1, canvas.clientHeight), dpr = Math.min(2, window.devicePixelRatio || 1);
        if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) { canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); }
        const gl = context.gl; gl.viewport(0, 0, canvas.width, canvas.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
        const viewHeight = Math.max(size.y * 1.4, size.x * height / width * 1.4, 1);
        renderer.camera.position.x = origin.x + size.x / 2; renderer.camera.position.y = origin.y + size.y / 2;
        renderer.camera.viewportHeight = viewHeight; renderer.camera.viewportWidth = viewHeight * width / height; renderer.camera.update();
        renderer.begin(); renderer.drawSkeleton(skeleton, model.premultipliedAlpha); renderer.end();
        frame = requestAnimationFrame(render);
      };
      frame = requestAnimationFrame(render);
    })().catch(() => { cleanup?.(); cleanup = undefined; if (!stopped) setError('This chibi could not load. Try another facing or reopen the viewer.'); });
    return () => { stopped = true; abort.abort(); cancelAnimationFrame(frame); cleanup?.(); };
  }, [model, onAnimationChange, onAnimationsChange]);
  return <div className={`chibi-viewer${roaming ? ' is-roaming' : ''}`}>
    <canvas ref={canvasRef} aria-label={`${label} chibi`} title={roaming ? 'Tap to interact · Drag to move' : 'Drag chibi onto the page'} onPointerDown={onPointerDown} style={flipped ? { transform: 'scaleX(-1)' } : undefined} />
    {error ? <p role="status">{error}</p> : loading ? <p role="status">Loading chibi…</p> : null}
  </div>;
}
