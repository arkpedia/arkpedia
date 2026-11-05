import { useEffect, useRef, useState, type ReactNode } from 'react';
import Image from '@/components/content/ContentImage';
import Link from 'next/link';
import { TwitchStream } from '@/lib/community/twitch';
import { YouTubeVideo } from '@/lib/music/youtube';
import { CommunityEvent } from '@/lib/schedule/eventTypes';
import { useLiveTwitchStreams } from '@/lib/community/useLiveTwitchStreams';

type Slide =
  | { kind: 'stream'; data: TwitchStream }
  | { kind: 'video'; data: YouTubeVideo }
  | { kind: 'event'; data: CommunityEvent };

const FADE_INTERVAL_MS = 6000;

/** "19 Aug 2026 – 2 Sep 2026", the same shape the community page's event list
 *  prints. A start date on its own says an event happened, not whether it is
 *  still happening, which is the question the front page is being asked. */
function formatEventWindow(startTime: string, endTime?: string, timeZone?: string): string {
  const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', ...(timeZone ? { timeZone } : {}) });
  const a = new Date(startTime);
  if (Number.isNaN(a.getTime())) return '';
  // Same default the schedule uses when an event carries no end: one day.
  const b = endTime ? new Date(endTime) : new Date(a.getTime() + 24 * 60 * 60 * 1000);
  const from = fmt(a);
  const to = Number.isNaN(b.getTime()) ? from : fmt(b);
  return from === to ? from : `${from} \u2013 ${to}`;
}

/** The quieter second path on a slide: the card opens the stream or the video
 *  itself (what a reader who presses a LIVE thumbnail wants), and this opens the
 *  World section that collects the rest. It is under the card rather than inside
 *  it -- one link cannot hold another -- and it follows the slide, so the label
 *  and destination always name what is on screen. */
function WorldMore({ href, children }: { href: string; children: ReactNode }) {
  return (
    <div className="front-community-more-row">
      <Link prefetch={false} className="front-community-more" href={href}>{children}</Link>
    </div>
  );
}

interface Props {
  video: YouTubeVideo | null;
  event: CommunityEvent | null;
}

export default function CommunityFader({ video, event }: Props) {
  const { streams } = useLiveTwitchStreams();
  const stream = streams[0] ?? null;
  const slides: Slide[] = [
    ...(stream ? [{ kind: 'stream', data: stream } as Slide] : []),
    ...(video ? [{ kind: 'video', data: video } as Slide] : []),
    ...(event ? [{ kind: 'event', data: event } as Slide] : []),
  ];

  const [index, setIndex] = useState(0);
  // Bumped on every swipe or dot press so the rotation timer restarts and
  // counts from the interaction instead of yanking the chosen slide away.
  const [interactionKey, setInteractionKey] = useState(0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  // Held while the pointer or keyboard focus is on the panel: a slide the reader is about to
  // open never swaps out from under them.
  const [paused, setPaused] = useState(false);
  // The event's days in UTC on the server and the first render, so hydration has nothing to
  // correct, then in the reader's own zone (as components/ui/LocalTime.tsx does).
  const [zone, setZone] = useState<string | undefined>('UTC');
  useEffect(() => { setZone(undefined); }, []);

  useEffect(() => {
    if (slides.length <= 1 || paused) return;
    const interval = setInterval(() => {
      setIndex((i) => (i + 1) % slides.length);
    }, FADE_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slides.length, interactionKey, paused]);

  const goTo = (next: number) => {
    setIndex(((next % slides.length) + slides.length) % slides.length);
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
      <section className="front-panel front-home-panel front-community-panel">
        <h2 className="section-title">Community</h2>
        <p className="hint">Nothing to feature right now.</p>
      </section>
    );
  }

  const current = index % slides.length;
  const slide = (active: Slide) => {
    if (active.kind === 'stream') return (
      <>
        <a className="front-community-item" href={active.data.url} target="_blank" rel="noreferrer">
          <div className="front-community-thumb-wrap">
            <Image src={active.data.thumbnailUrl} alt={active.data.title} fill sizes="384px" style={{ objectFit: 'cover' }} />
            <span className="badge-live front-live-badge">LIVE</span>
          </div>
          <p className="front-community-title">{active.data.title}</p>
          <p className="hint">{active.data.displayName} on Twitch</p>
        </a>
        <WorldMore href="/world?section=twitch">More Twitch streams</WorldMore>
      </>
    );
    if (active.kind === 'video') return (
      <>
        <a className="front-community-item" href={active.data.url} target="_blank" rel="noreferrer">
          <div className="front-community-thumb-wrap">
            <Image src={active.data.thumbnail} alt={active.data.title} fill sizes="384px" style={{ objectFit: 'cover' }} />
          </div>
          <p className="front-community-title">{active.data.title}</p>
          <p className="hint">{active.data.channelLabel} on YouTube</p>
        </a>
        <WorldMore href="/world?section=youtube">More videos</WorldMore>
      </>
    );
    return (
      <Link prefetch={false} className="front-community-item" href="/world?section=offline">
        <div className="front-community-thumb-wrap front-community-event-thumb">
          <span className="front-community-event-country">{active.data.country}</span>
        </div>
        <p className="front-community-title">{active.data.name}</p>
        <p className="hint">{formatEventWindow(active.data.startTime, active.data.endTime, zone)}</p>
      </Link>
    );
  };

  return (
    <section className="front-panel front-home-panel front-community-panel"
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPaused(false); }}>
      <h2 className="section-title">Community</h2>
      {/* Every slide is in the markup, stacked in one grid cell, and only the current one shows:
          the panel is as tall as its tallest slide, so turning one never moves the page
          (a long event name took a line more than a video's title). pan-y keeps vertical
          drags as native scroll; horizontal swipes flip slides. */}
      <div
        className="front-community-fade-wrap"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        style={{ touchAction: 'pan-y' }}
      >
        {slides.map((item, i) => (
          // visibility: hidden (front.css) takes the others out of the tab order and the accessibility tree.
          <div key={item.kind} className="front-community-slide" data-current={i === current ? '' : undefined}>
            {slide(item)}
          </div>
        ))}
      </div>

      {slides.length > 1 && (
        <div className="front-community-dots">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              className={`front-community-dot${i === current ? ' active' : ''}`}
              aria-label={`Show slide ${i + 1} of ${slides.length}`}
              aria-current={i === current}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
