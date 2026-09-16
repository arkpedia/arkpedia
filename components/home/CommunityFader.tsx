import { useEffect, useRef, useState } from 'react';
import Image from '@/components/content/ContentImage';
import Link from 'next/link';
import { TwitchStream } from '@/lib/community/twitch';
import { YouTubeVideo } from '@/lib/music/youtube';
import { CommunityEvent } from '@/lib/schedule/eventTypes';

type Slide =
  | { kind: 'stream'; data: TwitchStream }
  | { kind: 'video'; data: YouTubeVideo }
  | { kind: 'event'; data: CommunityEvent };

const FADE_INTERVAL_MS = 6000;

/** "19 Aug 2026 – 2 Sep 2026", the same shape the community page's event list
 *  prints. A start date on its own says an event happened, not whether it is
 *  still happening, which is the question the front page is being asked. */
function formatEventWindow(startTime: string, endTime?: string): string {
  const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const a = new Date(startTime);
  if (Number.isNaN(a.getTime())) return '';
  // Same default the schedule uses when an event carries no end: one day.
  const b = endTime ? new Date(endTime) : new Date(a.getTime() + 24 * 60 * 60 * 1000);
  const from = fmt(a);
  const to = Number.isNaN(b.getTime()) ? from : fmt(b);
  return from === to ? from : `${from} \u2013 ${to}`;
}

interface Props {
  stream: TwitchStream | null;
  video: YouTubeVideo | null;
  event: CommunityEvent | null;
}

export default function CommunityFader({ stream, video, event }: Props) {
  const slides: Slide[] = [
    ...(stream ? [{ kind: 'stream', data: stream } as Slide] : []),
    ...(video ? [{ kind: 'video', data: video } as Slide] : []),
    ...(event ? [{ kind: 'event', data: event } as Slide] : []),
  ];

  const [index, setIndex] = useState(0);
  const [fadeKey, setFadeKey] = useState(0);
  // Bumped on every swipe or dot press so the rotation timer restarts and
  // counts from the interaction instead of yanking the chosen slide away.
  const [interactionKey, setInteractionKey] = useState(0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (slides.length <= 1) return;
    const interval = setInterval(() => {
      setIndex((i) => (i + 1) % slides.length);
      setFadeKey((k) => k + 1);
    }, FADE_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slides.length, interactionKey]);

  const goTo = (next: number) => {
    setIndex(((next % slides.length) + slides.length) % slides.length);
    setFadeKey((k) => k + 1);
    setInteractionKey((k) => k + 1);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || slides.length <= 1) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    // Mostly-vertical or tiny movement is a scroll or a tap, not a swipe.
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return;
    goTo(dx < 0 ? index + 1 : index - 1);
  };

  if (slides.length === 0) {
    return (
      <section className="front-panel front-community-panel">
        <h2>Community</h2>
        <p className="hint">Nothing to feature right now.</p>
      </section>
    );
  }

  const active = slides[index % slides.length];

  return (
    <section className="front-panel front-community-panel">
      <h2>Community</h2>
      {/* pan-y keeps vertical drags as native scroll; horizontal swipes flip slides. */}
      <div
        className="front-community-fade-wrap"
        key={fadeKey}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        style={{ touchAction: 'pan-y' }}
      >
        {active.kind === 'stream' && (
          <a
            className="front-community-item"
            href={active.data.url}
            target="_blank"
            rel="noreferrer"
          >
            <div className="front-community-thumb-wrap">
              <Image src={active.data.thumbnailUrl} alt={active.data.title} fill sizes="384px" style={{ objectFit: 'cover' }} />
              <span className="front-live-badge">LIVE</span>
            </div>
            <p className="front-community-title">{active.data.title}</p>
            <p className="hint">{active.data.displayName} on Twitch</p>
          </a>
        )}

        {active.kind === 'video' && (
          <a className="front-community-item" href={active.data.url} target="_blank" rel="noreferrer">
            <div className="front-community-thumb-wrap">
              <Image src={active.data.thumbnail} alt={active.data.title} fill sizes="384px" style={{ objectFit: 'cover' }} />
            </div>
            <p className="front-community-title">{active.data.title}</p>
            <p className="hint">{active.data.channelLabel} on YouTube</p>
          </a>
        )}

        {active.kind === 'event' && (
          <Link prefetch={false} className="front-community-item" href="/community">
            <div className="front-community-thumb-wrap front-community-event-thumb">
              <span className="front-community-event-country">{active.data.country}</span>
            </div>
            <p className="front-community-title">{active.data.name}</p>
            <p className="hint">{formatEventWindow(active.data.startTime, active.data.endTime)}</p>
          </Link>
        )}
      </div>

      {slides.length > 1 && (
        <div className="front-community-dots">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              className={`front-community-dot${i === index ? ' active' : ''}`}
              aria-label={`Show slide ${i + 1} of ${slides.length}`}
              aria-current={i === index}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
      )}
    </section>
  );
}