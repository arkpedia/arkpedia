import { useId, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from 'react';
import { useKeyboardListNav } from '@/lib/hooks/useKeyboardListNav';
import SuggestMenu from './SuggestMenu';
import XButton from './XButton';

interface BaseProps {
  id?: string;
  /** Accessible name of the field. Required -- a placeholder is not a label. */
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  name?: string;
  className?: string;
  autoFocus?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  /** Runs after the built-in keys (Escape, and the suggestion keys when a list is
   *  open) have had their turn; check event.defaultPrevented to skip handled ones. */
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
}

interface PlainProps extends BaseProps {
  suggestions?: undefined;
}

/**
 * With suggestions, the field becomes a combobox and every part of the list is
 * required: the rows, how to key them, how to draw them, what picking one does and
 * what the list is called. Leaving any of them optional is how a half-wired list
 * ships (keys that do nothing, rows with no name).
 */
interface SuggestProps<T> extends BaseProps {
  suggestions: readonly T[];
  getKey: (item: T) => string;
  renderSuggestion: (item: T, state: { active: boolean }) => ReactNode;
  onPick: (item: T) => void;
  /** The list's accessible name: "Matching operators". */
  suggestLabel: string;
  /** Shown when the field has text and nothing matches. Omit to show no list. */
  emptyText?: ReactNode;
  /** Open the list above the field (a field low on a phone screen). */
  upward?: boolean;
}

export type SearchInputProps<T> = PlainProps | SuggestProps<T>;

/**
 * The site's one text search field: --well ground, --control-border, mono 13px, a
 * magnifier and a clear button, the site focus ring. `.search-input` in
 * styles/core/arkpedia-theme.css is its whole appearance.
 *
 * Given `suggestions` it is a WAI-ARIA combobox with a SuggestMenu under it: typing
 * opens the list, ArrowUp/ArrowDown move the highlight (focus stays in the field),
 * Enter picks the highlighted row -- or the only row, when exactly one matches --
 * and Escape closes the list, then clears the field on a second press.
 */
export default function SearchInput<T>(props: SearchInputProps<T>) {
  const { id, label, value, onChange, placeholder, name, className, autoFocus, inputRef, onKeyDown } = props;
  const generated = useId();
  const fieldId = id ?? generated;
  const listId = `${fieldId}-list`;
  const optionId = (index: number) => `${fieldId}-opt-${index}`;
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const suggest = props.suggestions ? props : null;
  const items = suggest?.suggestions ?? EMPTY;
  const pick = (item: T) => { suggest?.onPick(item); setOpen(false); };
  const nav = useKeyboardListNav(items as T[], pick);
  const showList = !!suggest && open && value.trim() !== '' && (items.length > 0 || suggest.emptyText !== undefined);

  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    /* While an IME is composing (Japanese, Chinese, Korean titles), Enter confirms
       the composition and the arrows move its candidates; none of them are ours. */
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Escape') {
      if (showList) { event.preventDefault(); setOpen(false); nav.setHighlightedIndex(-1); }
      else if (value) { event.preventDefault(); onChange(''); }
    } else if (showList) {
      nav.handleKeyDown(event);
    } else if (suggest && (event.key === 'ArrowDown' || event.key === 'ArrowUp') && value.trim()) {
      event.preventDefault();
      setOpen(true);
    }
    onKeyDown?.(event);
  }

  return (
    <div ref={wrap} className={`search-input-wrap${className ? ` ${className}` : ''}`}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
      <svg className="search-input-icon" aria-hidden="true" viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7">
        <circle cx="8.5" cy="8.5" r="5.5" /><path d="m13 13 4.5 4.5" strokeLinecap="round" />
      </svg>
      <input
        id={fieldId}
        ref={inputRef}
        type="search"
        name={name}
        className="search-input"
        aria-label={label}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        autoFocus={autoFocus}
        value={value}
        onChange={(event) => { onChange(event.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={keyDown}
        {...(suggest ? {
          role: 'combobox',
          'aria-autocomplete': 'list' as const,
          'aria-expanded': showList,
          'aria-controls': listId,
          'aria-activedescendant': showList && nav.highlightedIndex >= 0 ? optionId(nav.highlightedIndex) : undefined,
        } : {})}
      />
      {value && (
        <XButton dense className="search-input-clear" label={`Clear ${label.toLowerCase()}`}
          onClick={() => { onChange(''); wrap.current?.querySelector('input')?.focus(); }} />
      )}
      {showList && suggest && (
        <SuggestMenu
          id={listId}
          label={suggest.suggestLabel}
          items={suggest.suggestions}
          getKey={suggest.getKey}
          renderItem={suggest.renderSuggestion}
          activeIndex={nav.highlightedIndex}
          optionId={optionId}
          onPick={pick}
          onHover={nav.setHighlightedIndex}
          setItemRef={nav.setItemRef}
          empty={suggest.emptyText}
          upward={suggest.upward}
        />
      )}
    </div>
  );
}

const EMPTY: readonly never[] = [];
