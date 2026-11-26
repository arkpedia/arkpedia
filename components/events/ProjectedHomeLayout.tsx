import { useLayoutEffect, useRef, useState } from 'react';
import { ContentArt, ContentImg } from '@/components/content/ContentImage';
import PersonaHeadphones from './PersonaHeadphones';
import PersonaMenuParticles, { type ParticleTrack } from './PersonaMenuParticles';
import EventSceneCanvas from './EventSceneCanvas';
import type { HomeTheme } from '@/lib/home/previews';

type ProjectedLayer = {
  camera?: string;
  width: number;
  height: number;
  matrix: number[];
  opacity?: number;
  children?: ProjectedLayer[];
  bitmap?: { atlas: string; spacing: number; glyphs: Record<string, [number, number, number, number, number]> };
  content?: string;
  sprite?: string;
  themed?: boolean;
  fixedCN?: boolean;
  text?: string;
  label?: string;
  fontSize?: number;
  fontFace?: string;
  color?: string;
  alignment?: number;
  effect?: string;
  emitter?: string;
  particleMask?: string;
  particles?: ParticleTrack[];
  bounds?: number[];
  shadow?: { matrix: number[]; opacity: number };
  fallbackFor?: string;
  motion?: { duration: number; frames: number[][] };
};

type CameraMotion = { rest: number[]; left: number[]; right: number[]; up: number[]; down: number[]; ease: number };
export type ProjectedLayout = {
  width: number;
  height: number;
  layers: ProjectedLayer[];
  motion: { left: CameraMotion; right: CameraMotion };
};

const matrix = (values: number[]) => `matrix3d(${values.join(',')})`;
const clamp = (value: number) => Math.min(1, Math.max(-1, value));
// Screen-relative travel measured in the PC client against its fixed profile overlay.
const frontTravel = { x: .65, y: 1.25 };

