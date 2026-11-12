import { ContentImg } from '@/components/content/ContentImage';
/* eslint-disable @next/next/no-img-element -- zoom deliberately loads the lossless public original. */
import { useCallback, useEffect, useRef, useState, MouseEvent, TouchEvent, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import StyledSelect from '@/components/ui/StyledSelect';
import SegmentedControl from '@/components/ui/SegmentedControl';
import { getSkinArtworkOriginal } from '@/lib/assets/skinArtwork';
import { animationButtons } from '@/lib/skins/dynamicArt';
import type { DynamicArtworkStatus } from './DynamicArtwork';

/* The animated artwork and the Spine runtime it draws with load only when the reader presses
   Animated: this file's chunk, then the runtime's, then the model (scripts/tests/test-dynamic-art.ts). */
const DynamicArtwork = dynamic(() => import('./DynamicArtwork'), { ssr: false });

interface Props {
  image: string;
  name: string;
  /** The artwork's animated version: its model.json (lib/skins/dynamicArt.ts), or null when it has
   *  none. Required, so every page that opens this view says which (null where it carries no pointers). */
  dynamic: string | null;
  alternate?: string | null;
  details?: ReactNode;
  voiceOperator?: string;
  closeLabel?: string;
  onClose: () => void;
}

const VIEW_OPTIONS = [
  { value: 'still', label: 'Still' },
  { value: 'animated', label: 'Animated' },
] as const;
type View = typeof VIEW_OPTIONS[number]['value'];

const MIN_SCALE = 1;
const MAX_SCALE = 5;

/* Whether an entrance's soundtrack is heard: on unless this reader turned it off, remembered in
   this browser (a convenience; storage may be unavailable). */
const SOUND_KEY = 'arkpedia:animated-art-sound';
function readSound(): boolean {
  try { return window.localStorage.getItem(SOUND_KEY) !== 'off'; } catch { return true; }
}
function writeSound(on: boolean) {
  try { window.localStorage.setItem(SOUND_KEY, on ? 'on' : 'off'); } catch { /* not remembered */ }
}

export default function SkinZoomOverlay({ image, name, dynamic: original, alternate = null, details, voiceOperator, closeLabel = 'Close', onClose }: Props) {
  const [variant, setVariant] = useState('original');
  const model = variant === 'alternate' && alternate ? alternate : original;
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    closeRef.current?.focus({ preventScroll: true });
    return () => previousFocus?.focus({ preventScroll: true });
  }, []);

  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragState = useRef<{ startX: number; startY: number; startOffsetX: number; startOffsetY: number } | null>(null);
  const pinchState = useRef<{ startDist: number; startScale: number } | null>(null);

  function clampScale(next: number) {
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
  }

  useEffect(() => {
    const overlay = dialogRef.current;
    if (!overlay) return;

    // React's wheel handler can be passive in Chromium. A cancelable native
    // listener lets trackpad pinch (Ctrl+wheel) and regular wheel zoom the art
    // without also zooming the browser page while the viewer is open.
    const onWheel = (event: globalThis.WheelEvent) => {
      if (event.cancelable) event.preventDefault();
      const distance = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1);
      const next = clampScale(scale - distance * 0.002);
      setScale(next);
      if (next === MIN_SCALE) setOffset({ x: 0, y: 0 });
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (dialogRef.current?.querySelector('[role="combobox"][aria-expanded="true"]')) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    overlay.addEventListener('wheel', onWheel, { passive: false });
    document.addEventListener('keydown', onEscape, true);
    return () => {
      overlay.removeEventListener('wheel', onWheel);
      document.removeEventListener('keydown', onEscape, true);
    };
  }, [scale, onClose]);

  function handleMouseDown(e: MouseEvent) {
    if (scale === MIN_SCALE) return;
    dragState.current = { startX: e.clientX, startY: e.clientY, startOffsetX: offset.x, startOffsetY: offset.y };
  }
  function handleMouseMove(e: MouseEvent) {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    setOffset({ x: dragState.current.startOffsetX + dx, y: dragState.current.startOffsetY + dy });
  }
  function handleMouseUp() {
    dragState.current = null;
  }

  function touchDistance(touches: React.TouchList) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function handleTouchStart(e: TouchEvent) {
    if (e.touches.length === 2) {
      pinchState.current = { startDist: touchDistance(e.touches), startScale: scale };
    } else if (e.touches.length === 1 && scale > MIN_SCALE) {
      dragState.current = {
        startX: e.touches[0].clientX,
        startY: e.touches[0].clientY,
        startOffsetX: offset.x,
        startOffsetY: offset.y,
      };
    }
  }
  function handleTouchMove(e: TouchEvent) {
    if (e.touches.length === 2 && pinchState.current) {
      const dist = touchDistance(e.touches);
      const next = clampScale(pinchState.current.startScale * (dist / pinchState.current.startDist));
      setScale(next);
    } else if (e.touches.length === 1 && dragState.current) {
      const dx = e.touches[0].clientX - dragState.current.startX;
      const dy = e.touches[0].clientY - dragState.current.startY;
      setOffset({ x: dragState.current.startOffsetX + dx, y: dragState.current.startOffsetY + dy });
    }
  }
  function handleTouchEnd() {
    dragState.current = null;
    pinchState.current = null;
  }

  function reset() {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }

  // Animated art: nothing is fetched until the reader picks Animated. A failure goes back to the
  // still picture and says so on the row the animation buttons take.
  const [view, setView] = useState<View>('still');
  const [status, setStatus] = useState<DynamicArtworkStatus | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [request, setRequest] = useState<{ name: string; id: number } | null>(null);
  // The view opens on a click, never on the server, so the stored choice can be read at once.
  const [sound, setSound] = useState(readSound);
  const [voiceLanguage, setVoiceLanguage] = useState('cn');
  function toggleSound() {
    setSound((on) => { writeSound(!on); return !on; });
  }
  const animated = model !== null && view === 'animated';
  const ready = animated && status?.kind === 'ready';
  const onStatus = useCallback((next: DynamicArtworkStatus) => {
    setStatus(next);
    if (next.kind === 'error') setView('still');
  }, []);
  function pickView(next: View) {
    setView(next);
    setStatus(null);
    setPlaying(null);
    setRequest(null);
  }
  const transform = `translate(${offset.x}px, ${offset.y}px) scale(${scale})`;

  return (
    <div className="skin-zoom-overlay" ref={dialogRef} role="dialog" aria-modal="true" aria-label={`${name} artwork`}
      onKeyDown={event => {
        if (event.key !== 'Tab') return;
        const buttons = Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}>
      <div
        className="skin-zoom-viewport"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* The canvas takes the still picture's box and its zoom and pan; the picture stays as the
            poster until the first frame is drawn. */}
        <div className="skin-zoom-stage">
          <ContentImg
            src={getSkinArtworkOriginal(image)}
            alt={name}
            width={1600}
            height={900}
            className="skin-zoom-image"
            style={{
              maxWidth: '90vw',
              maxHeight: '80vh',
              width: 'auto',
              height: 'auto',
              objectFit: 'contain',
              transform,
              cursor: scale > MIN_SCALE ? 'grab' : 'default',
              visibility: ready ? 'hidden' : undefined,
            }}
            draggable={false}
          />
          {animated && (
            <DynamicArtwork key={model} model={model} poster={getSkinArtworkOriginal(image)} label={name} transform={transform} scale={scale} request={request}
              sound={sound} voiceOperator={voiceOperator} voiceLanguage={voiceLanguage} onStatus={onStatus} onPlaying={setPlaying} />
          )}
        </div>
      </div>

      {/* One row for the animations, held at a control's height from the start, so the artwork's
          box does not move when the buttons arrive or a message replaces them. */}
      {model !== null && (
        <div className="skin-zoom-animations" aria-live="polite">
          {ready && status?.kind === 'ready' ? (<>
            {status.animations.length > 6 ? <StyledSelect className="scrim-control" label="Animation" value={playing ?? ''}
              options={animationButtons(status.animations, status.labels).map(button => ({value:button.name,label:button.label}))}
              onChange={name => setRequest(last => ({name,id:(last?.id ?? 0) + 1}))} /> : <div role="group" aria-label="Animation" className="seg-control">
              {animationButtons(status.animations, status.labels).map((button) => (
                <button key={button.name} type="button" className="filter-chip" aria-pressed={playing === button.name}
                  onClick={() => setRequest((last) => ({ name: button.name, id: (last?.id ?? 0) + 1 }))}>
                  {button.label}
                </button>
              ))}
            </div>}
            {status.voiceLanguages.length > 0 && <StyledSelect className="scrim-control" label="Voice language" value={status.voiceLanguage ?? ''}
              options={status.voiceLanguages} onChange={setVoiceLanguage}
              renderValue={option => <>Voice: {option.label}</>} />}
            {/* Soundtracks and authored voice actions share the sound preference. */}
            {status.sound && (
              <button type="button" className="filter-chip" aria-pressed={sound} onClick={toggleSound}>
                Sound
              </button>
            )}
          </>) : animated ? (
            <span className="skin-zoom-status">Loading the animated art…</span>
          ) : status?.kind === 'error' ? (
            <span className="skin-zoom-status">{status.message}</span>
          ) : null}
        </div>
      )}

      {details && <details className="skin-zoom-details"><summary>Outfit details</summary>{details}</details>}
      {alternate && <div className="skin-zoom-versions" aria-hidden={view !== 'animated'} style={{ visibility: view === 'animated' ? 'visible' : 'hidden' }}><SegmentedControl label="Illustration version" value={variant}
          options={[{ value: 'original', label: 'Version 1', disabled: view !== 'animated' }, { value: 'alternate', label: 'Version 2', disabled: view !== 'animated' }]}
          onChange={next => { setVariant(next); setStatus(null); setPlaying(null); setRequest(null); }} /></div>}
      <div className="skin-zoom-controls">
        {model !== null && <SegmentedControl label="Artwork" options={VIEW_OPTIONS} value={view} onChange={pickView} />}
        <div className="skin-zoom-actions">
          <button type="button" className="ghost" onClick={reset} disabled={scale === MIN_SCALE}>
            Reset
          </button>
          <button ref={closeRef} type="button" className="primary" onClick={onClose}>
            {closeLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
