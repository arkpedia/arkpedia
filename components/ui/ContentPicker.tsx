import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { KIND_LABELS, ContentKind } from '@/lib/enemies/enemyTypes';
import { matchesSearch } from '@/lib/search/searchNormalize';

/** One piece of content, with however many things the caller is counting in it. */
export interface ContentPickerOption {
  kind: ContentKind;
  id: string;
  label: string | null;
  name: string;
  count: number;
}

interface Props {
  options: ContentPickerOption[];
  value: string;
  onChange: (id: string) => void;
  /** Singular noun for the count. */
  countNoun: string;
  /** Its plural, when adding an s is wrong -- "enemy" wants "enemies". */
  countNounPlural?: string;
  /**
   * An ungrouped row above the groups. Without it this picks between contents;
   * with it, one of the choices is "no content in particular", which is what the
   * filter panel needs and an appearance list does not.
   */
  anyOption?: { id: string; name: string; count: number };
  ariaLabel?: string;
  /** The filter picker can narrow events by code or name without changing the selection. */
  searchable?: boolean;
}

/**
 * Picking a piece of content. A custom listbox rather than a <select>, because a
 * native popup is drawn by the OS in the system font: the counts down the right
 * cannot be lined up with the labels down the left, the shorthand ("EP 08") cannot
 * be the teal code it is everywhere else, and grouping is limited to optgroup.
 *
 * Used twice -- the appearances list on an enemy page and the "Introduced by"
 * filter -- which is the point. The filter was a bare <select>, so the same choice
 * looked like two different products depending on which panel you opened it from.
 */
