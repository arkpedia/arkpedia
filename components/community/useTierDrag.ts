import { useEffect, useRef, type RefObject } from 'react';

/**
 * Dragging for the Tier List maker, by pointer events: a mouse or pen drags once it has
 * moved a few pixels, a finger after a short hold (a swipe before that scrolls as usual).
 *
 * Nothing here is React state. The pointer's position, the ghost and the insertion mark are
 * written straight to the DOM: the board can hold a couple of thousand tiles, and a state
 * change per pointer move would redraw them all. Nothing reflows during a drag either: the
 * dragged tiles stay where they are, dimmed, and the mark is laid over the row, so a row
 * never wraps and unwraps under the pointer.
 *
 * Markup contract, all inside `root`: a draggable is `[data-item="<id>"]`; a row's tile
 * container is `[data-row="<row id>"]` (a tier, or a chart's cell); a chart's free plane is
 * `[data-plane]`; the pool is `[data-pool-window]`. A drag that ends on a row or a plane
 * places the item there; one that ends anywhere else puts it back in the pool.
 */
export type TierDrop = { row: string; index: number } | { plane: true; x: number; y: number } | { pool: true };

interface Options {
  root: RefObject<HTMLElement | null>;
  ghost: RefObject<HTMLElement | null>;
  mark: RefObject<HTMLElement | null>;
  /** The items a drag that starts on `id` carries (the selection when `id` is in it). */
  carried: (id: string) => string[];
  onDrop: (ids: string[], drop: TierDrop) => void;
}

const MOUSE_SLOP = 5;
const TOUCH_SLOP = 10;
const HOLD_MS = 220;
const EDGE = 64;

