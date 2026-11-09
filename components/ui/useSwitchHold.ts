import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';

/** The element's height without any hold: from its top to the bottom of its last
 *  child, with its own bottom padding and border. */
function contentHeight(el: HTMLElement): number {
  const last = el.lastElementChild as HTMLElement | null;
  if (!last) return 0;
  const style = getComputedStyle(el);
  return last.getBoundingClientRect().bottom + parseFloat(getComputedStyle(last).marginBottom || '0')
    - el.getBoundingClientRect().top + parseFloat(style.paddingBottom || '0') + parseFloat(style.borderBottomWidth || '0');
}

/** The margins of the element's first and last children that collapse through its own
 *  top and bottom edges (a block box with no padding or border there): the page counts
 *  them and the element's box does not. So the page loses them with the panel, and the
 *  hold has to give them back: the planner's Experimental panel opened with a 16px margin
 *  (its first .plan-panel's, since removed) and Simple with none, and the hold for
 *  Experimental -> Simple came out 16px short on a phone. Measured by giving the element
 *  1px of padding at each end for one synchronous layout, in the handler, before anything
 *  is painted. */
function collapsedMargins(el: HTMLElement): number {
  const style = getComputedStyle(el);
  if (style.display !== 'block') return 0;
  const openTop = !(parseFloat(style.paddingTop) > 0 || parseFloat(style.borderTopWidth) > 0);
  const openBottom = !(parseFloat(style.paddingBottom) > 0 || parseFloat(style.borderBottomWidth) > 0);
  if (!openTop && !openBottom) return 0;
  const before = el.getBoundingClientRect().height;
  const saved = [el.style.paddingTop, el.style.paddingBottom];
  if (openTop) el.style.paddingTop = '1px';
  if (openBottom) el.style.paddingBottom = '1px';
  const after = el.getBoundingClientRect().height - (openTop ? 1 : 0) - (openBottom ? 1 : 0);
  [el.style.paddingTop, el.style.paddingBottom] = saved;
  return Math.max(0, after - before);
}

/** Only fixed scrolling panes need a nested hold; flowing phone layouts use the window. */
function scrollContainer(el: HTMLElement, selector?: string): HTMLElement | null {
  const root = selector ? el.closest<HTMLElement>(selector) : null;
  return root && /^(auto|scroll)$/.test(getComputedStyle(root).overflowY) ? root : null;
}

/** The least height that keeps the reader’s current scroll position reachable. */
function holdNeeded(el: HTMLElement, selector?: string): number {
  const root = scrollContainer(el, selector);
  const roomBelow = root ? root.scrollHeight - root.scrollTop - root.clientHeight
    : document.documentElement.scrollHeight - (window.scrollY + window.innerHeight);
  return el.getBoundingClientRect().height - roomBelow;
}

/**
 * The Anti-Page Jump hold for a tab switch or a view swap: the handler pattern from
 * the arkpedia-ui skill, as /events/[slug] had it inline (2026-09-25) and /schedule
 * needed it too (r9: Events -> Calendar clamped the reader 51px up at 1440).
 *
 *     const hold = useSwitchHold(pageKey);
 *     const choose = (next) => { hold.capture(); setTab(next); };
 *     <div ref={hold.ref} style={hold.style}>{panels}</div>
 *
 * `capture()` runs in the handler, BEFORE the change: it works out how tall the
 * container must stay for the document to still reach the bottom of the reader's
 * screen, and that is applied as the container's min-height in the same render as the
 * new content -- so the page is never shorter than the reader's position and there is
 * nothing for the browser to clamp. It is only what this position needs (nothing at the
 * top of the page), worked out fresh each time rather than summed, and it melts as the
 * reader scrolls back up. A min-height, not padding, so it cannot clobber the
 * container's own padding. useHeightFloor, which reserves AFTER the switch, lost the
 * race with the clamp on the event page and still moved the tab row 150px at 390.
 *
 * `resetKey` is the logical page (the event, the route): a hold never carries over to
 * another one. `scrollRoot` can name a nested scrolling pane; when that pane
 * flows in the document on phones, the ordinary window hold still applies.
 */
export function useSwitchHold(resetKey: string, scrollRoot?: string) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [hold, setHold] = useState<{ key: string; px: number } | null>(null);
  const px = hold && hold.key === resetKey ? hold.px : undefined;

  const capture = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const need = Math.ceil(holdNeeded(el, scrollRoot) + collapsedMargins(el));
    setHold(need > 0 ? { key: resetKey, px: need } : null);
  }, [resetKey, scrollRoot]);

  useEffect(() => {
    if (px === undefined) return;
    const release = () => {
      const el = ref.current;
      if (!el) return;
      const need = Math.ceil(holdNeeded(el, scrollRoot));
      if (need <= contentHeight(el) + 1) setHold(null);
      else if (need < px) setHold({ key: resetKey, px: need });
    };
    const root = ref.current && scrollContainer(ref.current, scrollRoot);
    root?.addEventListener('scroll', release, { passive: true });
    window.addEventListener('scroll', release, { passive: true });
    window.addEventListener('resize', release);
    return () => {
      root?.removeEventListener('scroll', release);
      window.removeEventListener('scroll', release);
      window.removeEventListener('resize', release);
    };
  }, [px, resetKey, scrollRoot]);

  const style: CSSProperties | undefined = px ? { minHeight: px } : undefined;
  return { ref, capture, style, px };
}
