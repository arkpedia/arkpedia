import { useEffect, useRef, useState } from 'react';

/** Pull the phone's player down from the artwork; scrolling lyrics and controls stay native. */
export function usePlayerMinimizeGesture(active: boolean, onMinimize: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const callback = useRef(onMinimize);
  callback.current = onMinimize;
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const panel = ref.current;
    if (!panel || !active) return;
    let start: { x: number; y: number } | null = null;
    let distance = 0;
    const begin = (event: TouchEvent) => {
      if (!window.matchMedia('(max-width: 999px)').matches || window.scrollY > 1 || event.touches.length !== 1
        || (event.target as HTMLElement).closest('button, a, input, #music-lyrics')) return;
      start = { x: event.touches[0].clientX, y: event.touches[0].clientY };
      distance = 0;
    };
    const move = (event: TouchEvent) => {
      if (!start || event.touches.length !== 1) return;
      const dx = event.touches[0].clientX - start.x;
      const dy = event.touches[0].clientY - start.y;
      if (Math.abs(dx) > 16 && Math.abs(dx) > Math.abs(dy)) { start = null; return; }
      if (dy < 12) return;
      event.preventDefault();
      distance = Math.min(320, dy);
      setOffset(distance);
    };
    const finish = () => {
      if (start && distance >= 90) callback.current();
      start = null; distance = 0; setOffset(0);
    };
    const cancel = () => { start = null; distance = 0; setOffset(0); };
    panel.addEventListener('touchstart', begin, { passive: true });
    panel.addEventListener('touchmove', move, { passive: false });
    panel.addEventListener('touchend', finish);
    panel.addEventListener('touchcancel', cancel);
    return () => {
      panel.removeEventListener('touchstart', begin); panel.removeEventListener('touchmove', move);
      panel.removeEventListener('touchend', finish); panel.removeEventListener('touchcancel', cancel);
    };
  }, [active]);
  return { ref, offset };
}
