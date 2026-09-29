import { useEffect, useRef } from 'react';

/** How far ahead of the reader the next batch starts rendering. */
const AHEAD = '600px';

function scrollBox(el: HTMLElement): HTMLElement | null {
  for (let node = el.parentElement; node; node = node.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(node).overflowY)) return node;
  }
  return null;
}

/**
 * The foot of a list that grows as it is read: once the reader is within AHEAD of it, the
 * list renders its next batch (onMore). Every long list on the site grows this way instead
 * of behind a "Show more" button (scripts/tests/test-load-on-scroll.ts holds it). Put it
 * right after the list's last item; it renders nothing once the whole list is shown.
 *
 * In a list that scrolls in its own box (the music queue) the box is what is watched, so
 * the batch still comes before the reader reaches it. A tab or keyboard focus that moves to
 * the last item scrolls it into view, so keyboard readers load the next batch the same way.
 */
export default function LoadOnScroll({ shown, total, onMore }: { shown: number; total: number; onMore: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const more = useRef(onMore);
  more.current = onMore;

  useEffect(() => {
    const el = ref.current;
    if (!el || shown >= total) return;
    // A fresh observer for every batch: when the new batch still ends within reach (a tall
    // screen), it reports at once and the next batch follows.
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      more.current();
    }, { root: scrollBox(el), rootMargin: `${AHEAD} 0px` });
    observer.observe(el);
    return () => observer.disconnect();
  }, [shown, total]);

  if (shown >= total) return null;
  return <div ref={ref} className="load-on-scroll" aria-hidden="true" />;
}
