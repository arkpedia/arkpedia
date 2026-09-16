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
import { VideoCard, TwitchCard } from '@/components/community/StreamCards';

const CAROUSEL_MAX_ITEMS = 4;

interface Props {
  videos: YouTubeVideo[];
  twitchStreams: TwitchStream[];
  events: CommunityEvent[];
  hasYouTubeApiKey: boolean;
  hasTwitchCreds: boolean;
}

export default function CommunityHub({
  videos,
  twitchStreams,
  events,
  hasYouTubeApiKey,
  hasTwitchCreds,
}: Props) {
  const nothingAtAll = videos.length === 0 && twitchStreams.length === 0;

  return (
    <>
      <Head><title>Community Hub — Arkpedia</title></Head>

      <header>
        <div className="eyebrow">Rhodes Island // Broadcast Feed</div>
        <h1>Community Hub</h1>
      </header>

      <main>
        {nothingAtAll && (
          <div className="waiting-box">
            <h2>No videos found</h2>
            <p className="hint">
              Check that a real channel ID is set in <code>lib/youtubeConfig.ts</code>.
            </p>
          </div>
        )}

        {/* Map + events: event list as a left panel, map as the main
            area to its right -- stacks to map-on-top, events-below on
            mobile instead of squeezing both into a narrow row. */}
        <section className="op-section" style={{ marginBottom: 20 }}>
          <div className="community-map-row">
            <div className="community-event-panel">
              <EventListPanel events={events} />
            </div>
            <div className="community-map-main">
              <WorldMapEvents events={events} />
            </div>
          </div>
        </section>

        <style jsx>{`
          .community-map-row {
            display: flex;
            gap: 16px;
            align-items: stretch;
          }
          .community-event-panel {
            flex: 0 0 260px;
            max-height: 480px;
            /* The list outgrows the cap; without its own scroll context it
               paints straight over the Twitch/YouTube sections below. */
            overflow-y: auto;
          }
          .community-map-main {
            flex: 1;
            min-width: 0;
          }
          @media (max-width: 640px) {
            .community-map-row {
              flex-direction: column;
            }
            .community-map-main {
              order: -1; /* map first, events panel below it */
            }
            .community-event-panel {
              flex: 0 0 auto;
              max-height: 320px;
            }
          }
        `}</style>

        {/* Twitch + YouTube: each its own fade-carousel, up to 4 items
            shown 2 at a time, rather than a click-to-scroll row. */}
        <div style={{ display: 'flex', gap: 20, marginBottom: 20, flexWrap: 'wrap' }}>
          <section className="op-section" style={{ flex: '1 1 400px', minWidth: 0 }}>
            <div className="live-section-heading-row">
              <h2 className="live-section-heading live-section-heading-twitch">● Live on Twitch</h2>
              <Link prefetch={false} href="/community/twitch" className="see-more-link">
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

          <section className="op-section" style={{ flex: '1 1 400px', minWidth: 0 }}>
            <div className="live-section-heading-row">
              <h2>YouTube Videos</h2>
              <Link prefetch={false} href="/community/videos" className="see-more-link">
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

        {/* Art + Cosplayer: both coming soon. */}
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <section className="op-section" style={{ flex: '1 1 400px', minWidth: 0 }}>
            <h2>Art</h2>
            <p className="hint">Coming soon.</p>
          </section>
          <section className="op-section" style={{ flex: '1 1 400px', minWidth: 0 }}>
            <h2>Cosplayer</h2>
            <p className="hint">Coming soon.</p>
          </section>
        </div>

        {(!hasYouTubeApiKey || !hasTwitchCreds) && !nothingAtAll && (
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
      hasYouTubeApiKey: Boolean(youtubeApiKey),
      hasTwitchCreds: Boolean(twitchClientId && twitchClientSecret),
    },
    revalidate: 1500,
  };
};