import { withContentPage } from '@/lib/content/server';
import { GetStaticProps } from 'next';
import Head from 'next/head';
import Image from '@/components/content/ContentImage';
import Link from 'next/link';
import { useMemo } from 'react';
import { useReaderClockSeconds } from '@/lib/time/readerClock';
import { MinistoryMark } from '@/components/ui/ContentCardLink';
import TerminalNav from '@/components/stages/TerminalNav';
import PageHeader from '@/components/ui/PageHeader';
import { getTerminalHome, TerminalHome } from '@/lib/stages/terminal';
import { StageModeCard } from '@/lib/stages/stageTypes';
import { countOf } from '@/lib/stages/stageText';

/**
 * Terminal: what is open right now, and the two modes that are always open.
 *
 * The game's own home board leads with the running event's key art, keeps an
 * ATTENTION column of what is about to close, and pins Integrated Strategies to the
 * side. This is that, with the site's own tokens.
 *
 * "Running now" is decided against the READER's clock, not the build's. A static
 * build can be weeks old, and a home board that leads with an event that closed a
 * fortnight ago is worse than one that leads with nothing -- so the server renders
 * from its own clock (markup and first paint must agree) and an effect re-picks
 * immediately on mount.
 */
interface Props extends TerminalHome {
  /** The build's clock, in unix seconds. */
  now: number;
}

function daysLeft(end: number, from: number): number {
  return Math.max(0, Math.ceil((end - from) / 86400));
}

