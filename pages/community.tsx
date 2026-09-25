import { GetStaticProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { getLatestVideos, enrichWithLiveStatus, YouTubeVideo } from '@/lib/music/youtube';
import { YOUTUBE_CHANNELS, VIDEOS_PER_CHANNEL } from '@/lib/music/youtubeConfig';
import { filterArknightsVideos } from '@/lib/music/contentFilter';
import { getLiveTwitchStreams, TwitchStream } from '@/lib/community/twitch';
import { TWITCH_CATEGORY, TWITCH_STREAM_LIMIT } from '@/lib/community/twitchConfig';
import { EVENTS } from '@/lib/schedule/eventsConfig';
import { CommunityEvent } from '@/lib/schedule/eventTypes';
import WorldMapEvents from '@/components/schedule/WorldMapEvents';
import EventListPanel from '@/components/schedule/EventListPanel';
import FadeCarousel from '@/components/ui/FadeCarousel';
import PageHeader from '@/components/ui/PageHeader';
import { VideoCard, TwitchCard } from '@/components/community/StreamCards';
import { getEventStatus } from '@/lib/maps/mapProjection';

const CAROUSEL_MAX_ITEMS = 4;

interface Props {
  videos: YouTubeVideo[];
  twitchStreams: TwitchStream[];
  events: CommunityEvent[];
  /** When these props were made: the event panels render from it until they mount. */
  now: number;
  hasYouTubeApiKey: boolean;
  hasTwitchCreds: boolean;
}

export default function CommunityHub({
  videos,
  twitchStreams,
  events,
  now,
  hasYouTubeApiKey,
  hasTwitchCreds,
}: Props) {
  const nothingAtAll = videos.length === 0 && twitchStreams.length === 0;
  /* Events still worth travelling to, at the page's clock. When every configured event
     has ended the page used to open on a 480px block of them plus a map labelled
     "Ended"; it now says so in one line and points at the schedule. */
  const activeEvents = events.filter((ev) => getEventStatus(ev.startTime, ev.endTime, now) !== 'ended');

  return (
    <>
      <Head><title>Community Hub — Arkpedia</title></Head>

      <PageHeader eyebrow="Rhodes Island // Broadcast Feed" title="Community Hub" sub="Community events, live streams and videos." />

      <main>
        {nothingAtAll && (
          <div className="waiting-box">
            <h2>No videos found</h2>
            <p className="hint">The community feed is temporarily unavailable.</p>
          </div>
        )}

        {/* Map + events: the event list as a left panel, the map to its right;
            on a phone the map comes first and the list below it. */}
        <section className="op-section community-events" aria-labelledby="community-events-title">
          <h2 id="community-events-title">Community events</h2>
          {activeEvents.length > 0 ? (
            <div className="community-map-row">
              <div className="community-event-panel">
                <EventListPanel events={activeEvents} now={now} />
              </div>
              <div className="community-map-main">
                <WorldMapEvents events={activeEvents} now={now} />
              </div>
            </div>
          ) : (
            <p className="community-events-empty">
              No upcoming community events. <Link prefetch={false} href="/schedule" className="ghost btn-sm">See the schedule</Link>
            </p>
          )}
        </section>

        {/* Twitch + YouTube: each its own fade-carousel, up to 4 items
            shown 2 at a time, rather than a click-to-scroll row. */}
        <div className="community-feeds">
          <section className="op-section">
            <div className="live-section-heading-row">
              <h2>Live on Twitch</h2>
              <Link prefetch={false} href="/community/twitch" className="ghost btn-sm">
                Show all
              </Link>
            </div>
            {twitchStreams.length > 0 ? (
              <FadeCarousel
                items={twitchStreams.slice(0, CAROUSEL_MAX_ITEMS)}
                perPage={2}
                renderItem={(s) => <TwitchCard s={s} />}
              />
            ) : (
              <p className="hint">No one&apos;s live on Twitch right now.</p>
            )}
          </section>

          <section className="op-section">
            <div className="live-section-heading-row">
              <h2>YouTube videos</h2>
              <Link prefetch={false} href="/community/videos" className="ghost btn-sm">
                Show all
              </Link>
            </div>
            {videos.length > 0 ? (
              <FadeCarousel
                items={videos.slice(0, CAROUSEL_MAX_ITEMS)}
                perPage={2}
                renderItem={(v) => <VideoCard v={v} />}
              />
            ) : (
              <p className="hint">No videos found.</p>
            )}
          </section>
        </div>

        {/* Setup notes for whoever runs the site, never for readers: they named
            environment variables and a source file on the public page. */}
        {process.env.NODE_ENV === 'development' && (!hasYouTubeApiKey || !hasTwitchCreds) && !nothingAtAll && (
          <div className="hint" style={{ marginTop: 16 }}>
            {!hasYouTubeApiKey && (
              <p>
                Set <code>YOUTUBE_API_KEY</code> so livestreams can be correctly excluded from the Videos panel.
              </p>
            )}
            {!hasTwitchCreds && (
              <p>
                Set <code>TWITCH_CLIENT_ID</code> and <code>TWITCH_CLIENT_SECRET</code>, and confirm the
                category in <code>lib/twitchConfig.ts</code>, to show live Twitch streams.
              </p>
            )}
          </div>
        )}
      </main>
    </>
  );
}

export const getStaticProps: GetStaticProps<Props> = async () => {
  const rawVideos = await getLatestVideos(YOUTUBE_CHANNELS, VIDEOS_PER_CHANNEL);
  const youtubeApiKey = process.env.YOUTUBE_API_KEY;
  const enriched = await enrichWithLiveStatus(rawVideos, youtubeApiKey);

  // Livestreams (live or not) are dropped from display entirely, and
  // every remaining video must mention Arknights and not mention any
  // banned other-game keyword -- some configured channels post mixed
  // content, and this panel is specifically an Arknights feed.
  const videos = filterArknightsVideos(enriched.filter((v) => !v.isLivestream));

  const twitchClientId = process.env.TWITCH_CLIENT_ID;
  const twitchClientSecret = process.env.TWITCH_CLIENT_SECRET;
  const twitchStreams = await getLiveTwitchStreams(
    TWITCH_CATEGORY,
    TWITCH_STREAM_LIMIT,
    twitchClientId,
    twitchClientSecret
  );

  return {
    props: {
      videos,
      twitchStreams,
      events: EVENTS,
      now: Date.now(),
      hasYouTubeApiKey: Boolean(youtubeApiKey),
      hasTwitchCreds: Boolean(twitchClientId && twitchClientSecret),
    },
    revalidate: 1500,
  };
};
