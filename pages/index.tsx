import { useRegionalTime } from '@/lib/time/useRegionalTime';
import { SITE_DESCRIPTION } from '@/lib/seo/site';
import PageMeta from '@/components/layout/PageMeta';
import { regionalBanners, regionalGameEvents, regionalScheduleSlice, regionalSkinWindows, stripRegionalTimingSources } from '@/lib/time/regional';
import { useReaderClock } from '@/lib/time/readerClock';
import { parseBannerWindow } from '@/lib/gacha/realGachaBanners';
import { getEventFarmingMaterials } from '@/lib/farming/eventFarming';
import { withContentPage } from '@/lib/content/server';
import { parseGameWindow } from '@/lib/schedule/gameWindow';
import { loadGameEvents } from '@/lib/home/frontPageContent';
import { getAllSkins } from '@/lib/skins/skins';
import { availableSkins, getSkinWindows, type SkinWindow } from '@/lib/skins/skinAvailability';
import { getAllEvents } from '@/lib/schedule/schedule';
import type { HeadhuntingBanner } from '@/lib/gacha/headhuntingBanners';
import { getBannersSortedByDate } from '@/lib/gacha/headhuntingBannerData';
import { GetStaticProps } from 'next';
import { useEffect, useState, useMemo } from 'react';
import AnnouncementTicker from '@/components/layout/AnnouncementTicker';
import { useReleaseTable } from '@/lib/content/context';
import { checkSssCycle, type SssCycle } from '@/lib/schedule/sssCycle';
import EventsPanel from '@/components/schedule/EventsPanel';
import GachaBannersPanel from '@/components/home/GachaBannersPanel';
import FarmableMaterialsPanel from '@/components/home/FarmableMaterialsPanel';
import FeaturedOperatorsPanel from '@/components/home/FeaturedOperatorsPanel';
import SkinsCarousel from '@/components/skins/SkinsCarousel';
import CommunityFader from '@/components/home/CommunityFader';
import MaintenanceNotice from '@/components/home/MaintenanceNotice';
import { currentRegionalMaintenance, type RegionalMaintenance } from '@/lib/home/maintenance';
import { readMaintenanceWindows } from '@/lib/home/maintenanceServer';
import {
  GameEvent,
  GachaBannerWithWindow,
  getOngoingEvents,
  getNextUpcomingEvent,
  getHomeGachaBanners,
  getOngoingSkins,
} from '@/lib/home/frontPageContent';
import { Skin } from '@/lib/skins/skinTypes';
import { withSkinArtwork } from '@/lib/skins/dynamicArtFallback';
import { FarmingMaterial } from '@/lib/farming/farmingTypes';
import { enrichWithLiveStatus, YouTubeVideo } from '@/lib/music/youtube';
import { getLatestVideos } from '@/lib/music/youtubeFeedsServer';
import { youtubeChannels, VIDEOS_PER_CHANNEL } from '@/lib/music/youtubeConfig';
import { featuredChannelVideos } from '@/lib/music/youtubeDiscovery';
import { loadVideoDiscoveryContext } from '@/lib/music/youtubeContextServer';
import { loadVideoArchive } from '@/lib/music/youtubeArchiveServer';
import type { VideoDiscoveryContext } from '@/lib/music/youtubeRelevance';
import type { TwitchStream } from '@/lib/community/twitch';
import { EVENTS } from '@/lib/schedule/eventsConfig';
import { CommunityEvent } from '@/lib/schedule/eventTypes';

// Serialized variants -- getStaticProps can only return JSON-safe data,
// so start/end travel as ISO strings and get converted back to real
// Date objects client-side before being handed to the panels below.
type SerializedGameEvent = Omit<GameEvent, 'start' | 'end'> & { start: string; end: string };
type SerializedGachaBanner = Omit<GachaBannerWithWindow, 'start' | 'end'> & { start: string; end: string };

