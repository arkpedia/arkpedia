import type { ChibiTapVoices } from '@/lib/operators/chibiVoice';
import { useChibiVoice } from './useChibiVoice';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import XButton from '@/components/ui/XButton';
import { ContentImg } from '@/components/content/ContentImage';
import type { ChibiModel, ChibiFacings } from '@/lib/operators/chibi';
import { resolveChibiModel, resolveChibiFacings } from '@/lib/operators/chibi';
import { useContentUrl } from '@/lib/content/context';
import { CHIBI_FURNITURE, chooseChibiBreak, chooseChibiTap, chibiActivities } from '@/lib/operators/chibiRoutine';
import ChibiWindow from './ChibiWindow';
import ChibiSizeControl from './ChibiSizeControl';
import { chibiDimensions } from '@/lib/operators/chibiSize';
import type { ChibiAnimation, ChibiBreak } from '@/lib/operators/chibiRoutine';

const ChibiCanvas = dynamic(() => import('./ChibiCanvas'), { ssr: false });
const PET_WIDTH = 160, PET_HEIGHT = 180;
type Point = { x: number; y: number };
export interface Pet { voices?: ChibiTapVoices; models: ChibiFacings; label: string; model: ChibiModel; paused: boolean; returnFocus: HTMLButtonElement | null }
export interface ChibiViewerConfig { voices?: ChibiTapVoices; label: string; models: ChibiFacings; returnFocus: HTMLButtonElement | null }
interface RoamingChibiContextValue {
  viewer: ChibiViewerConfig | null;
  viewerOpen: boolean;
  openViewer: (viewer: ChibiViewerConfig) => void;
  closeViewer: () => void;
  pet: Pet | null;
  walkOnPage: (pet: Pet, point: Point) => void;
  startDrag: (event: ReactPointerEvent<HTMLCanvasElement>, pet: Pet) => void;
  size: number;
  setSize: (size: number) => void;
  dismiss: () => void;
}
const RoamingChibiContext = createContext<RoamingChibiContextValue | null>(null);
export function useRoamingChibi() {
  const context = useContext(RoamingChibiContext);
  if (!context) throw new Error('Chibi viewers require RoamingChibiProvider');
  return context;
}
const clampToPage = ({ x, y }: Point, size = 100): Point => {
  const bounds = chibiDimensions(size, window.innerWidth, window.innerHeight);
  return { x: Math.max(0, Math.min(window.innerWidth - bounds.width, x)), y: Math.max(0, Math.min(window.innerHeight - bounds.height, y)) };
};
type Drag = { pointer: number; origin: Point; offset: Point; bounds: DOMRect; detached: boolean; moved: boolean; pet: Pet };
type Walker = { id: number; pet: Pet; point: Point; drag?: Drag; size: number };
const ignoreAnimation = () => {};

