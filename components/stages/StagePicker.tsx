import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

export interface PickerOption {
  id: string;
  /** Short code shown in its own column, e.g. "EP 04". May be empty. */
  code: string;
  name: string;
  count: number | null;
}

export interface PickerGroup {
  id: string;
  /** Heading above the group. Empty for a single ungrouped list. */
  label: string;
  options: PickerOption[];
}

interface Props {
  /** Accessible name -- "Stage type", "Chapter or event". */
  label: string;
  value: string;
  groups: PickerGroup[];
  onChange: (id: string) => void;
}

/**
 * The filter's dropdown, as our own control rather than a <select>.
 *
 * A native select cannot align its options: macOS draws the popup in the system
 * font whatever font-family the element carries, so a code padded to a fixed
 * width with spaces still lands in a different place on every row -- "TW" is
 * wider than "LE" in a proportional font. Codes are 2 to 5 characters and 35 of
 * the 150 contents have none, so the dashes ended up scattered down the list.
 *
 * Here the code and name have aligned columns, and the list can be wider than
 * the 264px rail because the
 * popover is positioned fixed -- an absolutely positioned one would be clipped by
 * .stage-rail's overflow:hidden.
 */
export default function StagePicker({ label, value, groups, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState<{ left: number; top: number; width: number; maxHeight: number } | null>(null);
  const baseId = useId();

  const flat = useMemo(() => groups.flatMap((g) => g.options), [groups]);
  const selected = useMemo(() => flat.find((o) => o.id === value) || flat[0], [flat, value]);
  /** The widest code decides the column, so every name starts in one place. */
  const codeWidth = useMemo(() => flat.reduce((w, o) => Math.max(w, o.code.length), 0), [flat]);

  const place = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    // Wider than the 264px rail on purpose: a name like "So Long, Adele: Home
    // Away From Home - Retrospection" has nowhere to go in the rail's width.
    const width = Math.min(Math.max(rect.width, 420), Math.max(240, window.innerWidth - 24));
    // Opens downward unless there is more room above, and never taller than the
    // room it has -- the list is 150 entries long.
    const maxHeight = Math.min(440, Math.max(below, above));
    const top = below >= maxHeight || below >= above ? rect.bottom + 4 : rect.top - maxHeight - 4;
    setBox({
      left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
      top,
      width,
      maxHeight,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    const close = () => setOpen(false);
    // The popover is fixed, so a page scroll would strand it -- closing is what a
    // native select does too. But this is a CAPTURE listener, which also sees
    // scrolls inside the popover itself: 150 entries in a 440px box means the
    // first flick of the wheel shut it. Only scrolls from outside close it.
    const onScroll = (e: Event) => {
      const target = e.target;
      if (target instanceof Node && popRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener('resize', close);
    window.addEventListener('scroll', onScroll, true);
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (popRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', onScroll, true);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open, place]);

  // Opening starts on the current selection, and scrolls it into view inside the
  // popover only -- never the page.
  useEffect(() => {
    if (!open) return;
    const index = Math.max(0, flat.findIndex((o) => o.id === value));
    setActive(index);
    const pop = popRef.current;
    const row = pop?.querySelector<HTMLElement>('[data-selected="true"]');
    if (pop && row) pop.scrollTop = Math.max(0, row.offsetTop - pop.clientHeight / 2 + row.offsetHeight / 2);
  }, [open, flat, value]);

  const move = (delta: number) => {
    setActive((i) => {
      const next = Math.min(flat.length - 1, Math.max(0, i + delta));
      const pop = popRef.current;
      const row = pop?.querySelector<HTMLElement>(`#${CSS.escape(`${baseId}-opt-${next}`)}`);
      if (pop && row) {
        if (row.offsetTop < pop.scrollTop) pop.scrollTop = row.offsetTop;
        else if (row.offsetTop + row.offsetHeight > pop.scrollTop + pop.clientHeight) {
          pop.scrollTop = row.offsetTop + row.offsetHeight - pop.clientHeight;
        }
      }
      return next;
    });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    switch (e.key) {
      case 'Escape':
      case 'Tab':
        setOpen(false);
        break;
      case 'ArrowDown':
        e.preventDefault();
        move(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        move(-1);
        break;
      case 'Home':
        e.preventDefault();
        move(-flat.length);
        break;
      case 'End':
        e.preventDefault();
        move(flat.length);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (flat[active]) {
          onChange(flat[active].id);
          setOpen(false);
        }
        break;
      default:
        break;
    }
  };

  let index = -1;
  return (
    <div className="stage-picker">
      <button
        type="button"
        ref={buttonRef}
        className="stage-picker-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onKeyDown}
      >
        <span className="stage-picker-code" style={{ minWidth: `${codeWidth}ch` }}>
          {selected?.code || ''}
        </span>
        <span className="stage-picker-name">{selected?.name || ''}</span>
        <span className="stage-picker-caret" aria-hidden="true" />
      </button>

      {open && (
        <div
          ref={popRef}
          className="stage-picker-pop"
          role="listbox"
          aria-label={label}
          aria-activedescendant={flat[active] ? `${baseId}-opt-${active}` : undefined}
          style={box ? { left: box.left, top: box.top, width: box.width, maxHeight: box.maxHeight } : { visibility: 'hidden' }}
        >
          {groups.map((group) => (
            <div key={group.id} className="stage-picker-group" role="group" aria-labelledby={group.label ? `${baseId}-g-${group.id}` : undefined}>
              {group.label && (
                <div className="stage-picker-heading" id={`${baseId}-g-${group.id}`}>
                  {group.label}
                </div>
              )}
              {group.options.map((option) => {
                index += 1;
                const at = index;
                const isSelected = option.id === value;
                return (
                  <div
                    key={`${group.id}-${option.id}`}
                    id={`${baseId}-opt-${at}`}
                    role="option"
                    aria-selected={isSelected}
                    data-selected={isSelected}
                    className={`stage-picker-opt${isSelected ? ' selected' : ''}${at === active ? ' active' : ''}`}
                    onMouseEnter={() => setActive(at)}
                    onClick={() => {
                      onChange(option.id);
                      setOpen(false);
                    }}
                  >
                    <span className="stage-picker-code" style={{ minWidth: `${codeWidth}ch` }}>
                      {option.code}
                    </span>
                    <span className="stage-picker-name">{option.name}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
