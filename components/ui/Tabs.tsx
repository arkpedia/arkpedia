import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { useClientLayoutEffect } from '@/lib/ui/useClientLayoutEffect';
import { XGlyph } from './XButton';

export interface TabOption<V extends string | number> {
  value: V;
  /** Visible text. Also the accessible name unless `ariaLabel` is given. */
  label: ReactNode;
  /** Accessible name when the label is an icon or an abbreviation ("S1"). */
  ariaLabel?: string;
  /** A small count after the label: "Items 12" while a search is typed. */
  count?: number;
  /** An icon before the label (an <img> or <svg>, sized 28px by the tab rule). */
  icon?: ReactNode;
  disabled?: boolean;
  /** Tooltip, for a tab whose label is shortened. */
  title?: string;
}

interface TabsProps<V extends string | number> {
  /** The tablist's accessible name: "Sections", "Schedule view". Required. */
  label: string;
  /** The stem of every tab and panel id (tabId / panelId below). Required, because
   *  aria-controls has to name the panel the page renders: the page puts
   *  {...tabPanelProps(id, value)} on its panel, and the two agree on one id. Plain
   *  props, no useId, so the server and the browser render the same markup. */
  id: string;
  options: readonly TabOption<V>[];
  value: V;
  onChange: (value: V) => void;
  className?: string;
  /** A strip of removable tabs (the planner's operators): Delete or Backspace on a
   *  focused tab calls `onRemove`, and the tab draws a × that does the same on a click,
   *  titled with `label` ("Remove Amiya from plan"). `label` returns null for a tab
   *  that cannot be removed (the planner's All). Both are shortcuts: the × is
   *  aria-hidden and Delete needs a keyboard, so the page ALSO renders a real button
   *  in the panel that removes the tab on show (the planner's "Remove from plan"), or a
   *  touch screen reader and voice control cannot remove anything. */
  removable?: { onRemove: (value: V) => void; label: (option: TabOption<V>) => string | null };
}

/* Layout effects are the browser's; on the server React only warns about them. */

/** Where the strip's sliding underline goes: under the current tab, in the strip's own
 *  coordinates, or null when no enabled tab is current (or the strip is not rendered).
 *  The size is the tab's LAYOUT box (its used width and height, fractional, so the bar is
 *  exactly the static ::after it replaces), never its drawn box: a click selects on
 *  mouseup, while the tab is still easing back from `:active`'s scale(.97)
 *  (styles/core/motion.css), and dividing the drawn box by the scale read back trusted
 *  two readings to agree mid-transition (the owner saw the bar run past the planner's
 *  Thorns tab into the next one, 2026-10-29). Only the centre comes from the drawn box,
 *  and a scale about the centre does not move it. */
function underlineOf(strip: HTMLElement): { x: number; y: number; w: number } | null {
  const tab = strip.querySelector<HTMLElement>(':scope > [role="tab"][aria-selected="true"]');
  if (!tab || !tab.offsetParent) return null;
  const s = strip.getBoundingClientRect();
  const t = tab.getBoundingClientRect();
  const box = getComputedStyle(tab);
  const w = parseFloat(box.width) || tab.offsetWidth;
  const h = parseFloat(box.height) || tab.offsetHeight;
  const left = (t.left + t.right) / 2 - w / 2;
  const bottom = (t.top + t.bottom) / 2 + h / 2;
  return { x: left - s.left - strip.clientLeft, y: bottom - s.top - strip.clientTop - 2, w };
}

const slug = (value: string | number) => String(value).replace(/[^A-Za-z0-9_-]/g, '_');
/** The id of the tab for `value` in the strip `id`. */
export const tabId = (id: string, value: string | number) => `${id}-tab-${slug(value)}`;
/** The id of the panel the tab for `value` controls. */
export const panelId = (id: string, value: string | number) => `${id}-panel-${slug(value)}`;
/** What a panel carries: its id, role="tabpanel" and the tab that names it. Spread it
 *  on the element the tab shows (a section, a div), whether the page mounts one panel
 *  at a time or keeps them all and hides the others. */
