import { CSSProperties, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './StyledSelect.module.css';

const useClientLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export interface SelectOption {
  value: string;
  label: string;
  group?: string;
}

interface Props {
  id?: string;
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  className?: string;
  style?: CSSProperties;
}

/** Select-only combobox: the trigger keeps keyboard focus while the list is open. */
export default function StyledSelect({ id, label, value, options, onChange, className, style }: Props) {
  const generatedId = useId();
  const triggerId = id ?? generatedId;
  const listId = `${triggerId}-list`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState<{ left: number; top?: number; bottom?: number; width: number; maxHeight: number }>();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef({ text: '', time: 0 });
  const selected = options.find(option => option.value === value) ?? options[0];

  function show(index = Math.max(0, options.findIndex(option => option.value === value))) {
    setActive(index);
    setOpen(true);
  }

  function choose(index: number) {
    const option = options[index];
    if (!option) return;
    setOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
    onChange(option.value);
  }

  useClientLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - 16;
    const above = rect.top - 16;
    const upward = below < 240 && above > below;
    const width = Math.min(Math.max(rect.width, 240), window.innerWidth - 24);
    setPosition({
      left: Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12)),
      ...(upward ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
      width,
      maxHeight: Math.max(80, Math.min(560, upward ? above : below)),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !listRef.current?.contains(target)) setOpen(false);
    };
    const close = () => setOpen(false);
    const scroll = (event: Event) => {
      if (event.target instanceof Node && listRef.current?.contains(event.target)) return;
      close();
    };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', scroll, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', scroll, true);
    };
  }, [open]);

  useClientLayoutEffect(() => {
    if (!open) return;
    const list = listRef.current;
    const row = document.getElementById(`${listId}-${active}`);
    if (!list || !row) return;
    // Scroll only the popup, so keyboard movement cannot shift the page.
    if (row.offsetTop < list.scrollTop) list.scrollTop = row.offsetTop;
    else if (row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = row.offsetTop + row.offsetHeight - list.clientHeight;
    }
  }, [active, listId, open, position]);

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    const { key } = event;
    if (key === 'Escape') { if (open) event.preventDefault(); setOpen(false); return; }
    if (key === 'Tab') { setOpen(false); return; }
    if (key === 'Enter' || key === ' ') {
      event.preventDefault();
      if (open) choose(active); else show();
    } else if (key === 'ArrowDown' || key === 'ArrowUp') {
      event.preventDefault();
      if (!open) show();
      else setActive(index => Math.max(0, Math.min(options.length - 1, index + (key === 'ArrowDown' ? 1 : -1))));
    } else if (key === 'Home' || key === 'End') {
      event.preventDefault();
      const index = key === 'Home' ? 0 : options.length - 1;
      if (open) setActive(index); else show(index);
    } else if (key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      const now = Date.now();
      const search = now - searchRef.current.time < 700 ? searchRef.current.text + key : key;
      searchRef.current = { text: search, time: now };
      const index = options.findIndex(option => option.label.toLowerCase().startsWith(search.toLowerCase()));
      if (index >= 0) { if (open) setActive(index); else show(index); }
    }
  }

  return <div className={`${styles.root} ${className ?? ''}`} style={style}>
    <button id={triggerId} ref={triggerRef} type="button" role="combobox"
      className={styles.trigger} aria-label={label} aria-haspopup="listbox"
      aria-expanded={open} aria-controls={open ? listId : undefined}
      aria-activedescendant={open ? `${listId}-${active}` : undefined}
      onClick={() => open ? setOpen(false) : show()} onKeyDown={onKeyDown}>
      <span className={styles.value}>{selected?.label}</span>
      <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="m4 6 4 4 4-4" /></svg>
    </button>
    {open && createPortal(<div id={listId} ref={listRef} role="listbox" aria-label={label}
      className={styles.menu} style={position ?? { visibility: 'hidden' }}>
      {options.map((option, index) => <div key={option.value}>
        {option.group && option.group !== options[index - 1]?.group && <div className={styles.group}>{option.group}</div>}
        <div id={`${listId}-${index}`} role="option" aria-selected={option.value === value}
          className={styles.option} data-active={index === active || undefined}
          onPointerMove={() => setActive(index)} onPointerDown={event => event.preventDefault()}
          onClick={() => choose(index)}>
          <span>{option.label}</span>
          <svg className={styles.check} aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m3 8 3 3 7-7" /></svg>
        </div>
      </div>)}
    </div>, document.body)}
  </div>;
}