/** Each roaming canvas owns its motion and controls; opening another viewer leaves it alive. */
export default function RoamingChibiProvider({ children }: { children: ReactNode }) {
  const resolveUrl = useContentUrl();
  const resolvedPet = useCallback((pet: Pet): Pet => ({ ...pet, voices: pet.voices ? Object.fromEntries(Object.entries(pet.voices).filter(([, clip]) => clip).map(([key, clip]) => [key, { ...clip!, url: resolveUrl(clip!.url) }])) : undefined, model: resolveChibiModel(pet.model, resolveUrl), models: resolveChibiFacings(pet.models, resolveUrl) }), [resolveUrl]);
  const [viewer, setViewer] = useState<ChibiViewerConfig | null>(null), [viewerOpen, setViewerOpen] = useState(false);
  const [walkers, setWalkers] = useState<Walker[]>([]);
  const [size, setSize] = useState(100);
  const nextId = useRef(0), drag = useRef<Drag | null>(null);
  const viewerRef = useRef(viewer); viewerRef.current = viewer;
  const openViewer = useCallback((next: ChibiViewerConfig) => { setViewer({ ...next, models: resolveChibiFacings(next.models, resolveUrl) }); setViewerOpen(true); }, [resolveUrl]);
  const closeViewer = useCallback(() => {
    setViewerOpen(false);
    const source = viewerRef.current?.returnFocus;
    (source?.isConnected ? source : document.getElementById('page-content'))?.focus({ preventScroll: true });
  }, []);
  const walkOnPage = useCallback((pet: Pet, point: Point) => {
    const id = ++nextId.current;
    setWalkers(current => [...current, { id, pet: resolvedPet(pet), point, size }]);
  }, [size, resolvedPet]);
  const startDrag = useCallback((event: ReactPointerEvent<HTMLCanvasElement>, pet: Pet) => {
    if (event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    const bounds = chibiDimensions(size, window.innerWidth, window.innerHeight);
    drag.current = { pointer: event.pointerId, origin: { x: event.clientX, y: event.clientY }, offset: { x: bounds.width / 2, y: bounds.height / 2 }, bounds: event.currentTarget.getBoundingClientRect(), detached: false, moved: false, pet: resolvedPet(pet) };
  }, [size, resolvedPet]);
  useEffect(() => {
    const move = (event: PointerEvent) => {
      const active = drag.current;
      if (!active || active.pointer !== event.pointerId) return;
      const outside = event.clientX < active.bounds.left || event.clientX > active.bounds.right || event.clientY < active.bounds.top || event.clientY > active.bounds.bottom;
      if (!outside || Math.hypot(event.clientX - active.origin.x, event.clientY - active.origin.y) <= 6) return;
      event.preventDefault(); drag.current = null;
      const id = ++nextId.current;
      setWalkers(current => [...current, { id, pet: active.pet, size, point: { x: event.clientX - active.offset.x, y: event.clientY - active.offset.y }, drag: { ...active, detached: true, moved: true } }]);
    };
    const finish = () => { drag.current = null; };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', finish); window.addEventListener('pointercancel', finish); window.addEventListener('blur', finish);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', finish); window.removeEventListener('pointercancel', finish); window.removeEventListener('blur', finish); };
  }, [size]);
  const dismiss = () => setWalkers(current => current.filter(walker => walker.pet.label !== viewer?.label));
  const pet = walkers.find(walker => walker.pet.label === viewer?.label)?.pet ?? null;
  return <RoamingChibiContext.Provider value={{ pet, viewer, viewerOpen, openViewer, closeViewer, walkOnPage, startDrag, size, setSize, dismiss }}>
    {children}
    {viewer && <ChibiWindow config={viewer} open={viewerOpen} />}
    {walkers.map(walker => <RoamingChibi key={walker.id} initial={walker} onDismiss={() => setWalkers(current => current.filter(item => item.id !== walker.id))} />)}
  </RoamingChibiContext.Provider>;
}

