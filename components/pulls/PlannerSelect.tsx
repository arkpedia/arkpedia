import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { ContentImg } from '@/components/content/ContentImage';

interface Option { value: string; label: string; detail?: string; meta?: string; portraits?: { name: string; src: string }[] }

function OptionContent({ option, hideDetail = false }: { option?: Option; hideDetail?: boolean }) {
  return <span className="pulls-select-content">
    {!!option?.portraits?.length && <span className="pulls-select-portraits" aria-hidden="true">{option.portraits.map(portrait => (
      // eslint-disable-next-line @next/next/no-img-element
      <ContentImg key={portrait.name} src={portrait.src} alt="" title={portrait.name} width="40" height="40" />
    ))}</span>}
    <span className={option?.portraits?.length ? 'visually-hidden' : undefined}>{option?.label}</span>
    {!hideDetail && option?.detail && <small className="pulls-select-caption"><span>{option.detail}</span>{option.meta && <span className="pulls-select-meta">{option.meta}</span>}</small>}
  </span>;
}

/** A themed, select-only combobox with a viewport-bounded popup. */
export function PlannerSelect({ label, value, options, onChange }: {
  label: string; value: string; options: Option[]; onChange: (value: string) => void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const search = useRef({ text: '', time: 0 });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState<CSSProperties>({ left: 0, top: 0, width: 0, maxHeight: 320 });
  const illustrated = options.some(option => option.portraits?.length);
  const selected = options.find(option => option.value === value) ?? options[0];

  function show(index = options.findIndex(option => option.value === value)) {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect || !options.length) return;
    const below = window.innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const maxHeight = Math.max(44, Math.min(360, Math.max(below, above)));
    const width = Math.min(Math.max(rect.width, options.some(option => option.detail) ? 320 : 120), window.innerWidth - 24);
    setPosition({ width, maxHeight, left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
      ...(below >= maxHeight || below >= above ? { top: rect.bottom + 4 } : { bottom: window.innerHeight - rect.top + 4 }) });
    setActive(Math.max(0, index));
    setOpen(true);
  }

  function choose(index: number) {
    if (options[index]) onChange(options[index].value);
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }

  useEffect(() => {
    if (open) menu.current?.querySelector(`[id="${id}-option-${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active, id]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!trigger.current?.contains(event.target as Node) && !menu.current?.contains(event.target as Node)) setOpen(false);
    };
    const close = () => setOpen(false);
    const scroll = (event: Event) => {
      if (!menu.current?.contains(event.target as Node)) close();
    };
    document.addEventListener('pointerdown', closeOutside);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', scroll, true);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', scroll, true);
    };
  }, [open]);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const last = options.length - 1;
    if (event.key === 'Escape') {
      if (open) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
    } else if (event.key === 'Tab') setOpen(false);
    else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (open) choose(active); else show();
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? last : Math.max(0, Math.min(last, active + (event.key === 'ArrowDown' ? 1 : -1)));
      if (open) setActive(next); else show(event.key === 'Home' || event.key === 'End' ? next : undefined);
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const now = Date.now();
      search.current = { text: (now - search.current.time < 700 ? search.current.text : '') + event.key.toLocaleLowerCase(), time: now };
      const next = options.findIndex(option => option.label.toLocaleLowerCase().startsWith(search.current.text));
      if (next >= 0) { event.preventDefault(); if (open) setActive(next); else show(next); }
    }
  }

  return <>
    <button ref={trigger} type="button" role="combobox" aria-label={label} aria-haspopup="listbox"
      aria-expanded={open} aria-controls={open ? `${id}-list` : undefined}
      aria-activedescendant={open ? `${id}-option-${active}` : undefined}
      className={`pulls-select-trigger${illustrated ? ' pulls-select-illustrated' : ''}`} disabled={!options.length}
      onClick={() => open ? setOpen(false) : show()} onKeyDown={onKeyDown} onBlur={() => setOpen(false)}>
      <OptionContent option={selected} hideDetail={illustrated} />
      <svg aria-hidden="true" width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="m5 8 5 5 5-5" /></svg>
    </button>
    {open && createPortal(<div ref={menu} id={`${id}-list`} role="listbox" aria-label={label} className="pulls-select-menu" style={position}>
      {options.map((option, index) => <div id={`${id}-option-${index}`} key={option.value} role="option"
        aria-selected={option.value === value} data-active={index === active} className="pulls-select-option"
        onPointerDown={event => event.preventDefault()} onClick={() => choose(index)} onMouseEnter={() => setActive(index)}>
        <OptionContent option={option} />
        <span className="pulls-select-check" aria-hidden="true">{option.value === value ? '✓' : ''}</span>
      </div>)}
    </div>, document.body)}
  </>;
}
