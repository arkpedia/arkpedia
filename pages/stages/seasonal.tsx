import { withContentPage } from '@/lib/content/server';
import PageMeta from '@/components/layout/PageMeta';
import { GetStaticProps } from 'next';
import Image from '@/components/content/ContentImage';
import ContentCardLink, { NoMapNote } from '@/components/ui/ContentCardLink';
import Rail from '@/components/ui/Rail';
import ModeMark from '@/components/stages/ModeMark';
import TerminalNav from '@/components/stages/TerminalNav';
import PageHeader from '@/components/ui/PageHeader';
import { getSeasonalChallenge, seasonalFromRelease, SeasonalChallenge } from '@/lib/stages/terminal';
import { StageModeCard } from '@/lib/stages/stageTypes';
import { countOf } from '@/lib/stages/stageText';

/**
 * Seasonal Challenge: Contingency Contract Battleplan and the other challenge modes.
 *
 * The game's screen holds a panel per challenge mode. Contingency Contract is its own
 * content kind; the others -- Vector Breakthrough and Trials for Navigator today -- the
 * game files as events, so they were sitting in Score with the side stories. Which they
 * are is data/game-modes.json (getSeasonalChallenge), so the header names whatever that
 * record lists rather than a sentence that a new mode would contradict. Every past
 * season is here, since unlike the game we are not showing a live account.
 *
 * Simulation Training (the Holographic Combat Matrix) had a dashed placeholder panel
 * here saying the pipeline has no rows for it. A placeholder waits until it has content
 * (docs/development/ui-primitives.md, migration step 9), so it is gone.
 */
type Props = SeasonalChallenge;

/** "A, B and C". */
const listed = (names: string[]) =>
  names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names.join('');

export default function SeasonalPage({ ccb, challenges }: Props) {
  const modes = ['Contingency Contract Battleplan', ...challenges.filter((m) => m.cards.length).map((m) => m.name)];
  return (
    <>
      <PageMeta title="Seasonal Challenge" description="The Arknights seasonal challenge modes and their current rotations." path="/stages/seasonal" />
      <TerminalNav current="seasonal" />
      <PageHeader
        slim
        eyebrow={<><ModeMark name="contingency-contract.svg" className="head-mark" />Rhodes Island // Challenge modes</>}
        title="Seasonal Challenge"
        sub={<>The challenge modes: {listed(modes)}, with every season each of them has run.</>}
      />

      <main className="terminal-scene">
        <Mode title="Contingency Contract" cards={ccb} noun="operation" mark="contingency-contract.svg" />
        {/* The challenge modes the game files as events, from data/game-modes.json. */}
        {challenges.map((mode) => (
          <Mode key={mode.label} title={mode.name} cards={mode.cards} noun="stage" mark={mode.mark} />
        ))}
      </main>
    </>
  );
}

/** One challenge mode: its newest season at hero size, every past one on a rail.
 *  `noun` is singular; countOf picks the number. */
function Mode({ title, cards, noun, mark }: { title: string; cards: StageModeCard[]; noun: string; mark: string | null }) {
  if (!cards.length) return null;
  const [latest, ...rest] = cards;
  return (
    <section className="terminal-panel op-section">
      <h2>{title}</h2>
      {mark && <ModeMark name={mark} className="panel-mark" />}
      <ContentCardLink id={latest.id} mapless={latest.mapless} className="explore-hero">
        <span className="explore-hero-art">
          {latest.art
            ? <Image src={latest.art} alt="" fill sizes="(max-width: 900px) 100vw, 1000px" />
            : <span className="terminal-row-art-none" />}
          {latest.mapless && <NoMapNote />}
        </span>
        <span className="explore-hero-text">
          <span className="explore-hero-kind">{latest.label || 'Latest'}</span>
          <span className="explore-hero-name">{latest.name}</span>
          <span className="explore-hero-meta">{countOf(latest.count, noun)}</span>
        </span>
      </ContentCardLink>
      {rest.length > 0 && (
        <Rail className="score-rail explore-rail">
          {rest.map((card) => (
            <ContentCardLink key={card.id} id={card.id} mapless={card.mapless} className="score-node">
              <span className="score-node-pin" aria-hidden="true" />
              <span className="score-node-art">
                {card.art
                  ? <Image src={card.art} alt="" fill sizes="(max-width: 700px) 55vw, 240px" className={card.artKind === 'map' ? 'score-node-map' : undefined} />
                  : <span className="score-node-art-none">{card.label || '--'}</span>}
                {card.mapless && <NoMapNote />}
              </span>
              <span className="score-node-foot">
                {card.label && <span className="score-node-code">{card.label}</span>}
                <span className="score-node-name">{card.name}</span>
              </span>
              <span className="score-node-meta">{countOf(card.count, noun)}</span>
            </ContentCardLink>
          ))}
        </Rail>
      )}
    </section>
  );
}

// seasonalFromRelease: the live release may still be one the previous code compiled, with
// the challenge modes under their old keys (see there).
export const getStaticProps: GetStaticProps<Props> = withContentPage<Props>("/stages/seasonal", async () => ({
  props: getSeasonalChallenge(),
}), { finalize: async (props) => seasonalFromRelease(props) });
