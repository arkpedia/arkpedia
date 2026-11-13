import { useChibiVoice } from './useChibiVoice';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { resizeChibiWindow, type ChibiWindowEdge, type ChibiWindowRect } from '@/lib/operators/chibiWindowSize';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import SegmentedControl from '@/components/ui/SegmentedControl';
import StyledSelect from '@/components/ui/StyledSelect';
import XButton from '@/components/ui/XButton';
import { loadChibiAnimations, chibiAnimationLabel } from '@/lib/operators/chibiAnimations';
import { chooseChibiTap, chibiIdleAnimation } from '@/lib/operators/chibiRoutine';
import type { ChibiAnimation, ChibiBreak } from '@/lib/operators/chibiRoutine';
import { useRoamingChibi, type ChibiViewerConfig } from './RoamingChibiProvider';

const ChibiCanvas = dynamic(() => import('./ChibiCanvas'), { ssr: false });
const ignoreAnimation = () => {};
const EMPTY: ChibiAnimation[] = [];
type Point = { x: number; y: number };
const RESIZE_EDGES: ChibiWindowEdge[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
const EDGE_LABELS = { n: 'top', ne: 'top right', e: 'right', se: 'bottom right', s: 'bottom', sw: 'bottom left', w: 'left', nw: 'top left' };

/** An app-owned, non-modal viewer; closing it leaves the roaming canvas alive. */
export default function ChibiWindow({ config, open }: { config: ChibiViewerConfig; open: boolean }) {
  const chibi = useRoamingChibi();
  const roaming = chibi.pet?.label === config.label;
  const [facing, setFacing] = useState<'front' | 'back'>('front');
  const [selected, setSelected] = useState({ base: false, clip: 'Idle' });
  const [catalogue, setCatalogue] = useState<Partial<Record<'front' | 'back' | 'walk', ChibiAnimation[]>>>({});
  const [error, setError] = useState('');
  const [previewPaused, setPreviewPaused] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [sequence, setSequence] = useState(0);
  const paused = previewPaused;
  const [playing, setPlaying] = useState(selected);
  const [reaction, setReaction] = useState<ChibiBreak | null>(null);
  const firstTap = useRef(true);
  const playVoice = useChibiVoice(config.voices, open);
  const completed = useRef(false);
  useEffect(() => { completed.current = false; }, [playing, sequence]);
  const onAnimationComplete = useCallback((looping: boolean) => {
    // Queued poses start at the next cycle boundary, including looping clips.
    completed.current = !looping;
    setReaction(null);
    setPlaying(selected);
  }, [selected]);
  const windowRef = useRef<HTMLDivElement>(null), position = useRef<Point>({ x: 8, y: 8 });
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const resizing = useRef<{ pointer: number; edge: ChibiWindowEdge; origin: Point; rect: ChibiWindowRect } | null>(null);
  const resizeTo = useCallback((rect: ChibiWindowRect) => {
    const element = windowRef.current; if (!element) return;
    position.current = { x: rect.x, y: rect.y };
    element.style.left = `${rect.x}px`; element.style.top = `${rect.y}px`;
    element.style.width = `${rect.width}px`; element.style.height = `${rect.height}px`;
    setDimensions({ width: rect.width, height: rect.height });
  }, []);
  const placed = useRef(false), drag = useRef<{ pointer: number; offset: Point } | null>(null);
  const place = useCallback((point: Point) => {
    const element = windowRef.current; if (!element) return;
    const bounds = element.getBoundingClientRect();
    position.current = { x: Math.max(8, Math.min(window.innerWidth - bounds.width - 8, point.x)),
      y: Math.max(8, Math.min(window.innerHeight - bounds.height - 8, point.y)) };
    element.style.left = `${position.current.x}px`; element.style.top = `${position.current.y}px`;
  }, []);
  useEffect(() => {
    setCatalogue({}); setFacing('front'); setSelected({ base: false, clip: 'Idle' }); setPlaying({ base: false, clip: 'Idle' }); completed.current = false;
  }, [config.models, config.label]);
  useEffect(() => {
    if (!open) return;
    let active = true;
    setError('');
    Promise.all(Object.entries(config.models).map(async ([key, model]) => {
      const animations = await loadChibiAnimations(model);
      if (active) setCatalogue(value => ({ ...value, [key]: animations }));
    })).catch(() => { if (active) setError('Some animations could not load. Reopen the viewer to retry.'); });
    return () => { active = false; };
  }, [config.models, config.label, open]);
  useEffect(() => {
    if (!open) { placed.current = false; return; }
    if (!windowRef.current) return;
    if (!placed.current) {
      const source = config.returnFocus?.getBoundingClientRect();
      place({ x: (source?.right ?? window.innerWidth) - windowRef.current.offsetWidth, y: source?.top ?? 8 });
      placed.current = true;
    } else place(position.current);
    windowRef.current.focus({ preventScroll: true });
    const resize = () => place(position.current);
    const observer = new ResizeObserver(resize); observer.observe(windowRef.current);
    window.addEventListener('resize', resize);
    return () => { observer.disconnect(); window.removeEventListener('resize', resize); };
  }, [open, config.label, config.returnFocus, place]);
  useEffect(() => {
    const move = (event: PointerEvent) => {
      const active = resizing.current;
      if (active && event.pointerId === active.pointer) {
        event.preventDefault();
        resizeTo(resizeChibiWindow(active.rect, active.edge, event.clientX - active.origin.x, event.clientY - active.origin.y, { width: window.innerWidth, height: window.innerHeight }));
        return;
      }
      if (event.pointerId !== drag.current?.pointer) return;
      event.preventDefault(); place({ x: event.clientX - drag.current.offset.x, y: event.clientY - drag.current.offset.y });
    };
    const finish = () => { drag.current = null; resizing.current = null; };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', finish); window.addEventListener('pointercancel', finish); window.addEventListener('blur', finish);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', finish); window.removeEventListener('pointercancel', finish); window.removeEventListener('blur', finish); };
  }, [place, resizeTo]);
  const shown = config.models[facing] ? facing : config.models.front ? 'front' : 'back';
  const battleModel = config.models[shown], model = playing.base ? config.models.walk : battleModel;
  useEffect(() => { if (!reaction && (paused || completed.current || !model)) setPlaying(selected); }, [selected, paused, model, reaction]);
  const battle = catalogue[shown] ?? EMPTY, base = catalogue.walk ?? EMPTY;
  const sharedReaction = !base.some(pose => pose.duration > 0 && /^Interact(?:[_\d].*)?$/i.test(pose.name)) || !base.some(pose => pose.duration > 0 && /^Special(?:[_\d].*)?$/i.test(pose.name));
  const choices = useMemo(() => [...battle.map(pose => ({ value: `battle:${pose.name}`, label: pose.name, pose, base: false })),
    ...base.map(pose => ({ value: `base:${pose.name}`, label: chibiAnimationLabel(pose.name, true, sharedReaction), pose, base: true }))], [battle, base, sharedReaction]);
  const selectedPose = (selected.base ? base : battle).find(pose => pose.name === selected.clip);
  useEffect(() => {
    // Do not replace a battle selection just because the base catalogue loaded first.
    if (selectedPose || !choices.length || (selected.base ? !catalogue.walk : battleModel && !catalogue[shown])) return;
    const preferBase = selected.base || !battle.length;
    const idle = chibiIdleAnimation(preferBase ? base : battle);
    const first = choices.find(choice => choice.base === preferBase && choice.pose.name === idle) ?? choices[0];
    setSelected({ base: first.base, clip: first.pose.name });
  }, [selectedPose, selected.base, base, battle, choices, catalogue, battleModel, shown]);
  const onAnimationsChange = useCallback((names: string[], durations?: Record<string, number>) => {
    const key = playing.base ? 'walk' : shown;
    setCatalogue(value => ({ ...value, [key]: names.map(name => ({ name, duration: durations?.[name] ?? 0 })) }));
  }, [playing.base, shown]);
  const tap = () => {
    const next = chooseChibiTap(base, firstTap.current);
    playVoice(next ? next.activity === 'trust-tap' : firstTap.current);
    firstTap.current = false;
    if (next && config.models.walk) { setReaction(next); setPlaying({ base: true, clip: next.clip }); setSequence(value => value + 1); }
  };
  const play = () => {
    setPreviewPaused(false);
    if (paused || completed.current) { setPlaying(selected); setSequence(value => value + 1); completed.current = false; }
  };
  const nextPet = () => {
    const walking = config.models.walk ?? model;
    return walking ? { ...config, model: walking, paused: window.matchMedia('(prefers-reduced-motion: reduce)').matches, returnFocus: config.returnFocus } : null;
  };
  const furnitureActivity = playing.base && /^(sit|sleep)(?:[_\d].*)?$/i.test(playing.clip) ? /^sit/i.test(playing.clip) ? 'sit' : 'sleep' : undefined;
  if (!open) return null;
  return createPortal(<div ref={windowRef} className="chibi-window" role="dialog" aria-label={`Chibi viewer — ${config.label}`} tabIndex={-1}
    style={{ left: position.current.x, top: position.current.y, width: dimensions ? `min(${dimensions.width}px, calc(100vw - 16px))` : undefined, height: dimensions ? `min(${dimensions.height}px, calc(100dvh - 16px))` : undefined }} onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); chibi.closeViewer(); }
    }}>
    <div className="chibi-window-header">
      <button type="button" className="btn-bare chibi-window-drag" aria-label="Move chibi viewer" title="Drag to move · Arrow keys to move"
        onPointerDown={event => {
          if (event.button !== 0 || !event.isPrimary) return;
          event.preventDefault(); event.currentTarget.focus({ preventScroll: true });
          drag.current = { pointer: event.pointerId, offset: { x: event.clientX - position.current.x, y: event.clientY - position.current.y } };
          event.currentTarget.setPointerCapture(event.pointerId);
        }} onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
          event.preventDefault();
          place({ x: position.current.x + (event.key === 'ArrowLeft' ? -20 : event.key === 'ArrowRight' ? 20 : 0),
            y: position.current.y + (event.key === 'ArrowUp' ? -20 : event.key === 'ArrowDown' ? 20 : 0) });
        }}><strong>Chibi</strong><span>{config.label}</span></button>
      {!!battleModel && <SegmentedControl label="Chibi facing" value={shown} options={(['front', 'back'] as const).filter(key => config.models[key]).map(value => ({ value, label: value === 'front' ? 'Front' : 'Back' }))}
        onChange={value => { setFacing(value); if (selected.base) setSelected({ base: false, clip: 'Idle' }); }} />}
      <XButton label="Close chibi viewer" onClick={chibi.closeViewer} />
    </div>
    {model ? <ChibiCanvas model={model} label={config.label} animation={playing.clip} onAnimationChange={ignoreAnimation}
      onAnimationsChange={onAnimationsChange} onAnimationComplete={onAnimationComplete} animationSequence={sequence} paused={paused} moving={false} flipped={false} activity={reaction?.activity ?? furnitureActivity} playWhilePaused={Boolean(reaction)} onTap={tap}
      roaming={false} onPointerDown={event => { const next = nextPet(); if (next) chibi.startDrag(event, next); }} />
      : <p className="hint" role="status">Chibi artwork for this outfit is not in the current asset catalogue.</p>}
    {model && <div className="chibi-controls">
      <StyledSelect className="chibi-animation" label="Chibi animation" value={`${selected.base ? 'base' : 'battle'}:${selected.clip}`} options={choices}
        onChange={value => { const choice = choices.find(choice => choice.value === value); if (choice) setSelected({ base: choice.base, clip: choice.pose.name }); }} />
      <button className="ghost btn-icon" type="button" aria-label="Play" title="Play selected animation" disabled={!selectedPose} onClick={play}>▶</button>
      <button className="ghost btn-icon" type="button" aria-label="Pause" title="Pause" aria-pressed={paused}
        onClick={() => setPreviewPaused(true)}>Ⅱ</button>
    </div>}
    {(model || roaming) && <div className="chibi-page-controls"><button className="ghost" type="button" onClick={() => {
      if (roaming) chibi.dismiss(); else { const next = nextPet(); if (next && windowRef.current) { const bounds = windowRef.current.getBoundingClientRect(); const point = bounds.left >= 168 ? { x: bounds.left - 168, y: bounds.top }
          : window.innerHeight - bounds.bottom >= 188 ? { x: 8, y: bounds.bottom + 8 }
          : bounds.top >= 188 ? { x: 8, y: bounds.top - 188 } : { x: 8, y: window.innerHeight - 180 };
        chibi.walkOnPage(next, point); } }
    }}>{roaming ? 'Return to viewer' : 'Walk on page'}</button>{roaming && <button type="button" className="ghost" onClick={() => { const next = nextPet(); if (next) chibi.walkOnPage(next, { x: 8, y: window.innerHeight - 200 }); }}>Add another</button>}</div>}
    {error && <p className="hint" role="status">{error}</p>}
    {RESIZE_EDGES.map(edge => <button key={edge} type="button" className={`chibi-window-resize chibi-window-resize-${edge}`} tabIndex={edge === 'se' ? 0 : -1}
      aria-label={`Resize chibi viewer from ${EDGE_LABELS[edge]}`} title="Drag to resize · Arrow keys to resize"
      onPointerDown={event => {
        if (event.button !== 0 || !event.isPrimary || !windowRef.current) return;
        event.preventDefault(); event.stopPropagation();
        const bounds = windowRef.current.getBoundingClientRect();
        drag.current = null;
        resizing.current = { pointer: event.pointerId, edge, origin: { x: event.clientX, y: event.clientY }, rect: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height } };
        event.currentTarget.setPointerCapture(event.pointerId);
      }} onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) || !windowRef.current) return;
        event.preventDefault(); event.stopPropagation();
        const bounds = windowRef.current.getBoundingClientRect();
        resizeTo(resizeChibiWindow(bounds, edge, event.key === 'ArrowLeft' ? -20 : event.key === 'ArrowRight' ? 20 : 0,
          event.key === 'ArrowUp' ? -20 : event.key === 'ArrowDown' ? 20 : 0, { width: window.innerWidth, height: window.innerHeight }));
      }} />)}
  </div>, document.body);
}
