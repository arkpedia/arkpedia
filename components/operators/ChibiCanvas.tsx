import { useEffect, useRef, useState } from 'react';
import { premultipliedTexture } from '@/lib/spine/premultipliedTexture';
import { acquireChibiGL } from '@/lib/spine/sharedChibiGL';
import type { PointerEventHandler } from 'react';
import type { ChibiModel } from '@/lib/operators/chibi';
import type { ChibiActivity } from '@/lib/operators/chibiRoutine';
import { chibiIdleAnimation, isChibiTap } from '@/lib/operators/chibiRoutine';
import { chibiAtlas } from '@/lib/operators/chibiAtlas';
import { fetchAsset, loadAssetImage } from '@/lib/assets/assetRetry';
import { pinAssetUrl } from '@/lib/assets/revisions';
interface ChibiCanvasProps {
  model: ChibiModel; label: string; animation: string; onAnimationChange: (value: string) => void;
  onAnimationsChange: (values: string[], durations?: Record<string, number>) => void; paused: boolean; moving: boolean; flipped: boolean;
  onPointerDown: PointerEventHandler<HTMLCanvasElement>; roaming: boolean;
  activity?: ChibiActivity;
  onAnimationComplete?: (looping: boolean) => void;
  animationSequence?: number; once?: boolean; playWhilePaused?: boolean;
}
export default function ChibiCanvas({ model, label, animation, onAnimationChange, onAnimationsChange, paused, moving, flipped, onPointerDown, roaming, activity, animationSequence = 0, once = false, playWhilePaused = false, onAnimationComplete }: ChibiCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const control = useRef({ animation, paused, moving, roaming, activity, animationSequence, once, playWhilePaused, onAnimationComplete });
  control.current = { animation, paused, moving, roaming, activity, animationSequence, once, playWhilePaused, onAnimationComplete };
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const abort = new AbortController(); let stopped = false, frame = 0;
    let cleanup: (() => void) | undefined;
    setError(''); setLoading(true);
    (async () => {
      const [{ spine }, skeletonBytes, atlasText, images] = await Promise.all([
        import('@/lib/vendor/spine-3.8/spine-webgl'),
        fetchAsset(pinAssetUrl(model.skeleton), { signal: abort.signal }).then(res => { if (!res.ok) throw Error('Skeleton unavailable'); return res.arrayBuffer(); }),
        fetchAsset(pinAssetUrl(model.atlas), { signal: abort.signal }).then(res => { if (!res.ok) throw Error('Atlas unavailable'); return res.text(); }),
        Promise.all(Object.entries(model.textures).map(([name, url]) => loadAssetImage(pinAssetUrl(url), { crossOrigin: 'anonymous', signal: abort.signal })
          .then((image): [string, HTMLImageElement] => [name, image], () => { throw Error(abort.signal.aborted ? 'Aborted' : 'Texture unavailable'); }))),
      ]);
      if (stopped) return;
      // The page's one WebGL context (lib/spine/sharedChibiGL.ts); this canvas is a 2D copy target.
      const shared = acquireChibiGL(spine);
      const context = shared.context;
      cleanup = () => shared.release();
      const textures = new Map(images);
      const atlas = chibiAtlas(spine, atlasText, name => { const image = textures.get(name); if (!image) throw Error(`Missing texture ${name}`); return premultipliedTexture(spine, context, image); });
      cleanup = () => { atlas.dispose(); shared.release(); };
      const data = new spine.SkeletonBinary(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(new Uint8Array(skeletonBytes));
      const skeleton = new spine.Skeleton(data); skeleton.setToSetupPose(); skeleton.updateWorldTransform();
      const stateData = new spine.AnimationStateData(data); stateData.defaultMix = .15;
      const state = new spine.AnimationState(stateData);
      state.addListener({ start: () => {}, interrupt: () => {}, end: () => {}, dispose: () => {}, event: () => {}, complete: entry => { if (entry === state.getCurrent(0)) control.current.onAnimationComplete?.(entry.loop && entry.animation.duration > 0); } });
      const names = data.animations.map(value => value.name); const initial = names.includes('Idle') ? 'Idle' : names[0];
      onAnimationsChange(names, Object.fromEntries(data.animations.map(value => [value.name, value.duration]))); setLoading(false);
      // Frame Idle, but retain the selected animation across facing/model changes.
      if (!control.current.roaming && !names.includes(control.current.animation)) onAnimationChange(initial);
      state.setAnimation(0, initial, true);
      const walkAnimation = names.find(name => /^(move|walk)$/i.test(name)) ?? names.find(name => /walk|move/i.test(name));
      const idleAnimation = chibiIdleAnimation(data.animations);
      // Frame the visible idle pose. Invisible effect slots can be much larger than
      // the character in the setup pose; including them makes bard chibis tiny.
      state.apply(skeleton); skeleton.updateWorldTransform();
      const drawOrder = skeleton.drawOrder;
      skeleton.drawOrder = drawOrder.filter(slot => slot.color.a >= .01);
      const origin = new spine.Vector2(), size = new spine.Vector2(); skeleton.getBounds(origin, size, []);
      skeleton.drawOrder = drawOrder;
      if (!Number.isFinite(size.x) || !Number.isFinite(size.y)) { origin.set(-100, 0); size.set(200, 300); }
      // Measure every frame of a clip before playback. Transparent effect attachments
      // do not count, but effects that become visible later must fit too.
      const envelopes = new Map<string, { left: number; bottom: number; right: number; top: number }>();
      const envelope = (name: string) => {
        const cached = envelopes.get(name); if (cached) return cached;
        const pose = new spine.Skeleton(data), sample = new spine.AnimationState(stateData);
        sample.setAnimation(0, name, false);
        const duration = data.animations.find(value => value.name === name)?.duration ?? 0;
        const bounds = { left: origin.x, bottom: origin.y, right: origin.x + size.x, top: origin.y + size.y };
        const steps = Math.max(1, Math.ceil(duration * 30));
        const point = new spine.Vector2(), extent = new spine.Vector2();
        for (let i = 0; i <= steps; i++) {
          if (i) sample.update(duration / steps);
          sample.apply(pose); pose.updateWorldTransform();
          const order = pose.drawOrder;
          pose.drawOrder = order.filter(slot => slot.color.a * pose.color.a >= .01);
          pose.getBounds(point, extent, []); pose.drawOrder = order;
          if (!Number.isFinite(extent.x) || !Number.isFinite(extent.y)) continue;
          bounds.left = Math.min(bounds.left, point.x); bounds.bottom = Math.min(bounds.bottom, point.y);
          bounds.right = Math.max(bounds.right, point.x + extent.x); bounds.top = Math.max(bounds.top, point.y + extent.y);
        }
        envelopes.set(name, bounds); return bounds;
      };
      let previous = performance.now(), current = initial, sequence = 0, wasTap = false, looping = true;
      cleanup = () => { atlas.dispose(); shared.release(); };
      const render = (now: number) => {
        if (stopped) return;
        const dt = Math.min(.05, (now - previous) / 1000); previous = now;
        const fallback = control.current.roaming ? idleAnimation ?? initial : initial;
        const requested = control.current.moving ? walkAnimation ?? fallback
          : control.current.roaming && !control.current.activity ? fallback
          : names.includes(control.current.animation) ? control.current.animation : fallback;
        const tap = isChibiTap(control.current.activity);
        const loop = !tap && !control.current.once && !/die|retreat|start|begin|end/i.test(requested);
        if ((requested !== current || sequence !== control.current.animationSequence || looping !== loop) && names.includes(requested)) {
          current = requested; sequence = control.current.animationSequence; looping = loop;
          const entry = state.setAnimation(0, current, loop);
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
        const holder = canvas.parentElement!;
        const rect = holder.getBoundingClientRect(), baseWidth = Math.max(1, rect.width), baseHeight = Math.max(1, rect.height);
        const baseView = Math.max(size.y * 1.4, size.x * baseHeight / baseWidth * 1.4, 1);
        const measured = envelope(current);
        const bounds = { ...measured, bottom: Math.min(measured.bottom, measured.bottom + skeleton.y), top: Math.max(measured.top, measured.top + skeleton.y) };
        const centerX = origin.x + size.x / 2, centerY = origin.y + size.y / 2;
        const worldWidth = Math.max(baseView * baseWidth / baseHeight, 2 * Math.max(centerX - bounds.left, bounds.right - centerX) * 1.15);
        const worldHeight = Math.max(baseView, 2 * Math.max(centerY - bounds.bottom, bounds.top - centerY) * 1.15);
        // Grow the artwork layer without moving the window's buttons or drag handle.
        // At the viewport edge, fit the complete envelope into the space available.
        const width = Math.min(Math.max(baseWidth, worldWidth / baseView * baseHeight), Math.max(baseWidth, 2 * Math.min(rect.left + baseWidth / 2 - 8, window.innerWidth - 8 - rect.left - baseWidth / 2)));
        const height = Math.min(Math.max(baseHeight, worldHeight / baseView * baseHeight), Math.max(baseHeight, 2 * Math.min(rect.top + baseHeight / 2 - 8, window.innerHeight - 8 - rect.top - baseHeight / 2)));
        // A roaming chibi keeps its size: one world unit is always the same number of pixels, and an
        // effect that does not fit the space left at the viewport's edge is cut there. Fitting the
        // whole envelope instead made a chibi tapped near an edge, or one whose interaction clip has
        // wide effects, shrink to a fraction of its size (2026-10-20). The viewer still fits it all.
        const worldPerPixel = baseView / baseHeight;
        const left = (baseWidth - width) / 2;
        const top = (baseHeight - height) / 2;
        canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
        canvas.style.left = `${left}px`; canvas.style.top = `${top}px`;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const viewHeight = control.current.roaming ? height * worldPerPixel : Math.max(worldHeight, worldWidth * height / width);
        const viewWidth = viewHeight * width / height;
        const order = skeleton.drawOrder;
        skeleton.drawOrder = order.filter(slot => slot.color.a * skeleton.color.a >= .01);
        const actualOrigin = new spine.Vector2(), actualSize = new spine.Vector2();
        skeleton.getBounds(actualOrigin, actualSize, []); skeleton.drawOrder = order;
        canvas.dataset.framed = String(!Number.isFinite(actualSize.x) || (actualOrigin.x >= centerX - viewWidth / 2 && actualOrigin.x + actualSize.x <= centerX + viewWidth / 2
          && actualOrigin.y >= centerY - viewHeight / 2 && actualOrigin.y + actualSize.y <= centerY + viewHeight / 2));
        canvas.dataset.worldPerPixel = String(viewHeight / height);
        // The renderer and its camera are shared: set the camera for this chibi inside its draw.
        shared.frame(canvas, width * dpr, height * dpr, renderer => {
          renderer.camera.position.x = centerX; renderer.camera.position.y = centerY;
          renderer.camera.viewportHeight = viewHeight; renderer.camera.viewportWidth = viewWidth; renderer.camera.update();
          renderer.begin(); renderer.drawSkeleton(skeleton, true); renderer.end();
        });
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