interface Props {
  ongoingEvents: SerializedGameEvent[];
  upcomingEvent: SerializedGameEvent | null;
  ongoingBanners: SerializedGachaBanner[];
  ongoingSkins: Skin[];
  farmableMaterials: FarmingMaterial[];
  featuredStream: TwitchStream | null;
  featuredVideo: YouTubeVideo | null;
  featuredVideos?: YouTubeVideo[];
  videoContext?: VideoDiscoveryContext;
  earliestCommunityEvent: CommunityEvent | null;
  /** Each server's maintenance announced in game and not over (lib/home/maintenance.ts): the
   *  notice above the panels and the ticker. Absent from releases before it, so finalize fills it. */
  maintenance: RegionalMaintenance;
  /** The request's clock (epoch ms, to the minute), which contentPageClock adds
   *  (lib/content/pageClock.ts). finalizeHome picks the panels' rows by it, and the
   *  Events panel's first paint uses it too, so the server markup and hydration agree. */
  now: number;
  __calendar?: {
    events: (Omit<GameEvent, 'start' | 'end'> & { start: string; end: string })[]; banners: HeadhuntingBanner[]; skins: Skin[];
    /** Every outfit's acquisition windows, from the release's tables, as /skins has them
     *  (getSkinWindows). Absent in releases from before the carousel read them. */
    skinWindows?: SkinWindow[];
  };
}

export default function HomePage({
  ongoingEvents: globalOngoing,
  upcomingEvent: globalUpcoming,
  ongoingBanners: globalBanners,
  ongoingSkins: globalSkins,
  farmableMaterials: globalMaterials,
  featuredVideo,
  featuredVideos,
  videoContext,
  earliestCommunityEvent,
  maintenance,
  now: requestNow,
}: Props) {
  const { server, schedule } = useRegionalTime();
  const now = useReaderClock(requestNow, { tickMs: 1000, onFocus: true });
  /* JP and KR show Global's panels one to one, in Global's order, on the server's own dates
     where it has them (lib/time/regional.ts). Only a server window that has already closed takes
     an item off, as Global's own close would. This path once picked and sorted its own items
     from the whole calendar: CN-predicted events and banners vanished, and the banners lost
     the panel's category order. */
  const selected = useMemo(() => {
    if (server === 'en') return { ongoingEvents: globalOngoing, upcomingEvent: globalUpcoming, ongoingBanners: globalBanners, ongoingSkins: globalSkins };
    const ongoingEvents = regionalGameEvents(globalOngoing, schedule, server).filter(event => now < Date.parse(event.shopEndAt ?? event.end));
    const [upcomingEvent = null] = regionalGameEvents(globalUpcoming ? [globalUpcoming] : [], schedule, server);
    const ongoingBanners = regionalBanners(globalBanners, schedule, server).map(banner => {
      const window = parseBannerWindow(banner);
      return window ? { ...banner, start: window.start.toISOString(), end: window.end.toISOString() } : banner;
    }).filter(banner => now < Date.parse(banner.end));
    return { ongoingEvents, upcomingEvent, ongoingBanners, ongoingSkins: globalSkins };
  }, [server, schedule, now, globalOngoing, globalUpcoming, globalBanners, globalSkins]);
  const { ongoingEvents, upcomingEvent, ongoingBanners, ongoingSkins } = selected;
  const farmableMaterials = useMemo(() => server === 'en' ? globalMaterials : getEventFarmingMaterials(schedule?.farming ?? []), [globalMaterials, server, schedule]);
  useEffect(() => {
    document.body.classList.add('front-page-no-scroll');
    return () => document.body.classList.remove('front-page-no-scroll');
  }, []);

  const deserializedEvents: GameEvent[] = ongoingEvents.map((e) => ({ ...e, start: new Date(e.start), end: new Date(e.end) }));
  const deserializedUpcoming: GameEvent | null = upcomingEvent
    ? { ...upcomingEvent, start: new Date(upcomingEvent.start), end: new Date(upcomingEvent.end) }
    : null;
  const deserializedBanners: GachaBannerWithWindow[] = ongoingBanners.map((b) => ({ ...b, start: new Date(b.start), end: new Date(b.end) }));

  // Lifted here (rather than kept local to GachaBannersPanel) so
  // FeaturedOperatorsPanel, in the right column, always shows the
  // lineup for whichever banner is currently displayed on the left.
  const [activeBannerIndex, setActiveBannerIndex] = useState(0);
  const activeBanner = deserializedBanners[Math.min(activeBannerIndex, deserializedBanners.length - 1)] || null;
  /* The release's SSS cycle, for the ticker's countdown (lib/content/tables.mjs). */
  const sssCycle = useReleaseTable<SssCycle>('sss-cycle');

  return (
    <>
      <PageMeta fullTitle="Arkpedia — Arknights operators, planners and schedule" title="Arkpedia" description={SITE_DESCRIPTION} path="/" />
      {/* Home-page-only, not global -- see AnnouncementTicker.tsx. */}
      <AnnouncementTicker sssCycle={sssCycle} maintenance={maintenance} />
      <main className="front-page-layout">
        {/* The page's visual identity is the nav's wordmark, so the document
            outline gets its h1 invisibly -- without it the outline started at
            the panels' h2s with nothing above them. */}
        <h1 className="visually-hidden">Arkpedia — Arknights community hub</h1>
        <MaintenanceNotice maintenance={maintenance} now={now} />
        {/* The hero panels share one row so their bottoms meet. Below them the
            columns stack independently; current farming stays outside the carousel. */}
        <div className="front-hero-row">
          <EventsPanel ongoing={deserializedEvents} upcoming={deserializedUpcoming} now={now} />
          <GachaBannersPanel banners={deserializedBanners} activeIndex={activeBannerIndex} onSelect={setActiveBannerIndex} now={now} />
        </div>
        <div className="front-page-left">
          <FarmableMaterialsPanel materials={farmableMaterials} now={now} />
          <SkinsCarousel skins={ongoingSkins} />
          {/* A "Packs -- Coming soon" panel stood here. Placeholders stay hidden until
              they have content (decision of 2026-09-25). */}
        </div>
        <div className="front-page-right">
          <FeaturedOperatorsPanel banner={activeBanner} />
          <CommunityFader videos={featuredVideos ?? (featuredVideo ? [featuredVideo] : [])} context={videoContext} now={now} event={earliestCommunityEvent} />
        </div>
      </main>
    </>
  );
}

