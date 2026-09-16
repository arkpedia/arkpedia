import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * A row that scrolls sideways, wearing the two things that say so.
 *
 * A row which simply overflows says nothing at all. The reader sees a control cut off
 * at the edge, which reads as a layout fault as often as it reads as an invitation, and
 * on a touch screen there is no cursor to change shape and no scrollbar to appear --
 * iOS draws overlay scrollbars and ignores ::-webkit-scrollbar entirely, so styling the
 * native one is not an option on the device this is for.
 *
 * So: a fade at whichever end has content past it, and a rail underneath. The fade says
 * there is more; the rail says how much more and where in it you are, which is the part
 * a cut-off edge cannot tell you. Both are measured rather than assumed -- the rail is
 * only rendered when the row actually overflows, so a row that fits is a row with
 * nothing under it, at any width and in any window.
 *
 * The ResizeObserver watches the row AND its children, not the window: the companion's
 * zoom dial resizes this row through CSS zoom without the window's pixel dimensions
 * moving at all, so a window 'resize' listener never fires for it. That is the same
 * trap the Core row's arrows hit, and the comment there is where this one is from.
 */
export default function ScrollRow({ className, children }: { className: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  /** `len` is the visible share of the row, 0-1; `pos` is how far through the scrollable
   *  part we are, 0-1. Together they place the thumb without the CSS needing pixels.
   *  `on` is whether this row is a scroller at all right now. */
  const [rail, setRail] = useState({ on: false, start: false, end: false, len: 1, pos: 0 });

  const read = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    /* Whether the row is SCROLLABLE, which is not the same question as whether its
       content is wider than its box -- and getting those two confused is what put a
       rail under the toggles row in the pop-out. .gm-co-dials carries
       `min-width: max-content`, so its box grows with its content and nothing
       overflows; .gm-co-dials2 overrides that with `min-width: 0; width: 100%`, so its
       content overflows a box that is not a scroller, and the page carries the
       overflow instead. Only the stylesheet knows which of those is in force -- the
       phone gets `overflow-x: auto` and the pop-out deliberately does not -- so this
       asks it rather than inferring from the numbers. */
    const ox = getComputedStyle(el).overflowX;
    const on = ox === 'auto' || ox === 'scroll';
    const max = el.scrollWidth - el.clientWidth;
    const next = {
      on,
      /* 4px of slack at each end. Sub-pixel layout and momentum scrolling both leave
         scrollLeft a fraction short of the end, and a fade that never quite goes out
         says there is more when there is not. */
      start: on && el.scrollLeft > 4,
      end: on && el.scrollLeft < max - 4,
      len: el.scrollWidth > 0 ? Math.min(1, el.clientWidth / el.scrollWidth) : 1,
      pos: max > 0 ? Math.min(1, Math.max(0, el.scrollLeft / max)) : 0,
    };
    /* Returning the previous object unchanged makes React skip the render. A scroll
       fires this at frame rate and most frames move the thumb by less than a pixel. */
    setRail((prev) => (
      prev.on === next.on && prev.start === next.start && prev.end === next.end
      && Math.abs(prev.len - next.len) < 0.002 && Math.abs(prev.pos - next.pos) < 0.002
        ? prev : next
    ));
  }, []);

  useEffect(() => {
    read();
    /* And again on the next frame, because the first read can be too early to be true.
       Whether this row is a scroller depends on a body class -- .gm-popout is put on by
       the companion page's own effect, and a parent's effect runs AFTER its children's,
       so the first read always happens in a document that has not been told it is a
       pop-out yet. It measured overflow-x: auto, drew a rail, and nothing resized
       afterwards to correct it. One frame later the class is on. */
    const soon = requestAnimationFrame(read);
    const el = ref.current;
    if (!el) return () => cancelAnimationFrame(soon);
    el.addEventListener('scroll', read, { passive: true });
    const ro = new ResizeObserver(read);
    ro.observe(el);
    Array.from(el.children).forEach((c) => ro.observe(c));
    return () => {
      cancelAnimationFrame(soon);
      el.removeEventListener('scroll', read);
      ro.disconnect();
    };
  }, [read]);

  /* The rail is a scrollbar, so it can be dragged like one. A phone swipes the row
     itself and never needs this; a mouse has no swipe, and in the pop-out -- a 390px
     window with no room for the row -- dragging the rail is the only way along it that
     does not involve a modifier key. The mapping is exact rather than approximate: the
     thumb's travel is the track less the thumb, and the scroll's travel is the content
     less the viewport, so a pixel of thumb is (max / travel) pixels of scroll. */
  const railRef = useRef<HTMLSpanElement>(null);
  const [dragging, setDragging] = useState(false);
  const onRailDown = useCallback((e: React.PointerEvent<HTMLSpanElement>) => {
    const el = ref.current;
    const track = railRef.current;
    if (!el || !track) return;
    const max = el.scrollWidth - el.clientWidth;
    const travel = track.clientWidth * (1 - (el.clientWidth / el.scrollWidth));
    if (max <= 0 || travel <= 0) return;
    const startX = e.clientX;
    const startScroll = el.scrollLeft;
    const ratio = max / travel;
    /* Captured on the rail, so a drag that leaves it -- which it will, the thing is
       two pixels tall -- keeps arriving here instead of stopping dead. */
    track.setPointerCapture(e.pointerId);
    setDragging(true);
    const move = (ev: PointerEvent) => {
      el.scrollLeft = startScroll + (ev.clientX - startX) * ratio;
    };
    const up = (ev: PointerEvent) => {
      setDragging(false);
      try { track.releasePointerCapture(ev.pointerId); } catch { /* already gone */ }
      track.removeEventListener('pointermove', move);
      track.removeEventListener('pointerup', up);
      track.removeEventListener('pointercancel', up);
    };
    track.addEventListener('pointermove', move);
    track.addEventListener('pointerup', up);
    track.addEventListener('pointercancel', up);
    e.preventDefault();
  }, []);

  const overflows = rail.on && rail.len < 0.999;
  const edges = `${rail.start ? ' at-start' : ''}${rail.end ? ' at-end' : ''}`;
  return (
    <div className={`gm-co-railwrap${edges}`}>
      <div className={`${className} gm-co-scroller`} ref={ref}>{children}</div>
      {overflows && (
        /* aria-hidden: it reports the scroll position of a box the reader can already
           scroll, which assistive tech announces on its own. */
        <span
          ref={railRef}
          className={`gm-co-rail${dragging ? ' dragging' : ''}`}
          onPointerDown={onRailDown}
          aria-hidden="true"
        >
          <i style={{ width: `${rail.len * 100}%`, left: `${rail.pos * (100 - rail.len * 100)}%` }} />
        </span>
      )}
    </div>
  );
}
