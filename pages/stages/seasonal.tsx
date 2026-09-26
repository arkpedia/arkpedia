import { withContentPage } from '@/lib/content/server';
import { GetStaticProps } from 'next';
import Image from '@/components/content/ContentImage';
import ContentCardLink, { NoMapNote } from '@/components/ui/ContentCardLink';
import Rail from '@/components/ui/Rail';
import ModeMark from '@/components/stages/ModeMark';
import TerminalNav from '@/components/stages/TerminalNav';
import PageHeader from '@/components/ui/PageHeader';
import { getSeasonalChallenge, SeasonalChallenge } from '@/lib/stages/terminal';
import { StageModeCard } from '@/lib/stages/stageTypes';

/**
 * Seasonal Challenge: Contingency Contract Battleplan, and an honest gap.
 *
 * The game's screen holds a panel per challenge mode, with unopened slots drawn as
 * empty panels rather than hidden. Three of them are in this dataset: Contingency
 * Contract, which is its own content kind, and Vector Breakthrough and Trials for
 * Navigator, which the game files as events -- so they were sitting in Score with the
 * side stories until now. Every past season of all three is here, since unlike the
 * game we are not showing a live account.
 *
 * Simulation Training is the one that is not, and its panel says so: the Holographic
 * Combat Matrix has no stage_table rows for the pipeline to read.
 */
type Props = SeasonalChallenge;

export default function SeasonalPage({ ccb, challenges }: Props) {
  return (
    <>
      <TerminalNav current="seasonal" />
      <PageHeader
        slim
        eyebrow={<><ModeMark name="contingency-contract.svg" className="head-mark" />Terminal // Challenge modes</>}
        title="Seasonal Challenge"
        sub={<>
          The challenge modes: Contingency Contract Battleplan, Vector Breakthrough and
          Trials for Navigator, with every season each of them has run.
        </>}
      />

      <main className="terminal-scene">
        <Mode tab="Contingency Contract" cards={ccb} noun="operations" mark="contingency-contract.svg" />
        {/* The challenge modes the game files as events, from data/game-modes.json: Vector
            Breakthrough (no emblem in the set) and Trials for Navigator today. */}
        {challenges.map((mode) => (
          <Mode key={mode.label} tab={mode.name} cards={mode.cards} noun="stages" mark={mode.mark ?? undefined} />
        ))}

        {/* The game draws a slot it cannot open rather than hiding it. So does this --
            with the reason, which the game does not have to give. */}
        <section className="terminal-panel shut" data-tab="Simulation Training">
          <p className="hint">
            The Holographic Combat Matrix is not in this dataset: its operations have no
            stage_table rows for the pipeline to read, so there is nothing here to show.
          </p>
        </section>
      </main>
    </>
  );
}

/** One challenge mode: its newest season at hero size, every past one on a rail. */
function Mode({ tab, cards, noun, mark }: { tab: string; cards: StageModeCard[]; noun: string; mark?: string }) {
  if (!cards.length) return null;
  const [latest, ...rest] = cards;
  return (
    <section className="terminal-panel" data-tab={tab}>
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
          <span className="explore-hero-meta">{latest.count} {noun}</span>
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
              <span className="score-node-meta">{card.count} {noun}</span>
            </ContentCardLink>
          ))}
        </Rail>
      )}
    </section>
  );
}

export const getStaticProps: GetStaticProps<Props> = withContentPage<Props>("/stages/seasonal", async () => ({
  props: getSeasonalChallenge(),
}));
