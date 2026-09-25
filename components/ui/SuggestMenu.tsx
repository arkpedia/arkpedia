import type { ReactNode } from 'react';
import styles from './StyledSelect.module.css';

export interface SuggestMenuProps<T> {
  /** The listbox id; the input names it in aria-controls. */
  id: string;
  /** Accessible name: "Matching operators". */
  label: string;
  items: readonly T[];
  getKey: (item: T) => string;
  renderItem: (item: T, state: { active: boolean }) => ReactNode;
  /** The highlighted row, or -1. The input keeps focus and points at it with
   *  aria-activedescendant, so this is the only place the highlight lives. */
  activeIndex: number;
  /** The id of row `index`, for aria-activedescendant. */
  optionId: (index: number) => string;
  onPick: (item: T) => void;
  onHover: (index: number) => void;
  /** Lets the owner keep the highlighted row scrolled into view. */
  setItemRef?: (index: number) => (el: HTMLElement | null) => void;
  /** Shown instead of rows when there are none: "No operators found." */
  empty?: ReactNode;
  /** Open above the input -- for a field low on a phone screen, where the on-screen
   *  keyboard covers anything drawn below it. */
  upward?: boolean;
}

/**
 * The suggestion list under a search field, on the same surface as StyledSelect's
 * menu (it imports that module's .menu/.option classes): --panel, a 2px teal top
 * edge, 40px rows, selected row in teal on --teal-dim.
 *
 * Positioned absolutely inside SearchInput's wrapper rather than portalled, so it
 * scrolls with the field and sits above the page without adding to its height.
 * Normally rendered by SearchInput; export it only for a field SearchInput cannot be.
 */
export default function SuggestMenu<T>({
  id, label, items, getKey, renderItem, activeIndex, optionId, onPick, onHover, setItemRef, empty, upward = false,
}: SuggestMenuProps<T>) {
  return (
    <div id={id} role="listbox" aria-label={label}
      className={`${styles.menu} ${styles.suggest}${upward ? ` ${styles.suggestUp}` : ''}`}>
      {items.length === 0 && empty ? <div className={styles.empty} role="presentation">{empty}</div> : null}
      {items.map((item, index) => (
        <div key={getKey(item)} id={optionId(index)} ref={setItemRef?.(index)} role="option"
          aria-selected={index === activeIndex} data-active={index === activeIndex || undefined}
          className={styles.option}
          onPointerMove={() => onHover(index)}
          /* Keep focus in the input: a press on a row must not blur the field first,
             or the list closes before the click lands. */
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => onPick(item)}>
          <span className={styles.optionBody}>{renderItem(item, { active: index === activeIndex })}</span>
        </div>
      ))}
    </div>
  );
}
