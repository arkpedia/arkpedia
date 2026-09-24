import { useCallback, useEffect, useRef, useState } from 'react';

export interface VirtualRowLayout {
  columns: number;
  rowStride: number;
}

interface Metrics extends VirtualRowLayout {
  scrollTop: number;
  viewportHeight: number;
}

/** Keeps only nearby rows mounted while spacers preserve the full scroll range. */
export function useVirtualRows(
  count: number,
  measure: (element: HTMLDivElement) => VirtualRowLayout,
  initial: VirtualRowLayout,
  overscan = 3,
) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState<Metrics>({ ...initial, scrollTop: 0, viewportHeight: 600 });

  useEffect(() => {
    const element = scrollerRef.current;
    if (!element) return;
    let frame = 0;
    const update = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const layout = measure(element);
        const next: Metrics = {
          columns: Math.max(1, layout.columns),
          rowStride: Math.max(1, layout.rowStride),
          scrollTop: element.scrollTop,
          viewportHeight: element.clientHeight,
        };
        setMetrics(previous => Object.keys(next).every(key =>
          Math.abs(previous[key as keyof Metrics] - next[key as keyof Metrics]) < 0.5
        ) ? previous : next);
      });
    };
    const observer = new ResizeObserver(update);
    observer.observe(element);
    element.addEventListener('scroll', update, { passive: true });
    update();
    return () => {
      element.removeEventListener('scroll', update);
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [measure]);

  const rows = Math.ceil(count / metrics.columns);
  const first = Math.min(rows, Math.max(0, Math.floor(metrics.scrollTop / metrics.rowStride) - overscan));
  const last = Math.min(rows, Math.max(first, Math.ceil((metrics.scrollTop + metrics.viewportHeight) / metrics.rowStride) + overscan));

  const revealIndex = useCallback((index: number) => {
    const element = scrollerRef.current;
    if (!element || index < 0) return;
    const rowTop = Math.floor(index / metrics.columns) * metrics.rowStride;
    const rowBottom = rowTop + metrics.rowStride;
    if (rowTop < element.scrollTop || rowBottom > element.scrollTop + element.clientHeight) {
      element.scrollTop = Math.max(0, rowTop - metrics.rowStride);
    }
  }, [metrics.columns, metrics.rowStride]);

  return {
    scrollerRef,
    firstIndex: first * metrics.columns,
    lastIndex: Math.min(count, last * metrics.columns),
    before: first * metrics.rowStride,
    after: (rows - last) * metrics.rowStride,
    revealIndex,
  };
}
