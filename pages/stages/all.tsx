import { withContentPage } from '@/lib/content/server';
import { GetStaticProps } from 'next';
import Head from 'next/head';
import StageModeBrowser from '@/components/stages/StageModeBrowser';
import TerminalNav from '@/components/stages/TerminalNav';
import { getModeCounts, getStageModeCards } from '@/lib/stages/stageContents';
import { StageModeCard } from '@/lib/stages/stageTypes';

interface Props {
  cards: StageModeCard[];
  counts: Record<string, number>;
  /** The build's clock, in unix seconds. */
  now: number;
}

export default function AllOperationsPage({ cards, counts, now }: Props) {
  return (
    <>
      <Head><title>All Operations — Arkpedia</title></Head>

      <TerminalNav current="all" />
      {/* The same slim two-line head the stage pages carry. */}
      <div className="terminal-head">
        <div className="eyebrow">Rhodes Island // Terminal</div>
        <h1>All Operations</h1>
        <p className="sub">
          Every chapter, event and mode the game has run -- 
          the Terminal&apos;s own sections show what is open and what is permanent, this shows
          the lot.
        </p>
      </div>

      <main>
        <StageModeBrowser cards={cards} counts={counts} now={now} />
      </main>
    </>
  );
}

export const getStaticProps: GetStaticProps<Props> = withContentPage<Props>("/stages/all", async () => {
  const cards = getStageModeCards();
  return { props: { cards, counts: getModeCounts(cards), now: Math.floor(Date.now() / 1000) } };
});
