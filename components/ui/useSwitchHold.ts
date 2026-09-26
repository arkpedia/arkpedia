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

/** The least height the element can have and still leave the document reaching the
 *  bottom of the reader's screen, worked out fresh against the page as it is now. */
function holdNeeded(el: HTMLElement): number {
  const roomBelow = document.documentElement.scrollHeight - (window.scrollY + window.innerHeight);
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
 * another one.
 */
export function useSwitchHold(resetKey: string) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [hold, setHold] = useState<{ key: string; px: number } | null>(null);
  const px = hold && hold.key === resetKey ? hold.px : undefined;

  const capture = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const need = Math.ceil(holdNeeded(el));
    setHold(need > 0 ? { key: resetKey, px: need } : null);
  }, [resetKey]);

  useEffect(() => {
    if (px === undefined) return;
    const release = () => {
      const el = ref.current;
      if (!el) return;
      const need = Math.ceil(holdNeeded(el));
      if (need <= contentHeight(el) + 1) setHold(null);
      else if (need < px) setHold({ key: resetKey, px: need });
    };
    window.addEventListener('scroll', release, { passive: true });
    window.addEventListener('resize', release);
    return () => {
      window.removeEventListener('scroll', release);
      window.removeEventListener('resize', release);
    };
  }, [px, resetKey]);

  const style: CSSProperties | undefined = px ? { minHeight: px } : undefined;
  return { ref, capture, style, px };
}
