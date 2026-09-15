import { useEffect, useState } from 'react';
import { formatCountdown, formatServerClock, getNextDailyReset } from '@/lib/schedule/opsSchedules';

/**
 * The server's wall clock and the time left until the daily reset.
 *
 * Both are derived from one fixed offset rather than from the reader's own timezone:
 * the global server runs on 04:00 UTC-7, which is 19:00 SGT, and neither of those
 * observes daylight saving. See lib/schedule/opsSchedules.ts, which owns the reset
 * hour -- this component must not carry a second copy of it.
 *
 * Nothing renders a real time on the server. A clock is by definition different on
 * every render, so prerendering one guarantees a hydration mismatch; the placeholders
 * below are what both the server and the first client render produce, and they are
 * the same width as a real value so the bar is settled before the first tick lands.
 * That matters more than it looks: the nav's spacer is sized from a ResizeObserver,
 * so a bar that changed size a second after load would move the whole document.
 */

/**
 * Which of the two places this is being drawn in. Required, not an optional flag with
 * a default: the two differ because of a measured width budget, not a preference, and
 * a default would hand a future third caller one of them by accident.
 *
 * 'bar' is the desktop nav, where the strip has to fit in about 135px -- the space
 * left over once the brand, the six nav entries at their natural 625px and the theme
 * toggle have taken theirs out of the bar's 1040px. That budget is what makes this two
 * rows rather than the one row the design was drawn as. Overrunning it does not
 * overflow the bar and shows no scrollbar -- it silently squeezes .site-nav-links,
 * whose entries clip their own text at 200px each, so the cost lands on the nav labels
 * where nothing points at it.
 *
 * 'drawer' is the mobile drawer's header, a column that takes the strip on one line.
 *
 * 'mobile' is the phone's own bar, at the end of the row the brand starts. Two rows
 * like the desktop bar and for the same reason, but on a tighter budget still: the
 * brand, the theme toggle and a 44px menu button leave about 105px of a 375px phone,
 * and a 320px one has none. So the labels go to SVR and RST -- three characters each,
 * about 16px of column against "Server Time"'s 71, which is what makes the whole strip
 * fit the narrowest phone rather than the second narrowest. They are abbreviations a
 * reader meets once; what they label is a clock and a countdown, and the shape of the
 * two values says which is which before the labels do.
 */
export type ServerClockVariant = 'bar' | 'drawer' | 'mobile';

/* Server time, not SGT: it is the clock beside it that the reader is comparing this
   to. The two are the same instant and fifteen hours apart as clocks. */
const RESET_TITLE = 'Daily reset at 04:00 server time (UTC-7)';

const CLOCK_PLACEHOLDER = '--:--';
const RESET_PLACEHOLDER = '--h --m';

interface Display {
  clock: string;
  reset: string;
}

export default function ServerClock({ variant }: { variant: ServerClockVariant }) {
  const [display, setDisplay] = useState<Display | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const t = Date.now();
      const d = new Date(t);
      /* Both values are recomputed from the current instant, never decremented from the
         last ones: a decremented countdown accumulates drift, and it is wrong by however
         long the tab spent asleep in a background window. */
      const next: Display = {
        clock: formatServerClock(d),
        reset: formatCountdown(getNextDailyReset(d).getTime() - t),
      };
      /* Returning the previous object unchanged makes React skip the render. Neither
         field shows seconds, so both change once a minute, and this component sits in
         the nav on every page -- without the comparison it would re-render 59 times a
         minute, site-wide, to draw exactly the same two strings. The timer still runs
         every second so the change lands within a second of the minute turning over. */
      setDisplay((prev) => (prev && prev.clock === next.clock && prev.reset === next.reset ? prev : next));
      /* Re-aimed at the next whole second instead of a flat 1000ms interval, which
         drifts a few milliseconds a tick and eventually skips one. */
      timer = setTimeout(tick, 1000 - (t % 1000));
    };
    tick();
    return () => clearTimeout(timer);
  }, []);

  const clock = display ? display.clock : CLOCK_PLACEHOLDER;
  const reset = display ? display.reset : RESET_PLACEHOLDER;

  return (
    /* Deliberately not an aria-live region. It changes every second, and a live region
       would make a screen reader read the bar out once a second. It is plain text,
       announced when the reader moves through it, and the title says which reset the
       countdown is counting to. */
    <div
      className={`site-nav-clock site-nav-clock-${variant}`}
      title={RESET_TITLE}
    >
      <span className="site-nav-clock-label">{variant === 'mobile' ? 'SVR' : 'Server Time'}</span>
      <span className="site-nav-clock-time">{clock}</span>
      <span className="site-nav-clock-sep" aria-hidden="true" />
      <span className="site-nav-clock-label">{variant === 'mobile' ? 'RST' : 'Reset'}</span>
      <span className="site-nav-clock-reset">{reset}</span>
    </div>
  );
}