export function tabPanelProps(id: string, value: string | number) {
  return { id: panelId(id, value), role: 'tabpanel' as const, 'aria-labelledby': tabId(id, value) };
}

/**
 * Tabs: one of N panels shown in place. A real tablist (role="tablist", role="tab",
 * aria-selected, aria-controls), with a roving tabindex -- the strip is one Tab stop,
 * Left and Right move along it (wrapping), Home and End jump to the ends, and moving
 * selects (automatic activation: every panel here is already rendered or cheap).
 *
 * The look is the site's one tab look (styles/core/arkpedia-theme.css, .tabs / .tab):
 * content-width labels in the button voice (Rajdhani 600, uppercase, 0.09em) with no
 * box and no side padding, so the first label starts exactly where the section heading
 * does. --text-dim at rest, --text on hover, --teal with a 2px --teal underline when
 * current. The server draws the underline as each tab's ::after; once the browser has
 * measured the current tab, one indicator per strip (.tabs-indicator) takes over in
 * the same paint and slides from tab to tab (docs/development/ui-primitives.md, rule 23).
 *
 * Pick-one VALUES (a sort order, a level, a filter) are not tabs: they stay
 * SegmentedControl. Links between routes take the same .tabs / .tab classes on
 * <a aria-current="page"> instead of this component (TerminalNav, GameLinks).
 *
 * Switching must not shorten the document (the Anti-Page Jump rule): onChange runs in
 * the click or key handler, so a page that holds the reader's place (a reserve taken in
 * its handler, useHeightFloor on the panel) keeps doing so.
 */
