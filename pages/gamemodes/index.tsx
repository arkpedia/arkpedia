import { withContentPage } from '@/lib/content/server';
import PageMeta from '@/components/layout/PageMeta';
import { GetStaticProps } from 'next';
import Link from 'next/link';
import ModeMark from '@/components/stages/ModeMark';
import PageHeader from '@/components/ui/PageHeader';

interface Mode {
  /** null while the mode has no page of its own -- the row is still listed. */
  href: string | null;
  name: string;
  /** The file in public/mode-marks/, extension and all. */
  mark: string;
  blurb: string;
  /** Short enough to stay a badge: a pill this narrow column cannot shrink, so a
   *  sentence in here squeezes the name to one word per line. */
  holds: string;
}

/**
 * The seasonal modes, listed whether or not they have a page yet.
 *
 * A mode with no page is still a row, greyed and marked, rather than absent: the point
 * of this screen is "what modes are there", and leaving three of the four out to avoid
 * an unfinished link answers a different question. Integrated Strategies and
 * Reclamation Algorithm do already have stage pages under /stages -- these rows are for
 * the rules of the mode, which is a different thing and is not written yet.
 */
export default function GamemodesPage({ modes }: { modes: Mode[] }) {
  return (
    <>
      <PageMeta title="Game modes" description="Arknights game modes, and what each one is made of." path="/gamemodes" />
      <PageHeader
        slim
        eyebrow="Rhodes Island // Mode rulebooks"
        title="Game Modes"
        sub="The modes that run beside the mainline, each with its own rules to learn."
      />
      <main className="terminal-scene">
        <section className="terminal-panel wide" data-tab="Modes">
          <ul className="terminal-list">
            {modes.map((m) => {
              const inside = (
                <>
                  <ModeMark name={m.mark} className="gm-modemark" />
                  <span className="terminal-row-text">
                    <span className="terminal-row-name">{m.name}</span>
                    <span className="terminal-row-meta">{m.blurb}</span>
                  </span>
                  <span className="terminal-pill">{m.holds}</span>
                </>
              );
              return (
                <li key={m.name}>
                  {m.href ? (
                    <Link prefetch={false} href={m.href} scroll={false} className="terminal-row">{inside}</Link>
                  ) : (
                    /* Not a link and not a button: there is nowhere to go yet, and a
                       control that does nothing when clicked is worse than a plain row. */
                    <div className="terminal-row gm-nopage" aria-disabled="true">{inside}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </main>
    </>
  );
}

export const getStaticProps: GetStaticProps<{ modes: Mode[] }> = withContentPage<{ modes: Mode[] }>("/gamemodes", async () => {
  return {
    props: {
      modes: [
        {
          href: null,
          name: 'Integrated Strategies',
          mark: 'integrated-strategies.svg',
          blurb: 'Roguelike runs: a squad, a branching map, and relics that rewrite it.',
          holds: 'no page yet',
        },
        {
          href: null,
          name: 'Reclamation Algorithm',
          mark: 'reclamation-algorithm.webp',
          blurb: 'Gather, build and survive across an open map over several days.',
          holds: 'no page yet',
        },
        {
          href: "/game-modes/stronghold-protocol",
          name: 'Stronghold Protocol',
          mark: 'stronghold-protocol.webp',
          blurb: 'Build alliances out of dispatched operators, then let the fight run itself.',
          holds: 'Version 1.0',
        },
        {
          href: null,
          name: 'Stationary Security Service',
          mark: 'stationary-security-service.webp',
          blurb: 'Fixed squads against escalating waves, scored on how long you hold.',
          holds: 'no page yet',
        },
      ],
    },
  };
});