export default function TerminalPage({ candidates, latestIs, latestRa, isThemes, raSeasons, now }: Props) {
  // The request's clock first, the reader's (to the minute) after mount.
  const clock = useReaderClockSeconds(now);

  /**
   * What the board leads with.
   *
   * Live first, newest start among them -- two events overlap often and the one that
   * started last is the one being played, the same rule the stage rail's default
   * chapter uses. But an event gap is normal and the dataset trails the live game by
   * days, so with nothing running this leads with the most recent thing instead,
   * labelled as what it is. A board that says "nothing is running" is technically
   * right and no use to anybody.
   */
  const { lead, rest } = useMemo(() => {
    const live = (c: StageModeCard) => !!c.start && !!c.end && c.start <= clock && c.end >= clock;
    const byRecency = candidates.slice().sort((a, b) => (b.end || 0) - (a.end || 0));
    const running = byRecency.filter(live).sort((a, b) => (b.start || 0) - (a.start || 0));
    const head = running[0] ?? byRecency[0];
    return {
      lead: head,
      rest: byRecency.filter((c) => c.id !== head?.id).slice(0, 4),
    };
  }, [candidates, clock]);
  const isLive = (c: StageModeCard) => !!c.start && !!c.end && c.start <= clock && c.end >= clock;

  // Each panel is an .op-section headed by a real h2, the site's amber section heading.
  // The labels used to be painted by CSS out of a data-tab attribute, a 10px teal tab
  // no outline saw, with a visually hidden h2 beside each to say the same thing.
  const leadTab = lead && isLive(lead) ? 'Now Open' : 'Most Recent';

  return (
    <>
      <Head><title>Terminal — Arkpedia</title></Head>

      <TerminalNav current="terminal" />
      <PageHeader slim eyebrow="Rhodes Island // Operations board" title="Terminal" />

      <main className="terminal-scene">
        <div className="terminal-home">
          <section className="terminal-panel wide op-section">
            <h2>{leadTab}</h2>
            {lead ? <Lead card={lead} clock={clock} live={isLive(lead)} /> : (
              <p className="hint terminal-empty">No event in the dataset carries a run window.</p>
            )}
          </section>

          {rest.length > 0 && (
            <section className="terminal-panel op-section">
              <h2>Attention</h2>
              <ul className="terminal-list">
                {rest.map((card) => (
                  <li key={card.id}>
                    <Link prefetch={false} href={`/stages/content/${card.id}`} scroll={false} className="terminal-row">
                      <span className="terminal-row-art">
                        {card.art
                          ? <Image src={card.art} alt="" fill sizes="120px" />
                          : <span className="terminal-row-art-none" />}
                        {card.ministory && <MinistoryMark />}
                      </span>
                      <span className="terminal-row-text">
                        <span className="terminal-row-name">{card.name}</span>
                        <span className="terminal-row-meta">
                          {countOf(card.count, 'stage')}
                        </span>
                      </span>
                      {card.end && (
                        <span className={`terminal-pill${isLive(card) ? ' live' : ''}`}>
                          {isLive(card) ? `${daysLeft(card.end, clock)}d` : ended(card.end)}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="terminal-panel op-section">
            <h2>Long-Term Exploration</h2>
            {latestIs && <ModePanel card={latestIs} kind="Integrated Strategies" count={isThemes} noun="theme" />}
            {latestRa && <ModePanel card={latestRa} kind="Reclamation Algorithm" count={raSeasons} noun="season" />}
            <Link prefetch={false} href="/stages/exploration" scroll={false} className="btn terminal-cta">
              All themes and seasons
            </Link>
          </section>
        </div>
      </main>
    </>
  );
}

/**
 * The date an event closed, short, in one fixed locale: en-GB ("16 Sept"), the one
 * /stages/regular uses too. It used to switch to the reader's locale once mounted,
 * so the render that followed hydration printed a different date string from the
 * markup -- and the format a reader saw depended on when they looked. A locale the
 * page names is the same on the server, in the hydration render and after.
 */
function ended(end: number): string {
  return new Date(end * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** The event the board leads with, the way the game leads with it: its art, big. */
function Lead({ card, clock, live }: { card: StageModeCard; clock: number; live: boolean }) {
  return (
    <Link prefetch={false} href={`/stages/content/${card.id}`} scroll={false} className={`terminal-lead${live ? ' live' : ''}`}>
      <span className="terminal-lead-art">
        {card.art
          ? <Image src={card.art} alt="" fill sizes="(max-width: 900px) 100vw, 720px" priority />
          : <span className="terminal-row-art-none" />}
        {card.ministory && <MinistoryMark />}
      </span>
      <span className="terminal-lead-text">
        <span className="terminal-lead-kind">
          {card.label ? `${card.label} · ` : ''}
          {live ? 'Open now' : 'Most recent'}
        </span>
        <span className="terminal-lead-name">{card.name}</span>
        <span className="terminal-lead-meta">
          {countOf(card.count, 'stage')}
          {card.end
            ? live ? ` · ${daysLeft(card.end, clock)} days left` : ` · ran until ${ended(card.end)}`
            : ''}
        </span>
      </span>
    </Link>
  );
}

/** One permanent mode: its newest season, and the way into all of them. `noun` is
 *  singular ("season"); countOf picks the number. */
function ModePanel({ card, kind, count, noun }: { card: StageModeCard; kind: string; count: number; noun: string }) {
  return (
    <Link prefetch={false} href={`/stages/content/${card.id}`} scroll={false} className="terminal-mode">
      <span className="terminal-mode-art">
        {card.art
          ? <Image src={card.art} alt="" fill sizes="(max-width: 900px) 100vw, 340px" />
          : <span className="terminal-row-art-none" />}
      </span>
      <span className="terminal-mode-text">
        <span className="terminal-mode-kind">{kind}</span>
        <span className="terminal-mode-name">{card.name}</span>
        <span className="terminal-mode-meta">{countOf(count, noun)} · {countOf(card.count, 'stage')}</span>
      </span>
    </Link>
  );
}

export const getStaticProps: GetStaticProps<Props> = withContentPage<Props>("/stages", async () => {
  // `now` is the request's, from contentPageClock (lib/content/pageClock.ts).
  return { props: getTerminalHome() };
});
