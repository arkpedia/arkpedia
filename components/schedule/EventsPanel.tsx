import { useEffect, useRef, useState } from 'react';
import { useReaderClock } from '@/lib/time/readerClock';
import Link from 'next/link';
import Image from '@/components/content/ContentImage';
import CountdownTimer from '../ui/CountdownTimer';
import { eventShopEnd } from '@/lib/schedule/gameWindow';
import LocalTime from '@/components/ui/LocalTime';
import { useOfficialBroadcasts } from '@/lib/home/useOfficialBroadcasts';
import { featuredBroadcastGroups, BROADCAST_REGIONS, type BroadcastGroup } from '@/lib/home/officialBroadcasts';
import { GameEvent } from '@/lib/home/frontPageContent';

const SLIDE_INTERVAL_MS = 8000;
const PAUSE_AFTER_CLICK_MS = 30000;

type SlideItem = { key:string; event:GameEvent; isUpcoming:boolean; broadcast?:never } | { key:string; broadcast:BroadcastGroup; event?:never; isUpcoming?:never };

interface Props {
  ongoing: GameEvent[];
  upcoming: GameEvent | null;
  /** The request's clock (epoch ms), from the page's contentPageClock `now`: used by the
   *  server markup and the first client paint for event status. Required,
   *  because a panel that read the clock itself rendered the reader's answer over the
   *  server's and failed hydration once an event closed in between. */
  now: number;
}

export default function EventsPanel({ ongoing, upcoming, now }: Props) {
  // The request's clock first, so the markup and the first client paint agree; the
  // reader's after mount, re-read every second (it changes once a minute).
  const clock = useReaderClock(now, { tickMs: 1000 });
  const broadcasts = useOfficialBroadcasts();
  const slides: SlideItem[] = [
    ...featuredBroadcastGroups(broadcasts,clock).map(broadcast=>({key:broadcast.key,broadcast})),
    ...ongoing.map((event) => ({ key:event.name, event, isUpcoming: clock < event.start.getTime() })),
    ...(upcoming ? [{ key:upcoming.name, event: upcoming, isUpcoming: clock < upcoming.start.getTime() }] : []),
  ];

  const [activeKey, setActiveKey] = useState<string | null>(null);
  const slideKeys = JSON.stringify(slides.map(slide=>slide.key));
  const activeIndex = Math.max(0,slides.findIndex(slide=>slide.key===activeKey));
  const [paused, setPaused] = useState(false);
  const resumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (paused || slides.length <= 1) return;
    const interval = setInterval(() => {
      const keys = JSON.parse(slideKeys) as string[];
      setActiveKey(key => keys[(Math.max(0,keys.indexOf(key??''))+1)%keys.length]);
    }, SLIDE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [paused, slides.length, slideKeys]);

  useEffect(() => {
    return () => {
      if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current);
    };
  }, []);

  function selectSlide(i: number) {
    setActiveKey(slides[i].key);
    setPaused(true);
    if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current);
    resumeTimeoutRef.current = setTimeout(() => setPaused(false), PAUSE_AFTER_CLICK_MS);
  }

  if (slides.length === 0) {
    return (
      <section className="front-panel front-home-panel front-events-panel">
        <h2 className="section-title">Events</h2>
        <p className="hint">No events to show right now.</p>
      </section>
    );
  }

  const active = slides[Math.min(activeIndex, slides.length - 1)];
  // Stages closed, store still open: the event stays, counting down to the store's close.
  const shopEnd = active.event ? eventShopEnd(active.event) : null;
  const shopOnly = !!shopEnd && active.event && clock >= active.event.end.getTime();

  return (
    <section className="front-panel front-home-panel front-events-panel">
      <h2 className="section-title">Events</h2>
      {/* The event's own page. This was a button whose only effect was to pause the
          slideshow, which is not what a reader pressing an event expects. */}
      {active.broadcast ? <BroadcastSlide group={active.broadcast} now={clock} /> : <Link prefetch={false} href={`/events/${encodeURIComponent(active.event.name)}`} className="front-events-main">
        {/* The box keeps its size without art: a poster the image repository has not
            published yet is null (publishedArt), never a broken image. */}
        <div className="front-events-poster-wrap">
          {/* The first slide is the home page's hero at 1440 (its LCP), so it is fetched at
              once and first; the slides after it come in on screen, as the carousel turns. */}
          {active.event.poster && <Image src={active.event.poster} alt={active.event.name} fill sizes="600px" style={{ objectFit: 'contain' }} priority={activeIndex === 0} />}
        </div>
        <div className="front-events-info">
          <span className="front-events-name">{active.event.name}</span>
          {shopOnly
            ? <CountdownTimer target={shopEnd!} label="Stages closed · Shop closes in" closed />
            : <CountdownTimer start={active.event.start} target={active.event.end} />}
        </div>
      </Link>}

      {slides.length > 1 && (
        <div className="front-events-dots">
          {slides.map((s, i) => (
            <button
              type="button"
              key={s.key}
              className={`front-events-dot${i === activeIndex ? ' active' : ''}`}
              onClick={() => selectSlide(i)}
              /* Stage availability remains in the name; colour marks only the selected slide. */
              title={s.broadcast ? s.broadcast.primary.title : s.isUpcoming ? `${s.event.name} — not started yet` : clock >= s.event.end.getTime() ? `${s.event.name} — stages closed` : `${s.event.name} — stages open`}
              aria-label={s.broadcast ? s.broadcast.primary.title : s.isUpcoming ? `${s.event.name}, upcoming` : clock >= s.event.end.getTime() ? `${s.event.name}, stages closed` : `${s.event.name}, stages open`}
              aria-current={i === activeIndex}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function BroadcastSlide({group,now}:{group:BroadcastGroup;now:number}) {
  const broadcast=group.primary;
  return <>
    <a href={broadcast.url} target="_blank" rel="noopener noreferrer" className="front-events-main">
      <div className="front-events-poster-wrap">
        {broadcast.thumbnail && <Image src={broadcast.thumbnail} alt={broadcast.title} fill sizes="600px" style={{objectFit:'contain'}} />}
      </div>
      <div className="front-events-info">
        <span className={broadcast.status==='live'?'badge-live':'badge-upcoming'}>{broadcast.status==='live'?'Live now':Date.parse(broadcast.startsAt)<=now?'Starting soon':'Upcoming broadcast'}</span>
        <span className="front-events-name">{broadcast.game==='endfield'?'Endfield':'Arknights'} · {BROADCAST_REGIONS[broadcast.region]} — {broadcast.title} ↗</span>
        <LocalTime iso={broadcast.startsAt} precision="minute" />
        {broadcast.status==='upcoming'&&Date.parse(broadcast.startsAt)>now&&<CountdownTimer target={new Date(broadcast.startsAt)} label="Starts in" />}
      </div>
    </a>
    {group.others.length>0&&<ul className="front-broadcast-regions" aria-label="Other regional broadcasts">
      {group.others.map(other=><li key={other.id}>
        <a className="btn ghost btn-sm" href={other.url} target="_blank" rel="noopener noreferrer">{BROADCAST_REGIONS[other.region]}{other.status==='ended'?' replay':other.status==='live'?' · Live now':''} ↗</a>
        {' · '}<LocalTime iso={other.startsAt} precision="minute" />
      </li>)}
    </ul>}
  </>;
}