export function useTierDrag({ root, ghost, mark, carried, onDrop }: Options): { wasDrag: () => boolean } {
  const live = useRef({ carried, onDrop });
  useEffect(() => { live.current = { carried, onDrop }; });
  const dragged = useRef(false);

  useEffect(() => {
    const host = root.current;
    if (!host) return;
    let pending: { id: string; pointer: number; x: number; y: number; touch: boolean; timer: number } | null = null;
    let active: { ids: string[]; x: number; y: number; drop: TierDrop | null; frame: number } | null = null;

    const marked = () => host.querySelectorAll('[data-dragging],[data-drop]');
    const clearDrop = () => { host.querySelectorAll('[data-drop]').forEach((el) => el.removeAttribute('data-drop')); if (mark.current) mark.current.hidden = true; };

    const locate = () => {
      if (!active) return;
      clearDrop();
      active.drop = null;
      const under = document.elementFromPoint(active.x, active.y);
      // The floating pool lies over the rows: a drop on it is a drop on the pool.
      const row = under?.closest('[data-pool-window]') ? null : under?.closest<HTMLElement>('[data-row]');
      if (row && host.contains(row)) {
        const tiles = [...row.querySelectorAll<HTMLElement>('[data-item]')];
        const boxes = tiles.map((tile) => tile.getBoundingClientRect());
        // The first tile the pointer is before: left of its centre on its own line, or on a line above it.
        let index = boxes.findIndex((box) => active!.y < box.top || (active!.y <= box.bottom && active!.x < box.left + box.width / 2));
        if (index < 0) index = tiles.length;
        active.drop = { row: row.dataset.row!, index };
        row.setAttribute('data-drop', '');
        const bar = mark.current;
        if (bar) {
          const at = boxes[index];
          const last = boxes[boxes.length - 1];
          const rowBox = row.getBoundingClientRect();
          const left = at ? at.left - 3 : last ? last.right + 1 : rowBox.left + 4;
          const top = at ? at.top : last ? last.top : rowBox.top + 4;
          const height = (at ?? last)?.height ?? rowBox.height - 8;
          bar.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
          bar.style.height = `${Math.round(height)}px`;
          bar.hidden = false;
        }
        return;
      }
      // A plane takes an item anywhere on it: where the pointer is, as fractions of its box.
      const plane = under?.closest('[data-pool-window]') ? null : under?.closest<HTMLElement>('[data-plane]');
      if (plane && host.contains(plane)) {
        const box = plane.getBoundingClientRect();
        active.drop = { plane: true, x: Math.max(0, Math.min(1, (active.x - box.left) / box.width)), y: Math.max(0, Math.min(1, (active.y - box.top) / box.height)) };
        return;
      }
      // Anywhere that is not a row or a plane: the item goes back to the pool.
      active.drop = { pool: true };
    };

    const moveGhost = () => { if (active && ghost.current) ghost.current.style.transform = `translate(${active.x}px, ${active.y}px)`; };

    // While the pointer rests near the top or bottom edge, the page scrolls under it.
    const tick = () => {
      if (!active) return;
      // Not while the pointer is over the pool: it sits at the bottom edge (pinned under the
      // board, or a phone's sheet), and a drag that starts there would scroll the page at once.
      const over = document.elementFromPoint(active.x, active.y)?.closest('[data-pool-window]');
      const speed = over ? 0 : active.y < EDGE ? -Math.ceil((EDGE - active.y) / 5) : active.y > window.innerHeight - EDGE ? Math.ceil((active.y - (window.innerHeight - EDGE)) / 5) : 0;
      if (speed) { window.scrollBy(0, speed); locate(); }
      active.frame = requestAnimationFrame(tick);
    };

    const begin = () => {
      if (!pending) return;
      const { id, x, y } = pending;
      window.clearTimeout(pending.timer);
      pending = null;
      const ids = live.current.carried(id);
      if (!ids.length) return;
      active = { ids, x, y, drop: null, frame: 0 };
      dragged.current = true;
      const held = new Set(ids);
      host.querySelectorAll<HTMLElement>('[data-item]').forEach((tile) => { if (held.has(tile.dataset.item!)) tile.setAttribute('data-dragging', ''); });
      host.setAttribute('data-dragging-any', '');
      const box = ghost.current;
      if (box) {
        const source = host.querySelector<HTMLImageElement>(`[data-item="${CSS.escape(id)}"] img`);
        const picture = box.querySelector<HTMLElement>('[data-art]');
        // A copy of the tile's own picture: already loaded, so the ghost never waits for art.
        if (picture && source) picture.replaceChildren(source.cloneNode());
        const count = box.querySelector<HTMLElement>('[data-count]');
        if (count) { count.textContent = String(ids.length); count.hidden = ids.length < 2; }
        box.hidden = false;
      }
      moveGhost();
      locate();
      active.frame = requestAnimationFrame(tick);
    };

    const finish = (drop: boolean) => {
      if (pending) { window.clearTimeout(pending.timer); pending = null; }
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKey, true);
      if (!active) return;
      cancelAnimationFrame(active.frame);
      const { ids, drop: target } = active;
      active = null;
      clearDrop();
      marked().forEach((el) => el.removeAttribute('data-dragging'));
      host.removeAttribute('data-dragging-any');
      if (ghost.current) ghost.current.hidden = true;
      // The click that ends a mouse drag lands after pointerup: keep the flag one task longer.
      window.setTimeout(() => { dragged.current = false; }, 0);
      if (drop && target) live.current.onDrop(ids, target);
    };

    const onMove = (event: PointerEvent) => {
      if (active) { active.x = event.clientX; active.y = event.clientY; moveGhost(); locate(); return; }
      if (!pending || event.pointerId !== pending.pointer) return;
      const far = Math.hypot(event.clientX - pending.x, event.clientY - pending.y);
      if (pending.touch) { if (far > TOUCH_SLOP) finish(false); else { pending.x = event.clientX; pending.y = event.clientY; } return; }
      if (far > MOUSE_SLOP) { pending.x = event.clientX; pending.y = event.clientY; begin(); }
    };
    const onUp = () => finish(true);
    const onCancel = () => finish(false);
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && active) { event.preventDefault(); event.stopPropagation(); finish(false); } };

    const onDown = (event: PointerEvent) => {
      if (active || pending || (event.pointerType === 'mouse' && event.button !== 0)) return;
      const tile = (event.target as Element | null)?.closest<HTMLElement>('[data-item]');
      if (!tile || !host.contains(tile)) return;
      dragged.current = false;
      const touch = event.pointerType === 'touch';
      pending = { id: tile.dataset.item!, pointer: event.pointerId, x: event.clientX, y: event.clientY, touch, timer: touch ? window.setTimeout(begin, HOLD_MS) : 0 };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
      window.addEventListener('keydown', onKey, true);
    };

    // A finger that is dragging must not also scroll the page; one that is still waiting may.
    const onTouchMove = (event: TouchEvent) => { if (active && event.cancelable) event.preventDefault(); };
    // The long press that starts a touch drag also asks for the image menu.
    const onContext = (event: Event) => { if ((active || pending?.touch) && (event.target as Element | null)?.closest('[data-item]')) event.preventDefault(); };
    const onNativeDrag = (event: Event) => { if ((event.target as Element | null)?.closest('[data-item]')) event.preventDefault(); };

    host.addEventListener('pointerdown', onDown);
    host.addEventListener('contextmenu', onContext);
    host.addEventListener('dragstart', onNativeDrag);
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      finish(false);
      host.removeEventListener('pointerdown', onDown);
      host.removeEventListener('contextmenu', onContext);
      host.removeEventListener('dragstart', onNativeDrag);
      document.removeEventListener('touchmove', onTouchMove);
    };
  }, [root, ghost, mark]);

  return useRef({ wasDrag: () => dragged.current }).current;
}
