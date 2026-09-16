import { withContentPage } from '@/lib/content/server';
import { GetStaticProps } from 'next';
import Image from '@/components/content/ContentImage';
import Link from 'next/link';
import Rail from '@/components/ui/Rail';
import ModeMark from '@/components/stages/ModeMark';
import TerminalNav from '@/components/stages/TerminalNav';
import { getModeCardsOfKind } from '@/lib/stages/terminal';
import { StageModeCard } from '@/lib/stages/stageTypes';

/**
 * Long-Term Exploration: the two modes that never close.
 *
 * The game gives this section two enormous art cards and a way into every theme
 * behind them. Every theme IS here rather than behind a second press, because unlike
 * the game we are not showing a live account -- a reader looking for IS2 wants to
 * see that it exists.
 */
interface Props {
  is: StageModeCard[];
  ra: StageModeCard[];
}

export default function ExplorationPage({ is, ra }: Props) {
  return (
    <>
      <TerminalNav current="exploration" />
      <div className="terminal-head">
        <div className="eyebrow">Rhodes Island // Terminal</div>
        <h1><ModeMark name="integrated-strategies.svg" className="head-mark" />Long-Term Exploration</h1>
        <p className="sub">
          The two modes that are always open: every Integrated Strategies theme, and every
          season of Reclamation Algorithm.
        </p>
      </div>

      <main className="terminal-scene">
        <Mode label="Integrated Strategies" cards={is} />
        <Mode label="Reclamation Algorithm" cards={ra} />
      </main>
    </>
  );
}

function Mode({ label, cards }: { label: string; cards: StageModeCard[] }) {
  if (!cards.length) return null;
  const [latest, ...rest] = cards;
  return (
    <section className="explore-mode">
      <h2 className="score-block-title">{label}</h2>

      {/* The newest theme at the size the game gives it, the rest as a rail under it.
          Which is what the game's own "View all Themes" leads to. */}
      <Link prefetch={false} href={`/stages/content/${latest.id}`} scroll={false} className="explore-hero">
        <span className="explore-hero-art">
          {latest.art
            ? <Image src={latest.art} alt="" fill sizes="(max-width: 900px) 100vw, 1000px" />
            : <span className="terminal-row-art-none" />}
        </span>
        <span className="explore-hero-text">
          <span className="explore-hero-kind">{latest.label || 'Current'}</span>
          <span className="explore-hero-name">{latest.name}</span>
          <span className="explore-hero-meta">{latest.count} stages</span>
        </span>
      </Link>

      {rest.length > 0 && (
        <Rail className="score-rail explore-rail">
          {rest.map((card) => (
            <Link prefetch={false} key={card.id} href={`/stages/content/${card.id}`} scroll={false} className="score-node">
              <span className="score-node-pin" aria-hidden="true" />
              <span className="score-node-art">
                {card.art
                  ? <Image src={card.art} alt="" fill sizes="(max-width: 700px) 55vw, 240px" />
                  : <span className="score-node-art-none">{card.label || '--'}</span>}
              </span>
              <span className="score-node-foot">
                {card.label && <span className="score-node-code">{card.label}</span>}
                <span className="score-node-name">{card.name}</span>
              </span>
              <span className="score-node-meta">{card.count} stages</span>
            </Link>
          ))}
        </Rail>
      )}
    </section>
  );
}

export const getStaticProps: GetStaticProps<Props> = withContentPage<Props>("/stages/exploration", async () => ({
  props: {
    is: getModeCardsOfKind('integrated_strategies'),
    ra: getModeCardsOfKind('reclamation'),
  },
}));
