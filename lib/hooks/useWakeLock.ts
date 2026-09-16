import { useEffect, useRef, useState } from 'react';

/** The bit of the Screen Wake Lock API this needs. Typed here because the DOM lib in
 *  this TypeScript version does not carry it. */
interface WakeLockSentinelLike {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: 'release', fn: () => void) => void;
}
type NavigatorWithWakeLock = Navigator & {
  wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
};

/**
 * Keeps the screen awake while `active`.
 *
 * A Stronghold run is long and mostly reading, so a phone propped beside the game dims
 * and locks in the middle of it and has to be woken every time the companion is worth
 * a glance. This asks the browser not to.
 *
 * Three things are worth knowing about the API.
 *
 * It is Chromium and Safari 16.4+; where it is missing this does nothing and reports
 * nothing, which is right for a convenience.
 *
 * The lock is dropped by the browser whenever the tab is hidden, and is NOT restored
 * on return, so switching to the game and back would silently end it. The
 * visibilitychange listener takes it again.
 *
 * And it can be refused: a device in battery saver says no. That is reported through
 * `held` so the caller can be honest rather than claiming a lock it does not have.
 */
export function useWakeLock(active: boolean): { supported: boolean; held: boolean } {
  const [supported, setSupported] = useState(false);
  const [held, setHeld] = useState(false);
  const sentinel = useRef<WakeLockSentinelLike | null>(null);

  useEffect(() => {
    setSupported(typeof navigator !== 'undefined' && 'wakeLock' in navigator);
  }, []);

  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    let dropped = false;

    const take = async () => {
      if (dropped || document.visibilityState !== 'visible') return;
      if (sentinel.current && !sentinel.current.released) return;
      try {
        const s = await (navigator as NavigatorWithWakeLock).wakeLock!.request('screen');
        if (dropped) { void s.release(); return; }
        sentinel.current = s;
        setHeld(true);
        s.addEventListener('release', () => setHeld(false));
      } catch {
        /* Refused, usually battery saver. Not an error worth showing: the screen simply
           behaves as it did before. */
        setHeld(false);
      }
    };

    const onVisible = () => { if (document.visibilityState === 'visible') void take(); };
    void take();
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      dropped = true;
      document.removeEventListener('visibilitychange', onVisible);
      const s = sentinel.current;
      sentinel.current = null;
      setHeld(false);
      if (s && !s.released) void s.release();
    };
  }, [active]);

  return { supported, held };
}
