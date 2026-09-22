import { useRouter } from 'next/router';
import { useCallback, useEffect, useRef, useState } from 'react';

const keys = ['skin', 'series', 'q', 'sort', 'availability', 'wishlist'] as const;
type Key = typeof keys[number];
type State = Record<Key, string>;
const empty: State = { skin: '', series: '', q: '', sort: '', availability: '', wishlist: '' };

/** One URL write for a combined filter change, so Reset/View all cannot race
 * several independent debounced query writers. Also follows browser navigation. */
export function useSkinGalleryState(): [State, (key: Key, value: string) => void] {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const [state, setState] = useState<State>(empty);
  const pending = useRef<Partial<State>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!router.isReady || timer.current) return;
    setState(Object.fromEntries(keys.map(key => [key, typeof router.query[key] === 'string' ? router.query[key] : ''])) as State);
  }, [router.isReady, router.query]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const set = useCallback((key: Key, value: string) => {
    setState(current => ({ ...current, [key]: value }));
    pending.current[key] = value;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const r = routerRef.current;
      const query = { ...r.query };
      for (const [field, next] of Object.entries(pending.current)) {
        if (next) query[field] = next;
        else delete query[field];
      }
      pending.current = {};
      timer.current = null;
      void r.replace({ pathname: r.pathname, query }, undefined, { shallow: true, scroll: false });
    }, 200);
  }, []);
  return [state, set];
}
