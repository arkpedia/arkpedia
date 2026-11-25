import { useLayoutEffect, useRef, useState } from 'react';
import { ContentImg } from '@/components/content/ContentImage';
import PersonaHeadphones from './PersonaHeadphones';
import layout from '@/config/persona-home-layout.json';
import type { HomeTheme } from '@/lib/events/cosmeticPreviews';

type ProjectedLayer = {
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
  bounds?: number[];
  shadow?: { matrix: number[]; opacity: number };
  fallbackFor?: string;
};

const [assistant, ...layers]: ProjectedLayer[] = layout.layers;

export default function PersonaHomeLayout({ theme, animationStart }: { theme: HomeTheme; animationStart: number }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const [headphones, setHeadphones] = useState(false);
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const resize = () => setScale(element.clientWidth / layout.width);
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
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
    if (layer.effect === 'headphones' && layer.bounds) {
      const shadowStyle = layer.shadow && {
        ...style,
        opacity: layer.shadow.opacity,
        transform: `matrix3d(${layer.shadow.matrix.join(',')})`,
      };
      return <PersonaHeadphones key={index} style={style} shadowStyle={shadowStyle}
        bounds={layer.bounds} animationStart={animationStart} onReady={setHeadphones} />;
    }
    if (layer.fallbackFor === 'headphones' && headphones) return null;
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
      {renderLayer(assistant, -1)}
      <div className="event-persona-interface">{layers.map(renderLayer)}</div>
    </div>
  </div>;
}
