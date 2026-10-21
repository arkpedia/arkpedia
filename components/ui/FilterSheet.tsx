import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import XButton from '@/components/ui/XButton';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';

/** The site's phone breakpoint: `--control-h` and `.search-input` change at it too. */
const PHONE = '(max-width: 720px)';

const useClientLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** The class for a toolbar's own Reset: the sheet ends in a Reset of its own, so in the
 *  sheet this one is not drawn. */
export const INLINE_RESET = 'filter-reset-inline';

/** One filter that is on: a chip on the phone bar, whose × turns it off. */
export interface ActiveFilter {
  /** Unique among the page's chips. */
  key: string;
  /** What the chip says: "6★", "Sniper", "CN only". */
  label: string;
  /** Turns this one filter off, as pressing the lit control would. */
  remove: () => void;
}

/**
 * A list page's filters on a phone (ui-primitives, FilterSheet).
 *
 * Over 720px nothing changes: `controls` render where they always have, inside the
 * page's toolbar (the wrapper is `display: contents`). At 720px and under the toolbar
 * keeps only what the page puts beside this (its search, its tab strip), plus one line
 * that never changes height: a Filters button with the number of filters on, then one
 * chip per filter with a × that removes it, scrolling sideways when they run long. The
 * button opens the same `controls`, the same components on the same state, applied as
 * they are pressed, in the site's modal dialog frame (`.account-dialog`): focus moves
 * into it and goes back to the button, Escape closes it, the page under it does not
 * scroll, and it ends in Reset and Done.
 *
 * Only one copy of `controls` is mounted at a time. CSS decides the first paint (the
 * inline copy is hidden on a phone before scripts run), so nothing moves at hydration.
 *
 * `hold` is required: it is the page's useSwitchHold over its list. Every press inside
 * the sheet and every chip's × captures it before the change, so a list the filter
 * shortens cannot clamp the reader (the Anti-Page Jump rule): the sheet closes over
 * the page exactly as it opened.
 */
export default function FilterSheet({ controls, active, onReset, hold, controlsClassName }: {
  controls: ReactNode;
  active: readonly ActiveFilter[];
  /** Turns every filter the chips show off (the sheet's Reset). */
  onReset: () => void;
  hold: { capture: () => void };
  /** The page's toolbar class, so the controls lay out in the sheet as they do inline. */
  controlsClassName: string;
}) {
  const phone = useMediaQuery(PHONE);
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const chips = useRef<HTMLUListElement>(null);
  // Where focus goes after a chip's × removes the chip it was in: the chip that takes
  // its place, else the one before it, else the Filters button.
  const refocus = useRef<number | null>(null);

  useEffect(() => { if (!phone) setOpen(false); }, [phone]);

  useClientLayoutEffect(() => {
    const at = refocus.current;
    if (at === null) return;
    refocus.current = null;
    const xs = chips.current?.querySelectorAll<HTMLButtonElement>('.btn-x');
    const next = xs?.length ? xs[Math.min(at, xs.length - 1)] : button.current;
    next?.focus({ preventScroll: true });
  }, [active]);

  return (
    <>
      <div className="filter-bar">
        <button ref={button} type="button" className="ghost filter-bar-open" aria-haspopup="dialog" aria-expanded={open}
          onClick={() => setOpen(true)}>
          Filters{active.length ? <span className="filter-chip-count">{active.length}</span> : null}
        </button>
        <ul ref={chips} className="filter-bar-chips" aria-label="Filters on">
          {active.map((filter, i) => (
            <li key={filter.key} className="filter-tag">
              <span>{filter.label}</span>
              <XButton dense label={`Remove filter: ${filter.label}`} onClick={() => { hold.capture(); refocus.current = i; filter.remove(); }} />
            </li>
          ))}
        </ul>
      </div>
      {!phone && <div className="filter-sheet-inline">{controls}</div>}
      {phone && open && (
        <Sheet onClose={() => setOpen(false)} onReset={onReset} resetDisabled={!active.length} hold={hold} returnTo={button}>
          <div className={`filter-sheet-controls ${controlsClassName}`}>{controls}</div>
        </Sheet>
      )}
    </>
  );
}

function Sheet({ children, onClose, onReset, resetDisabled, hold, returnTo }: {
  children: ReactNode;
  onClose: () => void;
  onReset: () => void;
  resetDisabled: boolean;
  hold: { capture: () => void };
  returnTo: React.RefObject<HTMLButtonElement>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const back = returnTo.current;
    const overflow = document.body.style.overflow;
    dialog?.showModal();
    // The box takes focus, not its first control: Chromium carries :focus-visible over
    // from a text field to whatever a script focuses next (ui-primitives rule 21).
    dialog?.focus({ preventScroll: true });
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
      back?.focus({ preventScroll: true });
    };
  }, [returnTo]);
  return (
    <dialog ref={ref} className="account-dialog filter-sheet" aria-labelledby="filter-sheet-title" tabIndex={-1}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      // Before any control inside changes a filter: the page keeps its height for the
      // reader's position, in the same render as the narrower list.
      onClickCapture={() => hold.capture()}
      onKeyDownCapture={(event) => { if (event.key === 'Enter' || event.key === ' ') hold.capture(); }}
      // Tab wraps inside the sheet: a modal dialog makes the page inert, but past its last
      // control Chromium hands focus to the browser's own toolbar, out of the page.
      onKeyDown={(event) => {
        if (event.key !== 'Tab' || event.defaultPrevented) return;
        const stops = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button, [href], input, [tabindex]:not([tabindex="-1"])'))
          .filter((el) => !(el as HTMLButtonElement).disabled && el.getClientRects().length > 0);
        if (!stops.length) return;
        const first = stops[0];
        const last = stops[stops.length - 1];
        const at = document.activeElement;
        if (event.shiftKey && (at === first || at === event.currentTarget)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && at === last) { event.preventDefault(); first.focus(); }
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const box = event.currentTarget.getBoundingClientRect();
        if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose();
      }}>
      <header><h2 id="filter-sheet-title" className="entity-title">Filters</h2><XButton label="Close filters" onClick={onClose} /></header>
      <div className="account-dialog-body">{children}</div>
      <footer className="filter-sheet-foot">
        <button type="button" className="ghost" onClick={onReset} disabled={resetDisabled} title={resetDisabled ? 'No filter to reset' : undefined}>Reset</button>
        <button type="button" className="primary btn-sm" onClick={onClose}>Done</button>
      </footer>
    </dialog>
  );
}
