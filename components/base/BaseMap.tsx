import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

/** Keep the base's floor plan intact at every width; zoom reveals the room tiles. */
export default function BaseMap({ children }: { children: ReactNode }) {
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 974, height: 774 });
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const [minimumZoom, setMinimumZoom] = useState(1);
  const minimumZoomRef = useRef(1);
  const userZoomed = useRef(false);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const moved = useRef(false);

  const fittedZoom = useCallback(() => {
    if (!viewport.current || !content.current) return 1;
    // Whole percentage steps match the slider and stay inside the viewport.
    return Math.min(1, Math.max(0.01, Math.floor((viewport.current.clientWidth - 16) / content.current.offsetWidth * 100) / 100));
  }, []);

  const fit = useCallback(() => {
    if (!viewport.current) return;
    const next = fittedZoom();
    minimumZoomRef.current = next;
    setMinimumZoom(next);
    zoomRef.current = next;
    setZoom(next);
    viewport.current.scrollTo(0, 0);
  }, [fittedZoom]);

  const zoomAt = useCallback((value: number, x?: number, y?: number) => {
    const view = viewport.current;
    if (!view) return;
    const next = Math.min(2.5, value <= minimumZoomRef.current + 1e-9 ? minimumZoomRef.current : value);
    if (next === zoomRef.current) return;
    const anchorX = x ?? view.clientWidth / 2, anchorY = y ?? view.clientHeight / 2;
    const left = (view.scrollLeft + anchorX - 8) / zoomRef.current;
    const top = (view.scrollTop + anchorY - 8) / zoomRef.current;
    userZoomed.current = true;
    zoomRef.current = next;
    setZoom(next);
    requestAnimationFrame(() => view.scrollTo(left * next + 8 - anchorX, top * next + 8 - anchorY));
  }, []);

  useEffect(() => {
    const view = viewport.current, grid = content.current;
    if (!view || !grid) return;
    let previousWidth = 0;
    const observer = new ResizeObserver(() => {
      const widthChanged = view.clientWidth !== previousWidth;
      previousWidth = view.clientWidth;
      setSize({ width: grid.offsetWidth, height: grid.offsetHeight });
      const minimum = fittedZoom();
      minimumZoomRef.current = minimum;
      setMinimumZoom(minimum);
      // Staffing can change a row's height. Resize its scrollable canvas without
      // resetting a view the reader has already panned to that room.
      if (widthChanged && (!userZoomed.current || zoomRef.current < minimum)) fit();
    });
    observer.observe(view);
    observer.observe(grid);
    return () => observer.disconnect();
  }, [fit, fittedZoom]);

  useEffect(() => {
    const view = viewport.current;
    if (!view) return;
    let pinch: { distance: number; zoom: number } | null = null;
    let touchStart: { x: number; y: number } | null = null;
    const distance = (e: TouchEvent) => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const box = view.getBoundingClientRect();
      zoomAt(zoomRef.current * (e.deltaY < 0 ? 1.12 : 1 / 1.12), e.clientX - box.left, e.clientY - box.top);
    };
    const start = (e: TouchEvent) => {
      moved.current = false;
      touchStart = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
      if (e.touches.length === 2) {
        e.preventDefault();
        pinch = { distance: distance(e), zoom: zoomRef.current };
      }
    };
    const move = (e: TouchEvent) => {
      if (e.touches.length === 2 || (e.touches.length === 1 && touchStart && (Math.abs(e.touches[0].clientX - touchStart.x) > 4 || Math.abs(e.touches[0].clientY - touchStart.y) > 4))) moved.current = true;
      if (e.touches.length !== 2 || !pinch) return;
      e.preventDefault();
      const box = view.getBoundingClientRect();
      zoomAt(pinch.zoom * distance(e) / pinch.distance, (e.touches[0].clientX + e.touches[1].clientX) / 2 - box.left, (e.touches[0].clientY + e.touches[1].clientY) / 2 - box.top);
    };
    const end = () => { pinch = null; };
    view.addEventListener('wheel', wheel, { passive: false });
    view.addEventListener('touchstart', start, { passive: false });
    view.addEventListener('touchmove', move, { passive: false });
    view.addEventListener('touchend', end);
    view.addEventListener('touchcancel', end);
    return () => {
      view.removeEventListener('wheel', wheel);
      view.removeEventListener('touchstart', start);
      view.removeEventListener('touchmove', move);
      view.removeEventListener('touchend', end);
      view.removeEventListener('touchcancel', end);
    };
  }, [zoomAt]);

  return <section className="base-map" aria-label="Base floor plan">
    <div className="base-map-controls">
      <button type="button" className="ghost" aria-label="Zoom out" disabled={zoom <= minimumZoom} onClick={() => zoomAt(zoomRef.current / 1.2)}>−</button>
      <input type="range" aria-label="Base zoom" min={minimumZoom} max="2.5" step="0.01" value={zoom} onChange={event => zoomAt(Number(event.target.value))} />
      <button type="button" className="ghost" aria-label="Zoom in" onClick={() => zoomAt(zoomRef.current * 1.2)}>+</button>
      <span className="base-map-zoom-value">{Math.round(zoom * 100)}%</span>
      <button type="button" className="ghost" onClick={() => { userZoomed.current = false; fit(); }}>Fit base</button>
    </div>
    <div ref={viewport} className="base-map-viewport" aria-label="Zoomable base map"
      onDragStart={event => event.preventDefault()}
      onMouseDown={event => {
        if (event.button !== 0) return;
        moved.current = false;
        drag.current = { x: event.clientX, y: event.clientY, left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop };
      }}
      onMouseMove={event => {
        if (!drag.current) return;
        const dx = event.clientX - drag.current.x, dy = event.clientY - drag.current.y;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved.current = true;
        if (moved.current) event.currentTarget.scrollTo(drag.current.left - dx, drag.current.top - dy);
      }}
      onMouseUp={() => { drag.current = null; }} onMouseLeave={() => { drag.current = null; }}
      onClickCapture={event => {
        if (moved.current && event.detail !== 0) { event.preventDefault(); event.stopPropagation(); }
        moved.current = false;
      }}>
      <div className="base-map-canvas" style={{ width: size.width * zoom + 16, height: size.height * zoom + 16 }}>
        <div ref={content} className="base-map-content" style={{ transform: `scale(${zoom})` }}>{children}</div>
      </div>
    </div>
  </section>;
}
