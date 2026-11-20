import { useEffect, useRef, useState } from 'react';
import { useReaderClock } from '@/lib/time/readerClock';
import Link from 'next/link';
import Image from '@/components/content/ContentImage';
import CountdownTimer from '../ui/CountdownTimer';
import { eventShopEnd } from '@/lib/schedule/gameWindow';
import ExternalLinkIcon from '@/components/ui/ExternalLinkIcon';
import LocalTime from '@/components/ui/LocalTime';
import { useOfficialBroadcasts } from '@/lib/home/useOfficialBroadcasts';
import { featuredBroadcastGroups, BROADCAST_REGIONS, type BroadcastGroup } from '@/lib/home/officialBroadcasts';
import type { GameEvent } from '@/lib/home/frontPageContent';
import { broadcastStartCard, gameEventStartCard, type EventStartCard } from '@/lib/home/eventStartTimes';
import type { RegionalSchedule } from '@/lib/time/regional';
import type { GameServer } from '@/lib/time/servers.mjs';
import EventStartTimesDialog from './EventStartTimesDialog';

const SLIDE_INTERVAL_MS = 8000;
const PAUSE_AFTER_CLICK_MS = 30000;

type SlideItem = { key:string; event:GameEvent; isUpcoming:boolean; broadcast?:never } | { key:string; broadcast:BroadcastGroup; event?:never; isUpcoming?:never };

interface Props {
  ongoing: GameEvent[];
  upcoming: GameEvent | null;
  server?: GameServer;
  regionalEvents?: RegionalSchedule['events'];
  /** The request's clock (epoch ms), from the page's contentPageClock `now`: used by the
   *  server markup and the first client paint for event status. Required,
   *  because a panel that read the clock itself rendered the reader's answer over the
   *  server's and failed hydration once an event closed in between. */
  now: number;
}

