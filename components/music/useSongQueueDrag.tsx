import { useCallback, useEffect, useRef, useState, type DragEvent, type PointerEvent } from 'react';
import { useClientLayoutEffect } from '@/lib/ui/useClientLayoutEffect';
import { createPortal } from 'react-dom';


type Session = {
  kind: 'pointer' | 'native'; from: number; x: number; y: number; startX: number; startY: number;
  active: boolean; title: string; width: number; target: number | null; list: HTMLElement | null;
  intentY: number; scrollIntent: -1 | 0 | 1;
  handle?: HTMLButtonElement; pointerId?: number;
};

/**
 * The part of a song list the reader can see: the window cuts it, and so does the music section's
 * player bar, which sticks to the bottom of the window over whatever scrolls under it. Edge
 * scrolling starts at this bottom, not at a bottom hidden under the bar (on a phone, dragging to
 * the visible end of the queue scrolled nothing).
 */
function visibleBounds(list: HTMLElement) {
  const r = list.getBoundingClientRect();
  const bar = document.querySelector<HTMLElement>('.music-player-bottombar');
  const barTop = bar && ['sticky', 'fixed'].includes(getComputedStyle(bar).position) ? bar.getBoundingClientRect().top : window.innerHeight;
  const top = Math.max(r.top, 0);
  const bottom = Math.max(top, Math.min(r.bottom, barTop, window.innerHeight));
  return { left: r.left, right: r.right, top, bottom, height: bottom - top };
}

function updatePosition(current: Session, x: number, y: number) {
  const delta = y - current.intentY;
  // A small reversal pauses scrolling before the pointer has left the edge zone.
  // Accumulate tiny movements while ignoring jitter under three pixels.
  if (Math.abs(delta) >= 3) {
    current.scrollIntent = delta < 0 ? -1 : 1;
    current.intentY = y;
  }
  current.x = x; current.y = y;
}

