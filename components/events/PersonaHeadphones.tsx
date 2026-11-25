import { useEffect, useRef, type CSSProperties } from 'react';
import { fetchAsset, loadAssetImage } from '@/lib/assets/assetRetry';
import { chibiAtlas } from '@/lib/operators/chibiAtlas';
import { premultipliedTexture } from '@/lib/spine/premultipliedTexture';
import { acquireChibiGL } from '@/lib/spine/sharedChibiGL';

const DIRECTORY = '/event-preview/tm_p3r_1';

export default function PersonaHeadphones({ style, bounds, onReady }: {
  style: CSSProperties;
  bounds: number[];
  onReady: (ready: boolean) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const target = canvas.current;
    if (!target) return;
    const signal = new AbortController();
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let release: (() => void) | undefined;
    async function prepare() {
      const [{ spine }, skeleton, atlasText, texture] = await Promise.all([
        import('@/lib/vendor/spine-3.8/spine-webgl'),
        fetchAsset(`${DIRECTORY}/headphone-spine.json`, { signal: signal.signal }).then(r => r.json()),
        fetchAsset(`${DIRECTORY}/headphone-spine.atlas.txt`, { signal: signal.signal }).then(r => r.text()),
        loadAssetImage(`${DIRECTORY}/headphone-spine.webp`, { signal: signal.signal }),
      ]);
      if (signal.signal.aborted || !target) return;
      const shared = acquireChibiGL(spine);
      release = shared.release;
      const atlas = chibiAtlas(spine, atlasText, () => premultipliedTexture(spine, shared.context, texture));
      release = () => { atlas.dispose(); shared.release(); };
      const data = new spine.SkeletonJson(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(skeleton);
      const pose = new spine.Skeleton(data);
      const state = new spine.AnimationState(new spine.AnimationStateData(data));
      state.setAnimation(0, 'loop', true);
      const [x0, x1, y0, y1] = bounds;
      const width = x1 - x0, height = y1 - y0;
      let last = performance.now();
      function draw(time: number) {
        if (!target || signal.signal.aborted) return;
        const delta = motion.matches ? 0 : Math.max(0, Math.min(.05, (time - last) / 1000));
        last = time;
        state.update(delta);
        state.apply(pose);
        pose.updateWorldTransform();
        shared.frame(target, width, height, renderer => {
          renderer.camera.position.x = (x0 + x1) / 2;
          renderer.camera.position.y = (y0 + y1) / 2;
          renderer.camera.viewportWidth = width;
          renderer.camera.viewportHeight = height;
          renderer.camera.update();
          renderer.begin();
          renderer.drawSkeleton(pose, true);
          renderer.end();
        });
        if (!motion.matches) frame = requestAnimationFrame(draw);
      }
      const change = () => { cancelAnimationFrame(frame); draw(performance.now()); };
      motion.addEventListener('change', change);
      release = () => { motion.removeEventListener('change', change); atlas.dispose(); shared.release(); };
      change();
      onReady(true);
    }
    void prepare().catch(() => { release?.(); release = undefined; });
    return () => { signal.abort(); cancelAnimationFrame(frame); release?.(); };
  }, [bounds, onReady]);
  return <canvas ref={canvas} className="event-persona-layer" style={style} aria-hidden="true" />;
}
