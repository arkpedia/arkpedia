import { CSSProperties, ReactNode, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './StyledSelect.module.css';

const useClientLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export interface SelectOption {
  value: string;
  /** Plain text: what the trigger shows by default, what type-to-find matches and,
   *  unless a render slot says otherwise, what the row reads. */
  label: string;
  /** Rows with the same group are drawn under one heading, in the order given. */
  group?: string;
  disabled?: boolean;
}

export interface OptionState {
  selected: boolean;
  active: boolean;
}

interface Props<T extends SelectOption> {
  id?: string;
  /** Accessible name of the control and its list. Required: a select with no name is
   *  announced as "combobox, collapsed" and nothing else. */
  label: string;
  value: string;
  options: readonly T[];
  onChange: (value: string) => void;
  /** A row's content: portraits, a badge, a count, a code column. The row keeps its
   *  40px floor, hover, selection and check mark; this only fills it. Optional on
   *  purpose -- it is presentation, and a text row is the right default. */
  renderOption?: (option: T, state: OptionState) => ReactNode;
  /** The closed trigger's content for the selected option. Defaults to its label. */
  renderValue?: (option: T) => ReactNode;
  /** Shown on the trigger when no option has `value` (an unset filter). */
  placeholder?: string;
  /** 'title' is the heading-sized trigger (the calendar's month and year): display
   *  face, 22px, uppercase, no fill. */
  size?: 'default' | 'title';
  /** Which trigger edge the menu lines up with when it is wider than the trigger. */
  align?: 'start' | 'end';
  /** The menu's minimum width. It is never narrower than the trigger. */
  menuMinWidth?: number;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
}

/** How many rows PageUp and PageDown move. */
const PAGE = 10;

/**
 * The site's one dropdown: a select-only combobox whose trigger keeps keyboard focus
 * while the list is open (aria-activedescendant), with the list portalled to <body>
 * and positioned fixed so no scrolling or clipping ancestor can cut it off.
 *
 * It replaces the native <select> (drawn by the OS in the system font, so it could not
 * match anything on the page) and the hand-built listboxes: gm-pickbtn, stage-picker,
 * PlannerSelect, cal-pick-btn. `npm run audit:styles` fails a new <select> or
 * role="listbox" anywhere outside components/ui.
 *
 * Keyboard (WAI-ARIA select-only combobox): Enter, Space, ArrowDown, ArrowUp or
 * Alt+ArrowDown open it; ArrowUp/Down move, Home/End jump to the ends, PageUp/PageDown
 * move ten; Enter, Space or Alt+ArrowUp choose; Escape and Tab close; typing finds a
 * row by its label. Disabled rows are skipped.
 */
export default function StyledSelect<T extends SelectOption>({
  id, label, value, options, onChange, renderOption, renderValue, placeholder,
  size = 'default', align = 'start', menuMinWidth = 240, disabled = false, className, style,
}: Props<T>) {
  const generatedId = useId();
  const triggerId = id ?? generatedId;
  const listId = `${triggerId}-list`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState<{ left: number; top?: number; bottom?: number; width: number; maxHeight: number }>();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef({ text: '', time: 0 });
  const selectedIndex = options.findIndex(option => option.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;
  const inert = disabled || options.length === 0;

  /* Consecutive rows that share a group, in order. A group name that comes back later
     starts a second run rather than pulling rows out of order. */
  const runs = useMemo(() => {
    const out: { group?: string; start: number; items: T[] }[] = [];
    options.forEach((option, index) => {
      const last = out[out.length - 1];
      if (last && last.group === option.group) last.items.push(option);
      else out.push({ group: option.group, start: index, items: [option] });
    });
    return out;
  }, [options]);

  /** The nearest enabled row from `from`, stepping by `step` (±1). */
  function enabledFrom(from: number, step: 1 | -1): number {
    for (let i = from; i >= 0 && i < options.length; i += step) if (!options[i].disabled) return i;
    for (let i = from - step; i >= 0 && i < options.length; i -= step) if (!options[i].disabled) return i;
    return -1;
  }

  function show(index = Math.max(0, selectedIndex)) {
    if (inert) return;
    setActive(Math.max(0, enabledFrom(index, 1)));
    setOpen(true);
  }

  function choose(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    setOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
    if (option.value !== value) onChange(option.value);
  }

  useClientLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - 16;
    const above = rect.top - 16;
    const upward = below < 240 && above > below;
    const width = Math.min(Math.max(rect.width, menuMinWidth), window.innerWidth - 24);
    const wanted = align === 'end' ? rect.right - width : rect.left;
    setPosition({
      left: Math.max(12, Math.min(wanted, window.innerWidth - width - 12)),
      ...(upward ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
      width,
      maxHeight: Math.max(80, Math.min(560, upward ? above : below)),
    });
  }, [open, align, menuMinWidth]);

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
    const top = row.offsetTop;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (top + row.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = top + row.offsetHeight - list.clientHeight;
    }
  }, [active, listId, open, position]);

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    const { key } = event;
    if (key === 'Escape') { if (open) { event.preventDefault(); event.stopPropagation(); } setOpen(false); return; }
    if (key === 'Tab') { setOpen(false); return; }
    if (event.altKey && (key === 'ArrowDown' || key === 'ArrowUp')) {
      event.preventDefault();
      if (!open) show(); else if (key === 'ArrowUp') choose(active); else setOpen(false);
      return;
    }
    if (key === 'Enter' || key === ' ') {
      event.preventDefault();
      if (open) choose(active); else show();
    } else if (key === 'ArrowDown' || key === 'ArrowUp') {
      event.preventDefault();
      if (!open) { show(); return; }
      const step = key === 'ArrowDown' ? 1 : -1;
      setActive(index => {
        const next = enabledFrom(Math.max(0, Math.min(options.length - 1, index + step)), step);
        return next >= 0 ? next : index;
      });
    } else if (key === 'PageDown' || key === 'PageUp') {
      if (!open) return;
      event.preventDefault();
      const step = key === 'PageDown' ? 1 : -1;
      setActive(index => {
        const next = enabledFrom(Math.max(0, Math.min(options.length - 1, index + step * PAGE)), step);
        return next >= 0 ? next : index;
      });
    } else if (key === 'Home' || key === 'End') {
      event.preventDefault();
      const index = key === 'Home' ? enabledFrom(0, 1) : enabledFrom(options.length - 1, -1);
      if (index < 0) return;
      if (open) setActive(index); else show(index);
    } else if (key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      const now = Date.now();
      const search = now - searchRef.current.time < 700 ? searchRef.current.text + key : key;
      searchRef.current = { text: search, time: now };
      const needle = search.toLocaleLowerCase();
      /* A repeated single letter walks through the rows that start with it, the way
         a native select does; a longer string finds the first match. */
      const start = open && search.length === 1 ? active + 1 : 0;
      const order = [...options.keys()].slice(start).concat([...options.keys()].slice(0, start));
      const index = order.find(i => !options[i].disabled && options[i].label.toLocaleLowerCase().startsWith(needle));
      if (index !== undefined) { if (open) setActive(index); else show(index); }
    }
  }

  const row = (option: T, index: number) => {
    const isSelected = option.value === value;
    return (
      <div key={option.value} id={`${listId}-${index}`} role="option" aria-selected={isSelected}
        aria-disabled={option.disabled || undefined}
        className={styles.option} data-active={index === active || undefined}
        onPointerMove={() => { if (!option.disabled) setActive(index); }}
        onPointerDown={event => event.preventDefault()}
        onClick={() => choose(index)}>
        <span className={styles.optionBody}>{renderOption ? renderOption(option, { selected: isSelected, active: index === active }) : option.label}</span>
        <svg className={styles.check} aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m3 8 3 3 7-7" /></svg>
      </div>
    );
  };

  return <div className={`${styles.root} ${size === 'title' ? styles.title : ''} ${className ?? ''}`} style={style}>
    <button id={triggerId} ref={triggerRef} type="button" role="combobox"
      className={`btn-bare ${styles.trigger}`} aria-label={label} aria-haspopup="listbox"
      aria-expanded={open} aria-controls={open ? listId : undefined}
      aria-activedescendant={open ? `${listId}-${active}` : undefined}
      disabled={inert} data-placeholder={!selected || undefined}
      onClick={() => open ? setOpen(false) : show()} onKeyDown={onKeyDown}>
      <span className={styles.value}>{selected ? (renderValue ? renderValue(selected) : selected.label) : (placeholder ?? '')}</span>
      <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="m4 6 4 4 4-4" /></svg>
    </button>
    {open && createPortal(<div id={listId} ref={listRef} role="listbox" aria-label={label}
      className={styles.menu} style={position ?? { visibility: 'hidden' }}>
      {runs.map((run, r) => run.group
        ? <div key={`${run.group}-${r}`} role="group" aria-labelledby={`${listId}-g${r}`} className={styles.groupRun}>
            <div id={`${listId}-g${r}`} role="presentation" className={styles.group}>{run.group}</div>
            {run.items.map((option, i) => row(option, run.start + i))}
          </div>
        : run.items.map((option, i) => row(option, run.start + i)))}
    </div>, document.body)}
  </div>;
}