// Recompute time-sensitive homepage selections during server revalidation, at the
// request's clock -- the same `now` the page renders its first paint from.
async function finalizeHome(props: Props): Promise<Props> {
  const { __calendar, ...rest } = props;
  if (!Number.isFinite(props.now)) throw new Error('/ needs the request clock: it is in CLOCK_UNITS (lib/content/pageClock.ts), and finalize never runs for an export');
  const now = new Date(props.now);
  // Older releases serialized an assumed reset hour. Reparse date-only records
  // with the shared rules; new releases also carry the exact startAt/endAt.
  const events = __calendar?.events.flatMap(event => {
    const window = parseGameWindow(event.dateRange, event);
    return window ? [{ ...event, ...window }] : [];
  });
  const serialize = (event: GameEvent) => ({ ...event, start: event.start.toISOString(), end: event.end.toISOString() });
  const upcoming = getNextUpcomingEvent(now, events);
  const rawVideos = await getLatestVideos(await youtubeChannels(), VIDEOS_PER_CHANNEL);
  const enrichedVideos = await enrichWithLiveStatus(rawVideos, process.env.YOUTUBE_API_KEY);
  const [videoContext, archivedVideos] = await Promise.all([loadVideoDiscoveryContext(props.now), loadVideoArchive()]);
  const videos = featuredChannelVideos([...enrichedVideos, ...archivedVideos], props.now, videoContext);
  const communityEvent = [...EVENTS].filter(event => {
    const end = event.endTime ? new Date(event.endTime) : new Date(new Date(event.startTime).getTime() + 86400000);
    return end.getTime() >= now.getTime();
  }).sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())[0] || null;
  const regional = (props as Props & { __contentTables?: { 'regional-schedules'?: import('@/lib/time/regional').RegionalSchedules } }).__contentTables?.['regional-schedules'];
  // JP and KR read these same panels with their own dates (HomePage), so no other calendar ships.
  const ongoingEvents = getOngoingEvents(now, events).map(serialize);
  const upcomingEvent = upcoming ? serialize(upcoming) : null;
  const ongoingBanners = getHomeGachaBanners(now, __calendar?.banners).map(banner => ({ ...banner, start: banner.start.toISOString(), end: banner.end.toISOString() }));
  /* The regional table arrives with every server's every event and banner window ever run,
     720 kB in the HTML of every home visit (2026-10-27). The panels read only the windows of
     the rows they show, by name, on each server (regionalGameEvents, regionalBanners); the
     rest of the table (skin windows, farming, the weekly and SSS calendars) stays whole. */
  const tables = (rest as Props & { __contentTables?: Record<string, unknown> }).__contentTables;
  const sliced = regional && stripRegionalTimingSources(regionalScheduleSlice(regional, {
    events: [...ongoingEvents.map(event => event.name), ...(upcomingEvent ? [upcomingEvent.name] : [])],
    banners: ongoingBanners.map(banner => banner.name),
  }));
  /* The farming rows the same way: the Events panel lists a stage only while its window runs
     (activeEventFarming), so a window that has closed is never shown. Those still to open
     stay, for a page left open until one does. */
  const lightTables = sliced && tables ? { ...tables, 'regional-schedules': { ...sliced, servers: Object.fromEntries(Object.entries(sliced.servers).map(([server, schedule]) => [server,
    schedule?.farming ? { ...schedule, farming: schedule.farming.filter(drop => Date.parse(drop.endAt) > props.now) } : schedule])) } } : tables;
  return { ...rest, ...(lightTables ? { __contentTables: lightTables } : {}),
    ongoingEvents, upcomingEvent, ongoingBanners,
    farmableMaterials: rest.farmableMaterials.map(material => ({ ...material, stages: material.stages.filter(stage => !stage.endAt || Date.parse(stage.endAt) > props.now) })).filter(material => material.stages.length),
    // What is on sale now, as /skins' Available now tab has it. A release from before the
    // windows were stored falls back to the old match against running events.
    ongoingSkins: await withSkinArtwork(__calendar?.skinWindows
      ? availableSkins(__calendar.skins, regionalSkinWindows(__calendar.skinWindows, regional?.servers?.en, 'en'), now)
      : getOngoingSkins(now, __calendar?.skins, events)),
    featuredVideo: videos[0] || null, featuredVideos: videos, videoContext, featuredStream: null, earliestCommunityEvent: communityEvent,
    // A release from before the regions, which held Global's list alone, counts as Global's.
    maintenance: currentRegionalMaintenance(Array.isArray(props.maintenance) ? { en: props.maintenance } : props.maintenance ?? {}, props.now),
  };
}

