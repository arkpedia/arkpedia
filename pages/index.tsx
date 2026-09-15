import { GetStaticProps } from 'next';
import { useEffect, useState } from 'react';
import AnnouncementTicker from '@/components/AnnouncementTicker';
import EventsPanel from '@/components/EventsPanel';
import GachaBannersPanel from '@/components/GachaBannersPanel';
import FeaturedOperatorsPanel from '@/components/FeaturedOperatorsPanel';
import SkinsCarousel from '@/components/SkinsCarousel';
import CommunityFader from '@/components/CommunityFader';
import {
  GameEvent,
  GachaBannerWithWindow,
  getOngoingEvents,
  getNextUpcomingEvent,
  getOngoingGachaBanners,
  getOngoingSkins,
  getCurrentFarmableMaterials,
} from '@/lib/frontPageContent';
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

// Note: dates are computed at BUILD time here, so "ongoing" status is
// only as fresh as the last build/deploy -- fine for events/banners
// that last days to weeks, but if this site rebuilds infrequently,
// consider revalidate (ISR) or moving this check to getServerSideProps
// instead.
export const getStaticProps: GetStaticProps<Props> = async () => {
  const now = new Date();
  const ongoingEvents = getOngoingEvents(now).map((e) => ({ ...e, start: e.start.toISOString(), end: e.end.toISOString() }));
  const upcoming = getNextUpcomingEvent(now);
  const upcomingEvent = upcoming ? { ...upcoming, start: upcoming.start.toISOString(), end: upcoming.end.toISOString() } : null;
  const ongoingBanners = getOngoingGachaBanners(now).map((b) => ({ ...b, start: b.start.toISOString(), end: b.end.toISOString() }));
  const ongoingSkins = getOngoingSkins(now);
  const farmableMaterials = getCurrentFarmableMaterials();

  const youtubeApiKey = process.env.YOUTUBE_API_KEY;
  const rawVideos = await getLatestVideos(YOUTUBE_CHANNELS, VIDEOS_PER_CHANNEL);
  const enrichedVideos = await enrichWithLiveStatus(rawVideos, youtubeApiKey);
  const nonLivestreamVideos = filterBannedByTitle(enrichedVideos.filter((v) => !v.isLivestream));
  const featuredVideo = nonLivestreamVideos[0] || null;

  const twitchClientId = process.env.TWITCH_CLIENT_ID;
  const twitchClientSecret = process.env.TWITCH_CLIENT_SECRET;
  const twitchStreams = await getLiveTwitchStreams(TWITCH_CATEGORY, TWITCH_STREAM_LIMIT, twitchClientId, twitchClientSecret);
  const featuredStream = twitchStreams[0] || null;

  const earliestCommunityEvent =
    [...EVENTS]
      .filter((e) => {
        const end = e.endTime ? new Date(e.endTime) : new Date(new Date(e.startTime).getTime() + 24 * 60 * 60 * 1000);
        return end.getTime() >= now.getTime();
      })
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())[0] || null;

  return {
    props: {
      ongoingEvents,
      upcomingEvent,
      ongoingBanners,
      ongoingSkins,
      farmableMaterials,
      featuredStream,
      featuredVideo,
      earliestCommunityEvent,
    },
    revalidate: 1500,
  };
};