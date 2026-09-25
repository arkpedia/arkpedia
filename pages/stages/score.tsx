import { useContentUrl } from '@/lib/content/context';
import { cssUrl } from '@/lib/content/urls';
import { withContentPage } from '@/lib/content/server';
import { GetStaticProps } from 'next';
import Image from '@/components/content/ContentImage';
import ContentCardLink, { MinistoryMark, NoMapNote } from '@/components/ui/ContentCardLink';
import Rail from '@/components/ui/Rail';
import ModeMark from '@/components/stages/ModeMark';
import TerminalNav from '@/components/stages/TerminalNav';
import { getScoreLines, ScoreLine } from '@/lib/stages/terminal';

/**
 * Score: the story lines, laid out the way the game's own Terminal lays them out.
 *
 * Each line is a wire with its contents hung along it in the order the game plays
 * them -- "Story Line · RL / The Ark" runs Darknights Memoir, A Walk in the Dust,
 * Vigilo, Babel -- and the four acts of the main story lead, as they do in game.
 *
 * A rail scrolls sideways rather than wrapping. That is what the game does, and it is
 * also what makes this work on a phone without a second layout: the line is the unit,
 * and a line is always one row deep.
 */
interface Props {
  lines: ScoreLine[];
}

const YEAR = (unix: number | null) => (unix ? new Date(unix * 1000).getUTCFullYear() : null);

/** By act number, from 0: the mark's file, and what to call it out loud. The game
 *  does not number the first act -- it marks it `initium` -- so this is not a
 *  roman-numeral function. */
const ACT_MARKS: [file: string, label: string][] = [
  ['initium', 'initium'],
  ['i', 'I'],
  ['ii', 'II'],
  ['iii', 'III'],
];

export default function ScorePage({ lines }: Props) {
  const contentUrl = useContentUrl();
  const acts = lines.filter((l) => l.mainline);
  const stories = lines.filter((l) => !l.mainline);
  return (
    <>
      <TerminalNav current="score" />
      <div className="terminal-head">
        <div className="eyebrow">Rhodes Island // Terminal</div>
        <h1><ModeMark name="score.svg" className="head-mark" />Score</h1>
        <p className="sub">
          Every storyline the game has run, in its own order. The main story&apos;s four acts
          first, then the side-story lines by the code the game files them under.
        </p>
      </div>

      <main className="terminal-scene">
        <section className="score-block">
          <h2 className="score-block-title">
            <span
              className="score-block-emblem"
              style={{ ['--score-emblem' as string]: cssUrl(contentUrl('/story-marks/main-story.webp')) }}
              aria-hidden="true"
            />
            Main Theme
          </h2>
          {acts.map((line) => <Line key={line.id} line={line} act />)}
        </section>

        <section className="score-block">
          <h2 className="score-block-title">Story Lines</h2>
          {stories.map((line) => <Line key={line.id} line={line} />)}
        </section>
      </main>
    </>
  );
}

function Line({ line, act }: { line: ScoreLine; act?: boolean }) {
  const contentUrl = useContentUrl();
  return (
    <div
      className={`score-line${act ? ' act' : ''}`}
      /* The wash behind the line -- see .score-line::before for why it is the
         line's own banner rather than the game's storyline background. */
      style={line.backdrop ? { ['--line-bg' as string]: cssUrl(contentUrl(line.backdrop)) } : undefined}
    >
      <div className="score-line-head">
        {/* The game's own wordmark for an act, and the line's two-letter code for a
            story line. Act 0 is marked `initium`, not I. */}
        {line.act != null ? (
          <Image
            className="score-act-mark"
            src={`/act-marks/${(ACT_MARKS[line.act] ?? ACT_MARKS[0])[0]}.webp`}
            alt={`Act ${(ACT_MARKS[line.act] ?? ACT_MARKS[0])[1]}`}
            width={86}
            height={33}
          />
        ) : line.mark ? (
          /* The game's own emblem for the line. Keyed to a white-on-alpha mask by
             scripts/imports/import-story-marks.py, so it takes its colour from the CSS the
             way the stat glyphs do. */
          <span
            className="score-line-emblem"
            style={{ maskImage: cssUrl(contentUrl(line.mark)), WebkitMaskImage: cssUrl(contentUrl(line.mark)) }}
            aria-hidden="true"
          />
        ) : (
          <span className="score-line-mark" aria-hidden="true">{line.code || '·'}</span>
        )}
        <span className="score-line-titles">
          <span className="score-line-kind">
            {act ? 'Main Story' : 'Story Line'}
            {line.code ? ` · ${line.code}` : ''}
          </span>
          <span className="score-line-name">{line.name}</span>
        </span>
        <span className="score-line-count">{line.nodes.length}</span>
      </div>

      {/* The wire. A pseudo-element on the rail rather than a drawn line per node, so
          it runs the full scroll width and the nodes sit on it wherever they land. */}
      <Rail className="score-rail">
        {line.nodes.map((node) => (
          <ContentCardLink key={node.id} id={node.id} mapless={node.mapless} className="score-node">
            <span className="score-node-pin" aria-hidden="true" />
            <span className="score-node-art">
              {node.art ? (
                <Image
                  src={node.art}
                  alt=""
                  fill
                  sizes="(max-width: 700px) 55vw, 240px"
                  className={node.artKind === 'map' ? 'score-node-map' : undefined}
                />
              ) : (
                <span className="score-node-art-none">{node.label || '--'}</span>
              )}
              {node.mapless && <NoMapNote />}
              {node.ministory && <MinistoryMark />}
            </span>
            <span className="score-node-foot">
              {node.label && <span className="score-node-code">{node.label}</span>}
              <span className="score-node-name">{node.name}</span>
            </span>
            <span className="score-node-meta">
              {node.stages} {node.stages === 1 ? 'stage' : 'stages'}
              {YEAR(node.start) ? ` · ${YEAR(node.start)}` : ''}
            </span>
          </ContentCardLink>
        ))}
      </Rail>
    </div>
  );
}

export const getStaticProps: GetStaticProps<Props> = withContentPage<Props>("/stages/score", async () => ({
  props: { lines: getScoreLines() },
}));
