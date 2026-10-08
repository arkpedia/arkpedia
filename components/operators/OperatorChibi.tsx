import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import SegmentedControl from '@/components/ui/SegmentedControl';
import StyledSelect from '@/components/ui/StyledSelect';
import type { ChibiFacings } from '@/lib/operators/chibi';
const ChibiCanvas = dynamic(() => import('./ChibiCanvas'), { ssr: false });
const PET_WIDTH = 160, PET_HEIGHT = 180;
type Point = { x: number; y: number };
const clampToPage = ({ x, y }: Point): Point => ({
  x: Math.max(0, Math.min(window.innerWidth - PET_WIDTH, x)),
  y: Math.max(0, Math.min(window.innerHeight - PET_HEIGHT, y)),
});

export default function OperatorChibi({ models, label, onOpen }: { onOpen?: () => void; models: ChibiFacings | null; label: string }) {
  const [open, setOpen] = useState(false), [facing, setFacing] = useState<'front' | 'back'>('front');
  const [animation, setAnimation] = useState('Idle'), [animations, setAnimations] = useState<string[]>([]);
  const [paused, setPaused] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [roaming, setRoaming] = useState(false), [dragging, setDragging] = useState(false), [moving, setMoving] = useState(false), [flipped, setFlipped] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null), petRef = useRef<HTMLDivElement>(null);
  const position = useRef<Point>({ x: 0, y: 0 });
  const drag = useRef<{ pointer: number; origin: Point; offset: Point; bounds: DOMRect; detached: boolean } | null>(null);
  const options = (['front', 'back'] as const).filter(value => models?.[value]).map(value => ({ value, label: value === 'front' ? 'Front' : 'Back' }));
  const shown = models?.[facing] ? facing : options[0]?.value;
  const place = useCallback((point: Point) => {
    position.current = clampToPage(point);
    if (petRef.current) {
      petRef.current.style.left = `${position.current.x}px`;
      petRef.current.style.top = `${position.current.y}px`;
    }
  }, []);
  const returnToViewer = useCallback(() => { drag.current = null; setDragging(false); setRoaming(false); }, []);
  const startWalking = () => {
    const bounds = panelRef.current?.getBoundingClientRect();
    place({ x: (bounds?.left ?? window.innerWidth / 2) - PET_WIDTH, y: bounds?.top ?? window.innerHeight / 2 });
    setRoaming(true);
  };
  const startDrag = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    drag.current = { pointer: event.pointerId, origin: { x: event.clientX, y: event.clientY },
      offset: roaming ? { x: event.clientX - position.current.x, y: event.clientY - position.current.y } : { x: PET_WIDTH / 2, y: PET_HEIGHT / 2 }, bounds, detached: roaming };
    setDragging(true);
  };
  useEffect(() => {
    // Window listeners survive moving the canvas into its page-level portal.
    const move = (event: PointerEvent) => {
      const active = drag.current;
      if (!active || event.pointerId !== active.pointer) return;
      const outside = event.clientX < active.bounds.left || event.clientX > active.bounds.right || event.clientY < active.bounds.top || event.clientY > active.bounds.bottom;
      if (!active.detached && outside && Math.hypot(event.clientX - active.origin.x, event.clientY - active.origin.y) > 6) {
        active.detached = true; setRoaming(true);
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
    if (!roaming) return;
    const resize = () => place(position.current);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [roaming, place]);
  useEffect(() => {
    if (!roaming || paused || dragging) { setMoving(false); return; }
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
  }, [roaming, paused, dragging, place]);
  // An unavailable outfit must not leave the previous outfit roaming on the page.
  useEffect(() => { if (!shown) returnToViewer(); }, [shown, returnToViewer]);
  const model = shown ? roaming ? models?.walk ?? models?.[shown] : models?.[shown] : undefined;
  // A disposed WebGL context cannot be reused; only the canvas remounts. Selection
  // and pause state live here, so switching facing preserves both controls.
  const canvas = model ? <ChibiCanvas key={model.skeleton} model={model} label={label} animation={animation} onAnimationChange={setAnimation} onAnimationsChange={setAnimations} paused={paused} moving={moving} flipped={roaming && flipped} onPointerDown={startDrag} roaming={roaming} /> : null;
  return <div className="operator-chibi" ref={panelRef}>
    <div className="operator-chibi-header">
      <button className="ghost" type="button" aria-expanded={open} onClick={() => { if (!open) onOpen?.(); else returnToViewer(); setOpen(!open); }}>Chibi viewer</button>
      {open && shown && <SegmentedControl label="Chibi facing" value={shown} options={options} onChange={setFacing} />}
    </div>
    {open && (canvas ? <>
      {roaming ? <>
        <div className="chibi-away"><button className="ghost" type="button" onClick={returnToViewer}>Return to viewer</button></div>
        {createPortal(<div className={`chibi-roaming${dragging ? ' is-dragging' : ''}`} ref={petRef} style={{ left: position.current.x, top: position.current.y }} tabIndex={0} role="group" aria-label={`${label} roaming chibi`} title="Drag to move · Arrow keys to move · Escape to return" onKeyDown={event => {
          if (event.key === 'Escape') { returnToViewer(); panelRef.current?.querySelector<HTMLButtonElement>('button')?.focus(); }
          if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
            event.preventDefault(); setPaused(true);
            place({ x: position.current.x + (event.key === 'ArrowLeft' ? -20 : event.key === 'ArrowRight' ? 20 : 0), y: position.current.y + (event.key === 'ArrowUp' ? -20 : event.key === 'ArrowDown' ? 20 : 0) });
          }
        }}>{canvas}<button className="chibi-return" type="button" aria-label="Return chibi to viewer" onClick={returnToViewer}>×</button></div>, document.body)}
      </> : canvas}
    </> : <p className="hint">Chibi artwork for this outfit is not in the current asset catalogue.</p>)}
    {open && canvas && <>
      <div className="chibi-controls">
        <StyledSelect className="chibi-animation" label="Chibi animation" value={animation} options={animations.map(value => ({ value, label: value }))} onChange={setAnimation} />
        <button type="button" className="ghost" aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? 'Play' : 'Pause'}</button>
      </div>
      {!roaming && <div className="chibi-page-controls"><button className="ghost" type="button" onClick={startWalking}>Walk on page</button></div>}
    </>}
  </div>;
}
