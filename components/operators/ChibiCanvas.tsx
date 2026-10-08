import { useEffect, useRef, useState } from 'react';
import StyledSelect from '@/components/ui/StyledSelect';
import type { ChibiModel } from '@/lib/operators/chibi';
export default function ChibiCanvas({ model, label }: { model: ChibiModel; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [animations, setAnimations] = useState<string[]>([]), [animation, setAnimation] = useState('Idle'), [paused, setPaused] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches), [error, setError] = useState('');
  const control = useRef({ animation, paused });
  control.current = { animation, paused };
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const abort = new AbortController(); let stopped = false, frame = 0;
    let cleanup: (() => void) | undefined;
    setError(''); setAnimations([]);
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
      setAnimations(names); setAnimation(initial); state.setAnimation(0, initial, true);
      const renderer = new spine.webgl.SceneRenderer(canvas, context, true);
      // Frame the visible idle pose. Invisible effect slots can be much larger than
      // the character in the setup pose; including them makes bard chibis tiny.
      state.apply(skeleton); skeleton.updateWorldTransform();
      const drawOrder = skeleton.drawOrder;
      skeleton.drawOrder = drawOrder.filter(slot => slot.color.a >= .01);
      const origin = new spine.Vector2(), size = new spine.Vector2(); skeleton.getBounds(origin, size, []);
      skeleton.drawOrder = drawOrder;
      if (!Number.isFinite(size.x) || !Number.isFinite(size.y)) { origin.set(-100, 0); size.set(200, 300); }
      let previous = performance.now(), current = initial;
      cleanup = () => { atlas.dispose(); renderer.dispose(); context.gl.getExtension('WEBGL_lose_context')?.loseContext(); };
      const render = (now: number) => {
        if (stopped) return;
        const dt = Math.min(.05, (now - previous) / 1000); previous = now;
        if (control.current.animation !== current && names.includes(control.current.animation)) { current = control.current.animation; state.setAnimation(0, current, !/die|retreat|start|begin|end/i.test(current)); }
        if (!control.current.paused) state.update(dt);
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
  }, [model]);
  return <div className="chibi-viewer"><canvas ref={canvasRef} aria-label={`${label} chibi`} />
    {error ? <p role="status">{error}</p> : !animations.length ? <p role="status">Loading chibi…</p> : <div className="skin-plan-filter-row"><StyledSelect label="Chibi animation" value={animation} options={animations.map(value => ({ value, label: value }))} onChange={setAnimation} /><button type="button" className="ghost" aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? 'Play' : 'Pause'}</button></div>}
  </div>;
}