export default function ProjectedHomeLayout({ layout, artRoot, theme, animationStart }: {
  layout: ProjectedLayout;
  artRoot: string;
  theme: HomeTheme;
  animationStart: number;
}) {
  const { layers } = layout;
  const cameraLayers = (side: string) => layers.map((layer, index) => layer.camera === side ? renderLayer(layer, index) : null);
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
  }, [layout.width]);

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
  }, [layout.motion]);

  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let running: Animation[] = [];
    const update = () => {
      running.forEach(animation => animation.cancel());
      running = [];
      if (reduced.matches) return;
      for (const sprite of element.querySelectorAll<HTMLElement>('[data-motion-layer]')) {
        const track = sprite.dataset.motionLayer
          ?.split('.')
          .reduce<ProjectedLayer | undefined>((parent, index, depth) =>
            (depth === 0 ? layers : parent?.children)?.[Number(index)], undefined)?.motion;
        if (!track) continue;
        const animation = sprite.animate(track.frames.map(([offset, ...values]) => ({
          offset,
          transform: matrix(values),
        })), { duration: track.duration, iterations: Infinity });
        animation.currentTime = Math.max(0, performance.now() - animationStart) % track.duration;
        running.push(animation);
      }
    };
    update();
    reduced.addEventListener('change', update);
    return () => {
      reduced.removeEventListener('change', update);
      running.forEach(animation => animation.cancel());
    };
  }, [layers, animationStart]);

  const values: Record<string, string> = {
    sanity: String(theme.profile?.sanity.current ?? 210),
    sanityTitle: theme.localized ? 'Sanity' : '理智',
    recruitment: theme.localized ? 'Recruitment' : '招募',
    recruit: theme.localized ? 'Recruit' : '公开招募',
    headhunt: theme.localized ? 'Headhunt' : '干员寻访',
    maxSanity: '/' + (theme.profile?.sanity.capacity ?? 210),
    level: String(theme.profile?.level ?? 120),
    doctor: theme.profile?.name ?? 'Doctor',
    progress: theme.localized ? 'All complete' : '全部完成',
    dialogue: theme.localized ? 'The spring sunlight in Laterano makes this room feel so warm.' : '……拉特兰春天的阳光，把屋子照得暖洋洋的了啊。真舒服呢。',
    lmd: '12000',
    orundum: '12000',
    originite: '1',
  };
  function renderLayer(layer: ProjectedLayer, index: string | number) {
    const value = layer.content ?? values[layer.text ?? ''];
    // The fixed profile and menu slots can be narrower than their localized text.
    const characterWidth = layer.fontFace === 'AEwide' ? .61
      : layer.fontFace === 'Novecentowide-Medium' ? .73
      : undefined;
    const fontSize = characterWidth && value && layer.fontSize
      ? Math.min(layer.fontSize, layer.width / (value.length * characterWidth))
      : layer.fontSize;
    const alignment = layer.alignment;
    const horizontal = ['start', 'center', 'end'] as const;
    const style = {
      width: layer.width, height: layer.height, fontSize, color: layer.color,
      justifyItems: alignment === undefined ? undefined : horizontal[alignment % 3],
      alignItems: alignment === undefined ? undefined : horizontal[Math.floor(alignment / 3)],
      opacity: layer.opacity, transform: matrix(layer.matrix),
    };
    if (layer.effect === 'particles' && layer.particles && layer.particleMask && layer.emitter) {
      return <PersonaMenuParticles key={index} emitter={layer.emitter} tracks={layer.particles}
        mask={layer.particleMask} style={style} animationStart={animationStart} />;
    }
    if (layer.effect === 'headphones' && layer.bounds) {
      const shadowStyle = layer.shadow && {
        ...style,
        opacity: layer.shadow.opacity,
        transform: matrix(layer.shadow.matrix),
      };
      return <PersonaHeadphones key={index} style={style} shadowStyle={shadowStyle}
        bounds={layer.bounds} animationStart={animationStart} onReady={setHeadphones} />;
    }
    if (layer.effect === 'shop') return regionalShopArt ? null : <div key={index} className="event-persona-layer" style={style}>
      <EventSceneCanvas source={`${artRoot}/shop-scene.json`} animationStart={animationStart} onReady={setShopReady} />
    </div>;
    if (layer.fallbackFor === 'headphones' && headphones) return null;
    if (layer.fallbackFor === 'shop' && shopReady && !regionalShopArt) return null;
    const bitmap = layer.bitmap;
    if (bitmap && value && [...value].every(character => character in bitmap.glyphs)) {
      const { atlas, spacing, glyphs } = bitmap;
      return <span key={index} className="event-persona-layer event-home-bitmap-digits" data-value={layer.text}
        style={style} role="img" aria-label={`${layer.label} ${value}`}>
        {[...value].map((character, position) => {
          const [x, y, width, height, advance] = glyphs[character];
          return <ContentArt key={position} aria-hidden="true" ownColors src={`${artRoot}/${atlas}.webp`} style={{
            width, height, marginRight: advance - width + (position === value.length - 1 ? 0 : spacing),
            backgroundPosition: `-${x}px -${y}px`,
          }} />;
        })}
      </span>;
    }
    if (!layer.sprite) return <span key={index} className="event-persona-layer event-persona-text"
      data-value={layer.text} data-font-face={layer.fontFace}
      style={style} aria-label={layer.label ? `${layer.label} ${value}` : undefined}>
      {layer.fontFace === 'AEwide' ? <span>{value}</span> : value}
    </span>;
    const regional = layer.themed && theme.nativeArt?.[layer.sprite]?.image;
    if (theme.localized && layer.fixedCN && !regional) return null;
    const source = regional || `${artRoot}/${layer.sprite}.webp`;
    if (layer.children) return <ContentArt key={index} className="event-persona-layer event-home-soft-mask" src={source} style={style}>
      {layer.children.map((child, childIndex) => renderLayer(child, `${index}.${childIndex}`))}
    </ContentArt>;
    return <ContentImg key={index} eager className="event-persona-layer" style={style}
      data-motion-layer={layer.motion ? index : undefined} src={source} alt={layer.label ?? ''} draggable={false} />;
  }

  return <div ref={viewport} className="event-persona-viewport" role="region" aria-label={`${theme.name} home screen`}>
    <div className="event-persona-layout" style={{ width: layout.width, height: layout.height, transform: `scale(${scale})` }}>
      <div className="event-persona-camera" data-camera="front">{cameraLayers('front')}</div>
      <div ref={leftCamera} className="event-persona-camera" data-camera="left">{cameraLayers('left')}</div>
      <div ref={rightCamera} className="event-persona-camera" data-camera="right">{cameraLayers('right')}</div>
      {layers.map((layer, index) => !layer.camera ? renderLayer(layer, index) : null)}
    </div>
  </div>;
}
