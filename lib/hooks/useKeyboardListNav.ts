import { useEffect, useRef, useState } from 'react';

/**
 * Standardizes arrow-key navigation for any autocomplete/suggestion list --
 * one hook, shared by every search bar in the app, rather than each screen
 * re-inventing its own Up/Down/Enter handling.
 *
 *   - ArrowDown / ArrowUp move a highlighted row, clamped at either end
 *     (not wrapping -- holding the key down just stops at the last row
 *     instead of cycling back to the top, which is less surprising when
 *     scanning a short suggestion list).
 *   - Enter selects the highlighted row. If nothing is highlighted yet
 *     but there's exactly one suggestion on screen, Enter selects that
 *     one too -- matches the "just finished typing the full name" case.
 *   - Escape clears the highlight without closing the list itself; the
 *     caller decides what Escape does beyond that, if anything.
 *   - The highlighted row is kept scrolled into view automatically, so
 *     arrowing past the visible edge of a taller list still works.
 *
 * The highlight resets to "none" (-1) whenever the `items` array is a new
 * reference -- i.e. whenever the caller's filtered/sorted result set
 * actually changes (new search text, fresh results loading in). Without
 * this, a stale index left over from a longer previous list could point
 * at the wrong row, or even silently select a leftover match when Enter
 * is pressed.
 *
 * Generic over the item type `T` so it works for operators, skins, or any
 * other list of suggestions -- callers just supply what "select" does.
 */
export function useKeyboardListNav<T>(items: T[], onSelect: (item: T) => void) {
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    setHighlightedIndex(-1);
  }, [items]);

  useEffect(() => {
    itemRefs.current = itemRefs.current.slice(0, items.length);
  }, [items.length]);

  useEffect(() => {
    if (highlightedIndex < 0) return;
    itemRefs.current[highlightedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIndex]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (items.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((current) => Math.min(current + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((current) => Math.max(current - 1, -1));
    } else if (e.key === 'Enter') {
      if (highlightedIndex >= 0 && highlightedIndex < items.length) {
        e.preventDefault();
        onSelect(items[highlightedIndex]);
      } else if (items.length === 1) {
        e.preventDefault();
        onSelect(items[0]);
      }
    } else if (e.key === 'Escape') {
      setHighlightedIndex(-1);
    }
  }

  /** Ref callback for the caller to spread onto each rendered row, e.g.
   * `ref={setItemRef(i)}`, so the hook can scroll the highlighted one
   * into view. */
  function setItemRef(index: number) {
    return (el: HTMLElement | null) => {
      itemRefs.current[index] = el;
    };
  }

  return { highlightedIndex, setHighlightedIndex, handleKeyDown, setItemRef };
}