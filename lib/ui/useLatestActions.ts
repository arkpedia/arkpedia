import { useRef } from 'react';

type Actions = Record<string, (...args: never[]) => unknown>;

/**
 * The same function identities on every render, each calling the version passed in last.
 *
 * For a context provider whose handlers are plain functions closing over the render they were
 * made in (the music player's thirty-odd queue and transport actions): put through here, they no
 * longer change the memoised context value on every render, and a call still reaches the latest
 * closure. The set of keys is fixed by the first render.
 */
export function useLatestActions<T extends Actions>(actions: T): T {
  const latest = useRef(actions);
  latest.current = actions;
  const stable = useRef<T | null>(null);
  if (!stable.current) {
    const wrapped: Record<string, (...args: never[]) => unknown> = {};
    for (const key of Object.keys(actions)) {
      wrapped[key] = (...args: never[]) => latest.current[key](...args);
    }
    stable.current = wrapped as T;
  }
  return stable.current;
}
