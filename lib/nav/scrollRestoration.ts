import type { NextRouter } from 'next/router';

const KEY = 'arkpedia:scroll-positions';
const pageOf = (url: string) => url.split('#')[0];
type Coordinates = [number, number];
type ScrollAnchor = { id: string; top: number };
type SavedPosition = Coordinates | { page: Coordinates; rows: Record<string, number[]>; anchor?: ScrollAnchor };

let nextAnchor: ScrollAnchor | undefined;

/** Keep the opened item at its viewport offset if content above it changes height. */
export function rememberScrollAnchor(element: HTMLElement) {
  nextAnchor = { id: element.id, top: element.getBoundingClientRect().top };
}

// A label identifies a shelf across unmounts. Some pages repeat a label.
function scrollRows(visit: (row: HTMLElement, key: string, index: number) => void) {
  const counts = new Map<string, number>();
  for (const row of document.querySelectorAll<HTMLElement>('[data-scroll-row]')) {
    const key = row.dataset.scrollRow!;
    const index = counts.get(key) ?? 0;
    counts.set(key, index + 1);
    visit(row, key, index);
  }
}

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
  let positions: Record<string, SavedPosition> = {};
  try {
    const stored: unknown = JSON.parse(sessionStorage.getItem(KEY) ?? '{}');
    if (stored && typeof stored === 'object' && !Array.isArray(stored)) positions = stored as typeof positions;
  } catch { /* storage unavailable */ }
  const previousMode = history.scrollRestoration;
  history.scrollRestoration = 'manual';

  function save() {
    const page: Coordinates = [window.scrollX, window.scrollY];
    const rows: Record<string, number[]> = Object.create(null);
    scrollRows((row, key, index) => {
      if (row.scrollLeft) (rows[key] ??= [])[index] = row.scrollLeft;
    });
    positions[current] = nextAnchor || Object.keys(rows).length ? { page, rows, anchor: nextAnchor } : page;
    nextAnchor = undefined;
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
  function error() { returning = null; requestedPage = null; nextAnchor = undefined; }
  function complete(url: string) {
    current = pageOf(url);
    const saved = returning === current ? positions[current] : undefined;
    returning = null;
    const position = Array.isArray(saved) ? saved : saved?.page;
    const rows = Array.isArray(saved) ? undefined : saved?.rows;
    const anchor = Array.isArray(saved) ? undefined : saved?.anchor;
    if (!Array.isArray(position) || !position.every(Number.isFinite)) return;
    // Retry as lazy lists and images arrive. Scrolling to the available bottom also
    // wakes LoadOnScroll, rebuilding batches that were present before leaving.
    const rowCount = Object.values(rows ?? {}).reduce((count, offsets) =>
      count + (Array.isArray(offsets) ? offsets.filter(Number.isFinite).length : 0), 0);
    let frame = 0;
    let settle = 0;
    let stopped = false;
    let deadline: number | undefined = window.setTimeout(stop, 10000);
    const observer = new ResizeObserver(schedule);
    // A shelf can populate after the page has reached its final height.
    const shelves = rows || anchor ? new MutationObserver(schedule) : null;
    function stop() {
      stopped = true;
      cancelAnimationFrame(frame);
      clearTimeout(deadline);
      observer.disconnect();
      shelves?.disconnect();
      for (const event of ['wheel', 'touchstart', 'pointerdown', 'keydown']) window.removeEventListener(event, stop);
    }
    function schedule() {
      if (stopped) return;
      cancelAnimationFrame(frame);
      settle = 0;
      frame = requestAnimationFrame(restore);
    }
    function restore() {
      let remaining = rowCount;
      if (rows) scrollRows((row, key, index) => {
        const left = rows[key]?.[index];
        if (!left || !Number.isFinite(left)) return;
        row.scrollLeft = left;
        if (Math.abs(row.scrollLeft - left) < 2) remaining--;
      });
      const item = anchor && document.getElementById(anchor.id);
      const top = item && anchor ? window.scrollY + item.getBoundingClientRect().top - anchor.top : position![1];
      window.scrollTo({ left: position![0], top, behavior: 'instant' });
      // The request may take longer than the initial restoration window. Keep
      // observing the layout while it loads, without polling every frame.
      const loading = item?.closest('main')?.querySelector('[aria-busy="true"]');
      if (loading) {
        clearTimeout(deadline);
        deadline = undefined;
      } else {
        deadline ??= window.setTimeout(stop, 10000);
      }
      if (!remaining && (!anchor || item) && Math.abs(window.scrollY - top) < 2) {
        // Allow the router's own end-of-navigation scroll and React's next paint.
        if (++settle >= 3) {
          if (!loading) stop();
          return;
        }
        frame = requestAnimationFrame(restore);
      }
    }
    shelves?.observe(document.body, { childList: true, subtree: true, ...(anchor && { attributeFilter: ['aria-busy'] }) });
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
