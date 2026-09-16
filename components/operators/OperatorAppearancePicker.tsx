import Image from '@/components/content/ContentImage';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import type { Appearance } from '@/lib/operators/operatorAppearances';
import styles from './OperatorAppearancePicker.module.css';

const useClientLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
const GAP = 6;
const DESKTOP_CARD_WIDTH = 116;

interface Props {
  appearances: Appearance[];
  activeIndex: number;
  onSelect: (index: number) => void;
  rotating: boolean;
  onRotationChange: (rotating: boolean) => void;
}

export default function OperatorAppearancePicker({ appearances, activeIndex, onSelect, rotating, onRotationChange }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dotsRef = useRef<HTMLDivElement>(null);
  const trackId = useId();
  const [layout, setLayout] = useState<{ desktop: boolean; columns: number; width: number } | null>(null);
  const columns = layout?.columns ?? 1;
  const desktop = layout?.desktop ?? false;
  const positionedRef = useRef(false);
  const activeRef = useRef(activeIndex);
  const dragRef = useRef<{ startX: number; lastX: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);
  const count = appearances.length;
  const multiple = count > 1;
  const looping = multiple && (!desktop || count > columns);
  const scrollable = looping || count > columns;
  const showArrows = multiple;

  useClientLayoutEffect(() => {
    activeRef.current = activeIndex;
  }, [activeIndex]);

  const geometry = useCallback(() => {
    const track = trackRef.current;
    const item = track?.firstElementChild as HTMLElement | null;
    const stride = item ? item.getBoundingClientRect().width + GAP : 0;
    return { track, stride, cycle: stride * count };
  }, [count]);

  const align = useCallback((index: number) => {
    const { track, stride, cycle } = geometry();
    if (!track || !stride) return;
    if (looping) {
      if (track.scrollLeft < cycle - 0.5) track.scrollLeft += cycle;
      else if (track.scrollLeft >= cycle * 2 - 0.5) track.scrollLeft -= cycle;
    }
    // Keep visible thumbnails in place when selected. For the looping strip,
    // use the nearest copy so selection never sends the strip back to its start.
    const copies = looping ? [0, 1, 2] : [0];
    const offsets = copies.map(copy => {
      const left = copy * cycle + index * stride;
      const right = left + stride - GAP;
      if (left < track.scrollLeft) return left - track.scrollLeft;
      if (right > track.scrollLeft + track.clientWidth) return right - track.scrollLeft - track.clientWidth;
      return 0;
    });
    const offset = offsets.reduce((closest, value) => Math.abs(value) < Math.abs(closest) ? value : closest);
    if (Math.abs(offset) > 0.5) track.scrollLeft += offset;
  }, [geometry, looping]);

  useClientLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const media = window.matchMedia('(min-width: 901px)');
    const resize = () => {
      const width = track.clientWidth;
      const desktop = media.matches;
      const capacity = desktop
        ? Math.floor((width + GAP) / (DESKTOP_CARD_WIDTH + GAP))
        : Math.min(3, Math.floor((width + GAP) / 86));
      const columns = Math.max(1, Math.min(count, capacity));
      setLayout(previous => previous?.desktop === desktop && previous.columns === columns && previous.width === width
        ? previous : { desktop, columns, width });
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(track);
    media.addEventListener('change', resize);
    return () => {
      observer.disconnect();
      media.removeEventListener('change', resize);
    };
  }, [count]);

  useClientLayoutEffect(() => {
    if (!layout?.width) return;
    const { track, stride, cycle } = geometry();
    if (!track || !stride) return;
    if (!positionedRef.current) {
      // Wait for measured card sizing before placing the initial selection at
      // the left edge. Later selections only reveal offscreen thumbnails.
      track.scrollLeft = (looping ? cycle : 0) + activeIndex * stride;
      positionedRef.current = true;
    } else align(activeIndex);
  }, [activeIndex, layout, geometry, looping, align]);

  function choose(index: number) {
    activeRef.current = index;
    align(index);
    onSelect(index);
  }

  function handleScroll() {
    if (!positionedRef.current || !looping) return;
    const { track, stride, cycle } = geometry();
    if (!track || !stride) return;
    // Identical copies on either side let native touch/trackpad scrolling cross
    // the ends. Relocate only this strip, to the same visual position.
    if (track.scrollLeft < cycle - 0.5) track.scrollLeft += cycle;
    else if (track.scrollLeft >= cycle * 2 - 0.5) track.scrollLeft -= cycle;
  }

  function cycle(direction: -1 | 1) {
    onRotationChange(false);
    choose((activeRef.current + direction + count) % count);
  }

  function handleKey(event: KeyboardEvent<HTMLButtonElement>, index: number, dots: boolean) {
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? count - 1
      : event.key === 'ArrowLeft' ? (index + count - 1) % count : event.key === 'ArrowRight' ? (index + 1) % count : null;
    if (next === null) return;
    event.preventDefault();
    choose(next);
    const target = dots ? dotsRef.current?.children[next] : trackRef.current?.children[(looping ? count : 0) + next];
    (target as HTMLElement | undefined)?.focus({ preventScroll: true });
  }

  function drag(event: PointerEvent<HTMLDivElement>) {
    const state = dragRef.current;
    if (!state || !trackRef.current) return;
    if (!state.moved && Math.abs(event.clientX - state.startX) < 6) return;
    state.moved = true;
    suppressClickRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    trackRef.current.scrollLeft += state.lastX - event.clientX;
    state.lastX = event.clientX;
  }

  function finishDrag() {
    dragRef.current = null;
    handleScroll();
  }

  if (!count) return null;

  return <div className={`${styles.picker}${multiple ? '' : ` ${styles.single}`}`} role="group" aria-label="Operator outfits">
    <div id={trackId} ref={trackRef} className={styles.track} onScroll={handleScroll}
      data-looping={looping || undefined} data-scrollable={scrollable || undefined}
      onWheel={() => onRotationChange(false)}
      style={{ gridAutoColumns: desktop
        ? `min(100%, ${DESKTOP_CARD_WIDTH}px)`
        : `calc((100% - ${(columns - 1) * GAP}px) / ${columns})` }}
      onPointerDown={event => {
        onRotationChange(false);
        suppressClickRef.current = false;
        if (scrollable && event.pointerType === 'mouse' && event.button === 0) dragRef.current = { startX: event.clientX, lastX: event.clientX, moved: false };
      }}
      onPointerMove={drag} onPointerUp={finishDrag} onPointerCancel={finishDrag}
      onClickCapture={event => {
        if (suppressClickRef.current) { event.preventDefault(); event.stopPropagation(); suppressClickRef.current = false; }
      }}>
      {(looping ? [0, 1, 2] : [1]).flatMap(copy => appearances.map((appearance, index) => <button
        key={`${copy}-${appearance.label}`} type="button" className={styles.thumbnail}
        aria-label={appearance.label} title={appearance.label} aria-pressed={index === activeIndex}
        aria-hidden={copy !== 1 || undefined} tabIndex={copy === 1 && index === activeIndex ? 0 : -1}
        onMouseDown={event => { if (copy !== 1) event.preventDefault(); }}
        onClick={() => choose(index)} onKeyDown={event => handleKey(event, index, false)}>
        {appearance.fullPath || appearance.iconPath
          ? <Image src={(appearance.fullPath || appearance.iconPath)!} alt="" width={68} height={50} draggable={false} />
          : <span className={styles.fallback}>{appearance.label[0]}</span>}
        <span className={styles.name}>{appearance.label}</span>
      </button>))}
    </div>
    {multiple && <div className={`${styles.controls}${showArrows ? ` ${styles.withArrows}` : ''}`}>
      {showArrows && <button type="button" className={`${styles.arrow} ${styles.previous}`}
        aria-label="Show previous outfit" title="Show previous outfit" aria-controls="operator-artwork"
        onClick={() => cycle(-1)}>
        <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m10 3-5 5 5 5" /></svg>
      </button>}
      <div ref={dotsRef} className={styles.dots} role="group" aria-label="Choose outfit">
        {appearances.map((appearance, index) => <button key={appearance.label} type="button"
          className={`front-events-dot${index === activeIndex ? ' active' : ''}`} aria-controls={trackId}
          aria-label={`${appearance.label}, ${index + 1} of ${count}`} title={appearance.label}
          aria-current={index === activeIndex ? 'true' : undefined} tabIndex={index === activeIndex ? 0 : -1}
          onClick={() => choose(index)} onKeyDown={event => handleKey(event, index, true)} />)}
      </div>
      {showArrows && <button type="button" className={`${styles.arrow} ${styles.next}`}
        aria-label="Show next outfit" title="Show next outfit" aria-controls="operator-artwork"
        onClick={() => cycle(1)}>
        <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m6 3 5 5-5 5" /></svg>
      </button>}
      <button type="button" className={styles.play} aria-controls={trackId}
        title={rotating ? 'Pause outfit autoplay' : 'Start outfit autoplay'}
        aria-label={rotating ? 'Pause outfit autoplay' : 'Start outfit autoplay'}
        onClick={() => onRotationChange(!rotating)}>
        <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
          {rotating ? <path d="M3 2h4v12H3zm6 0h4v12H9z" /> : <path d="m4 2 10 6-10 6z" />}
        </svg>
      </button>
    </div>}
  </div>;
}
