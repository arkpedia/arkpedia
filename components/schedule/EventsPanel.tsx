import { activeEventFarming } from '@/lib/farming/eventFarming';
import { useEffect, useRef, useState } from 'react';
import { useReaderClock } from '@/lib/time/readerClock';
import Link from 'next/link';
import Image from '@/components/content/ContentImage';
import CountdownTimer from '../ui/CountdownTimer';
import { GameEvent } from '@/lib/home/frontPageContent';
import { FarmingMaterial } from '@/lib/farming/farmingTypes';

const SLIDE_INTERVAL_MS = 8000;
const PAUSE_AFTER_CLICK_MS = 30000;

interface SlideItem {
  event: GameEvent;
  isUpcoming: boolean;
}

interface Props {
  ongoing: GameEvent[];
  upcoming: GameEvent | null;
  farmableMaterials: FarmingMaterial[];
  /** The request's clock (epoch ms), from the page's contentPageClock `now`: what the
   *  server markup and the first client paint pick the boosted materials by. Required,
   *  because a panel that read the clock itself rendered the reader's answer over the
   *  server's and failed hydration once an event closed in between. */
  now: number;
}

export default function EventsPanel({ ongoing, upcoming, farmableMaterials, now }: Props) {
  // The request's clock first, so the markup and the first client paint agree; the
  // reader's after mount, re-read every second (it changes once a minute).
  const clock = useReaderClock(now, { tickMs: 1000 });
  const currentMaterials = activeEventFarming(farmableMaterials, clock);
  const slides: SlideItem[] = [
    ...ongoing.map((event) => ({ event, isUpcoming: clock < event.start.getTime() })),
    ...(upcoming ? [{ event: upcoming, isUpcoming: clock < upcoming.start.getTime() }] : []),
  ];

  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const resumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (paused || slides.length <= 1) return;
    const interval = setInterval(() => {
      setActiveIndex((i) => (i + 1) % slides.length);
    }, SLIDE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [paused, slides.length]);

  useEffect(() => {
    return () => {
      if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current);
    };
  }, []);

  function selectSlide(i: number) {
    setActiveIndex(i);
    setPaused(true);
    if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current);
    resumeTimeoutRef.current = setTimeout(() => setPaused(false), PAUSE_AFTER_CLICK_MS);
  }

  if (slides.length === 0) {
    return (
      <section className="front-panel front-home-panel front-events-panel">
        <h2 className="section-title">Events</h2>
        <p className="hint">No events to show right now.</p>
        {currentMaterials.length > 0 && <FarmableInline materials={currentMaterials} />}
      </section>
    );
  }

  const active = slides[Math.min(activeIndex, slides.length - 1)];

  return (
    <section className="front-panel front-home-panel front-events-panel">
      <h2 className="section-title">Events</h2>
      {/* The event's own page. This was a button whose only effect was to pause the
          slideshow, which is not what a reader pressing an event expects. */}
      <Link prefetch={false} href={`/events/${encodeURIComponent(active.event.name)}`} className="front-events-main">
        {/* The box keeps its size without art: a poster the image repository has not
            published yet is null (publishedArt), never a broken image. */}
        <div className="front-events-poster-wrap">
          {/* The first slide is the home page's hero at 1440 (its LCP), so it is fetched at
              once and first; the slides after it come in on screen, as the carousel turns. */}
          {active.event.poster && <Image src={active.event.poster} alt={active.event.name} fill sizes="600px" style={{ objectFit: 'contain' }} priority={activeIndex === 0} />}
        </div>
        <div className="front-events-info">
          <span className="front-events-name">{active.event.name}</span>
          <CountdownTimer start={active.event.start} target={active.event.end} />
        </div>
      </Link>

      {slides.length > 1 && (
        <div className="front-events-dots">
          {slides.map((s, i) => (
            <button
              type="button"
              key={s.event.name}
              className={`front-events-dot${i === activeIndex ? ' active' : ''}${s.isUpcoming ? ' upcoming' : ''}`}
              onClick={() => selectSlide(i)}
              /* The amber pip means "not started yet", which is worth saying in
                 words too -- a colour is only a legend if you have seen one. */
              title={s.isUpcoming ? `${s.event.name} — not started yet` : s.event.name}
              aria-label={s.isUpcoming ? `${s.event.name}, upcoming` : s.event.name}
              aria-current={i === activeIndex}
            />
          ))}
        </div>
      )}

      <FarmableInline materials={currentMaterials} />
    </section>
  );
}

/** More than one active event may offer the same material. */
function farmLocationLabel(material: FarmingMaterial): string {
  return [...new Set(material.stages.map(stage => stage.label))].join(' · ');
}

function FarmableInline({ materials }: { materials: FarmingMaterial[] }) {
  if (materials.length === 0) {
    return (
      <div className="front-events-farmable">
        <h3>Currently Farmable</h3>
        <p className="hint">No event-boosted materials right now.</p>
      </div>
    );
  }
  return (
    <div className="front-events-farmable">
      <h3>Currently Farmable</h3>
      <div className="front-materials-grid">
        {materials.map((m) => (
          <div className="front-material-item" key={m.name} title={m.name}>
            {/* Twice the box. These icons are the ringed art, so the material
                itself occupies only the middle ~two thirds of the frame -- asking
                for exactly 40px left the object rendered at about 26. */}
            <Image src={m.icon} alt={m.name} width={80} height={80} quality={85} style={{ width: 40, height: 40 }} />
            <span>{farmLocationLabel(m)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}