function RoamingChibi({ initial, onDismiss }: { initial: Walker; onDismiss: () => void }) {
  const [size, setSize] = useState(initial.size);
  const sizeRef = useRef(size); sizeRef.current = size;
  const dismissRef = useRef(onDismiss); dismissRef.current = onDismiss;
  const [pet, setPet] = useState<Pet | null>(initial.pet);
  const [controlsVisible, setControlsVisible] = useState(false);
  useEffect(() => {
    if (!controlsVisible) return;
    const timeout = window.setTimeout(() => setControlsVisible(false), 5000);
    return () => window.clearTimeout(timeout);
  }, [controlsVisible]);
  const label = pet?.label, paused = pet?.paused;
  const [dragging, setDragging] = useState(Boolean(initial.drag)), [moving, setMoving] = useState(false), [flipped, setFlipped] = useState(false);
  const [rest, setRest] = useState<ChibiBreak | null>(null);
  const firstTap = useRef(true), [animationSequence, setAnimationSequence] = useState(0);
  const animations = useRef<ChibiAnimation[]>([]), resting = useRef<ChibiBreak | null>(null);
  const loadedModel = useRef('');
  const activeModel = pet?.model;
  const cycleFinished = useRef(false);
  const onAnimationComplete = useCallback(() => { cycleFinished.current = true; }, []);
  const remaining = useRef(0), loadedFurniture = useRef(new Set<string>());
  const onAnimationsChange = useCallback((names: string[], durations?: Record<string, number>) => {
    loadedModel.current = activeModel?.skeleton ?? '';
    if (activeModel?.skeleton === currentPet.current?.model.skeleton) {
      animations.current = names.map(name => ({ name, duration: durations?.[name] ?? 0 }));
    }
  }, [activeModel?.skeleton]);
  const endRest = useCallback(() => { resting.current = null; remaining.current = 0; cycleFinished.current = false; setRest(null); setMoving(false); }, []);
  const currentPet = useRef(pet); currentPet.current = pet;
  const petRef = useRef<HTMLDivElement>(null), position = useRef<Point>(clampToPage(initial.point, initial.size));
  const drag = useRef<Drag | null>(initial.drag ?? null);
  const place = useCallback((point: Point) => {
    position.current = clampToPage(point, sizeRef.current);
    if (petRef.current) {
      petRef.current.style.left = `${position.current.x}px`;
      petRef.current.style.top = `${position.current.y}px`;
    }
  }, []);
  const setPaused = useCallback((paused: boolean) => {
    if (paused) setMoving(false);
    setPet(value => value ? { ...value, paused } : null);
  }, []);
  const dismiss = useCallback(() => {
    const target = currentPet.current?.returnFocus;
    drag.current = null; setDragging(false); endRest(); dismissRef.current();
    (target?.isConnected ? target : document.getElementById('page-content'))?.focus({ preventScroll: true });
  }, [endRest]);
  const playVoice = useChibiVoice(pet?.voices);
  const tap = useCallback(() => {
    const next = chooseChibiTap(animations.current, firstTap.current);
    if (!next) return;
    playVoice(next.activity === 'trust-tap');
    firstTap.current = false; setMoving(false);
    cycleFinished.current = false; remaining.current = next.duration; resting.current = next; setRest(next);
    // Repeated taps can choose the same clip, which must restart from its beginning.
    setAnimationSequence(value => value + 1);
  }, [playVoice]);
  const beginDrag = useCallback((event: ReactPointerEvent<HTMLCanvasElement>, next: Pet, detached: boolean) => {
    if (event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    endRest();
    drag.current = { pointer: event.pointerId, origin: { x: event.clientX, y: event.clientY },
      offset: detached ? { x: event.clientX - position.current.x, y: event.clientY - position.current.y } : { x: PET_WIDTH / 2, y: PET_HEIGHT / 2 },
      bounds: event.currentTarget.getBoundingClientRect(), detached, moved: false, pet: next };
    if (detached) petRef.current?.focus({ preventScroll: true });
    setDragging(true);
  }, [endRest]);
  useEffect(() => { place(position.current); }, [size, place]);
  useEffect(() => {
    // These listeners also survive the source viewer closing during a drag.
    const move = (event: PointerEvent) => {
      const active = drag.current;
      if (!active || event.pointerId !== active.pointer) return;
      active.moved ||= Math.hypot(event.clientX - active.origin.x, event.clientY - active.origin.y) > 6;
      const outside = event.clientX < active.bounds.left || event.clientX > active.bounds.right || event.clientY < active.bounds.top || event.clientY > active.bounds.bottom;
      if (!active.detached && outside && active.moved) {
        active.detached = true; firstTap.current = true; setPet(active.pet);
      }
      if (active.detached && active.moved) { event.preventDefault(); place({ x: event.clientX - active.offset.x, y: event.clientY - active.offset.y }); }
    };
    const finish = (event: PointerEvent) => {
      const active = drag.current;
      if (!active || event.pointerId !== active.pointer) return;
      drag.current = null; setDragging(false);
      if (event.type === 'pointerup' && active.detached && !active.moved
        && Math.hypot(event.clientX - active.origin.x, event.clientY - active.origin.y) <= 6) { tap(); if (event.pointerType === 'touch') setControlsVisible(value => !value); }
    };
    const cancel = () => { drag.current = null; setDragging(false); };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', finish); window.addEventListener('pointercancel', finish); window.addEventListener('blur', cancel);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', finish); window.removeEventListener('pointercancel', finish); window.removeEventListener('blur', cancel); };
  }, [place, tap]);
  useEffect(() => {
    if (!label) return;
    const resize = () => place(position.current);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [label, place]);
  useEffect(() => {
    animations.current = []; endRest();
  }, [pet?.model, endRest]);
  useEffect(() => {
    if (!label) return;
    const images = Object.entries(CHIBI_FURNITURE).map(([activity, furniture]) => {
      const image = new Image();
      image.onload = () => loadedFurniture.current.add(activity);
      image.src = furniture.image;
      return image;
    });
    return () => { images.forEach(image => { image.onload = null; }); };
  }, [label]);
  useEffect(() => {
    if (!label || dragging) { setMoving(false); return; }
    if (paused) setMoving(false);
    let frame = 0, previous = performance.now(), waitUntil = previous + 700;
    let hasWalked = false;
    let target = position.current;
    const walk = (now: number) => {
      const elapsed = Math.max(0, (now - previous) / 1000), dt = Math.min(.05, elapsed); previous = now;
      if (document.hidden) { frame = requestAnimationFrame(walk); return; }
      if (resting.current) {
        if (loadedModel.current !== currentPet.current?.model.skeleton) {
          frame = requestAnimationFrame(walk); return;
        }
        remaining.current -= dt * 1000;
        if (remaining.current <= 0 && cycleFinished.current) { endRest(); hasWalked = false; waitUntil = now + 700; }
      } else if (!paused && !resting.current && loadedModel.current === currentPet.current?.model.skeleton && now >= waitUntil) {
        target = clampToPage(target, sizeRef.current);
        const dx = target.x - position.current.x, dy = target.y - position.current.y, distance = Math.hypot(dx, dy);
        if (distance < 3) {
          setMoving(false);
          const activities = chibiActivities(animations.current);
          const available = animations.current.filter(animation =>
            (!activities.sit.includes(animation) || loadedFurniture.current.has('sit')) &&
            (!activities.sleep.includes(animation) || loadedFurniture.current.has('sleep')));
          const next = hasWalked ? chooseChibiBreak(available) : null;
          if (next) { setAnimationSequence(value => value + 1); cycleFinished.current = false; remaining.current = next.duration; resting.current = next; setRest(next); }
          hasWalked = false;
          target = clampToPage({ x: Math.random() * window.innerWidth, y: Math.random() * window.innerHeight }, sizeRef.current);
          waitUntil = now + 1000 + Math.random() * 2000;
        } else {
          hasWalked = true; setMoving(true); setFlipped(dx < 0);
          const step = Math.min(distance, 45 * dt);
          place({ x: position.current.x + dx / distance * step, y: position.current.y + dy / distance * step });
        }
      }
      frame = requestAnimationFrame(walk);
    };
    const resize = () => { place(position.current); target = clampToPage(target, sizeRef.current); };
    const visibility = () => { previous = performance.now(); };
    frame = requestAnimationFrame(walk); window.addEventListener('resize', resize); document.addEventListener('visibilitychange', visibility);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', resize); document.removeEventListener('visibilitychange', visibility); };
  }, [label, pet?.model, paused, dragging, place, endRest]);
  const furniture = rest?.activity === 'sit' || rest?.activity === 'sleep' ? CHIBI_FURNITURE[rest.activity] : null;
  return pet ? createPortal(<div className={`chibi-roaming${dragging ? ' is-dragging' : ''}${controlsVisible ? ' show-controls' : ''}`} ref={petRef} data-activity={rest?.activity ?? (moving ? 'walking' : 'idle')} data-break-duration={rest?.duration}
      style={{ left: position.current.x, top: position.current.y, width: `min(${PET_WIDTH * size / 100}px, calc(100vw - 16px), calc((100dvh - 16px) * 8 / 9))` }} tabIndex={0} role="group" aria-label={`${pet.label} roaming chibi`}
      title="Tap to interact · Enter or Space to interact · Drag or arrow keys to move · Escape to dismiss" onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); dismiss(); }
        if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault(); if (!event.repeat) tap();
        }
        if (event.target === event.currentTarget && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
          event.preventDefault(); endRest(); setPaused(true);
          place({ x: position.current.x + (event.key === 'ArrowLeft' ? -20 : event.key === 'ArrowRight' ? 20 : 0), y: position.current.y + (event.key === 'ArrowUp' ? -20 : event.key === 'ArrowDown' ? 20 : 0) });
        }
      }}>
      {furniture && <ContentImg className={`chibi-furniture chibi-furniture-${rest!.activity}`} src={furniture.image} alt="" aria-hidden="true" draggable={false}
        data-furniture={furniture.id} style={flipped ? { transform: 'scaleX(-1)' } : undefined} onError={endRest} />}
      <ChibiCanvas key={activeModel!.skeleton} model={activeModel!} label={pet.label} animation={rest?.clip ?? 'Idle'} activity={rest?.activity} animationSequence={animationSequence} once={rest?.once} onAnimationChange={ignoreAnimation}
        onAnimationsChange={onAnimationsChange} onAnimationComplete={onAnimationComplete} paused={false} moving={moving} flipped={flipped} roaming onPointerDown={event => beginDrag(event, pet, true)} />
      <div className="chibi-roaming-controls" onPointerDown={() => setControlsVisible(true)}>
        <XButton label="Dismiss roaming chibi" onClick={dismiss} />
        <ChibiSizeControl size={size} onChange={setSize} compact />
        <button className="btn-x" type="button" aria-label={pet.paused ? 'Resume walking' : 'Pause walking'} title={pet.paused ? 'Resume walking' : 'Pause walking'} onClick={() => setPaused(!pet.paused)}>
          <svg aria-hidden="true" focusable="false" viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
            {pet.paused ? <path d="M5 3v10l6-5Z" /> : <><rect x="4" y="3" width="2" height="10" /><rect x="10" y="3" width="2" height="10" /></>}
          </svg>
        </button>
      </div>
    </div>, document.body) : null;
}
