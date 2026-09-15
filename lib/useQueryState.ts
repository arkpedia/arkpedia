import { useRouter } from 'next/router';
import { useCallback, useEffect, useRef, useState } from 'react';

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

  const set = useCallback((v: string) => {
    setValue(v);
    if (writeTimerRef.current) clearTimeout(writeTimerRef.current);
    writeTimerRef.current = setTimeout(() => {
      const r = routerRef.current;
      const query = { ...r.query };
      if (v === defaultValue || v === '') delete query[key];
      else query[key] = v;
      r.replace({ pathname: r.pathname, query }, undefined, { shallow: true, scroll: false });
    }, 250);
  }, [key, defaultValue]);

  return [value, set];
}
