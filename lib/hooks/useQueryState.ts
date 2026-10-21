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

type Query = Record<string, string | string[] | undefined>;

/**
 * The writes every useQueryState on a page has asked for, by page and key ('' removes the
 * key). Separate hooks each debounce their own write, and each built it from the router's
 * query when it fired -- which the write fired just before it had not reached yet, so the
 * later write put back what the earlier one left out: pressing 1★ and then Medic in the
 * roster's Filters sheet left ?rarity=1 and no class. Each write now carries every key
 * still asked for on its page, and a key leaves this list once the router's query shows it
 * (checked at every write and when each write lands).
 */
const asked = new Map<string, Map<string, string>>();

/** `query` with every pending write applied, and the writes it already shows dropped from
 *  `pending` (which this mutates). Exported for its test. */
export function applyPendingWrites(query: Query, pending: Map<string, string>): Query {
  const out: Query = { ...query };
  for (const [key, value] of pending) {
    if ((value === '' && query[key] === undefined) || query[key] === value) { pending.delete(key); continue; }
    if (value === '') delete out[key];
    else out[key] = value;
  }
  return out;
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
      const pending = asked.get(page) ?? new Map<string, string>();
      asked.set(page, pending);
      pending.set(key, v === defaultValue ? '' : v);
      const query = applyPendingWrites(r.query, pending);
      // This key is written now, whatever the router shows: keep asking until it does.
      if (v === defaultValue || v === '') delete query[key];
      else query[key] = v;
      // Once the address has it, nothing is pending any more: a later link to this page
      // with another query must not have an old write put back over it.
      void Promise.resolve(r.replace({ pathname: r.pathname, query }, undefined, { shallow: true, scroll: false }))
        .then(() => { applyPendingWrites(routerRef.current.query, pending); }, () => {});
    }, 250);
  }, [key, defaultValue]);

  return [value, set];
}

/**
 * useQueryState for a set of keys that change together: a toolbar whose Reset clears
 * several filters at once. Separate useQueryState hooks each schedule their own write, and
 * each writes the query it read off the router when it fires, which the write before it
 * may not have reached yet, so a later write can put back what an earlier one removed.
 * One record and one debounced write of every key, so a reset reaches the address whole.
 *
 * `defaults` names the keys and their defaults; keep it a module constant. A key at its
 * default (or empty) is left out of the address, as useQueryState does.
 */
export function useQueryRecord<K extends string>(defaults: Readonly<Record<K, string>>): [Record<K, string>, (patch: Partial<Record<K, string>>) => void] {
  const router = useRouter();
  const [value, setValue] = useState<Record<K, string>>(() => ({ ...defaults }));
  const valueRef = useRef(value);
  valueRef.current = value;
  const appliedRef = useRef(false);
  const writeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    if (!router.isReady || appliedRef.current) return;
    appliedRef.current = true;
    const read: Record<K, string> = { ...defaults };
    let changed = false;
    for (const key of Object.keys(defaults) as K[]) {
      const raw = router.query[key];
      if (typeof raw === 'string' && raw !== '') { read[key] = raw; changed = true; }
    }
    if (changed) setValue(read);
  }, [router.isReady, router.query, defaults]);

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

  const set = useCallback((patch: Partial<Record<K, string>>) => {
    const next = { ...valueRef.current, ...patch };
    valueRef.current = next;
    setValue(next);
    if (writeTimerRef.current) clearTimeout(writeTimerRef.current);
    const page = pathOf(routerRef.current.asPath);
    writeTimerRef.current = setTimeout(() => {
      writeTimerRef.current = null;
      const r = routerRef.current;
      // Written only on the page it was typed on.
      if (pathOf(r.asPath) !== page) return;
      const query = { ...r.query };
      for (const key of Object.keys(defaults) as K[]) {
        const v = valueRef.current[key];
        if (v === defaults[key] || v === '') delete query[key];
        else query[key] = v;
      }
      r.replace({ pathname: r.pathname, query }, undefined, { shallow: true, scroll: false });
    }, 250);
  }, [defaults]);

  return [value, set];
}
