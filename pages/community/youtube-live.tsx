import { GetStaticProps } from 'next';
import PageMeta from '@/components/layout/PageMeta';
import Link from 'next/link';
import { enrichWithLiveStatus, YouTubeVideo } from '@/lib/music/youtube';
import { getLatestVideos } from '@/lib/music/youtubeFeedsServer';
import { youtubeChannels, VIDEOS_PER_CHANNEL } from '@/lib/music/youtubeConfig';
import { filterArknightsVideos } from '@/lib/music/contentFilter';
import { CommunityEyebrow, VideoCard } from '@/components/community/StreamCards';
import PageHeader from '@/components/ui/PageHeader';

interface Props {
  liveNow: YouTubeVideo[];
  hasYouTubeApiKey: boolean;
}

export default function YouTubeLivePage({ liveNow, hasYouTubeApiKey }: Props) {
  return (
    <>
      <PageMeta title="Live on YouTube" description="Arknights streams live on YouTube right now." path="/community/youtube-live" />

      <PageHeader eyebrow={<CommunityEyebrow />} title="Live on YouTube"
        sub={hasYouTubeApiKey ? `${liveNow.length} channels live right now.` : 'Arknights livestreams from the community.'} />

      <main>
        {liveNow.length === 0 ? (
          <div className="waiting-box">
            <h2>{hasYouTubeApiKey ? 'No channels live right now' : 'Live feed unavailable'}</h2>
            {!hasYouTubeApiKey && <p className="hint">We can’t check who is live at the moment.</p>}
            <Link href="/world/videos" className="ghost">Browse community videos</Link>
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
  const rawVideos = await getLatestVideos(await youtubeChannels(), VIDEOS_PER_CHANNEL);
  const youtubeApiKey = process.env.YOUTUBE_API_KEY;
  const enriched = await enrichWithLiveStatus(rawVideos, youtubeApiKey);
  const liveNow = filterArknightsVideos(enriched.filter((v) => v.liveStatus === 'live'));

  return {
    props: { liveNow, hasYouTubeApiKey: Boolean(youtubeApiKey) },
    revalidate: 1500,
  };
};