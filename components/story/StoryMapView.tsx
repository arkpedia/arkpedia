import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ContentImg } from '@/components/content/ContentImage';
import { lineDrawing, withManga, type StoryElement, type StoryMap, type StoryText } from '@/lib/story/storyMap';
import dynamic from 'next/dynamic';
import type { StoryLibraryEntry } from '@/lib/story/storyLibrary';
import { useHeightFloor } from '@/components/ui/useHeightFloor';

/*
 * The Arknights Story Map as its author laid it out (lib/story/storyMap.ts): the board is drawn
 * in its own units inside one box scaled to the zoom, so every picture, line and label keeps its
 * place at any size. Each picture is a link to its story. The board's black is the theme's ink,
 * so it reads on either theme; its colours (the frames, the tags, the dashed lines) are its own.
 *
 * Zoom with the buttons, or Ctrl/⌘ and the wheel (a trackpad's pinch); drag to move around.
 * Below the board, the official comics, each under the section it belongs to (withManga). The List
 * view is the reader's complete library, grouped by reading category, independent of the board.
 */

const RECT = 'M0 0H64V64H0z';
const StoryLibrary = dynamic(() => import('./StoryLibrary'));
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

/* Every element is its own positioned box, drawn in the board's order, so what the author put on
   top stays on top: a heart or a star over the cover it marks, a tag over its frame. Positions are
   relative to the board's top left (the caller subtracts its bounds). */

/* A frame or a tag is a rectangle, outlined inside its box as the board draws it; a heart or a
   star is the board's own 64-unit path stretched over its box. */
function Shape({ element }: { element: Extract<StoryElement, { type: 'shape' }> }) {
  const { x, y, width: w, height: h } = element;
  const stroke = element.stroke ? element.strokeWidth : 0;
  return (
    <svg className="story-map-shape" style={{ left: x, top: y, width: w, height: h }} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      {element.path === RECT
        ? <rect x={stroke / 2} y={stroke / 2} width={Math.max(0, w - stroke)} height={Math.max(0, h - stroke)}
            rx={Math.min(element.radius, h / 2, w / 2)} fill={ink(element.fill)} stroke={ink(element.stroke)} strokeWidth={stroke} />
        : <path d={element.path} transform={`scale(${w / 64} ${h / 64})`} fill={ink(element.fill)} stroke={ink(element.stroke)}
            strokeWidth={(stroke * 64) / Math.max(w, h)} strokeLinejoin="round" />}
    </svg>
  );
}

/** A connector, in a box around everything it draws padded by its width so nothing is cut: its
 *  shaft, and at an end with a head (lineDrawing) the board's triangle, in the line's colour. */
export function Line({ element }: { element: Extract<StoryElement, { type: 'line' }> }) {
  const { shaft, heads, box } = lineDrawing(element);
  const { x: left, y: top, width, height } = box;
  const color = ink(element.color);
  return (
    <svg className="story-map-shape story-map-line" style={{ left, top, width, height }} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      {shaft && <line x1={shaft.x1 - left} y1={shaft.y1 - top} x2={shaft.x2 - left} y2={shaft.y2 - top} stroke={color}
        strokeWidth={element.width} strokeDasharray={element.dash ? element.dash.map((n) => n * element.width).join(' ') : undefined} />}
      {heads.map((points, index) => (
        <path key={index} className="story-map-head" d={`M${points.map(([x, y]) => `${x - left},${y - top}`).join('L')}Z`}
          fill={color} stroke={color} strokeWidth={element.width} />
      ))}
    </svg>
  );
}

/** Opening a chapter's popup (pages/story.tsx), for a chapter Timo's sections are known for; any
 *  other story links straight into the reader, as before. */
export interface ChapterOpener {
  has: (story: string | undefined) => boolean;
  open: (story: string) => void;
  isRead?: (story: string | undefined) => boolean;
  progressLabel?: (story: string | undefined) => string | undefined;
}

/** A story's link: its chapter popup at ?chapter=<group> (a plain click opens it in place, a new
 *  tab gets the page with it open), else the reader in a new tab. */
