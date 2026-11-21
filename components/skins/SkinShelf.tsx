import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { Skin } from '@/lib/skins/skinTypes';
import { parsePrices } from '@/lib/skins/skinPrice';
import PriceDisplay from '../ui/PriceDisplay';
import ResponsiveSkinArtwork from './ResponsiveSkinArtwork';

const PIXELS_PER_SECOND = 36;

type Props = {
  skins: Skin[];
  label: string;
  empty?: string;
  actions?: ReactNode;
  active?: boolean;
  newestOnly?: boolean;
  onOpen: (skin: Skin) => void;
};

function SkinCardContent({ skin }: { skin: Skin }) {
  const prices = parsePrices(skin.howToObtain);
  return <>
    <span className="skin-shelf-art">
      {skin.image && <ResponsiveSkinArtwork src={skin.image} alt="" width={144} height={192} sizes="144px" draggable={false} />}
    </span>
    {skin.model && <span className="skin-shelf-model">{skin.model}</span>}
    <span className="skin-shelf-name">{skin.name}</span>
    {prices.length > 0 && <span className="skin-shelf-price"><PriceDisplay prices={prices} /></span>}
  </>;
}

/** A real, manually scrollable shelf. A short visual copy of the leading cards makes the
 * end of the track continuous. Only the original cards enter the tab order and a copy
 * opens its original skin when clicked. */
export default function SkinShelf({ skins, label, empty, actions, active = true, newestOnly, onOpen }: Props) {
  const id = useId();
  const shelf = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLInputElement>(null);
  const seek = useRef<(percentage: number) => void>(() => {});
  const [overflow, setOverflow] = useState(false);
  const [copies, setCopies] = useState(0);
  const [reduced, setReduced] = useState(false);
  const playing = active && !reduced;

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (viewport.current) viewport.current.scrollLeft = 0;
  }, [newestOnly]);

  useEffect(() => {
    const row = viewport.current;
    const cards = track.current;
    if (!row || !cards || skins.length === 0) return;
    const match = window.matchMedia('(prefers-reduced-motion: reduce)');
    const hover = window.matchMedia('(hover: hover)');
    let frame = 0;
    let visible = false;
    let period = 0;
    let position = row.scrollLeft;
    let lastPaint = position;
    let lastFrame = 0;
    let manualUntil = 0;
    const contacts = new Set<number>();

    const scrollRange = () => Math.max(0, row.scrollWidth - row.clientWidth);
    const syncRail = (offset: number) => {
      const input = rail.current;
      if (!input) return;
      const range = period || scrollRange();
      input.value = String(range ? 1000 * Math.min(offset, range) / range : 0);
    };
    const measure = () => {
      const card = cards.firstElementChild?.getBoundingClientRect();
      const gutter = parseFloat(getComputedStyle(cards).columnGap);
      const step = card ? card.width + gutter : 0;
      const width = step * skins.length;
      const overflows = step > 0 && width - gutter > row.clientWidth + 1;
      period = overflows && !match.matches ? width : 0;
      setOverflow(overflows);
      setCopies(period ? Math.min(skins.length, Math.ceil(row.clientWidth / step) + 1) : 0);
      rail.current?.style.setProperty('--scroll-thumb-width', width ? `${Math.min(100, 100 * row.clientWidth / width)}%` : '100%');
      syncRail(period ? row.scrollLeft % period : row.scrollLeft);
    };
    const resize = new ResizeObserver(measure);
    resize.observe(row);
    resize.observe(cards);
    const scrolled = () => {
      const offset = Math.max(0, row.scrollLeft);
      if (offset === lastPaint) return;
      position = lastPaint = offset;
      cards.style.translate = '';
      manualUntil = performance.now() + 550;
      syncRail(period ? offset % period : offset);
    };
    const pressed = (e: PointerEvent) => contacts.add(e.pointerId);
    const released = (e: PointerEvent) => { contacts.delete(e.pointerId); };
    row.addEventListener('scroll', scrolled, { passive: true });
    row.addEventListener('pointerdown', pressed);
    window.addEventListener('pointerup', released);
    window.addEventListener('pointercancel', released);

    const tick = (now: number) => {
      const elapsed = lastFrame ? Math.min(40, now - lastFrame) : 0;
      lastFrame = now;
      const interacting = contacts.size || shelf.current?.matches(':focus-within') || (hover.matches && shelf.current?.matches(':hover'));
      if (period && copies && !match.matches && !document.hidden && !interacting && now > manualUntil) {
        position = (position + PIXELS_PER_SECOND * elapsed / 1000) % period;
        const whole = Math.floor(position);
        row.scrollLeft = whole;
        lastPaint = row.scrollLeft;
        // Retain fractional movement on browsers that round scrollLeft to a CSS pixel.
        cards.style.translate = `${lastPaint - position}px`;
        syncRail(position);
      }
      if (visible && playing && copies) frame = requestAnimationFrame(tick);
    };

    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      cancelAnimationFrame(frame);
      lastFrame = 0;
      if (visible && playing && copies) frame = requestAnimationFrame(tick);
    });
    intersection.observe(row);
    seek.current = (percentage) => {
      cards.style.translate = '';
      row.scrollLeft = (period || scrollRange()) * percentage;
    };
    measure();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      intersection.disconnect();
      row.removeEventListener('scroll', scrolled);
      row.removeEventListener('pointerdown', pressed);
      window.removeEventListener('pointerup', released);
      window.removeEventListener('pointercancel', released);
    };
  }, [copies, playing, reduced, skins.length, newestOnly]);

  return (
    <div className="skin-shelf" ref={shelf}>
      <div className="skin-shelf-head">
        <h2 className="section-title">Skins</h2>
        {actions && <div className="skin-shelf-controls">{actions}</div>}
      </div>
      {skins.length ? <>
        <div ref={viewport} id={id} className="scroll-row sidescroll scroll-row-with-rail skin-shelf-viewport" role="region" aria-label={label} tabIndex={overflow ? 0 : undefined}>
          <div className="skin-shelf-track" ref={track}>
            {skins.map(skin => <button type="button" key={`${skin.model ?? ''}|${skin.name}`} className="btn-bare skin-shelf-card" onClick={() => onOpen(skin)}>
              <SkinCardContent skin={skin} />
            </button>)}
            {skins.slice(0, copies).map(skin => <div key={`copy|${skin.model ?? ''}|${skin.name}`} aria-hidden="true" className="skin-shelf-card skin-shelf-copy" onMouseDown={event => event.preventDefault()} onClick={() => onOpen(skin)}>
              <SkinCardContent skin={skin} />
            </div>)}
          </div>
        </div>
        <input ref={rail} className="scroll-row-rail" type="range" min={0} max={1000} defaultValue={0} aria-label={`Scroll through ${label}`} aria-controls={id} disabled={!overflow}
          onChange={event => seek.current(Number(event.target.value) / 1000)} />
      </> : <p className="hint">{empty}</p>}
    </div>
  );
}
