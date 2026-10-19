import { useSyncExternalStore } from 'react';

/**
 * Songs the reader keeps out of autoplay ("Don't autoplay", on song rows and in the player's
 * More menu): autoplay from the library never picks them (musicPlayerContext nextAutoplayTracks).
 * They still play when chosen -- queued, played now, in a playlist. Kept in this browser only.
 */
const KEY = 'arkpediaMusicNoAutoplay';
const EVENT = 'arkpediaMusicNoAutoplayChanged';
const NONE: ReadonlySet<string> = new Set();

let cachedRaw: string | null | undefined;
let cached: ReadonlySet<string> = NONE;
/** The kept-out song ids now, outside React. */
export function noAutoplaySongs(): ReadonlySet<string> {
  let raw: string | null = null;
  try { raw = window.localStorage?.getItem(KEY) ?? null; } catch { raw = null; }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    try {
      const ids = JSON.parse(raw ?? '[]');
      cached = Array.isArray(ids) ? new Set(ids.filter((id): id is string => typeof id === 'string')) : NONE;
    } catch {
      cached = NONE;
    }
  }
  return cached;
}

function write(ids: Iterable<string>) {
  const list = [...ids];
  try {
    if (list.length) window.localStorage?.setItem(KEY, JSON.stringify(list));
    else window.localStorage?.removeItem(KEY);
  } catch { /* refused: lasts until the page is left */ }
  window.dispatchEvent(new Event(EVENT));
}

/** Keeps a song out of autoplay, or lets it back. Returns whether it is now kept out. */
export function toggleNoAutoplay(id: string): boolean {
  const next = new Set(noAutoplaySongs());
  const out = !next.delete(id);
  if (out) next.add(id);
  write(next);
  return out;
}

/** Lets every kept-out song back into autoplay. */
export function clearNoAutoplay(): void {
  write([]);
}

function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

/** The kept-out songs: none on the server and in the first paint, so the markup matches. */
export function useNoAutoplay(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, noAutoplaySongs, () => NONE);
}
