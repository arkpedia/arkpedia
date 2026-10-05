import { useEffect, useState } from 'react';

const OPTIONS: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' };

/** An instant (an ISO 8601 UTC timestamp) as "5 Oct 2026, 10:26 CEST": in `timeZone`, else the
 *  device's own. The site's day-month-year wording (en-GB), whatever the device's language. */
export function formatInstant(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-GB', timeZone ? { ...OPTIONS, timeZone } : OPTIONS).format(new Date(iso));
}

/**
 * A moment shown in the reader's own time zone. The server and the first render in the browser
 * write it in UTC, so the markup they produce is the same and hydration has nothing to correct;
 * once mounted it is rewritten in the device's zone. The UTC time stays in the tooltip, and the
 * instant itself in <time dateTime> for anything that reads it.
 */
export default function LocalTime({ iso }: { iso: string }) {
  const utc = formatInstant(iso, 'UTC');
  const [text, setText] = useState(utc);
  useEffect(() => { setText(formatInstant(iso)); }, [iso]);
  return <time dateTime={iso} title={utc}>{text}</time>;
}
