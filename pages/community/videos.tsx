import { GetStaticProps } from 'next';
import PageMeta from '@/components/layout/PageMeta';
import { enrichWithLiveStatus, YouTubeVideo } from '@/lib/music/youtube';
import { getLatestVideos } from '@/lib/music/youtubeFeedsServer';
import { youtubeChannels, VIDEOS_PER_CHANNEL } from '@/lib/music/youtubeConfig';
import { filterDiscoveryVideos } from '@/lib/music/youtubeDiscovery';
import { loadVideoArchive } from '@/lib/music/youtubeArchiveServer';
import { loadVideoDiscoveryContext } from '@/lib/music/youtubeContextServer';
import type { VideoDiscoveryContext } from '@/lib/music/youtubeRelevance';
import { useReaderClock } from '@/lib/time/readerClock';
import { CommunityEyebrow } from '@/components/community/StreamCards';
import YouTubeVideoGallery from '@/components/community/YouTubeVideoGallery';
import SearchInput from '@/components/ui/SearchInput';
import { useQueryState } from '@/lib/hooks/useQueryState';
import PageHeader from '@/components/ui/PageHeader';

interface Props {
  videos: YouTubeVideo[];
  videoContext: VideoDiscoveryContext;
  now: number;
}

export default function VideosPage({ videos, videoContext, now }: Props) {
  const [query, setQuery] = useQueryState('q');
  const clock = useReaderClock(now, { tickMs: 60_000, onFocus: true });
  return (
    <>
      <PageMeta title="Videos" description="The latest Arknights videos from official and community YouTube channels." path="/community/videos" />

      <PageHeader eyebrow={<CommunityEyebrow />} title="Videos" sub={`${videos.length} videos from the configured channels.`} />

      <main>
        <SearchInput label="Search videos or creators" placeholder="Video or creator" value={query} onChange={setQuery} />
        <YouTubeVideoGallery videos={videos} query={query} now={clock} context={videoContext} grouped={false} />
      </main>
    </>
  );
}

export const getStaticProps: GetStaticProps<Props> = async () => {
  const rawVideos = await getLatestVideos(await youtubeChannels(), VIDEOS_PER_CHANNEL);
  const youtubeApiKey = process.env.YOUTUBE_API_KEY;
  const enriched = await enrichWithLiveStatus(rawVideos, youtubeApiKey);
  const now = Date.now();
  const [archived, videoContext] = await Promise.all([loadVideoArchive(), loadVideoDiscoveryContext(now)]);
  const videos = filterDiscoveryVideos([...enriched, ...archived].filter((v) => !v.isLivestream));

  return { props: { videos, videoContext, now }, revalidate: 1500 };
};
