import { useRouter } from 'next/router';
import { useCallback, useEffect, useRef, useState } from 'react';

/** The path of an address (no query, no hash), for telling a page from a view of it. */
export function pathOf(url: string): string {
  return url.split(/[?#]/)[0] || '/';
}

/**
 * Whether a navigation to `url` leaves the page at `currentPath`. A pending write belongs to
 * the page it was typed on: once the reader follows a link to another page, writing it would
 * send them back. A navigation within the page (another key's shallow write, a link to the same
 * page with another query) keeps it: dropping it would lose that key from the address.
 */
export function leavesPage(currentPath: string, url: string): boolean {
  return pathOf(url) !== pathOf(currentPath);
}

/**
 * A piece of UI state mirrored into the URL query string, so filtered and
 * faceted views survive reload and can be shared -- before this, none of the
 * site's filters, tabs, or searches were deep-linkable.
 *
 * Reads apply once the router is ready: SSG pages hydrate with an empty query,
 * so the first paint uses the default and the URL's value lands immediately
 * after (this is also what keeps server and client markup identical). Writes
 * use shallow replace -- no data refetch, no history spam from keystrokes --
 * debounced just enough that typing into a search box doesn't thrash the
 * router. A value equal to the default is REMOVED from the URL, so the
 * address bar stays clean until something is actually non-default.
 *
 * A pending write never outlives the page it was typed on: a link followed within the delay
 * (type in Discover's search, then press Library) started its navigation, and the write that
 * fired before the new page mounted replaced the address with the old page and cancelled it
 * (2026-10-13). It is now dropped when a navigation away starts, and checked against the page
 * it was scheduled on when it fires.
 */
export function useQueryState(key: string, defaultValue = ''): [string, (v: string) => void] {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);
  const appliedRef = useRef(false);
  const writeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The router identity changes on every route event; the write callback
  // reads it through a ref so the debounce timer always sees current state.
  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    if (!router.isReady || appliedRef.current) return;
    appliedRef.current = true;
    const raw = router.query[key];
    if (typeof raw === 'string' && raw !== '') setValue(raw);
  }, [router.isReady, router.query, key]);

  useEffect(() => () => {
    if (writeTimerRef.current) clearTimeout(writeTimerRef.current);
  }, []);

  // A navigation to another page drops the write still waiting for its delay.
  useEffect(() => {
    const events = router.events;
    if (!events) return;
    const onStart = (url: string) => {
      if (writeTimerRef.current && leavesPage(routerRef.current.asPath, url)) {
        clearTimeout(writeTimerRef.current);
        writeTimerRef.current = null;
      }
    };
    events.on('routeChangeStart', onStart);
    return () => events.off('routeChangeStart', onStart);
  }, [router.events]);

  const set = useCallback((v: string) => {
    setValue(v);
    if (writeTimerRef.current) clearTimeout(writeTimerRef.current);
    const page = pathOf(routerRef.current.asPath);
    writeTimerRef.current = setTimeout(() => {
      writeTimerRef.current = null;
      const r = routerRef.current;
      // Written only on the page it was typed on.
      if (pathOf(r.asPath) !== page) return;
      const query = { ...r.query };
      if (v === defaultValue || v === '') delete query[key];
      else query[key] = v;
      r.replace({ pathname: r.pathname, query }, undefined, { shallow: true, scroll: false });
    }, 250);
  }, [key, defaultValue]);

  return [value, set];
}
