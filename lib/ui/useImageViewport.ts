import { useCallback, useEffect, useRef, useState, type PointerEvent, type KeyboardEvent } from 'react';

/** A contained image opens fitted; zoom/pan never moves its surrounding dialog. */
export function useImageViewport(width: number, height: number) {
  const viewport = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const current = useRef(view); current.current = view;
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const update = useCallback((scale: number, x: number, y: number) => {
    const rect = viewport.current?.getBoundingClientRect();
    scale = Math.max(1, Math.min(5, scale));
    const fit = rect ? Math.min(rect.width / width, rect.height / height, 1) : 0;
    const boundX = rect ? Math.max(0, (width * fit * scale - rect.width) / 2) : 0;
    const boundY = rect ? Math.max(0, (height * fit * scale - rect.height) / 2) : 0;
    const next = { scale, x: Math.max(-boundX, Math.min(boundX, x)), y: Math.max(-boundY, Math.min(boundY, y)) };
    current.current = next; setView(next);
  }, [width, height]);
  const zoom = useCallback((scale: number, x = 0, y = 0) => {
    const old = current.current, ratio = Math.max(1, Math.min(5, scale)) / old.scale;
    update(scale, x + (old.x - x) * ratio, y + (old.y - y) * ratio);
  }, [update]);
  const reset = useCallback(() => { pointers.current.clear(); update(1, 0, 0); }, [update]);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1;
      zoom(current.current.scale * Math.exp(-event.deltaY * units * .002), event.clientX - rect.left - rect.width / 2, event.clientY - rect.top - rect.height / 2);
    };
    element.addEventListener('wheel', wheel, { passive: false });
    const resize = new ResizeObserver(reset); resize.observe(element);
    return () => { element.removeEventListener('wheel', wheel); resize.disconnect(); };
  }, [zoom, reset]);
  const down = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault(); event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const old = pointers.current.get(event.pointerId);
    if (!old) return;
    const next = { x: event.clientX, y: event.clientY };
    const other = [...pointers.current.entries()].find(([id]) => id !== event.pointerId)?.[1];
    if (other) {
      const before = Math.hypot(old.x - other.x, old.y - other.y);
      const after = Math.hypot(next.x - other.x, next.y - other.y);
      const rect = event.currentTarget.getBoundingClientRect();
      if (before > 0) zoom(current.current.scale * after / before, (old.x + other.x) / 2 - rect.left - rect.width / 2, (old.y + other.y) / 2 - rect.top - rect.height / 2);
      update(current.current.scale, current.current.x + (next.x - old.x) / 2, current.current.y + (next.y - old.y) / 2);
    } else update(current.current.scale, current.current.x + next.x - old.x, current.current.y + next.y - old.y);
    pointers.current.set(event.pointerId, next);
  };
  const up = (event: PointerEvent<HTMLDivElement>) => { pointers.current.delete(event.pointerId); };
  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === '+' || event.key === '=') zoom(current.current.scale * 1.25);
    else if (event.key === '-') zoom(current.current.scale / 1.25);
    else if (event.key === '0' || event.key === 'Home') reset();
    else if (event.key.startsWith('Arrow')) update(current.current.scale,
      current.current.x + (event.key === 'ArrowLeft' ? 40 : event.key === 'ArrowRight' ? -40 : 0),
      current.current.y + (event.key === 'ArrowUp' ? 40 : event.key === 'ArrowDown' ? -40 : 0));
    else return;
    event.preventDefault();
  };
  return { viewport, view, zoom, reset, handlers: { onPointerDown: down, onPointerMove: move, onPointerUp: up, onPointerCancel: up, onLostPointerCapture: up, onKeyDown: keyboard } };
}