export default function Tabs<V extends string | number>({
  label, id, options, value, onChange, className, removable,
}: TabsProps<V>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const list = useRef<HTMLDivElement | null>(null);
  const bar = useRef<HTMLSpanElement | null>(null);
  const enabled = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);
  const current = options.findIndex((o) => o.value === value);
  // The one tab in the Tab order: the current one, or the first enabled one when the
  // value names none (a panel still loading).
  const stop = current >= 0 && !options[current].disabled ? current : enabled[0] ?? -1;
  const removeTitle = (option: TabOption<V>) => (removable ? removable.label(option) : null);
  const hint = removable && options.some((o) => removeTitle(o)) ? `${id}-remove-hint` : undefined;

  /** Select a tab. From the keyboard, focus follows (and may bring the tab into view);
   *  a click leaves focus to the browser, so pressing a tab near the edge of a
   *  scroller never scrolls the page under the pointer. */
  const go = (index: number, fromKeyboard: boolean) => {
    const option = options[index];
    if (!option || option.disabled) return;
    if (fromKeyboard) refs.current[index]?.focus();
    if (option.value !== value) onChange(option.value);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!enabled.length) return;
    const at = enabled.indexOf(index);
    let next: number | null = null;
    if (event.key === 'ArrowRight') next = enabled[(at + 1) % enabled.length];
    else if (event.key === 'ArrowLeft') next = enabled[(at - 1 + enabled.length) % enabled.length];
    else if (event.key === 'Home') next = enabled[0];
    else if (event.key === 'End') next = enabled[enabled.length - 1];
    else if ((event.key === 'Delete' || event.key === 'Backspace') && removable && removeTitle(options[index])) {
      event.preventDefault();
      // Focus stays in the strip while this tab goes, on the one beside it...
      const neighbour = enabled[at + 1] ?? enabled[at - 1];
      if (neighbour !== undefined) refs.current[neighbour]?.focus();
      removable.onRemove(options[index].value);
      // ...and lands on the tab the page makes current once it has re-rendered (the
      // planner makes All current): a focused tab that is not the selected one, at
      // tabindex -1, is announced "not selected" and is not the strip's Tab stop.
      requestAnimationFrame(() => {
        const strip = list.current;
        if (!strip?.isConnected || !(strip.contains(document.activeElement) || document.activeElement === document.body)) return;
        strip.querySelector<HTMLButtonElement>('[role="tab"][tabindex="0"]')?.focus();
      });
      return;
    }
    if (next === null) return;
    event.preventDefault();
    go(next, true);
  };

  /* The sliding underline (r11 quiet polish). The server's HTML draws each current tab's
     own ::after; here, before the first paint after hydration, the bar is put exactly
     there and only then does data-slide hand the underline over to it, so the swap is
     invisible and nothing slides in from the corner. Afterwards a new value moves the
     bar (the transition is motion.css's, and only under prefers-reduced-motion:
     no-preference), while a relayout -- the webfont arriving, a count changing a label,
     the window resizing, the strip wrapping -- puts it in place at once: one
     ResizeObserver per strip, watching the strip and each of its tabs. */
  const optionKeys = options.map((o) => `${String(o.value)}:${o.disabled ? 1 : 0}`).join('|');
  useClientLayoutEffect(() => {
    const strip = list.current;
    const indicator = bar.current;
    if (!strip || !indicator) return;
    const place = (instant: boolean) => {
      const at = underlineOf(strip);
      if (!at) { strip.removeAttribute('data-slide'); return; }
      // Give the bar its real layout width. Stretching a 1px element magnifies
      // browser-zoom rounding and can disagree with the compositor's painted edge.
      // Only its position slides; sizing never affects surrounding layout.
      const next = `translate(${at.x}px, ${at.y}px)`;
      const width = `${at.w}px`;
      const first = !strip.hasAttribute('data-slide');
      if (indicator.dataset.at === next && indicator.style.width === width && !first) return;
      if (instant || first) indicator.style.transition = 'none';
      indicator.style.width = width;
      indicator.style.transform = next;
      indicator.dataset.at = next;
      if (instant || first) {
        void indicator.offsetWidth; // commit the jump before the transition comes back
        indicator.style.transition = '';
      }
      if (first) strip.setAttribute('data-slide', '');
    };
    place(false);
    /* Checked again where a slide ends and once the webfonts are in, and put right at once
       if anything moved under it meanwhile: the bar is never left anywhere but under the
       current tab, whatever the cause. */
    const settle = (event: TransitionEvent) => { if (event.target === indicator) place(true); };
    indicator.addEventListener('transitionend', settle);
    let live = true;
    document.fonts?.ready.then(() => { if (live) place(true); });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => place(true));
    const resized = () => place(true);
    window.addEventListener('resize', resized);
    observer?.observe(strip);
    for (const tab of Array.from(strip.children)) if (tab !== indicator) observer?.observe(tab);
    return () => { live = false; observer?.disconnect(); window.removeEventListener('resize', resized); indicator.removeEventListener('transitionend', settle); };
  }, [value, optionKeys]);

  return (
    <>
      <div ref={list} role="tablist" aria-label={label} className={`tabs${className ? ` ${className}` : ''}`}>
        {options.map((option, index) => {
          const selected = index === current;
          const remove = removeTitle(option);
          return (
            <button
              key={String(option.value)}
              ref={(el) => { refs.current[index] = el; }}
              type="button"
              role="tab"
              id={tabId(id, option.value)}
              className="btn-bare tab"
              aria-selected={selected}
              aria-controls={panelId(id, option.value)}
              aria-label={option.ariaLabel}
              aria-describedby={remove ? hint : undefined}
              aria-keyshortcuts={remove ? 'Delete Backspace' : undefined}
              tabIndex={index === stop ? 0 : -1}
              title={option.title}
              disabled={option.disabled}
              onClick={() => go(index, false)}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              {option.icon}
              {option.label}
              {option.count !== undefined && <span className="tab-count">{option.count}</span>}
              {remove && removable && (
                // A mouse's way to Delete. Not a button of its own: a tab may not hold
                // one, and the key is the keyboard's way (aria-keyshortcuts, and the
                // hint below names it).
                <span
                  className="tab-remove"
                  aria-hidden="true"
                  title={remove}
                  onClick={(event) => { event.stopPropagation(); removable.onRemove(option.value); }}
                >
                  <XGlyph />
                </span>
              )}
            </button>
          );
        })}
        <span ref={bar} className="tabs-indicator" aria-hidden="true" />
      </div>
      {hint && <span id={hint} hidden>Press Delete to remove it.</span>}
    </>
  );
}