function storyLinkProps(link: { url: string | null; story?: string }, chapters: ChapterOpener) {
  if (link.story && chapters.has(link.story)) {
    const story = link.story;
    return { href: `/story?chapter=${encodeURIComponent(story)}`, onClick: (event: React.MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      chapters.open(story);
    } };
  }
  return { href: link.url ?? undefined, target: '_blank', rel: 'noopener noreferrer' };
}

function Picture({ element, chapters }: { element: Extract<StoryElement, { type: 'picture' }>; chapters: ChapterOpener }) {
  const title = element.link?.title ?? 'A story on the map';
  const style = { left: element.x, top: element.y, width: element.width, height: element.height };
  const art = element.image
    ? <ContentImg src={`/${element.image}`} alt="" draggable={false} />
    : <span className="story-map-missing">{title}</span>;
  if (!element.link?.url) return <span className="story-map-picture is-plain" style={style} title={title} role="img" aria-label={title}>{art}</span>;
  const inPopup = !!element.link.story && chapters.has(element.link.story);
  const read = chapters.isRead?.(element.link.story);
  return <a className={`story-map-picture${read ? ' is-read' : ''}`} style={style} {...storyLinkProps(element.link, chapters)} title={title} aria-label={`${inPopup ? `${title}: its chapters` : `${title} (opens in a new tab)`}${read ? ', read' : ''}`} draggable={false}>{art}{read && <svg className="story-map-read-mark" width="72" height="72" viewBox="0 0 72 72" fill="none" stroke="currentColor" strokeWidth="8" aria-hidden="true"><path d="M16 38 29 51 56 20" /></svg>}</a>;
}

