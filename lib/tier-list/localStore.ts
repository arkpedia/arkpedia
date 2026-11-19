/**
 * One piece of reader data in one localStorage key, read and written only through the
 * store made here: the shape the Tier List maker and the chart maker both keep theirs in.
 */
import { useCallback, useSyncExternalStore } from 'react';

export interface LocalStore<T> {
  write: (value: T) => void;
  /** The saved value and a reducer-style setter. The default on the server and in the
   *  first paint, so the markup matches; the saved one arrives right after. */
  use: () => [T, (change: (value: T) => T) => void];
}

export function createLocalStore<T>(key: string, event: string, parse: (raw: string | null) => T | null, fallback: T): LocalStore<T> {
  // useSyncExternalStore wants the same object back while nothing changed. `memory` holds
  // the value for this visit when storage refuses the write (private mode, a full quota).
  let cachedRaw: string | null | undefined;
  let cached: T = fallback;
  let memory: string | null = null;

  const snapshot = (): T => {
    let raw: string | null = memory;
    try { raw = window.localStorage?.getItem(key) ?? memory; } catch { /* storage unavailable */ }
    if (raw !== cachedRaw) {
      cachedRaw = raw;
      cached = parse(raw) ?? fallback;
    }
    return cached;
  };
  const write = (value: T): void => {
    const raw = JSON.stringify(value);
    memory = raw;
    try { window.localStorage?.setItem(key, raw); memory = null; } catch { /* kept in memory for this visit */ }
    window.dispatchEvent(new Event(event));
  };
  const subscribe = (onChange: () => void) => {
    window.addEventListener('storage', onChange);
    window.addEventListener(event, onChange);
    return () => {
      window.removeEventListener('storage', onChange);
      window.removeEventListener(event, onChange);
    };
  };
  const serverSnapshot = () => fallback;
  function use(): [T, (change: (value: T) => T) => void] {
    const value = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
    const update = useCallback((change: (current: T) => T) => {
      const current = snapshot();
      const next = change(current);
      if (next !== current) write(next);
    }, []);
    return [value, update];
  }
  return { write, use };
}
