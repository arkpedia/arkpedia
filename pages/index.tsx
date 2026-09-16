import { withContentPage } from '@/lib/content/server';
import { loadGameEvents } from '@/lib/home/frontPageContent';
import { getAllSkins } from '@/lib/skins/skins';
import { getBannersSortedByDate, type HeadhuntingBanner } from '@/lib/gacha/headhuntingBanners';
import { GetStaticProps } from 'next';
import { useEffect, useState } from 'react';
import AnnouncementTicker from '@/components/layout/AnnouncementTicker';
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
  getOngoingGachaBanners,
  getOngoingSkins,
  getCurrentFarmableMaterials,
} from '@/lib/home/frontPageContent';
import { Skin } from '@/lib/skins/skinTypes';
import { FarmingMaterial } from '@/lib/farming/farmingTypes';
import { getLatestVideos, enrichWithLiveStatus, YouTubeVideo } from '@/lib/music/youtube';
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
  __calendar?: { events: (Omit<GameEvent, 'start' | 'end'> & { start: string; end: string })[]; banners: HeadhuntingBanner[]; skins: Skin[] };
}

export default function HomePage({
  ongoingEvents,
  upcomingEvent,
  ongoingBanners,
  ongoingSkins,
  farmableMaterials,
  featuredStream,
  featuredVideo,
  earliestCommunityEvent,
}: Props) {
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

  return (
    <>
      {/* Home-page-only, not global -- see AnnouncementTicker.tsx. */}
      <AnnouncementTicker />
      <main className="front-page-layout">
        {/* The page's visual identity is the nav's wordmark, so the document
            outline gets its h1 invisibly -- without it the outline started at
            the panels' h2s with nothing above them. */}
        <h1 className="visually-hidden">Arkpedia — Arknights community hub</h1>
        <div className="front-page-left">
          <EventsPanel ongoing={deserializedEvents} upcoming={deserializedUpcoming} farmableMaterials={farmableMaterials} />
          <SkinsCarousel skins={ongoingSkins} />
          <section className="front-panel front-packs-panel">
            <h2>Packs</h2>
            <p className="hint">Coming soon.</p>
          </section>
        </div>
        <div className="front-page-right">
          <GachaBannersPanel banners={deserializedBanners} activeIndex={activeBannerIndex} onSelect={setActiveBannerIndex} />
          <FeaturedOperatorsPanel banner={activeBanner} />
          <CommunityFader stream={featuredStream} video={featuredVideo} event={earliestCommunityEvent} />
        </div>
      </main>
    </>
  );
}

// Recompute time-sensitive homepage selections during server revalidation.
async function finalizeHome(props: Props): Promise<Props> {
  const { __calendar, ...rest } = props;
  const now = new Date();
  const events = __calendar?.events.map(event => ({ ...event, start: new Date(event.start), end: new Date(event.end) }));
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
  return { ...rest,
    ongoingEvents: getOngoingEvents(now, events).map(serialize),
    upcomingEvent: upcoming ? serialize(upcoming) : null,
    ongoingBanners: getOngoingGachaBanners(now, __calendar?.banners).map(banner => ({ ...banner, start: banner.start.toISOString(), end: banner.end.toISOString() })),
    ongoingSkins: getOngoingSkins(now, __calendar?.skins, events),
    featuredVideo: videos[0] || null, featuredStream: streams[0] || null, earliestCommunityEvent: communityEvent,
  };
}

export const getStaticProps: GetStaticProps<Props> = withContentPage<Props>('/', async () => ({ props: {
  ongoingEvents: [], upcomingEvent: null, ongoingBanners: [], ongoingSkins: [],
  farmableMaterials: getCurrentFarmableMaterials(), featuredStream: null, featuredVideo: null, earliestCommunityEvent: null,
  // Stored in the data release, consumed on the server, and never sent to the browser.
  __calendar: { events: loadGameEvents().map(event => ({ ...event, start: event.start.toISOString(), end: event.end.toISOString() })), banners: getBannersSortedByDate(), skins: getAllSkins() },
} }), { finalize: finalizeHome, revalidate: 1500 });
