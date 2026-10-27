import { GetStaticProps } from 'next';
import Head from 'next/head';
import { useLiveTwitchStreams } from '@/lib/community/useLiveTwitchStreams';
import { CommunityEyebrow, TwitchCard } from '@/components/community/StreamCards';
import PageHeader from '@/components/ui/PageHeader';

type Props = Record<string, never>;

export default function TwitchLivePage() {
  const { streams: twitchStreams, available: hasTwitchCreds, loading } = useLiveTwitchStreams();
  return (
    <>
      <Head><title>Live on Twitch — Arkpedia</title></Head>

      <PageHeader eyebrow={<CommunityEyebrow />} title="Live on Twitch"
        sub={loading ? 'Checking live Arknights streams…' : hasTwitchCreds ? `${twitchStreams.length} streams live right now in the Arknights category.` : 'Arknights streams from the community.'} />

      <main>
        {twitchStreams.length === 0 ? (
          <div className="waiting-box">
            <h2>{loading ? 'Checking live streams…' : hasTwitchCreds ? 'No streams live right now' : 'Live feed unavailable'}</h2>
            {!hasTwitchCreds && <p className="hint">We can’t check who is live at the moment.</p>}
            <a href="https://www.twitch.tv/directory/category/arknights" className="ghost" target="_blank" rel="noopener noreferrer">Browse Arknights on Twitch</a>
          </div>
        ) : (
          <div className="video-grid">
            {twitchStreams.map((s) => (
              <TwitchCard key={s.userLogin} s={s} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}

export const getStaticProps: GetStaticProps<Props> = async () => {
  return {
    props: {},
    revalidate: 1500,
  };
};
