import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

interface ScrollRowProps {
  /** What the row holds, as its accessible name: "Albums", "Skins on sale". Required,
   *  because an overflowing row becomes a keyboard-scrollable region and a region
   *  needs a name. */
  label: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

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
 * Use it for any horizontal list that cannot wrap -- the home skins row, the
 * /music/discover rows. A small fixed set should wrap instead (.no-scroll-wrap).
 * The Stronghold companion has its own drawn rail (components/gamemodes/
 * CompanionScrollRow) for iOS, which ignores ::-webkit-scrollbar.
 */
export default function ScrollRow({ label, children, className, style }: ScrollRowProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);

  const measure = useCallback(() => {
    const el = ref.current;
    if (el) setOverflows(el.scrollWidth > el.clientWidth + 1);
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

  return (
    <div
      ref={ref}
      className={`scroll-row sidescroll${className ? ` ${className}` : ''}`}
      style={style}
      role={overflows ? 'region' : undefined}
      aria-label={overflows ? label : undefined}
      tabIndex={overflows ? 0 : undefined}
    >
      {children}
    </div>
  );
}