export default function ContentPicker({
  options, value, onChange, countNoun, countNounPlural, anyOption, ariaLabel, searchable = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [search, setSearch] = useState('');
  const box = useRef<HTMLDivElement | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const pop = useRef<HTMLDivElement | null>(null);
  const searchInput = useRef<HTMLInputElement | null>(null);
  const listId = useId();
  const [place, setPlace] = useState<{ left: number; top: number; width: number; maxHeight: number } | null>(null);
  /* The flat list the keyboard walks. "Any content" is a row like any other here,
     and only the grouped rendering below treats it differently. */
  const visibleOptions = search.trim()
    ? options.filter((option) => matchesSearch(`${option.label || ''} ${option.name}`, search))
    : options;
  const rows: { id: string; label: string | null; name: string; count: number }[] =
    anyOption && !search.trim() ? [{ ...anyOption, label: null }, ...visibleOptions] : visibleOptions;
  const selected = (anyOption?.id === value ? { ...anyOption, label: null } : options.find((option) => option.id === value))
    || (anyOption ? { ...anyOption, label: null } : options[0]);

  /**
   * Where the popup goes. It is position:fixed and placed here, the same way the
   * stages page's picker does it and for the same reason: an absolutely positioned
   * popup is clipped by the nearest scrolling ancestor. In the filter panel this
   * control is the LAST group in a pane with overflow-y:auto, so the list ran 283px
   * past the bottom of the pane and off the viewport. Opening upward when there is
   * more room above is what makes the bottom of a panel usable at all.
   */
  const position = useCallback(() => {
    const el = trigger.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const navHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 52;
    const topLimit = Math.max(navHeight + 8, document.querySelector('.enemy-frame-head')?.getBoundingClientRect().bottom ?? 0);
    const below = window.innerHeight - rect.bottom - 12;
    const above = rect.top - topLimit - 4;
    const maxHeight = Math.min(340, Math.max(below, above));
    /* The popup may be wider than its trigger, and now needs to be: the trigger is a
       340px control in a filter row rather than a full-width bar, and content names
       run to "EP 13 - The Whirlpool that is Passion". Clamped so a wider popup cannot
       run off the right edge. */
    const width = Math.min(Math.max(rect.width, 320), window.innerWidth - 24);
    setPlace({
      left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
      top: below >= maxHeight || below >= above ? rect.bottom + 4 : Math.max(topLimit, rect.top - maxHeight - 4),
      width,
      maxHeight,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    position();
    if (searchable) searchInput.current?.focus({ preventScroll: true });
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      // The popup is no longer inside `box`, so it needs testing separately.
      if (pop.current?.contains(target) || box.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const close = () => setOpen(false);
    // Keep the fixed popup anchored as its parent panel or the page scrolls.
    // Clicking a control near the foot can itself scroll that panel into view.
    const onScroll = (e: Event) => {
      const target = e.target;
      if (target instanceof Node && pop.current?.contains(target)) return;
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect || rect.bottom < 0 || rect.top > window.innerHeight) setOpen(false);
      else position();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, position, searchable]);

  // Group headings in the list, in the order the options already arrive -- which
  // is the stage index's own order, release date then label.
  const groups: { kind: ContentKind; items: ContentPickerOption[] }[] = [];
  for (const option of visibleOptions) {
    const last = groups[groups.length - 1];
    if (last && last.kind === option.kind) last.items.push(option);
    else groups.push({ kind: option.kind, items: [option] });
  }

  function choose(id: string) {
    onChange(id);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      setActive(Math.max(0, rows.findIndex((o) => o.id === value)));
      setOpen(true);
      return;
    }
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(rows.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter' && rows[active]) { e.preventDefault(); choose(rows[active].id); }
  }

  /* An explicit locale, not the visitor's: the filter's counts run to four digits
     and a server render that disagrees with the client is a hydration error. */
  const num = (n: number) => n.toLocaleString('en-US');

  const optionRow = (option: { id: string; label: string | null; name: string; count: number }) => {
    const index = rows.findIndex((row) => row.id === option.id);
    return (
      <button
        key={option.id}
        id={`${listId}-option-${index}`}
        type="button"
        role="option"
        aria-selected={option.id === value}
        className={`enemy-appear-option${option.id === value ? ' current' : ''}${index === active ? ' active' : ''}`}
        onMouseEnter={() => setActive(index)}
        onClick={() => choose(option.id)}
      >
        <span className="enemy-index">{option.label || ''}</span>
        <span className="enemy-appear-option-name">{option.name}</span>
        <span className="enemy-appear-option-count">{num(option.count)}</span>
      </button>
    );
  };

  return (
    <div className="enemy-appear-picker" ref={box}>
      <button
        ref={trigger}
        type="button"
        className="enemy-appear-trigger"
        aria-haspopup={searchable ? 'dialog' : 'listbox'}
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => { if (!open) setSearch(''); setOpen((v) => !v); }}
        onKeyDown={onKeyDown}
      >
        {selected?.label && <span className="enemy-index">{selected.label}</span>}
        <span className="enemy-appear-trigger-name">{selected?.name}</span>
        <span className="enemy-section-aside">
          {num(selected?.count ?? 0)}{' '}
          {selected?.count === 1 ? countNoun : countNounPlural || `${countNoun}s`}
        </span>
        <span className="enemy-appear-caret" aria-hidden="true">▾</span>
      </button>

      {open && (
        <div
          ref={pop}
          className={`enemy-appear-list${searchable ? ' searchable' : ''}`}
          role={searchable ? 'dialog' : 'listbox'}
          aria-label={ariaLabel}
          aria-activedescendant={!searchable && rows[active] ? `${listId}-option-${active}` : undefined}
          tabIndex={searchable ? undefined : -1}
          style={place ? { left: place.left, top: place.top, width: place.width, maxHeight: place.maxHeight } : { visibility: 'hidden' }}
        >
          {searchable && (
            <div className="enemy-appear-search-wrap">
              <input
                ref={searchInput}
                type="search"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded="true"
                aria-controls={listId}
                aria-activedescendant={rows[active] ? `${listId}-option-${active}` : undefined}
                className="enemy-appear-search"
                aria-label="Find event"
                placeholder="Find event by name or code..."
                value={search}
                onChange={(event) => { setSearch(event.target.value); setActive(0); }}
                onKeyDown={onKeyDown}
              />
            </div>
          )}
          <div id={listId} role={searchable ? 'listbox' : undefined} aria-label={searchable ? ariaLabel : undefined}>
            {/* Above the group headings and outside them: it belongs to no kind. */}
            {anyOption && !search.trim() && optionRow({ ...anyOption, label: null })}
            {rows.length === 0 && <p className="enemy-appear-empty">No matching events</p>}
            {groups.map((group) => (
              <div key={group.kind + group.items[0].id} className="enemy-appear-list-group">
                <div className="enemy-appear-list-head">{KIND_LABELS[group.kind]}</div>
                {group.items.map(optionRow)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
