import { ContentImg } from '@/components/content/ContentImage';
/* eslint-disable @next/next/no-img-element -- zoom deliberately loads the lossless public original. */
import { useEffect, useRef, useState, WheelEvent, MouseEvent, TouchEvent } from 'react';
import { getSkinArtworkOriginal } from '@/lib/assets/skinArtwork';

interface Props {
  image: string;
  name: string;
  onClose: () => void;
}

const MIN_SCALE = 1;
const MAX_SCALE = 5;

export default function SkinZoomOverlay({ image, name, onClose }: Props) {
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

  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    const next = clampScale(scale - e.deltaY * 0.002);
    setScale(next);
    if (next === MIN_SCALE) setOffset({ x: 0, y: 0 });
  }

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

  return (
    <div className="skin-zoom-overlay" ref={dialogRef} role="dialog" aria-modal="true" aria-label={`${name} artwork`}
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); onClose(); }
        if (event.key !== 'Tab') return;
        const buttons = Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }}>
      <div
        className="skin-zoom-viewport"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
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
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            cursor: scale > MIN_SCALE ? 'grab' : 'default',
          }}
          draggable={false}
          decoding="async"
        />
      </div>

      <div className="skin-zoom-controls">
        <button type="button" className="ghost" onClick={reset} disabled={scale === MIN_SCALE}>
          Reset
        </button>
        <button ref={closeRef} type="button" className="primary" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
