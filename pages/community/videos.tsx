import { GetStaticProps } from 'next';
import PageMeta from '@/components/layout/PageMeta';
import { useState } from 'react';
import { enrichWithLiveStatus, YouTubeVideo } from '@/lib/music/youtube';
import { getLatestVideos } from '@/lib/music/youtubeFeedsServer';
import { YOUTUBE_CHANNELS, VIDEOS_PER_CHANNEL } from '@/lib/music/youtubeConfig';
import { filterArknightsVideos } from '@/lib/music/contentFilter';
import { CommunityEyebrow, VideoCard } from '@/components/community/StreamCards';
import LoadOnScroll from '@/components/ui/LoadOnScroll';
import PageHeader from '@/components/ui/PageHeader';

/** Cards per batch: six rows of four in the frame. The whole feed was 61 cards and
 *  16,886px tall on a phone; the rest arrive as the reader scrolls. */
const PAGE = 24;

interface Props {
  videos: YouTubeVideo[];
}

export default function VideosPage({ videos }: Props) {
  const [shown, setShown] = useState(PAGE);
  return (
    <>
      <PageMeta title="Videos" description="The latest Arknights videos from official and community YouTube channels." path="/community/videos" />

      <PageHeader eyebrow={<CommunityEyebrow />} title="Videos" sub={`${videos.length} videos from the configured channels.`} />

      <main>
        {videos.length === 0 ? (
          <div className="waiting-box">
            <h2>No videos found</h2>
          </div>
        ) : (
          <>
            <div className="video-grid">
              {videos.slice(0, shown).map((v) => (
                <VideoCard key={v.videoId} v={v} />
              ))}
            </div>
            <LoadOnScroll shown={shown} total={videos.length} onMore={() => setShown((n) => n + PAGE)} />
          </>
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
