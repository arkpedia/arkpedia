import { GetStaticProps } from 'next';
import Head from 'next/head';
import { getLiveTwitchStreams, TwitchStream } from '@/lib/community/twitch';
import { TWITCH_CATEGORY, TWITCH_STREAM_LIMIT } from '@/lib/community/twitchConfig';
import { CommunityEyebrow, TwitchCard } from '@/components/community/StreamCards';
import PageHeader from '@/components/ui/PageHeader';

interface Props {
  twitchStreams: TwitchStream[];
  hasTwitchCreds: boolean;
}

export default function TwitchLivePage({ twitchStreams, hasTwitchCreds }: Props) {
  return (
    <>
      <Head><title>Live on Twitch — Arkpedia</title></Head>

      <PageHeader eyebrow={<CommunityEyebrow />} title="Live on Twitch"
        sub={hasTwitchCreds ? `${twitchStreams.length} streams live right now in the Arknights category.` : 'Arknights streams from the community.'} />

      <main>
        {twitchStreams.length === 0 ? (
          <div className="waiting-box">
            <h2>{hasTwitchCreds ? 'No streams live right now' : 'Live feed unavailable'}</h2>
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
  const twitchClientId = process.env.TWITCH_CLIENT_ID;
  const twitchClientSecret = process.env.TWITCH_CLIENT_SECRET;
  const twitchStreams = await getLiveTwitchStreams(
    TWITCH_CATEGORY,
    TWITCH_STREAM_LIMIT,
    twitchClientId,
    twitchClientSecret
  );

  return {
    props: { twitchStreams, hasTwitchCreds: Boolean(twitchClientId && twitchClientSecret) },
    revalidate: 1500,
  };
};