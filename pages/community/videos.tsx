import { GetStaticProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { getLatestVideos, enrichWithLiveStatus, YouTubeVideo } from '@/lib/music/youtube';
import { YOUTUBE_CHANNELS, VIDEOS_PER_CHANNEL } from '@/lib/music/youtubeConfig';
import { filterArknightsVideos } from '@/lib/music/contentFilter';
import { VideoCard } from '@/components/community/StreamCards';

interface Props {
  videos: YouTubeVideo[];
}

export default function VideosPage({ videos }: Props) {
  return (
    <>
      <Head><title>Videos — Arkpedia</title></Head>

      <header>
        <div className="eyebrow">Rhodes Island // Broadcast Feed</div>
        <Link prefetch={false} href="/community" className="hint">
          ← Back to Community Hub
        </Link>
        <h1>Videos</h1>
        <p className="sub">{videos.length} videos from the configured channels.</p>
      </header>

      <main>
        {videos.length === 0 ? (
          <div className="waiting-box">
            <h2>No videos found</h2>
          </div>
        ) : (
          <div className="video-grid">
            {videos.map((v) => (
              <VideoCard key={v.videoId} v={v} />
            ))}
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
  const videos = filterArknightsVideos(enriched.filter((v) => !v.isLivestream));

  return { props: { videos }, revalidate: 1500 };
};
