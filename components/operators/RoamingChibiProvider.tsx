import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import XButton from '@/components/ui/XButton';
import type { ChibiModel } from '@/lib/operators/chibi';

const ChibiCanvas = dynamic(() => import('./ChibiCanvas'), { ssr: false });
const PET_WIDTH = 160, PET_HEIGHT = 180;
type Point = { x: number; y: number };
interface Pet { label: string; model: ChibiModel; paused: boolean; returnFocus: HTMLButtonElement | null }
interface RoamingChibiContextValue {
  pet: Pet | null;
  walkOnPage: (pet: Pet, point: Point) => void;
  startDrag: (event: ReactPointerEvent<HTMLCanvasElement>, pet: Pet) => void;
  setPaused: (paused: boolean) => void;
  dismiss: () => void;
}
const RoamingChibiContext = createContext<RoamingChibiContextValue | null>(null);
export function useRoamingChibi() {
  const context = useContext(RoamingChibiContext);
  if (!context) throw new Error('Chibi viewers require RoamingChibiProvider');
  return context;
}
const clampToPage = ({ x, y }: Point): Point => ({
  x: Math.max(0, Math.min(window.innerWidth - PET_WIDTH, x)),
  y: Math.max(0, Math.min(window.innerHeight - PET_HEIGHT, y)),
});
const ignoreAnimation = () => {};

/** The detached canvas belongs to the app, so viewer and route changes cannot dispose it. */
export default function RoamingChibiProvider({ children }: { children: ReactNode }) {
  const [pet, setPet] = useState<Pet | null>(null);
  const label = pet?.label, paused = pet?.paused;
  const [dragging, setDragging] = useState(false), [moving, setMoving] = useState(false), [flipped, setFlipped] = useState(false);
  const currentPet = useRef(pet); currentPet.current = pet;
  const petRef = useRef<HTMLDivElement>(null), position = useRef<Point>({ x: 0, y: 0 });
  const drag = useRef<{ pointer: number; origin: Point; offset: Point; bounds: DOMRect; detached: boolean; pet: Pet } | null>(null);
  const place = useCallback((point: Point) => {
    position.current = clampToPage(point);
    if (petRef.current) {
      petRef.current.style.left = `${position.current.x}px`;
      petRef.current.style.top = `${position.current.y}px`;
    }
  }, []);
  const setPaused = useCallback((paused: boolean) => setPet(value => value ? { ...value, paused } : null), []);
  const dismiss = useCallback(() => {
    const target = currentPet.current?.returnFocus;
    drag.current = null; setDragging(false); setPet(null);
    (target?.isConnected ? target : document.getElementById('page-content'))?.focus({ preventScroll: true });
  }, []);
  const walkOnPage = useCallback((next: Pet, point: Point) => {
    drag.current = null; setDragging(false); place(point); setPet(next);
  }, [place]);
  const beginDrag = useCallback((event: ReactPointerEvent<HTMLCanvasElement>, next: Pet, detached: boolean) => {
    if (event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    drag.current = { pointer: event.pointerId, origin: { x: event.clientX, y: event.clientY },
      offset: detached ? { x: event.clientX - position.current.x, y: event.clientY - position.current.y } : { x: PET_WIDTH / 2, y: PET_HEIGHT / 2 },
      bounds: event.currentTarget.getBoundingClientRect(), detached, pet: next };
    setDragging(true);
  }, []);
  const startDrag = useCallback((event: ReactPointerEvent<HTMLCanvasElement>, next: Pet) => beginDrag(event, next, false), [beginDrag]);
  useEffect(() => {
    // These listeners also survive the source viewer closing during a drag.
    const move = (event: PointerEvent) => {
      const active = drag.current;
      if (!active || event.pointerId !== active.pointer) return;
      const outside = event.clientX < active.bounds.left || event.clientX > active.bounds.right || event.clientY < active.bounds.top || event.clientY > active.bounds.bottom;
      if (!active.detached && outside && Math.hypot(event.clientX - active.origin.x, event.clientY - active.origin.y) > 6) {
        active.detached = true; setPet(active.pet);
      }
      if (active.detached) { event.preventDefault(); place({ x: event.clientX - active.offset.x, y: event.clientY - active.offset.y }); }
    };
    const finish = (event: PointerEvent) => { if (event.pointerId === drag.current?.pointer) { drag.current = null; setDragging(false); } };
    const cancel = () => { drag.current = null; setDragging(false); };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', finish); window.addEventListener('pointercancel', finish); window.addEventListener('blur', cancel);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', finish); window.removeEventListener('pointercancel', finish); window.removeEventListener('blur', cancel); };
  }, [place]);
  useEffect(() => {
    if (!label) return;
    const resize = () => place(position.current);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [label, place]);
  useEffect(() => {
    if (!label || paused || dragging) { setMoving(false); return; }
    let frame = 0, previous = performance.now(), waitUntil = previous + 700;
    let target = position.current;
    const walk = (now: number) => {
      const dt = Math.min(.05, (now - previous) / 1000); previous = now;
      if (!document.hidden && now >= waitUntil) {
        const dx = target.x - position.current.x, dy = target.y - position.current.y, distance = Math.hypot(dx, dy);
        if (distance < 3) {
          setMoving(false);
          target = clampToPage({ x: Math.random() * Math.max(0, window.innerWidth - PET_WIDTH), y: Math.random() * Math.max(0, window.innerHeight - PET_HEIGHT) });
          waitUntil = now + 1000 + Math.random() * 2000;
        } else {
          setMoving(true); setFlipped(dx < 0);
          const step = Math.min(distance, 45 * dt);
          place({ x: position.current.x + dx / distance * step, y: position.current.y + dy / distance * step });
        }
      }
      frame = requestAnimationFrame(walk);
    };
    const resize = () => { place(position.current); target = clampToPage(target); };
    frame = requestAnimationFrame(walk); window.addEventListener('resize', resize);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', resize); };
  }, [label, paused, dragging, place]);
  return <RoamingChibiContext.Provider value={{ pet, walkOnPage, startDrag, setPaused, dismiss }}>
    {children}
    {pet && createPortal(<div className={`chibi-roaming${dragging ? ' is-dragging' : ''}`} ref={petRef}
      style={{ left: position.current.x, top: position.current.y }} tabIndex={0} role="group" aria-label={`${pet.label} roaming chibi`}
      title="Drag to move · Arrow keys to move · Escape to dismiss" onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); dismiss(); }
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
          event.preventDefault(); setPaused(true);
          place({ x: position.current.x + (event.key === 'ArrowLeft' ? -20 : event.key === 'ArrowRight' ? 20 : 0), y: position.current.y + (event.key === 'ArrowUp' ? -20 : event.key === 'ArrowDown' ? 20 : 0) });
        }
      }}>
      <ChibiCanvas key={pet.model.skeleton} model={pet.model} label={pet.label} animation="Idle" onAnimationChange={ignoreAnimation}
        onAnimationsChange={ignoreAnimation} paused={pet.paused} moving={moving} flipped={flipped} roaming onPointerDown={event => beginDrag(event, pet, true)} />
      <div className="chibi-roaming-controls">
        <XButton dense label="Dismiss roaming chibi" onClick={dismiss} />
      </div>
    </div>, document.body)}
  </RoamingChibiContext.Provider>;
}
