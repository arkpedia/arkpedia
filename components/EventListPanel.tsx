import { useEffect, useMemo, useState } from 'react';
import { CommunityEvent } from '@/lib/schedule/eventTypes';
import { getEventStatus, formatCountdown } from '@/lib/mapProjection';

const STATUS_PRIORITY: Record<'live' | 'upcoming' | 'ended', number> = { live: 0, upcoming: 1, ended: 2 };

/** "19 Aug 2026 – 2 Sep 2026", or one date where the event is a single day.
 *  en-GB because "19 Aug" is the order the rest of the site's dates read in. */
function formatRange(startTime: string, endTime?: string): string {
  const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const a = new Date(startTime);
  // Same default the rest of the schedule uses when an event has no end: a day.
  const b = endTime ? new Date(endTime) : new Date(a.getTime() + 24 * 60 * 60 * 1000);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return '';
  const from = fmt(a);
  const to = fmt(b);
  return from === to ? from : `${from} \u2013 ${to}`;
}

export default function EventListPanel({ events }: { events: CommunityEvent[] }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  // Live first, then upcoming soonest-first, then ended last -- "the
  // incoming event at the top, the furthest event below." Ended events
  // aren't "incoming" at all, so they sink to the bottom regardless of
  // how recently they ended.
  const sorted = useMemo(() => {
    const withStatus = events.map((ev) => ({ ...ev, status: getEventStatus(ev.startTime, ev.endTime, now) }));
    return withStatus.sort((a, b) => {
      if (STATUS_PRIORITY[a.status] !== STATUS_PRIORITY[b.status]) return STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
      return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
    });
  }, [events, now]);

  if (events.length === 0) {
    return (
      <div className="waiting-box">
        <p className="hint">No events scheduled.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
      {sorted.map((ev, i) => (
        <a
          key={i}
          href={ev.url}
          target="_blank"
          rel="noreferrer"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            padding: '10px 12px',
            border: '1px solid var(--line-soft, #333)',
            // Collapses shared borders between stacked boxes instead of
            // doubling up, while still keeping zero visual gap between
            // them -- every box after the first only contributes its
            // own bottom/side borders.
            borderTop: i === 0 ? '1px solid var(--line-soft, #333)' : 'none',
            textDecoration: 'none',
            color: 'inherit',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className={`event-status-dot event-status-${ev.status}`} />
            <span style={{ fontWeight: 600 }}>{ev.name}</span>
          </div>
          <span className="hint">{ev.country}</span>
          <span className="hint">
            {ev.status === 'live' && 'Live now'}
            {ev.status === 'upcoming' && `In ${formatCountdown(ev.startTime, now)}`}
            {ev.status === 'ended' && 'Ended'}
          </span>
          {/* "Live now" says WHEN in the loosest possible sense. The actual
              window is the thing a reader is planning around. */}
          <span className="hint event-list-range">{formatRange(ev.startTime, ev.endTime)}</span>
        </a>
      ))}
    </div>
  );
}