export default function EventsPanel({ ongoing, upcoming, now, server = 'en', regionalEvents }: Props) {
  // Keep the first paint on the request clock. After mount, retire the start-time
  // button at the scheduled second, including for a livestream.
  const clock = useReaderClock(now, { tickMs: 1000, precision: 'second', onFocus: true });
  const {broadcasts,featuredLiveIds} = useOfficialBroadcasts();
  const slides: SlideItem[] = [
    ...featuredBroadcastGroups(broadcasts,clock,featuredLiveIds).map(broadcast=>({key:broadcast.key,broadcast})),
    ...ongoing.map((event) => ({ key:event.name, event, isUpcoming: clock < event.start.getTime() })),
    ...(upcoming ? [{ key:upcoming.name, event: upcoming, isUpcoming: clock < upcoming.start.getTime() }] : []),
  ];

  const [activeKey, setActiveKey] = useState<string | null>(null);
  const slideKeys = JSON.stringify(slides.map(slide=>slide.key));
  const activeIndex = Math.max(0,slides.findIndex(slide=>slide.key===activeKey));
  const [paused, setPaused] = useState(false);
  const [startCard, setStartCard] = useState<EventStartCard | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const resumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showingStartCard = startCard !== null;

  useEffect(() => {
    if (paused || showingStartCard || slides.length <= 1) return;
    const interval = setInterval(() => {
      if (panelRef.current?.querySelector('.front-event-start-trigger:focus')) return;
      const keys = JSON.parse(slideKeys) as string[];
      setActiveKey(key => keys[(Math.max(0,keys.indexOf(key??''))+1)%keys.length]);
    }, SLIDE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [paused, showingStartCard, slides.length, slideKeys]);

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

  return (
    <section ref={panelRef} className="front-panel front-home-panel front-events-panel">
      <h2 className="section-title">Events</h2>
      {slides.length === 0 && <p className="hint">No events to show right now.</p>}
      {/* Overlap the slides in one grid cell so the tallest caption reserves the space
          for every selection, including broadcasts with regional links. */}
      <div className="front-events-slides">
        {slides.map((slide, index) => {
          const current = index === activeIndex;
          const shopEnd = slide.event ? eventShopEnd(slide.event) : null;
          const shopOnly = !!shopEnd && slide.event && clock >= slide.event.end.getTime();
          const card = slide.broadcast ? broadcastStartCard(slide.broadcast.primary)
            : gameEventStartCard(slide.event, server, regionalEvents?.[slide.event.name]);
          const showStartTimes = clock < card.instant && (!slide.broadcast || slide.broadcast.primary.status === 'upcoming');
          return <div key={slide.key} className="front-events-slide" data-current={current ? '' : undefined} inert={!current}>
            {slide.broadcast ? <BroadcastSlide group={slide.broadcast} now={clock} showArtwork={current} /> : <Link prefetch={false} href={`/events/${encodeURIComponent(slide.event.name)}`} className="front-events-main">
              <div className="front-events-poster-wrap">
                {current && slide.event.poster && <Image src={slide.event.poster} alt={slide.event.name} fill sizes="600px" style={{ objectFit: 'contain' }} priority={index === 0} />}
              </div>
              <div className="front-events-info">
                <span className="front-events-name">{slide.event.name}</span>
                {shopOnly
                  ? <CountdownTimer target={shopEnd!} label="Stages closed · Shop closes in" closed />
                  : <CountdownTimer start={slide.event.start} target={slide.event.end} />}
              </div>
            </Link>}
            {showStartTimes && <div className="front-event-poster-actions">
              <button type="button" className="btn btn-icon scrim-control front-event-start-trigger" title="Start times" aria-haspopup="dialog" aria-label={`Start times for ${card.title}`} onClick={() => {
                setActiveKey(slide.key);
                setStartCard(card);
              }}>
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" aria-hidden="true" focusable="false">
                  <circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v4.8l3 1.9" />
                </svg>
              </button>
            </div>}
          </div>;
        })}
      </div>

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
      {startCard && <EventStartTimesDialog card={startCard} onClose={() => setStartCard(null)} />}
    </section>
  );
}

function BroadcastSlide({group,now,showArtwork}:{group:BroadcastGroup;now:number;showArtwork:boolean}) {
  const broadcast=group.primary;
  return <>
    <a href={broadcast.url} target="_blank" rel="noopener noreferrer" className="front-events-main">
      <div className="front-events-poster-wrap">
        {showArtwork && broadcast.thumbnail && <Image src={broadcast.thumbnail} alt={broadcast.title} fill sizes="600px" style={{objectFit:'contain'}} />}
      </div>
      <div className="front-events-info">
        <span className={broadcast.status==='live'?'badge-live':'badge-upcoming'}>{broadcast.status==='live'?'Live now':Date.parse(broadcast.startsAt)<=now?'Starting soon':'Upcoming broadcast'}</span>
        <span className="front-events-name">{broadcast.game==='endfield'?'Endfield':'Arknights'} · {BROADCAST_REGIONS[broadcast.region]} — {broadcast.title} <ExternalLinkIcon /></span>
        <LocalTime iso={broadcast.startsAt} precision="minute" />
        {broadcast.status==='upcoming'&&Date.parse(broadcast.startsAt)>now&&<CountdownTimer target={new Date(broadcast.startsAt)} label="Starts in" />}
      </div>
    </a>
    {group.others.length>0&&<ul className="front-broadcast-regions" aria-label="Other regional broadcasts">
      {group.others.map(other=><li key={other.id}>
        <a className="btn ghost btn-sm" href={other.url} target="_blank" rel="noopener noreferrer">{BROADCAST_REGIONS[other.region]}{other.status==='ended'?' replay':other.status==='live'?' · Live now':''} <ExternalLinkIcon /></a>
        {' · '}<LocalTime iso={other.startsAt} precision="minute" />
      </li>)}
    </ul>}
  </>;
}
