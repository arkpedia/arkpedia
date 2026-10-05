import { useEffect, useState } from 'react';

/** How much of a moment to show: its day ("5 Oct 2026"), or its time too ("5 Oct 2026, 10:26 CEST"). */
export type Precision = 'day' | 'minute';
const OPTIONS: Record<Precision, Intl.DateTimeFormatOptions> = {
  day: { day: 'numeric', month: 'short', year: 'numeric' },
  minute: { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' },
};

/** An instant (an ISO 8601 UTC timestamp) to `precision`, in `timeZone`, else the device's own:
 *  the day is the reader's day. The site's day-month-year wording (en-GB), whatever the device's
 *  language. */
export function formatInstant(iso: string, precision: Precision, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-GB', timeZone ? { ...OPTIONS[precision], timeZone } : OPTIONS[precision]).format(new Date(iso));
}

/**
 * A moment shown in the reader's own time zone, to the precision the caller names (What's new
 * shows the day; the pull history the minute). The server and the first render in the browser
 * write it in UTC, so the markup they produce is the same and hydration has nothing to correct;
 * once mounted it is rewritten in the device's zone. The UTC moment stays in the tooltip, and the
 * instant itself in <time dateTime> for anything that reads it.
 */
export default function LocalTime({ iso, precision }: { iso: string; precision: Precision }) {
  const utc = formatInstant(iso, precision, 'UTC');
  const [text, setText] = useState(utc);
  useEffect(() => { setText(formatInstant(iso, precision)); }, [iso, precision]);
  return <time dateTime={iso} title={formatInstant(iso, 'minute', 'UTC')}>{text}</time>;
}
