import type { GetStaticPaths, GetStaticProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { VideoCard } from '@/components/community/StreamCards';
import { COMMUNITY_CREATORS, getCommunityCreator, type CommunityCreator } from '@/lib/community/creators';
import { filterArknightsVideos } from '@/lib/music/contentFilter';
import { enrichWithLiveStatus, getLatestVideos, type YouTubeVideo } from '@/lib/music/youtube';

interface Props {
  creator: CommunityCreator;
  videos: YouTubeVideo[];
}

export default function CreatorPage({ creator, videos }: Props) {
  return (
    <>
      <Head><title>{`${creator.label} — Arkpedia Creators`}</title></Head>
      <header className="creator-page-header">
        <div>
          <div className="eyebrow">Rhodes Island // Creator Directory</div>
          <Link prefetch={false} href="/community/creators" className="hint">← All creators</Link>
          <h1>{creator.label}</h1>
          <p className="sub">Latest Arknights videos from this channel.</p>
        </div>
        <a className="ghost creator-channel-link" href={creator.youtubeUrl} target="_blank" rel="noreferrer">Open YouTube ↗</a>
      </header>
      <main>
        {videos.length > 0 ? (
          <div className="video-grid">
            {videos.map((video) => <VideoCard key={video.videoId} v={video} />)}
          </div>
        ) : (
          <div className="waiting-box">
            <h2>No recent Arknights videos found</h2>
            <a href={creator.youtubeUrl} target="_blank" rel="noreferrer" className="ghost">Visit the channel</a>
          </div>
        )}
      </main>
    </>
  );
}

// Creator feeds are external and occasionally slow. Generating all of them during
// every website deployment added roughly two minutes of network waiting. Build the
// lightweight directory immediately, then generate a valid profile on first visit
// and cache it through the same 25-minute ISR window as the community feed.
export const getStaticPaths: GetStaticPaths = async () => ({ paths: [], fallback: 'blocking' });

export const getStaticProps: GetStaticProps<Props> = async ({ params }) => {
  const slug = typeof params?.slug === 'string' ? params.slug : '';
  const creator = getCommunityCreator(slug);
  if (!creator) return { notFound: true };
  const rawVideos = await getLatestVideos([creator], 12);
  const enriched = await enrichWithLiveStatus(rawVideos, process.env.YOUTUBE_API_KEY);
  const videos = filterArknightsVideos(enriched.filter((video) => !video.isLivestream));
  return { props: { creator, videos }, revalidate: 1500 };
};
