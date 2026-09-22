import { activeEventFarming } from '@/lib/farming/eventFarming';
import { useEffect, useRef, useState } from 'react';
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
}

export default function EventsPanel({ ongoing, upcoming, farmableMaterials }: Props) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const currentMaterials = activeEventFarming(farmableMaterials, (now ?? new Date()).getTime());
  const slides: SlideItem[] = [
    ...ongoing.map((event) => ({ event, isUpcoming: now ? now < event.start : false })),
    ...(upcoming ? [{ event: upcoming, isUpcoming: now ? now < upcoming.start : true }] : []),
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
      <section className="front-panel front-events-panel">
        <h2>Events</h2>
        <p className="hint">No events to show right now.</p>
        {currentMaterials.length > 0 && <FarmableInline materials={currentMaterials} />}
      </section>
    );
  }

  const active = slides[Math.min(activeIndex, slides.length - 1)];

  return (
    <section className="front-panel front-events-panel">
      <h2>Events</h2>
      <button type="button" className="front-events-main" onClick={() => selectSlide(activeIndex)}>
        <div className="front-events-poster-wrap">
          <Image src={active.event.poster} alt={active.event.name} fill sizes="600px" style={{ objectFit: 'contain' }} />
        </div>
        <div className="front-events-info">
          <span className="front-events-name">{active.event.name}</span>
          <CountdownTimer start={active.event.start} target={active.event.end} />
        </div>
      </button>

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