import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';

interface ScrollRowProps {
  /** What the row holds, as its accessible name: "Albums", "Skins on sale". Required,
   *  because an overflowing row becomes a keyboard-scrollable region and a region
   *  needs a name. The arrow buttons are named from it too. */
  label: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Previous/next buttons under the row. For a row that is a page's main content
   *  (the /skins "Available now" shelf): a mouse with only a vertical wheel, and iOS,
   *  which ignores ::-webkit-scrollbar and so shows no bar, get a way along it. */
  controls?: boolean;
  /** An always-visible rail, including browsers that hide native scrollbars at rest. */
  persistentScrollbar?: boolean;
}

/** Where the row is scrolled to, and how far it can go. Zero until measured, so the
 *  server markup and the first client render agree (both buttons disabled). */
interface Extent { left: number; max: number; share: number }

/**
 * A row of cards that scrolls sideways under the site's drawn scrollbar.
 *
 * The row is a flex line (children never shrink) with `overflow-x: auto` and the
 * .sidescroll class, which draws the 10px bar in styles/core/shared.css: resting thumb
 * in --text-faint, teal on hover, space reserved so nothing shifts when it appears. A
 * mouse with only a vertical wheel can grab it; a phone swipes the row.
 *
 * Once the content is wider than the row it also becomes a focusable, named region,
 * so a keyboard can scroll it with the arrow keys -- a row of plain cards otherwise
 * has nothing to focus. Measured, not assumed: a row that fits is a plain row.
 *
 * With `controls`, a previous/next pair of ghost buttons sits under the row (kukki PR
 * #66's shelf arrows, which the move to this primitive had dropped). Each scrolls by
 * most of the row's width, and is disabled at its end. The pair keeps its space while
 * the row fits (hidden, not removed), so measuring never changes the page's height.
 *
 * Use it for any horizontal list that cannot wrap -- the home skins row, the
 * /music/discover rows. A small fixed set should wrap instead (.no-scroll-wrap).
 * The Stronghold companion has its own drawn rail (components/gamemodes/
 * CompanionScrollRow) for iOS, which ignores ::-webkit-scrollbar.
 */
export default function ScrollRow({ label, children, className, style, controls = false, persistentScrollbar = false }: ScrollRowProps) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  const [extent, setExtent] = useState<Extent>({ left: 0, max: 0, share: 1 });
  const overflows = extent.max > 1;

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = Math.max(0, el.scrollWidth - el.clientWidth);
    const left = Math.max(0, Math.min(max, el.scrollLeft));
    const share = el.scrollWidth ? el.clientWidth / el.scrollWidth : 1;
    setExtent((current) => (current.left === left && current.max === max && current.share === share ? current : { left, max, share }));
  }, []);

  useEffect(() => {
    measure();
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    Array.from(el.children).forEach((child) => ro.observe(child));
    return () => ro.disconnect();
  }, [measure, children]);

  const move = (direction: -1 | 1) => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: direction * Math.max(180, el.clientWidth * 0.8), behavior: reduce ? 'auto' : 'smooth' });
  };

  const row = (
    <div
      ref={ref}
      id={controls || persistentScrollbar ? id : undefined}
      className={`scroll-row sidescroll${persistentScrollbar ? ' scroll-row-with-rail' : ''}${className ? ` ${className}` : ''}`}
      style={style}
      role={overflows ? 'region' : undefined}
      aria-label={overflows ? label : undefined}
      tabIndex={overflows ? 0 : undefined}
      onScroll={controls || persistentScrollbar ? measure : undefined}
    >
      {children}
    </div>
  );
  if (!controls && !persistentScrollbar) return row;
  return (
    <>
      {row}
      {persistentScrollbar && <input className="scroll-row-rail" type="range" min={0} max={Math.max(1, extent.max)} value={extent.left}
        style={{ '--scroll-thumb-width': `${extent.share * 100}%` } as CSSProperties}
        aria-label={`Scroll through ${label}`} aria-controls={id} disabled={!overflows}
        onChange={event => { if (ref.current) ref.current.scrollLeft = Number(event.target.value); }} />}
      {controls &&
      <div className="scroll-row-controls" data-idle={overflows ? undefined : ''}>
        <button type="button" className="ghost btn-sm" aria-label={`Scroll back through ${label}`} aria-controls={id}
          disabled={extent.left <= 1} onClick={() => move(-1)}>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="m12 5-5 5 5 5" /></svg>
        </button>
        <button type="button" className="ghost btn-sm" aria-label={`Scroll on through ${label}`} aria-controls={id}
          disabled={extent.left >= extent.max - 1} onClick={() => move(1)}>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="m8 5 5 5-5 5" /></svg>
        </button>
      </div>}
    </>
  );
}
