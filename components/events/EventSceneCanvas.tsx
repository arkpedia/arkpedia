import { useEffect, useRef, useState } from 'react';
import { useContentUrl } from '@/lib/content/context';
import type { GameUiPlayer } from '@/lib/events/gameUiPlayer';

/** A data-only room loop. The underlying sprite remains the fallback for
 * reduced motion, WebGL failure, and slow texture downloads. */
export default function EventSceneCanvas({ source, background, animationStart, onReady }: {
  source: string;
  background?: string;
  animationStart: number;
  onReady?: (ready: boolean) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const contentUrl = useContentUrl();
  const backgroundUrl = background && contentUrl(background);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const abort = new AbortController();
    let player: GameUiPlayer | undefined;
    let raf = 0;
    function stop() {
      cancelAnimationFrame(raf);
      setReady(false);
      onReady?.(false);
    }
    function play(scene: GameUiPlayer) {
      if (!element || motion.matches || abort.signal.aborted) return;
      const surface = element;
      const render = (time: number) => {
        const width = Math.min(surface.clientWidth, scene.scene.width);
        const elapsed = Math.max(0, time - animationStart) / 1000;
        if (width) scene.draw(scene.scene.transparent ? elapsed : elapsed % scene.scene.duration,
          { width, height: width * scene.scene.height / scene.scene.width });
        raf = requestAnimationFrame(render);
      };
      render(performance.now());
      setReady(true);
      onReady?.(true);
    }
    function preferenceChanged() {
      stop();
      if (player) play(player);
      else if (!motion.matches) void prepare();
    }
    let loading = false;
    async function prepare() {
      if (!element || loading || abort.signal.aborted) return;
      loading = true;
      try {
        const { loadGameUiPlayer } = await import('@/lib/events/gameUiPlayer');
        const loaded = await loadGameUiPlayer(element, new URL(source, window.location.href).href, abort.signal,
          backgroundUrl ? new URL(backgroundUrl, window.location.href).href : undefined);
        if (abort.signal.aborted) { loaded.dispose(); return; }
        player = loaded;
        play(loaded);
      } catch {
        // The scene keeps its still image if the original effects cannot render.
      } finally { loading = false; }
    }
    if (!motion.matches) void prepare();
    motion.addEventListener('change', preferenceChanged);
    element.addEventListener('webglcontextlost', stop);
    return () => {
      abort.abort();
      motion.removeEventListener('change', preferenceChanged);
      element.removeEventListener('webglcontextlost', stop);
      cancelAnimationFrame(raf);
      player?.dispose();
    };
  }, [source, backgroundUrl, animationStart, onReady]);
  return <canvas ref={canvas} className="event-scene-native" hidden={!ready} aria-hidden="true" />;
}
