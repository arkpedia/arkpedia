import { useEffect, useMemo, useState } from 'react';
import { CommunityEvent, CommunityEventKind } from '@/lib/schedule/eventTypes';
import { getEventStatus, formatCountdown } from '@/lib/maps/mapProjection';

/** The micro-label each kind of event carries in the list; an official presence carries none. */
const KIND_LABELS: Record<CommunityEventKind, string> = { collab: 'Collab', guest: 'Guest', fan: 'Fan' };

const STATUS_PRIORITY: Record<'live' | 'upcoming' | 'ended', number> = { live: 0, upcoming: 1, ended: 2 };

/** "19 Aug 2026 – 2 Sep 2026", or one date where the event is a single day.
 *  en-GB because "19 Aug" is the order the rest of the site's dates read in. `timeZone` is
 *  the zone the dates are read in: UTC until the page has mounted, the reader's own after. */
function formatRange(startTime: string, endTime: string | undefined, timeZone: 'UTC' | undefined): string {
  const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone });
  const a = new Date(startTime);
  // Same default the rest of the schedule uses when an event has no end: a day.
  const b = endTime ? new Date(endTime) : new Date(a.getTime() + 24 * 60 * 60 * 1000);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return '';
  const from = fmt(a);
  const to = fmt(b);
  return from === to ? from : `${from} \u2013 ${to}`;
}

/**
 * `now` is the page's own clock (its getStaticProps). The server's HTML and the browser's
 * first render must be the same text, or React throws that HTML away (errors #418, #423,
 * #425) and every reader outside UTC saw the dates flash: so both render the statuses at
 * the page's clock and the dates in UTC, and the reader's clock and zone take over once
 * the page has mounted.
 */
export default function EventListPanel({ events, now: renderedAt }: { events: CommunityEvent[]; now: number }) {
  const [clock, setClock] = useState<{ now: number; timeZone: 'UTC' | undefined }>({ now: renderedAt, timeZone: 'UTC' });
  const { now, timeZone } = clock;

  useEffect(() => {
    const tick = () => setClock({ now: Date.now(), timeZone: undefined });
    tick();
    const interval = setInterval(tick, 60000);
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

  /* One column of event links. It does not scroll itself: the panel that holds it
     is the one scroller (a second one inside it left two thumbs on one list). */
  return (
    <div className="community-event-list">
      {sorted.map((ev, i) => (
        <a key={i} href={ev.url || undefined} target="_blank" rel="noreferrer" className="community-event-item">
          <span className="community-event-name">
            <span className={`event-status-dot event-status-${ev.status}`} />
            <span>{ev.name}</span>
          </span>
          <span className="hint">{ev.country}</span>
          {ev.kind && <span className="label-tag">{KIND_LABELS[ev.kind]}</span>}
          <span className="hint">
            {ev.status === 'live' && 'Live now'}
            {ev.status === 'upcoming' && `In ${formatCountdown(ev.startTime, now)}`}
            {ev.status === 'ended' && 'Ended'}
          </span>
          {/* "Live now" says WHEN in the loosest possible sense. The actual
              window is the thing a reader is planning around. */}
          <span className="hint event-list-range">{formatRange(ev.startTime, ev.endTime, timeZone)}</span>
        </a>
      ))}
    </div>
  );
}