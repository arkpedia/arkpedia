import { useEffect, useState } from 'react';

/**
 * Where a sticky bar has to stick: the bottom edge of the site nav, measured now.
 *
 * The site nav is `position: fixed` and changes height when it collapses on scroll,
 * so a bar with `top: 0` spends the whole page underneath it -- which is what the
 * Stronghold page's section tabs did: pinned, and 0 of 7 clickable, because
 * elementFromPoint at every tab answered with the nav (2026-09-25 review, UC-01).
 * The Terminal bar had already solved it, inside TerminalNav; this is that code,
 * shared, so the next sticky bar does not have to rediscover it.
 *
 * Measured rather than read from the --nav-h variable Sitenav publishes, because that
 * variable lags the collapse: it reads 141px while the nav is 58px tall, which leaves
 * a bar stuck 83px below the nav with a gap for the page to scroll through.
 *
 * Returns null until the first measurement (render the CSS fallback until then).
 */
export function useNavOffset(): number | null {
  const [top, setTop] = useState<number | null>(null);
  useEffect(() => {
    const measure = () => {
      // Every candidate, not the first one: BOTH navs are in the DOM at all times and
      // the CSS hides one of them, so querySelector -- which answers in document order
      // -- returned the desktop nav on a phone. Hidden, its rect is all zeros, so the
      // bar was told to stick at 0 and spent the whole page underneath the mobile
      // nav, which is fixed, 52px tall and sits above the bar.
      let under = 0;
      for (const nav of document.querySelectorAll('.site-nav, .mobile-nav-bar')) {
        const box = nav.getBoundingClientRect();
        // Not rendered at this width, so there is nothing there to sit under.
        if (box.height === 0) continue;
        // Only a nav actually AT the top counts -- one that has scrolled away is
        // nothing to sit under either.
        if (box.top > 1) continue;
        under = Math.max(under, Math.round(box.bottom));
      }
      setTop(under);
    };
    measure();
    const onScroll = () => requestAnimationFrame(measure);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', measure);
    // The nav collapses with a padding transition, so its height mid-animation is not
    // its height -- measure again once it has settled.
    document.addEventListener('transitionend', measure);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', measure);
      document.removeEventListener('transitionend', measure);
    };
  }, []);
  return top;
}
