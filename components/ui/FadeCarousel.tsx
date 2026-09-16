import { useEffect, useRef, useState } from 'react';

interface Props<T> {
  items: T[];
  renderItem: (item: T) => React.ReactNode;
  perPage?: number;
  intervalMs?: number;
  fadeMs?: number;
}

export default function FadeCarousel<T>({ items, renderItem, perPage = 2, intervalMs = 6000, fadeMs = 400 }: Props<T>) {
  const [pageIndex, setPageIndex] = useState(0);
  const [fading, setFading] = useState(false);
  // Bumped on every manual swipe so the auto-advance effect restarts and its
  // interval counts from the interaction -- otherwise a swipe landing just
  // before the timer fires gets its page snatched away half a second later.
  const [interactionKey, setInteractionKey] = useState(0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const totalPages = Math.ceil(items.length / perPage);

  // Reset to the first page if the item count itself changes (e.g. a
  // data refresh returns fewer streams than before) -- keyed on length,
  // not the array reference, so a parent re-render that happens to
  // create a new array with the same content doesn't spuriously reset
  // the rotation.
  useEffect(() => {
    setPageIndex(0);
  }, [items.length]);

  // Fade out, swap underneath, fade back in -- shared by the timer and swipes.
  const swap = (next: (p: number) => number) => {
    setFading(true);
    setTimeout(() => {
      setPageIndex(next);
      setFading(false);
    }, fadeMs);
  };

  useEffect(() => {
    if (totalPages <= 1) return;
    const timer = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setPageIndex((p) => (p + 1) % totalPages);
        setFading(false);
      }, fadeMs);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [totalPages, intervalMs, fadeMs, interactionKey]);

  if (items.length === 0) return null;

  const onTouchStart = (e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || totalPages <= 1) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    // Mostly-vertical or tiny movement is the page scrolling or a tap on a
    // card, not a swipe.
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return;
    setInteractionKey((k) => k + 1);
    swap((p) => (dx < 0 ? (p + 1) % totalPages : (p - 1 + totalPages) % totalPages));
  };

  const currentItems = items.slice(pageIndex * perPage, pageIndex * perPage + perPage);

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      style={{
        display: 'flex',
        gap: 12,
        opacity: fading ? 0 : 1,
        transition: `opacity ${fadeMs}ms ease`,
        // Horizontal swipes are ours; vertical drags stay the browser's scroll.
        touchAction: 'pan-y',
      }}
    >
      {currentItems.map((item, i) => (
        <div key={pageIndex * perPage + i} style={{ flex: 1, minWidth: 0 }}>
          {renderItem(item)}
        </div>
      ))}
    </div>
  );
}
