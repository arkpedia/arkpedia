import { CSSProperties, ReactNode, useEffect, useId, useRef, useState } from 'react';

/** A persistent mouse/keyboard scrollbar, independent of OS overlay settings. */
export default function SkinShelfScroller({ children }: { children: ReactNode }) {
  const viewport = useRef<HTMLDivElement>(null);
  const row = useRef<HTMLDivElement>(null);
  const id = useId();
  const [scroll, setScroll] = useState({ left: 0, max: 0, width: 0 });
  const measure = () => {
    const element = viewport.current;
    if (!element) return;
    const max = Math.max(0, element.scrollWidth - element.clientWidth);
    setScroll({ left: Math.max(0, Math.min(max, element.scrollLeft)), max, width: element.clientWidth });
  };
  useEffect(() => {
    const observer = new ResizeObserver(measure);
    if (viewport.current) observer.observe(viewport.current);
    if (row.current) observer.observe(row.current);
    measure();
    return () => observer.disconnect();
  }, []);
  const move = (direction: number) => viewport.current?.scrollBy({
    left: direction * Math.max(180, scroll.width * 0.8),
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
  });
  const thumb = scroll.width ? `${100 * scroll.width / (scroll.width + scroll.max)}%` : '100%';

  return <>
    <div className="skins-current-viewport" id={id} ref={viewport} onScroll={measure}>
      <div className="skins-current-row" ref={row}>{children}</div>
    </div>
    <div className="skins-scroll-controls">
      <button type="button" className="ghost btn-sm" aria-label="Previous available outfits" aria-controls={id} disabled={scroll.left <= 1} onClick={() => move(-1)}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="m12 5-5 5 5 5" /></svg></button>
      <input type="range" className="skins-scrollbar" aria-label="Scroll available outfits" aria-controls={id}
        min={0} max={Math.max(1, scroll.max)} step={1} value={scroll.left} disabled={scroll.max === 0}
        style={{ '--skin-scroll-thumb': thumb } as CSSProperties}
        onChange={event => { if (viewport.current) viewport.current.scrollLeft = Number(event.target.value); measure(); }} />
      <button type="button" className="ghost btn-sm" aria-label="Next available outfits" aria-controls={id} disabled={scroll.left >= scroll.max - 1} onClick={() => move(1)}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="m8 5 5 5-5 5" /></svg></button>
    </div>
  </>;
}
