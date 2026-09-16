import { CSSProperties, ReactNode, useRef } from 'react';

/**
 * A sideways-scrolling row you can drag with the mouse.
 *
 * The Terminal's rails scroll horizontally, and a wheel without sideways tilt cannot
 * move them -- plenty of mice have no horizontal scroll at all, and on those the far
 * end of a story line was simply unreachable without a keyboard. Holding left-click
 * and dragging works everywhere.
 *
 * Three things this has to get right:
 *
 *   a drag must not become a click. Every child here is a link, so a drag that ends
 *   over a card would otherwise navigate. The click is swallowed in the capture phase
 *   when the pointer travelled more than a few pixels -- below that it is a click with
 *   a shaky hand, and it should still work.
 *
 *   the browser's OWN drag has to be called off. Images and links are draggable by
 *   default: press on a card and the browser starts a drag-and-drop with a ghost image
 *   of the artwork, the rail never moves, and the feature reads as broken. That is what
 *   dragstart is for here, and why the CSS also says user-drag: none -- the first is
 *   what stops it, the second keeps Safari from showing the ghost before it does.
 *
 *   touch is left alone. A phone already scrolls this by dragging, natively and with
 *   momentum; intercepting it would replace something good with something worse. Only
 *   mouse pointers are handled.
 *
 *   the pointer is captured ONLY once a drag is real. Capture keeps a drag alive past
 *   the rail's edge, which is worth having -- but it also retargets the click that
 *   follows to the capturing element, so capturing on every press meant no click ever
 *   reached a card and the whole rail stopped being clickable. Below the threshold
 *   nothing is captured, nothing is scrolled, and a press is exactly a press.
 */
export default function Rail({
  className,
  style,
  children,
}: {
  className: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const el = useRef<HTMLDivElement | null>(null);
  const from = useRef<{ x: number; left: number; moved: number } | null>(null);
  const held = useRef<number | null>(null);
  const swallow = useRef(false);

  /** Give the pointer back, if this rail ever took it. */
  const release = (pointerId: number) => {
    if (held.current === null) return;
    held.current = null;
    try { el.current?.releasePointerCapture(pointerId); } catch { /* already gone */ }
  };

  return (
    <div
      ref={el}
      className={`${className} rail-draggable`}
      style={style}
      /* Every card holds an image and is itself a link, so a press on one starts the
         browser's own drag-and-drop unless this says otherwise. dragstart bubbles, so
         one handler on the rail covers every child. */
      onDragStart={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        if (e.pointerType !== 'mouse' || e.button !== 0 || !el.current) return;
        // A fresh press is a fresh interaction: clear any swallow left over from a
        // drag that ended outside the rail, where no click ever came to consume it.
        // Without this the click AFTER such a drag was the one that got eaten.
        swallow.current = false;
        from.current = { x: e.clientX, left: el.current.scrollLeft, moved: 0 };
      }}
      onPointerMove={(e) => {
        const start = from.current;
        if (!start || !el.current) return;
        const dx = e.clientX - start.x;
        start.moved = Math.max(start.moved, Math.abs(dx));
        // Under the threshold this is a press with a shaky hand: no capture, no
        // scroll, nothing to undo.
        if (start.moved <= 4) return;
        if (held.current === null) {
          // Capturing is a nicety, so it must not take the drag down with it if the
          // pointer id is not one the element can capture.
          try {
            el.current.setPointerCapture(e.pointerId);
            held.current = e.pointerId;
          } catch { /* not capturable; dragging still works inside the rail */ }
        }
        el.current.classList.add('dragging');
        el.current.scrollLeft = start.left - dx;
      }}
      onPointerUp={(e) => {
        const start = from.current;
        from.current = null;
        release(e.pointerId);
        // State first, and releasing the capture last: releasePointerCapture THROWS on
        // a pointer id the element does not hold, and when that happened it took the
        // rest of this handler with it -- so a drag ended with its link still armed
        // and the click went through as a navigation.
        const dragged = !!start && start.moved > 4;
        if (dragged) swallow.current = true;
        // The `dragging` class puts pointer-events: none on every child, and that is
        // what really stops the navigation: the browser picks the click's target at
        // mouse-up, so with the cards inert at that moment the click lands on the rail
        // and no link is involved. Held one task longer than the drag for exactly that
        // reason. onClickCapture below is the belt to this braces -- it depends on
        // capture-phase ordering, which this does not.
        if (dragged) setTimeout(() => el.current?.classList.remove('dragging'), 0);
        else el.current?.classList.remove('dragging');
      }}
      /* A pointer can be cancelled rather than released -- the window loses focus, the
         OS takes the gesture. Without this the rail kept `dragging`, its children
         stayed inert, and nothing in it could be clicked again. */
      onPointerCancel={(e) => {
        from.current = null;
        swallow.current = false;
        release(e.pointerId);
        el.current?.classList.remove('dragging');
      }}
      onClickCapture={(e) => {
        if (!swallow.current) return;
        swallow.current = false;
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {children}
    </div>
  );
}
