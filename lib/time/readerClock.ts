import { useEffect, useRef, useState } from 'react';

/**
 * The one place a server-rendered page reads the reader's clock.
 *
 * A page is HTML rendered on the server at the request's moment and hydrated in the
 * reader's browser later, in whatever timezone they are in. Anything the first render
 * works out from `new Date()` can differ between the two, and when it does React
 * throws the server markup away (errors #418/#423/#425). /gacha did that for every
 * reader once Rage of The Many ended, and the home page's Events panel did it once an
 * event closed.
 *
 * So the server's clock travels as a prop -- `now`, which contentPageClock
 * (lib/content/pageClock.ts) adds to every route in CLOCK_UNITS -- the first render
 * uses exactly that, and these hooks swap in the reader's time once the page has
 * mounted. The clock is read only inside effects, never during a render. The pages
 * and components that follow this are listed in the no-restricted-syntax override in
 * .eslintrc.json, which rejects any other clock read in them
 * (scripts/tests/test-clock-lint.ts).
 */

const MINUTE = 60_000;
/** Rounded down to the minute, so a re-read within the same minute is a no-op for React. */
const toMinute = (ms: number) => Math.floor(ms / MINUTE) * MINUTE;

export interface ReaderClockOptions {
  /** Re-read the clock this often after mount, in ms. Omitted, it is read once, on mount. */
  tickMs?: number;
  /** Also re-read it when the window regains focus: a tab left open overnight. */
  onFocus?: boolean;
}

/**
 * A value worked out from the reader's clock, starting from the server's.
 *
 * The first render returns `initial`, which must be what the server rendered from its
 * own `now`, so the markup matches. After mount, `derive` is called with the reader's
 * clock (epoch ms, rounded down to the minute) and its result replaces it.
 */
export function useReaderValue<T>(initial: T, derive: (readerMs: number) => T, options: ReaderClockOptions = {}): T {
  const [value, setValue] = useState(initial);
  const deriveRef = useRef(derive);
  deriveRef.current = derive;
  const { tickMs, onFocus } = options;
  useEffect(() => {
    const read = () => setValue(deriveRef.current(toMinute(Date.now())));
    read();
    const timer = tickMs ? window.setInterval(read, tickMs) : undefined;
    if (onFocus) window.addEventListener('focus', read);
    return () => {
      if (timer !== undefined) window.clearInterval(timer);
      if (onFocus) window.removeEventListener('focus', read);
    };
  }, [tickMs, onFocus]);
  return value;
}

/** The reader's clock in epoch ms (rounded to the minute), starting from the page's `now`. */
export function useReaderClock(now: number, options?: ReaderClockOptions): number {
  return useReaderValue(now, (readerMs) => readerMs, options);
}

/** The same in unix seconds, for the routes whose `now` is counted in seconds (the
 *  CLOCK_UNITS entries of 1000: the Terminal's stage pages). */
export function useReaderClockSeconds(now: number, options?: ReaderClockOptions): number {
  return useReaderValue(now, (readerMs) => readerMs / 1000, options);
}
