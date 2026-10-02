import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ContentImg } from '@/components/content/ContentImage';
import SegmentedControl from '@/components/ui/SegmentedControl';
import { storySections, type StoryElement, type StoryMap, type StoryPicture, type StoryText } from '@/lib/story/storyMap';

/*
 * The Arknights Story Map as its author laid it out (lib/story/storyMap.ts): the board is drawn
 * in its own units inside one box scaled to the zoom, so every picture, line and label keeps its
 * place at any size. Each picture is a link to its story. The board's black is the theme's ink,
 * so it reads on either theme; its colours (the frames, the tags, the dashed lines) are its own.
 *
 * Zoom with the buttons, or Ctrl/⌘ and the wheel (a trackpad's pinch); drag to move around.
 * The List view is every story on the board under the board's own section names, for a small
 * screen (storySections).
 */

const RECT = 'M0 0H64V64H0z';
const ink = (color: string | null) => (!color ? 'none' : color.toLowerCase() === '#000000' ? 'var(--text)' : color);
const MAX_SCALE = 1;
const STEP = 1.5;

function textStyle(text: StoryText) {
  return {
    fontSize: `${text.size}px`,
    color: ink(text.color),
    textAlign: text.align,
    fontWeight: text.bold ? 700 : 500,
    fontStyle: text.italic ? 'italic' : undefined,
    textDecoration: text.underline ? 'underline' : undefined,
  } as const;
}

/* A frame or a tag is a rectangle, outlined inside its box as the board draws it; a heart or a
   star is the board's own 64-unit path stretched over its box. */
function Shape({ element }: { element: Extract<StoryElement, { type: 'shape' }> }) {
  const { x, y, width: w, height: h } = element;
  const stroke = element.stroke ? element.strokeWidth : 0;
  return element.path === RECT
    ? <rect x={x + stroke / 2} y={y + stroke / 2} width={Math.max(0, w - stroke)} height={Math.max(0, h - stroke)}
        rx={Math.min(element.radius, h / 2, w / 2)} fill={ink(element.fill)} stroke={ink(element.stroke)} strokeWidth={stroke} />
    : <path d={element.path} transform={`translate(${x} ${y}) scale(${w / 64} ${h / 64})`} fill={ink(element.fill)} stroke={ink(element.stroke)}
        strokeWidth={(stroke * 64) / Math.max(w, h)} strokeLinejoin="round" />;
}

function Picture({ element }: { element: Extract<StoryElement, { type: 'picture' }> }) {
  const title = element.link?.title ?? 'A story on the map';
  const style = { left: element.x, top: element.y, width: element.width, height: element.height };
  const art = element.image
    ? <ContentImg src={`/${element.image}`} alt="" draggable={false} />
    : <span className="story-map-missing">{title}</span>;
  return element.link?.url
    ? <a className="story-map-picture" style={style} href={element.link.url} target="_blank" rel="noopener noreferrer" title={title} aria-label={`${title} (opens in a new tab)`} draggable={false}>{art}</a>
    : <span className="story-map-picture is-plain" style={style} title={title} role="img" aria-label={title}>{art}</span>;
}

function ListCard({ story }: { story: StoryPicture }) {
  const title = story.link?.title ?? 'A story on the map';
  const art = story.image && <ContentImg src={`/${story.image}`} alt="" />;
  return story.link?.url
    ? <a className="story-list-card" href={story.link.url} target="_blank" rel="noopener noreferrer">{art}<span>{title}</span></a>
    : <span className="story-list-card is-plain">{art}<span>{title}</span></span>;
}