/** One drag session for every queue view: touch handles and native desktop dragging. */
export function useSongQueueDrag(onMove: (from: number, to: number) => void, revision: unknown) {
  const latestMove = useRef(onMove);
  latestMove.current = onMove;
  const session = useRef<Session | null>(null);
  const frame = useRef<number | null>(null);
  const lastTime = useRef(0);
  const ghostRef = useRef<HTMLDivElement>(null);
  const before = useRef<Map<HTMLElement, number> | null>(null);
  const [dragPos, setDragPos] = useState<number | null>(null);
  const [overPos, setOverPos] = useState<number | null>(null);
  const [ghost, setGhost] = useState<{ title: string; width: number; x: number; y: number } | null>(null);
  const [outside, setOutside] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  const move = useCallback((from: number, to: number) => {
    if (from === to) return;
    before.current = new Map([...document.querySelectorAll<HTMLElement>('.music-queue-row[data-song-id]')]
      .map(row => [row, row.getBoundingClientRect().top]));
    latestMove.current(from, to);
  }, []);
  useClientLayoutEffect(() => {
    const positions = before.current;
    before.current = null;
    if (!positions || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for (const [row, top] of positions) {
      if (!row.isConnected) continue;
      const delta = top - row.getBoundingClientRect().top;
      if (!delta || Math.abs(delta) > window.innerHeight) continue;
      row.getAnimations().forEach(animation => animation.cancel());
      row.animate([{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }], { duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
  }, [revision]);

  const resolve = useCallback(() => {
    const current = session.current;
    if (!current?.active) return;
    const hit = document.elementFromPoint(current.x, current.y);
    // Over the player bar, the pointer is still over the list it hides.
    const under = current.list && current.x >= current.list.getBoundingClientRect().left && current.x <= current.list.getBoundingClientRect().right
      && current.y >= current.list.getBoundingClientRect().top && current.y <= current.list.getBoundingClientRect().bottom ? current.list : null;
    const list = hit?.closest<HTMLElement>('[data-song-list]') ?? under;
    current.list = list;
    let target: number | null = null;
    if (list) {
      const bounds = visibleBounds(list);
      let distance = Infinity;
      for (const row of list.querySelectorAll<HTMLElement>('[data-display-pos]')) {
        const r = row.getBoundingClientRect();
        if (r.bottom < bounds.top || r.top > bounds.bottom) continue;
        const d = Math.abs(current.y - (r.top + r.bottom) / 2);
        if (d < distance) { distance = d; target = Number(row.dataset.displayPos); }
      }
    }
    current.target = target;
    setOverPos(value => value === target ? value : target);
    setOutside(target === null);
    if (ghostRef.current) {
      const width = Math.min(current.width, 300, window.innerWidth - 24);
      const left = Math.max(12, Math.min(current.x + 14, window.innerWidth - width - 12));
      const top = Math.max(12, Math.min(current.y + 16, window.innerHeight - ghostRef.current.offsetHeight - 12));
      ghostRef.current.style.transform = `translate3d(${left}px, ${top}px, 0)`;
    }
  }, []);
  const tick = useCallback((now: number) => {
    const current = session.current;
    if (!current?.active) return;
    resolve();
    const dt = lastTime.current ? Math.min(now - lastTime.current, 32) / 1000 : 0;
    lastTime.current = now;
    if (current.list) {
      const bounds = visibleBounds(current.list);
      const edge = Math.min(80, bounds.height / 3);
      const up = Math.max(0, (bounds.top + edge - current.y) / edge);
      const down = Math.max(0, (current.y - bounds.bottom + edge) / edge);
      // Up to 3,000px/s; a stationary pointer keeps scrolling and loading new batches.
      const edgeVelocity = 3000 * (Math.min(1, down) ** 2 - Math.min(1, up) ** 2);
      const velocity = edgeVelocity * current.scrollIntent < 0 ? 0 : edgeVelocity;
      if (velocity) {
        current.list.scrollTop += velocity * dt;
        resolve();
      }
    }
    frame.current = requestAnimationFrame(tick);
  }, [resolve]);
  const finish = useCallback((commit: boolean) => {
    const current = session.current;
    session.current = null;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    lastTime.current = 0;
    if (current?.handle && current.pointerId !== undefined && current.handle.hasPointerCapture(current.pointerId)) current.handle.releasePointerCapture(current.pointerId);
    if (current?.active) {
      if (commit && current.target !== null) {
        move(current.from, current.target);
        setAnnouncement(`Moved ${current.title} to position ${current.target + 1}.`);
      } else setAnnouncement(`Reordering ${current.title} cancelled.`);
    }
    setDragPos(null); setOverPos(null); setGhost(null); setOutside(false);
  }, [move]);
  const activate = useCallback(() => {
    const current = session.current;
    if (!current) return;
    current.active = true;
    setDragPos(current.from);
    if (current.kind === 'pointer') setGhost({ title: current.title, width: Math.min(current.width, 300, window.innerWidth - 24), x: current.x, y: current.y });
    setAnnouncement(`Moving ${current.title}. Release outside the song list or press Escape to cancel.`);
    frame.current = requestAnimationFrame(tick);
  }, [tick]);
  const startPointer = useCallback((event: PointerEvent<HTMLButtonElement>, from: number, title: string) => {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    const row = handle.closest<HTMLElement>('[data-display-pos]')!;
    handle.setPointerCapture(event.pointerId);
    session.current = { kind: 'pointer', from, title, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY,
      width: row.getBoundingClientRect().width, handle, pointerId: event.pointerId, active: false, list: row.closest<HTMLElement>('[data-song-list]'), target: null,
      intentY: event.clientY, scrollIntent: 0 };
  }, []);
  const startNative = useCallback((event: DragEvent<HTMLDivElement>, from: number, title: string) => {
    if (session.current || (event.target as HTMLElement).closest('button:not(.music-song-row-main)')) { event.preventDefault(); return; }
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(from));
    session.current = { kind: 'native', from, title, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY,
      width: event.currentTarget.getBoundingClientRect().width, active: false, list: event.currentTarget.closest<HTMLElement>('[data-song-list]'), target: null,
      intentY: event.clientY, scrollIntent: 0 };
    activate();
  }, [activate]);
  useEffect(() => {
    const pointerMove = (event: globalThis.PointerEvent) => {
      const current = session.current;
      if (current?.kind !== 'pointer' || event.pointerId !== current.pointerId) return;
      updatePosition(current, event.clientX, event.clientY);
      if (!current.active && Math.hypot(current.x - current.startX, current.y - current.startY) >= 5) activate();
      if (current.active) { event.preventDefault(); resolve(); }
    };
    const pointerUp = (event: globalThis.PointerEvent) => {
      const current = session.current;
      if (current?.kind !== 'pointer' || event.pointerId !== current.pointerId) return;
      current.x = event.clientX; current.y = event.clientY;
      resolve(); finish(true);
    };
    const dragOver = (event: globalThis.DragEvent) => {
      const current = session.current;
      if (current?.kind !== 'native') return;
      updatePosition(current, event.clientX, event.clientY);
      resolve();
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = current.target === null ? 'none' : 'move';
    };
    const nativeDrag = (event: globalThis.DragEvent) => {
      const current = session.current;
      if (current?.kind !== 'native' || (!event.clientX && !event.clientY)) return;
      // Keep coordinates fresh even while scrolling changes the hovered row.
      updatePosition(current, event.clientX, event.clientY);
      resolve();
    };
    const drop = (event: globalThis.DragEvent) => {
      const current = session.current;
      if (current?.kind !== 'native') return;
      event.preventDefault();
      current.x = event.clientX; current.y = event.clientY;
      resolve(); finish(true);
    };
    const cancel = () => { if (session.current) finish(false); };
    // Browsers cancel the pointer stream when handing control to native HTML dragging.
    const pointerCancel = () => { if (session.current?.kind === 'pointer') finish(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && session.current) { event.preventDefault(); cancel(); } };
    window.addEventListener('pointermove', pointerMove, { passive: false });
    window.addEventListener('pointerup', pointerUp);
    window.addEventListener('pointercancel', pointerCancel);
    window.addEventListener('dragover', dragOver);
    window.addEventListener('drag', nativeDrag);
    window.addEventListener('drop', drop);
    window.addEventListener('dragend', cancel);
    window.addEventListener('blur', cancel);
    window.addEventListener('keydown', escape);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      window.removeEventListener('pointermove', pointerMove); window.removeEventListener('pointerup', pointerUp);
      window.removeEventListener('pointercancel', pointerCancel); window.removeEventListener('dragover', dragOver);
      window.removeEventListener('drag', nativeDrag);
      window.removeEventListener('drop', drop); window.removeEventListener('dragend', cancel);
      window.removeEventListener('blur', cancel); window.removeEventListener('keydown', escape);
    };
  }, [activate, resolve, finish]);
  const feedback = <>
    <span className="visually-hidden" role="status">{announcement}</span>
    {ghost && createPortal(<div ref={ghostRef} className={`music-song-drag-ghost${outside ? ' cancelling' : ''}`} style={{ width: ghost.width, transform: `translate3d(${Math.max(12, Math.min(ghost.x + 14, window.innerWidth - ghost.width - 12))}px, ${Math.max(12, Math.min(ghost.y + 16, window.innerHeight - 70))}px, 0)` }} aria-hidden="true">
      <b>{ghost.title}</b><small>{outside ? 'Release to cancel' : 'Release to move'}</small>
    </div>, document.body)}
  </>;
  return { dragPos, overPos, nativeDragging: dragPos !== null && session.current?.kind === 'native', startPointer, startNative, move, feedback, cancel: () => finish(false) };
}
