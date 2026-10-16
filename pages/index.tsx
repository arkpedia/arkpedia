import { useRegionalTime } from '@/lib/time/useRegionalTime';
import { regionalBanners, regionalGameEvents, regionalSkinWindows } from '@/lib/time/regional';
import { useReaderClock } from '@/lib/time/readerClock';
import { parseBannerWindow } from '@/lib/gacha/realGachaBanners';
import { getEventFarmingMaterials } from '@/lib/farming/eventFarming';
import { withContentPage } from '@/lib/content/server';
import { parseGameWindow } from '@/lib/schedule/gameWindow';
import { loadGameEvents } from '@/lib/home/frontPageContent';
import { getAllSkins } from '@/lib/skins/skins';
import { availableSkins, getSkinWindows, type SkinWindow } from '@/lib/skins/skinAvailability';
import { withLocalConfirmedSkinWindows } from '@/lib/skins/localSkinWindows';
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
import FeaturedOperatorsPanel from '@/components/home/FeaturedOperatorsPanel';
import SkinsCarousel from '@/components/skins/SkinsCarousel';
import CommunityFader from '@/components/home/CommunityFader';
import {
  GameEvent,
  GachaBannerWithWindow,
  getOngoingEvents,
  getNextUpcomingEvent,
  getHomeGachaBanners,
  getOngoingSkins,
} from '@/lib/home/frontPageContent';
import { Skin } from '@/lib/skins/skinTypes';
import { FarmingMaterial } from '@/lib/farming/farmingTypes';
import { enrichWithLiveStatus, YouTubeVideo } from '@/lib/music/youtube';
import { getLatestVideos } from '@/lib/music/youtubeFeedsServer';
import { YOUTUBE_CHANNELS, VIDEOS_PER_CHANNEL } from '@/lib/music/youtubeConfig';
import { filterBannedByTitle } from '@/lib/music/contentFilter';
import { getLiveTwitchStreams, TwitchStream } from '@/lib/community/twitch';
import { TWITCH_CATEGORY, TWITCH_STREAM_LIMIT } from '@/lib/community/twitchConfig';
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
  earliestCommunityEvent: CommunityEvent | null;
  /** The request's clock (epoch ms, to the minute), which contentPageClock adds
   *  (lib/content/pageClock.ts). finalizeHome picks the panels' rows by it, and the
   *  Events panel's first paint uses it too, so the server markup and hydration agree. */
  now: number;
  regionalCalendar?: { events: SerializedGameEvent[]; banners: HeadhuntingBanner[]; skinWindows: SkinWindow[]; skins: Skin[] };
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
  featuredStream,
  featuredVideo,
  earliestCommunityEvent,
  now: requestNow,
  regionalCalendar,
}: Props) {
  const { server, schedule } = useRegionalTime();
  const now = useReaderClock(requestNow, { tickMs: 1000, onFocus: true });
  const selected = useMemo(() => {
    if (server === 'en' || !regionalCalendar) return { ongoingEvents: globalOngoing, upcomingEvent: globalUpcoming, ongoingBanners: globalBanners, ongoingSkins: globalSkins };
    const events = regionalGameEvents(regionalCalendar.events, schedule, server);
    const ongoingEvents = events.filter(event => Date.parse(event.start) <= now && now < Date.parse(event.shopEndAt ?? event.end));
    const upcomingEvent = events.filter(event => Date.parse(event.start) > now).sort((a, b) => Date.parse(a.start) - Date.parse(b.start))[0] ?? null;
    const banners = regionalBanners(regionalCalendar.banners, schedule, server).flatMap(banner => {
      const window = parseBannerWindow(banner);
      return window ? [{ ...banner, start: window.start.toISOString(), end: window.end.toISOString() }] : [];
    });
    const active = banners.filter(banner => Date.parse(banner.start) <= now && now < Date.parse(banner.end));
    const next = banners.filter(banner => Date.parse(banner.start) > now).sort((a, b) => Date.parse(a.start) - Date.parse(b.start))[0];
    const windows = regionalSkinWindows(regionalCalendar.skinWindows, schedule, server);
    return { ongoingEvents, upcomingEvent, ongoingBanners: next ? [...active, next] : active,
      ongoingSkins: availableSkins(regionalCalendar.skins, windows, new Date(now)) };
  }, [server, schedule, now, regionalCalendar, globalOngoing, globalUpcoming, globalBanners, globalSkins]);
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
      {/* Home-page-only, not global -- see AnnouncementTicker.tsx. */}
      <AnnouncementTicker sssCycle={sssCycle} />
      <main className="front-page-layout">
        {/* The page's visual identity is the nav's wordmark, so the document
            outline gets its h1 invisibly -- without it the outline started at
            the panels' h2s with nothing above them. */}
        <h1 className="visually-hidden">Arkpedia — Arknights community hub</h1>
        <div className="front-page-left">
          <EventsPanel ongoing={deserializedEvents} upcoming={deserializedUpcoming} farmableMaterials={farmableMaterials} now={now} />
          <SkinsCarousel skins={ongoingSkins} />
          {/* A "Packs -- Coming soon" panel stood here. Placeholders stay hidden until
              they have content (decision of 2026-09-25). */}
        </div>
        <div className="front-page-right">
          <GachaBannersPanel banners={deserializedBanners} activeIndex={activeBannerIndex} onSelect={setActiveBannerIndex} now={now} />
          <FeaturedOperatorsPanel banner={activeBanner} />
          <CommunityFader stream={featuredStream} video={featuredVideo} event={earliestCommunityEvent} />
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
  const rawVideos = await getLatestVideos(YOUTUBE_CHANNELS, VIDEOS_PER_CHANNEL);
  const enrichedVideos = await enrichWithLiveStatus(rawVideos, process.env.YOUTUBE_API_KEY);
  const videos = filterBannedByTitle(enrichedVideos.filter(video => !video.isLivestream));
  const streams = await getLiveTwitchStreams(TWITCH_CATEGORY, TWITCH_STREAM_LIMIT, process.env.TWITCH_CLIENT_ID, process.env.TWITCH_CLIENT_SECRET);
  const communityEvent = [...EVENTS].filter(event => {
    const end = event.endTime ? new Date(event.endTime) : new Date(new Date(event.startTime).getTime() + 86400000);
    return end.getTime() >= now.getTime();
  }).sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())[0] || null;
  const regional = (props as Props & { __contentTables?: { 'regional-schedules'?: import('@/lib/time/regional').RegionalSchedules } }).__contentTables?.['regional-schedules'];
  const regionalIds = new Set(Object.entries(regional?.servers ?? {}).filter(([server]) => server !== 'en').flatMap(([, schedule]) => (schedule as { skinWindows?: SkinWindow[] }).skinWindows?.flatMap(window => window.skinIds) ?? []));
  return { ...rest,
    ...(__calendar ? { regionalCalendar: { events: __calendar.events.map(event => ({ ...event, shopEndAt: event.shopEndAt ?? event.end })), banners: __calendar.banners.map(banner => ({ name: banner.name, category: banner.category, cn_date: null, global_date: null, six_stars: banner.six_stars, five_stars: banner.five_stars, rate_up_six_stars: banner.rate_up_six_stars ?? [], pull_type: banner.pull_type, year: banner.year, linked_event: banner.linked_event ?? null, banner_image: banner.banner_image ?? null, lineupSource: banner.lineupSource ?? 'wiki' })), skinWindows: __calendar.skinWindows ?? [], skins: __calendar.skins.filter(skin => regionalIds.has(`${skin.model} / ${skin.name}`)).map(skin => ({ ...skin, searchAliases: skin.searchAliases ?? [] })) } } : {}),
    ongoingEvents: getOngoingEvents(now, events).map(serialize),
    upcomingEvent: upcoming ? serialize(upcoming) : null,
    ongoingBanners: getHomeGachaBanners(now, __calendar?.banners).map(banner => ({ ...banner, start: banner.start.toISOString(), end: banner.end.toISOString() })),
    // What is on sale now, as /skins' Available now tab has it. A release from before the
    // windows were stored falls back to the old match against running events.
    ongoingSkins: __calendar?.skinWindows
      ? availableSkins(__calendar.skins, withLocalConfirmedSkinWindows(__calendar.skinWindows), now)
      : getOngoingSkins(now, __calendar?.skins, events),
    featuredVideo: videos[0] || null, featuredStream: streams[0] || null, earliestCommunityEvent: communityEvent,
  };
}

export const getStaticProps: GetStaticProps<Props> = withContentPage<Props>('/', async () => ({ props: {
  ongoingEvents: [], upcomingEvent: null, ongoingBanners: [], ongoingSkins: [],
  farmableMaterials: getEventFarmingMaterials((await import('@/data/event-farming.json')).default.drops), featuredStream: null, featuredVideo: null, earliestCommunityEvent: null,
  // Stored in the data release, consumed on the server, and never sent to the browser.
  __calendar: {
    events: loadGameEvents().map(event => ({ ...event, start: event.start.toISOString(), end: event.end.toISOString() })), banners: getBannersSortedByDate(), skins: getAllSkins(),
    skinWindows: getSkinWindows(getAllSkins(), getAllEvents(), {
      confirmed: (await import('@/data/skin-availability-windows.json')).default,
      rotations: (await import('@/data/skin-shop-rotations.json')).default,
    }),
  },
} }), { finalize: finalizeHome, revalidate: 1500, tables: {
  // Only what the ticker reads: the record's own "about" stays in data/.
  'sss-cycle': async () => { const { version, cycleEnd, periodDays } = checkSssCycle((await import('@/data/sss-cycle.json')).default); return { version, cycleEnd, periodDays }; },
} });
