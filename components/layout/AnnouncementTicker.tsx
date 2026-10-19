import { useRegionalTime } from '@/lib/time/useRegionalTime';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getActiveReminders, Reminder } from '@/lib/schedule/opsSchedules';
import type { SssCycle } from '@/lib/schedule/sssCycle';
import { currentMaintenance, maintenanceText, type RegionalMaintenance } from '@/lib/home/maintenance';

// useLayoutEffect on the server is a no-op React warns about on every SSR'd page,
// and this component rides _app so that was every page. On the server the swap is
// meaningless (neither runs), in the browser it IS useLayoutEffect -- the pre-paint
// measurement the marquee needs is untouched.
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

const FIRST_SHOW_DELAY_MS = 15000; // 15s after first entry
const REPEAT_INTERVAL_MS = 120000; // comes back every 2 minutes
const SEPARATOR = '\u00A0\u00A0\u00A0//\u00A0\u00A0\u00A0'; // "   //   " with non-breaking spaces
const PIXELS_PER_SECOND = 90; // scroll speed, tuned for the mono ticker font at 12px
const MIN_DURATION_S = 4;

/** `sssCycle` is the release's SSS cycle (data/sss-cycle.json), which the home page's props
 *  carry (lib/content/tables.mjs). Required: it used to be a date typed into opsSchedules.ts.
 *  `maintenance` is each server's announced maintenance (lib/home/maintenance.ts); the site's
 *  server's leads
 *  the reminders while it is still to come or under way. */
export default function AnnouncementTicker({ sssCycle, maintenance }: { sssCycle: SssCycle; maintenance: RegionalMaintenance }) {
  const { server, schedule } = useRegionalTime();
  const scheduleRef = useRef(schedule);
  scheduleRef.current = schedule;
  /* Read by the timer below, which is set up once; the ref keeps it on the latest props. */
  const sssCycleRef = useRef(sssCycle);
  sssCycleRef.current = sssCycle;
  const maintenanceRef = useRef(maintenance);
  maintenanceRef.current = maintenance;
  const [visible, setVisible] = useState(false);
  const [text, setText] = useState('');
  const [duration, setDuration] = useState(MIN_DURATION_S);
  // Pixel start/end positions for the marquee -- start is the
  // container's width (so the text's left edge begins exactly at the
  // container's right edge, fully off-screen), end is minus the
  // track's own width (so the text's right edge ends exactly at the
  // container's left edge, fully off-screen the other way). Using real
  // measured pixels instead of percentage transforms, since percentage
  // translateX is relative to the element's OWN box, not the
  // container -- which was why the old version never actually entered
  // from off-screen and didn't exit cleanly either.
  const [startPx, setStartPx] = useState(0);
  const [endPx, setEndPx] = useState(0);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Every 2 minutes (first fire at 15s), check what's currently active
  // and, if anything is, start a fresh pass. If nothing's active this
  // cycle, the bar just stays hidden until the next one.
  useEffect(() => {
    function runCycle() {
      const now = new Date();
      const reminders: Reminder[] = [
        ...currentMaintenance(maintenanceRef.current[server] ?? [], now.getTime()).map(window => ({ id: `maintenance-${window.startAt}`, text: maintenanceText(window, now.getTime(), server) })),
        ...getActiveReminders(now, sssCycleRef.current, server, scheduleRef.current),
      ];
      if (reminders.length === 0) {
        setVisible(false);
        return;
      }
      setText(reminders.map((r) => r.text).join(SEPARATOR));
      setVisible(true);
    }

    setVisible(false);
    const firstTimer = setTimeout(runCycle, FIRST_SHOW_DELAY_MS);
    const interval = setInterval(runCycle, REPEAT_INTERVAL_MS);
    return () => {
      clearTimeout(firstTimer);
      clearInterval(interval);
    };
  }, [server]);

  // Measures the container and text BEFORE the browser paints (see the
  // AnnouncementTicker on-mount-resume patch notes for why
  // useLayoutEffect, not useEffect, matters here too -- same
  // mid-animation-jump issue applies to duration changes between
  // cycles), then locks in the exact pixel travel distance and timing.
  useIsomorphicLayoutEffect(() => {
    if (!visible || !trackRef.current) return;
    const track = trackRef.current;
    const container = track.parentElement;
    const containerWidth = container ? container.clientWidth : 0;
    const trackWidth = track.scrollWidth;

    setStartPx(containerWidth);
    setEndPx(-trackWidth);

    const travelDistance = containerWidth + trackWidth;
    const computedDuration = Math.max(MIN_DURATION_S, travelDistance / PIXELS_PER_SECOND);
    setDuration(computedDuration);

    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    hideTimeoutRef.current = setTimeout(() => setVisible(false), computedDuration * 1000);

    return () => {
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, [visible, text]);

  return (
    <div className={`ticker-bar${visible ? ' visible' : ''}`} aria-live="polite">
      {visible && (
        <div
          className="ticker-track"
          ref={trackRef}
          style={{
            ['--ticker-duration' as string]: `${duration}s`,
            ['--ticker-start' as string]: `${startPx}px`,
            ['--ticker-end' as string]: `${endPx}px`,
          }}
        >
          <span className="ticker-text">{text}</span>
        </div>
      )}
    </div>
  );
}