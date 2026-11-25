import { useEffect, useRef, type CSSProperties } from 'react';

export type ParticleTrack = {
  frame: number;
  size: number;
  duration: number;
  delay: number;
  frames: number[][];
};

export default function PersonaMenuParticles({ emitter, tracks, mask, style, animationStart }: {
  emitter: string;
  tracks: ParticleTrack[];
  mask: string;
  style: CSSProperties;
  animationStart: number;
}) {
  const surface = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = surface.current;
    if (!element) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let animations: Animation[] = [];

    function stop() {
      animations.forEach(animation => animation.cancel());
      animations = [];
    }
    const refresh = () => {
      stop();
      if (motion.matches) return;
      const elapsed = Math.max(0, performance.now() - animationStart);
      animations = Array.from(element.children, (particle, index) => {
        const { frames, duration, delay } = tracks[index];
        const animation = particle.animate(frames.map(([offset, x, y, scale, rx, ry, rz, r, g, b, opacity]) => ({
          offset, opacity,
          backgroundColor: `rgb(${r * 100}% ${g * 100}% ${b * 100}%)`,
          transform: `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${rz}rad) rotateX(${rx}rad) rotateY(${ry}rad) scale(${scale})`,
        })), { duration, delay, iterations: Infinity });
        animation.currentTime = elapsed;
        return animation;
      });
    };

    refresh();
    motion.addEventListener('change', refresh);
    return () => {
      stop();
      motion.removeEventListener('change', refresh);
    };
  }, [tracks, animationStart]);

  return <div ref={surface} className="event-persona-layer event-persona-particles"
    data-emitter={emitter} style={style} aria-hidden="true">
    {tracks.map(({ size, frame }, index) => <span key={index} style={{
      width: size, height: size, maskImage: `url("/event-preview/tm_p3r_1/${mask}.webp")`,
      maskPosition: `${frame % 2 * 100}% ${Math.floor(frame / 2) * 100}%`,
    }} />)}
  </div>;
}
