import { useLayoutEffect, useRef, useState } from 'react';
import { ContentImg } from '@/components/content/ContentImage';
import PersonaHeadphones from './PersonaHeadphones';
import PersonaMenuParticles, { type ParticleTrack } from './PersonaMenuParticles';
import EventSceneCanvas from './EventSceneCanvas';
import layout from '@/config/persona-home-layout.json';
import type { HomeTheme } from '@/lib/events/cosmeticPreviews';

type ProjectedLayer = {
  camera?: string;
  width: number;
  height: number;
  matrix: number[];
  opacity?: number;
  sprite?: string;
  themed?: boolean;
  fixedCN?: boolean;
  text?: string;
  label?: string;
  fontSize?: number;
  effect?: string;
  emitter?: string;
  particleMask?: string;
  particles?: ParticleTrack[];
  bounds?: number[];
  shadow?: { matrix: number[]; opacity: number };
  fallbackFor?: string;
};

const [assistant, ...layers]: ProjectedLayer[] = layout.layers;
const cameraLayers = (side: string) => layers.filter(layer => layer.camera === side);
const leftLayers = cameraLayers('left');
const rightLayers = cameraLayers('right');
const overlayLayers = layers.filter(layer => !layer.camera);
const clamp = (value: number) => Math.min(1, Math.max(-1, value));
// Screen-relative travel measured in the PC client against its fixed profile overlay.
const frontTravel = { x: .65, y: 1.25 };

export default function PersonaHomeLayout({ theme, animationStart }: { theme: HomeTheme; animationStart: number }) {
  const viewport = useRef<HTMLDivElement>(null);
  const leftCamera = useRef<HTMLDivElement>(null);
  const rightCamera = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const [headphones, setHeadphones] = useState(false);
  const [shopReady, setShopReady] = useState(false);
  const regionalShopArt = layers.some(layer => layer.fallbackFor === 'shop' && layer.sprite && theme.nativeArt?.[layer.sprite]);
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const resize = () => setScale(element.clientWidth / layout.width);
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const stage = viewport.current?.closest<HTMLElement>('.event-scene-stage');
    if (!stage || !leftCamera.current || !rightCamera.current) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const views = [leftCamera.current, rightCamera.current].map((element, index) => {
      const camera = index === 0 ? layout.motion.left : layout.motion.right;
      const inverse = new DOMMatrix(camera.rest).inverse();
      element.style.setProperty('--persona-camera-ease', `${3 / camera.ease}s`);
      return { element, camera, inverse };
    });
    stage.style.setProperty('--persona-front-ease', `${3 / layout.motion.left.ease}s`);
    const center = () => {
      stage.style.removeProperty('--persona-front-transform');
      for (const { element } of views) element.style.removeProperty('--persona-camera-transform');
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || event.buttons || motion.matches) return;
      const { left, top, width, height } = stage.getBoundingClientRect();
      if (!width || !height) return;
      const x = clamp(2 * (event.clientX - left) / width - 1);
      const y = clamp(2 * (event.clientY - top) / height - 1);
      stage.style.setProperty('--persona-front-transform', `translate(${-x * frontTravel.x}%, ${-y * frontTravel.y}%)`);
      for (const { element, camera, inverse } of views) {
        const horizontal = x < 0 ? camera.left : camera.right;
        const vertical = y < 0 ? camera.up : camera.down;
        const plane = camera.rest.map((value, index) =>
          value + Math.abs(x) * (horizontal[index] - value) + Math.abs(y) * (vertical[index] - value));
        // Convert the neutral screen plane back to the canvas before applying its new camera.
        const transform = new DOMMatrix(plane).multiply(inverse);
        element.style.setProperty('--persona-camera-transform', transform.toString());
      }
    };
    const listeners = new AbortController();
    const options = { signal: listeners.signal };
    stage.addEventListener('pointermove', move, options);
    stage.addEventListener('pointerleave', center, options);
    stage.addEventListener('pointerdown', center, options);
    motion.addEventListener('change', center, options);
    return () => {
      listeners.abort();
      center();
      stage.style.removeProperty('--persona-front-ease');
    };
  }, []);

  const values: Record<string, string> = {
    sanity: String(theme.profile?.sanity.current ?? 210),
    maxSanity: '/' + (theme.profile?.sanity.capacity ?? 210),
    level: String(theme.profile?.level ?? 120),
    doctor: theme.localized ? 'Doctor' : '博士',
    progress: theme.localized ? 'All complete' : '全部完成',
    dialogue: theme.localized ? 'The spring sunlight in Laterano makes this room feel so warm.' : '……拉特兰春天的阳光，把屋子照得暖洋洋的了啊。真舒服呢。',
    lmd: '12000',
    orundum: '12000',
    originite: '1',
  };
  function renderLayer(layer: ProjectedLayer, index: number) {
    const style = {
      width: layer.width, height: layer.height, fontSize: layer.fontSize,
      opacity: layer.opacity, transform: `matrix3d(${layer.matrix.join(',')})`,
    };
    if (layer.effect === 'particles' && layer.particles && layer.particleMask && layer.emitter) {
      return <PersonaMenuParticles key={index} emitter={layer.emitter} tracks={layer.particles}
        mask={layer.particleMask} style={style} animationStart={animationStart} />;
    }
    if (layer.effect === 'headphones' && layer.bounds) {
      const shadowStyle = layer.shadow && {
        ...style,
        opacity: layer.shadow.opacity,
        transform: `matrix3d(${layer.shadow.matrix.join(',')})`,
      };
      return <PersonaHeadphones key={index} style={style} shadowStyle={shadowStyle}
        bounds={layer.bounds} animationStart={animationStart} onReady={setHeadphones} />;
    }
    if (layer.effect === 'shop') return regionalShopArt ? null : <div key={index} className="event-persona-layer" style={style}>
      <EventSceneCanvas source="/event-preview/tm_p3r_1/shop-scene.json" animationStart={animationStart} onReady={setShopReady} />
    </div>;
    if (layer.fallbackFor === 'headphones' && headphones) return null;
    if (layer.fallbackFor === 'shop' && shopReady && !regionalShopArt) return null;
    if (!layer.sprite) return <span key={index} className="event-persona-layer event-persona-text"
      data-value={layer.text} style={style} aria-label={layer.label ? `${layer.label} ${values[layer.text ?? '']}` : undefined}>
      {values[layer.text ?? '']}
    </span>;
    const regional = layer.themed && theme.nativeArt?.[layer.sprite]?.image;
    if (theme.localized && layer.fixedCN && !regional) return null;
    return <ContentImg key={index} eager className="event-persona-layer" style={style}
      src={regional || `/event-preview/tm_p3r_1/${layer.sprite}.webp`} alt={layer.label ?? ''} draggable={false} />;
  }

  return <div ref={viewport} className="event-persona-viewport" role="region" aria-label={`${theme.name} home screen`}>
    <div className="event-persona-layout" style={{ width: layout.width, height: layout.height, transform: `scale(${scale})` }}>
      <div className="event-persona-camera" data-camera="front">{renderLayer(assistant, -1)}</div>
      <div ref={leftCamera} className="event-persona-camera" data-camera="left">{leftLayers.map(renderLayer)}</div>
      <div ref={rightCamera} className="event-persona-camera" data-camera="right">{rightLayers.map(renderLayer)}</div>
      {overlayLayers.map(renderLayer)}
    </div>
  </div>;
}
