import type { NextRouter } from 'next/router';

const KEY = 'arkpedia:scroll-positions';
const pageOf = (url: string) => url.split('#')[0];
let requestedPage: string | null = null;

/** The site's Back link skips section-history entries, but still restores the page left. */
export function restoreScrollOnReturn(url: string) {
  requestedPage = pageOf(url);
}

/** Browser Back/Forward and page Back restore position; ordinary links start normally. */
export function watchScrollRestoration(router: NextRouter) {
  let current = pageOf(router.asPath);
  let returning: string | null = null;
  let stopRestoring = () => {};
  let positions: Record<string, [number, number]> = {};
  try {
    const stored: unknown = JSON.parse(sessionStorage.getItem(KEY) ?? '{}');
    if (stored && typeof stored === 'object' && !Array.isArray(stored)) positions = stored as typeof positions;
  } catch { /* storage unavailable */ }
  const previousMode = history.scrollRestoration;
  history.scrollRestoration = 'manual';

  function save() {
    positions[current] = [window.scrollX, window.scrollY];
    // Bound storage to the most recently visited pages in this tab.
    const entries = Object.entries(positions).filter(([url]) => url !== current);
    positions = Object.fromEntries([...entries.slice(-49), [current, positions[current]]]);
    try { sessionStorage.setItem(KEY, JSON.stringify(positions)); } catch { /* storage unavailable */ }
  }
  router.beforePopState(({ as }) => {
    const destination = pageOf(as);
    if (destination !== current) returning = destination;
    return true;
  });
  function start(url: string) {
    stopRestoring();
    save();
    if (requestedPage === pageOf(url)) returning = requestedPage;
    requestedPage = null;
  }
  function error() { returning = null; requestedPage = null; }
  function complete(url: string) {
    current = pageOf(url);
    const position = returning === current ? positions[current] : undefined;
    returning = null;
    if (!Array.isArray(position) || !position.every(Number.isFinite)) return;
    // Retry as lazy lists and images arrive. Scrolling to the available bottom also
    // wakes LoadOnScroll, rebuilding batches that were present before leaving.
    let frame = 0;
    let settle = 0;
    let stopped = false;
    const deadline = window.setTimeout(stop, 10000);
    const observer = new ResizeObserver(schedule);
    function stop() {
      stopped = true;
      cancelAnimationFrame(frame);
      clearTimeout(deadline);
      observer.disconnect();
      for (const event of ['wheel', 'touchstart', 'pointerdown', 'keydown']) window.removeEventListener(event, stop);
    }
    function schedule() {
      if (stopped) return;
      cancelAnimationFrame(frame);
      settle = 0;
      frame = requestAnimationFrame(restore);
    }
    function restore() {
      window.scrollTo({ left: position![0], top: position![1], behavior: 'instant' });
      if (Math.abs(window.scrollY - position![1]) < 2) {
        // Allow the router's own end-of-navigation scroll and React's next paint.
        if (++settle >= 3) { stop(); return; }
        frame = requestAnimationFrame(restore);
      }
    }
    observer.observe(document.body);
    for (const event of ['wheel', 'touchstart', 'pointerdown', 'keydown']) window.addEventListener(event, stop, { passive: true });
    stopRestoring = stop;
    schedule();
  }
  window.addEventListener('pagehide', save);
  router.events.on('routeChangeStart', start);
  router.events.on('routeChangeComplete', complete);
  router.events.on('routeChangeError', error);
  return () => {
    stopRestoring();
    history.scrollRestoration = previousMode;
    router.beforePopState(() => true);
    window.removeEventListener('pagehide', save);
    router.events.off('routeChangeStart', start);
    router.events.off('routeChangeComplete', complete);
    router.events.off('routeChangeError', error);
  };
}