export default function StoryMapView({ map, chapters, library, view = 'map' }: { map: StoryMap; chapters: ChapterOpener; library: StoryLibraryEntry[]; view?: 'map' | 'list' }) {
  const board = useMemo(() => withManga(map), [map]);
  const { bounds } = board;
  const floor = useHeightFloor('story-view');
  const viewport = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(0.15);
  const [scale, setScale] = useState<number | null>(null);
  const shown = scale === null ? fit : Math.max(fit, Math.min(MAX_SCALE, scale));
  // Where to keep in view across a zoom: a board point and where it sits in the viewport.
  const anchor = useRef<{ bx: number; by: number; vx: number; vy: number } | null>(null);

  /* The whole board in the viewport, measured; the board starts there and never zooms out past
     it. The viewport takes the board's proportions (within a floor and a ceiling), so at Fit the
     board fills it, and its height never changes with the zoom. */
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    // Leave one CSS pixel clear so rounding cannot repeatedly add/remove a scrollbar.
    const measure = () => setFit(Math.min(MAX_SCALE, (element.clientWidth - 1) / bounds.width, (element.clientHeight - 1) / bounds.height));
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

  /* Full screen: the map and its controls fill the screen. Where the browser grants it to an
     element (not iOS Safari, which grants it to <video> only) it is the real thing, and Esc or the
     browser's own control leaves it; elsewhere the map fills the window, over the page, until the
     button or Esc closes it. The state follows fullscreenchange, not the click, so leaving by Esc
     puts the button back. Either way the map leaves the page's flow, so a box of its height holds
     its place: the page never shortens under the reader (the Anti-Page Jump rule). */
  const frame = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState<'native' | 'window' | null>(null);
  const [held, setHeld] = useState<number | null>(null);
  useEffect(() => {
    const sync = () => setFull((state) => (document.fullscreenElement === frame.current ? 'native' : state === 'native' ? null : state));
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  const toggleFull = () => {
    if (full === 'native') { void document.exitFullscreen().catch(() => {}); return; }
    if (full === 'window') { setFull(null); return; }
    const element = frame.current;
    if (!element) return;
    setHeld(element.getBoundingClientRect().height);
    if (document.fullscreenEnabled && element.requestFullscreen) void element.requestFullscreen().catch(() => setFull('window'));
    else setFull('window');
  };
  /* Entering or leaving shows the whole board again, except on a portrait screen in full screen:
     there the landscape board would be a strip across the middle, so it starts at the screen's
     full height and pans sideways. The window form also takes Esc, and holds the page still. */
  useLayoutEffect(() => {
    setScale(null);
    if (!full) setHeld(null);
    const frameId = full ? requestAnimationFrame(() => {
      const element = viewport.current;
      if (element && element.clientHeight > element.clientWidth) setScale(Math.min(MAX_SCALE, element.clientHeight / bounds.height));
    }) : 0;
    if (full !== 'window') return () => cancelAnimationFrame(frameId);
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setFull(null); };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => { cancelAnimationFrame(frameId); document.body.style.overflow = overflow; document.removeEventListener('keydown', onKey); };
  }, [full, bounds.height]);

  const atFit = shown <= fit + 1e-6;
  return (
    <div ref={floor.ref} style={held ? { minHeight: held } : undefined}>
    <div ref={frame} className={`story-map-frame${full ? ' is-full' : ''}${full === 'window' ? ' is-window' : ''}`}>
      {view === 'map' && <div className="story-map-toolbar">
        {view === 'map' && (
          <div className="story-map-zoom" role="group" aria-label="Zoom">
            <button type="button" className="ghost btn-sm story-map-zoom-button" onClick={() => zoomTo(shown / STEP)} disabled={atFit} aria-label="Zoom out">−</button>
            <button type="button" className="ghost btn-sm story-map-zoom-button" onClick={() => zoomTo(fit)} disabled={atFit}>Fit</button>
            <button type="button" className="ghost btn-sm story-map-zoom-button" onClick={() => zoomTo(shown * STEP)} disabled={shown >= MAX_SCALE} aria-label="Zoom in">+</button>
          </div>
        )}
        {view === 'map' && (
          <button type="button" className="ghost btn-sm story-map-full" onClick={toggleFull} aria-pressed={!!full}>
            {full ? 'Exit full screen' : 'Full screen'}
          </button>
        )}
      </div>}
      {view === 'map' ? (
        <div ref={viewport} className="story-map-viewport" style={full ? undefined : { aspectRatio: `${bounds.width} / ${bounds.height}` }} onPointerDown={onPointerDown} onPointerMove={onPointerMove}
          onPointerUp={endDrag} onPointerCancel={endDrag} onPointerLeave={endDrag}
          onClickCapture={(event) => { if (drag.current?.moved) { event.preventDefault(); event.stopPropagation(); } }}>
          <div className="story-map-sizer" style={{ width: bounds.width * shown, height: bounds.height * shown }}>
            <div className="story-map-board" style={{ width: bounds.width, height: bounds.height, transform: `scale(${shown})` }}>
              {board.elements.map((element, index) => {
                if (element.type === 'line') {
                  return <Line key={index} element={{ ...element, x1: element.x1 - bounds.x, y1: element.y1 - bounds.y, x2: element.x2 - bounds.x, y2: element.y2 - bounds.y }} />;
                }
                const at = { left: element.x - bounds.x, top: element.y - bounds.y };
                if (element.type === 'text') {
                  return <div key={index} className={`story-map-text${element.wrap ? ' is-wrapped' : ''}`} style={{ ...at, width: element.width, ...textStyle(element) }}>{element.text}</div>;
                }
                if (element.type === 'shape') {
                  const shape = { ...element, x: at.left, y: at.top };
                  return element.label
                    ? <Fragment key={index}><Shape element={shape} /><div className="story-map-label" style={{ ...at, width: element.width, height: element.height, ...textStyle(element.label) }}>{element.label.text}</div></Fragment>
                    : <Shape key={index} element={shape} />;
                }
                return <Picture key={index} element={{ ...element, x: at.left, y: at.top }} chapters={chapters} />;
              })}
            </div>
          </div>
        </div>
      ) : (
        <StoryLibrary entries={library} map={map} chapters={chapters} />
      )}
    </div>
    {floor.spacer}
    </div>
  );
}