export const getStaticProps: GetStaticProps<Props> = withContentPage<Props>('/', async () => ({ props: {
  ongoingEvents: [], upcomingEvent: null, ongoingBanners: [], ongoingSkins: [],
  farmableMaterials: getEventFarmingMaterials((await import('@/data/event-farming.json')).default.drops), featuredStream: null, featuredVideo: null, featuredVideos: [], earliestCommunityEvent: null,
  maintenance: readMaintenanceWindows(),
  // Stored in the data release, consumed on the server, and never sent to the browser.
  __calendar: {
    events: loadGameEvents().map(event => ({ ...event, start: event.start.toISOString(), end: event.end.toISOString() })), banners: getBannersSortedByDate(), skins: await withSkinArtwork(getAllSkins()),
    skinWindows: getSkinWindows(getAllSkins(), getAllEvents(), {
      confirmed: (await import('@/data/skin-availability-windows.json')).default,
      rotations: (await import('@/data/skin-shop-rotations.json')).default,
    }),
  },
} }), { finalize: finalizeHome, revalidate: 1500, tables: {
  // Only what the ticker reads: the record's own "about" stays in data/.
  'sss-cycle': async () => { const { version, cycleEnd, periodDays } = checkSssCycle((await import('@/data/sss-cycle.json')).default); return { version, cycleEnd, periodDays }; },
} });
