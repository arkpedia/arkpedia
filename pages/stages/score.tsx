import { useContentUrl } from '@/lib/content/context';
import PageMeta from '@/components/layout/PageMeta';
import { cssUrl } from '@/lib/content/urls';
import { useAssetUrl } from '@/lib/assets/assetRetry';
import { useRef } from 'react';
import { withContentPage } from '@/lib/content/server';
import { GetStaticProps } from 'next';
import Image from '@/components/content/ContentImage';
import ContentCardLink, { MinistoryMark, NoMapNote } from '@/components/ui/ContentCardLink';
import Rail from '@/components/ui/Rail';
import ModeMark from '@/components/stages/ModeMark';
import TerminalNav from '@/components/stages/TerminalNav';
import PageHeader from '@/components/ui/PageHeader';
import { getScoreLines, ScoreLine } from '@/lib/stages/terminal';
import { actMark } from '@/lib/stages/actMarks';

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

export default function ScorePage({ lines }: Props) {
  const contentUrl = useContentUrl();
  // CSS art has no error event: a false 404 is looked at once it is shown (lib/assets/assetRetry.ts).
  const emblemRef = useRef<HTMLSpanElement>(null);
  const emblem = useAssetUrl(contentUrl('/story-marks/main-story.webp'), emblemRef);
  const acts = lines.filter((l) => l.mainline);
  const stories = lines.filter((l) => !l.mainline);
  return (
    <>
      <PageMeta title="Score" description="The Arknights score modes and their current seasons." path="/stages/score" />
      <TerminalNav current="score" />
      <PageHeader
        slim
        eyebrow={<><ModeMark name="score.svg" className="head-mark" />Rhodes Island // Story lines</>}
        title="Score"
        sub={<>
          Every storyline the game has run, in its own order. The main story&apos;s four acts
          first, then the side-story lines by the code the game files them under.
        </>}
      />

      <main className="terminal-scene">
        <section className="score-block op-section">
          <h2 className="score-block-title">
            <span
              className="score-block-emblem"
              ref={emblemRef}
              style={{ ['--score-emblem' as string]: cssUrl(emblem) }}
              aria-hidden="true"
            />
            Main Theme
          </h2>
          {acts.map((line) => <Line key={line.id} line={line} act />)}
        </section>

        <section className="score-block op-section">
          <h2 className="score-block-title">Story Lines</h2>
          {stories.map((line) => <Line key={line.id} line={line} />)}
        </section>
      </main>
    </>
  );
}

function Line({ line, act }: { line: ScoreLine; act?: boolean }) {
  const contentUrl = useContentUrl();
  const lineRef = useRef<HTMLDivElement>(null);
  const markRef = useRef<HTMLSpanElement>(null);
  const backdrop = useAssetUrl(line.backdrop ? contentUrl(line.backdrop) : '', lineRef);
  const lineMark = useAssetUrl(line.mark ? contentUrl(line.mark) : '', markRef);
  // An act the list does not know (an Act IV) gets no wordmark rather than initium's.
  const mark = line.act != null ? actMark(line.act) : null;
  return (
    <div
      className={`score-line${act ? ' act' : ''}`}
      /* The wash behind the line -- see .score-line::before for why it is the
         line's own banner rather than the game's storyline background. */
      ref={lineRef}
      style={line.backdrop ? { ['--line-bg' as string]: cssUrl(backdrop) } : undefined}
    >
      <div className="score-line-head">
        {/* The game's own wordmark for an act, and the line's two-letter code for a
            story line. Act 0 is marked `initium`, not I (lib/stages/actMarks.ts). */}
        {mark ? (
          <Image
            className="score-act-mark"
            src={`/act-marks/${mark.file}.webp`}
            alt={`Act ${mark.label}`}
            width={86}
            height={33}
          />
        ) : line.mark ? (
          /* The game's own emblem for the line. Keyed to a white-on-alpha mask by
             scripts/imports/import-story-marks.py, so it takes its colour from the CSS the
             way the stat glyphs do. */
          <span
            className="score-line-emblem"
            ref={markRef}
            style={{ maskImage: cssUrl(lineMark), WebkitMaskImage: cssUrl(lineMark) }}
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