export default function StoryMapView({ map }: { map: StoryMap }) {
  const { bounds } = map;
  const [view, setView] = useState<'map' | 'list'>('map');
  const viewport = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(0.15);
  const [scale, setScale] = useState<number | null>(null);
  const shown = scale ?? fit;
  // Where to keep in view across a zoom: a board point and where it sits in the viewport.
  const anchor = useRef<{ bx: number; by: number; vx: number; vy: number } | null>(null);

  /* The whole board in the viewport, measured; the board starts there and never zooms out past
     it. The viewport takes the board's proportions (within a floor and a ceiling), so at Fit the
     board fills it, and its height never changes with the zoom. */
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const measure = () => setFit(Math.min(element.clientWidth / bounds.width, element.clientHeight / bounds.height));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [bounds.width, bounds.height, view]);

  const zoomTo = useCallback((next: number, at?: { vx: number; vy: number }) => {
    const element = viewport.current;
    if (!element) return;
    const clamped = Math.min(MAX_SCALE, Math.max(fit, next));
    const vx = at?.vx ?? element.clientWidth / 2;
    const vy = at?.vy ?? element.clientHeight / 2;
    anchor.current = { bx: (element.scrollLeft + vx) / shown, by: (element.scrollTop + vy) / shown, vx, vy };
    setScale(clamped);
  }, [fit, shown]);

  // After a zoom, scroll so the anchored board point is back where it was in the viewport.
  useLayoutEffect(() => {
    const element = viewport.current;
    const point = anchor.current;
    if (!element || !point) return;
    anchor.current = null;
    element.scrollLeft = point.bx * shown - point.vx;
    element.scrollTop = point.by * shown - point.vy;
  }, [shown]);

  // Ctrl/⌘ + wheel (and a trackpad's pinch, which arrives as one) zooms around the pointer.
  useEffect(() => {
    const element = viewport.current;
    if (!element || view !== 'map') return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      zoomTo(shown * Math.exp(-event.deltaY / 300), { vx: event.clientX - rect.left, vy: event.clientY - rect.top });
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [view, shown, zoomTo]);

  /* Drag to move, with a mouse (touch already pans the box). A drag that moved is not a click,
     so letting go over a picture does not open it. */
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse' || event.button !== 0 || !viewport.current) return;
    drag.current = { x: event.clientX, y: event.clientY, left: viewport.current.scrollLeft, top: viewport.current.scrollTop, moved: false };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    const element = viewport.current;
    if (!state || !element) return;
    const dx = event.clientX - state.x, dy = event.clientY - state.y;
    if (!state.moved && Math.hypot(dx, dy) < 5) return;
    state.moved = true;
    element.classList.add('is-dragging');
    element.scrollLeft = state.left - dx;
    element.scrollTop = state.top - dy;
  };
  const endDrag = () => {
    viewport.current?.classList.remove('is-dragging');
    // Cleared after this event's click, which checks it.
    setTimeout(() => { drag.current = null; }, 0);
  };

  const sections = useMemo(() => storySections(map), [map]);
  const count = sections.reduce((n, section) => n + section.stories.length, 0);

  const atFit = shown <= fit + 1e-6;
  return (
    <div>
      <div className="story-map-toolbar">
        <SegmentedControl label="Show the map as" value={view} onChange={setView}
          options={[{ value: 'map', label: 'Map' }, { value: 'list', label: 'List', count }]} />
        {view === 'map' && (
          <div className="story-map-zoom" role="group" aria-label="Zoom">
            <button type="button" className="ghost btn-sm story-map-zoom-button" onClick={() => zoomTo(shown / STEP)} disabled={atFit} aria-label="Zoom out">−</button>
            <button type="button" className="ghost btn-sm story-map-zoom-button" onClick={() => zoomTo(fit)} disabled={atFit}>Fit</button>
            <button type="button" className="ghost btn-sm story-map-zoom-button" onClick={() => zoomTo(shown * STEP)} disabled={shown >= MAX_SCALE} aria-label="Zoom in">+</button>
          </div>
        )}
      </div>
      {view === 'map' ? (
        <div ref={viewport} className="story-map-viewport" style={{ aspectRatio: `${bounds.width} / ${bounds.height}` }} onPointerDown={onPointerDown} onPointerMove={onPointerMove}
          onPointerUp={endDrag} onPointerCancel={endDrag} onPointerLeave={endDrag}
          onClickCapture={(event) => { if (drag.current?.moved) { event.preventDefault(); event.stopPropagation(); } }}>
          <div className="story-map-sizer" style={{ width: bounds.width * shown, height: bounds.height * shown }}>
            <div className="story-map-board" style={{ width: bounds.width, height: bounds.height, transform: `scale(${shown})` }}>
              <svg className="story-map-lines" viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`} aria-hidden="true">
                {map.elements.map((element, index) => {
                  if (element.type === 'shape') return <Shape key={index} element={element} />;
                  if (element.type === 'line') {
                    return <line key={index} x1={element.x1} y1={element.y1} x2={element.x2} y2={element.y2} stroke={ink(element.color)}
                      strokeWidth={element.width} strokeDasharray={element.dash ? element.dash.map((n) => n * element.width).join(' ') : undefined} />;
                  }
                  return null;
                })}
              </svg>
              {map.elements.map((element, index) => {
                const at = (x: number, y: number) => ({ left: x - bounds.x, top: y - bounds.y });
                if (element.type === 'text') {
                  return <div key={index} className="story-map-text" style={{ ...at(element.x, element.y), width: element.width, ...textStyle(element) }}>{element.text}</div>;
                }
                if (element.type === 'shape' && element.label) {
                  return <div key={index} className="story-map-label" style={{ ...at(element.x, element.y), width: element.width, height: element.height, ...textStyle(element.label) }}>{element.label.text}</div>;
                }
                if (element.type === 'picture') return <Picture key={index} element={{ ...element, x: element.x - bounds.x, y: element.y - bounds.y }} />;
                return null;
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="story-list-sections">
          {sections.map((section) => (
            <div key={section.name} className="story-list-section">
              <h3>{section.name}</h3>
              <ul className="story-list">
                {section.stories.map((story) => <li key={story.id}><ListCard story={story} /></li>)}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
