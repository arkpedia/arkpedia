import { GetStaticProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { getLatestVideos, enrichWithLiveStatus, YouTubeVideo } from '@/lib/music/youtube';
import { YOUTUBE_CHANNELS, VIDEOS_PER_CHANNEL } from '@/lib/music/youtubeConfig';
import { filterArknightsVideos } from '@/lib/music/contentFilter';
import { VideoCard } from '@/components/StreamCards';

interface Props {
  liveNow: YouTubeVideo[];
  hasYouTubeApiKey: boolean;
}

export default function YouTubeLivePage({ liveNow, hasYouTubeApiKey }: Props) {
  return (
    <>
      <Head><title>Live on YouTube — Arkpedia</title></Head>

      <header>
        <div className="eyebrow">Rhodes Island // Broadcast Feed</div>
        <Link prefetch={false} href="/community" className="hint">
          ← Back to Community Hub
        </Link>
        <h1>Live on YouTube</h1>
        <p className="sub">{hasYouTubeApiKey ? `${liveNow.length} channels live right now.` : 'Arknights livestreams from the community.'}</p>
      </header>

      <main>
        {liveNow.length === 0 ? (
          <div className="waiting-box">
            <h2>{hasYouTubeApiKey ? 'No channels live right now' : 'Live feed unavailable'}</h2>
            {!hasYouTubeApiKey && <p className="hint">We can’t check who is live at the moment.</p>}
            <Link href="/community/videos" className="ghost">Browse community videos</Link>
          </div>
        ) : (
          <div className="video-grid">
            {liveNow.map((v) => (
              <VideoCard key={v.videoId} v={v} live />
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
  const liveNow = filterArknightsVideos(enriched.filter((v) => v.liveStatus === 'live'));

  return {
    props: { liveNow, hasYouTubeApiKey: Boolean(youtubeApiKey) },
    revalidate: 1500,
  };
};