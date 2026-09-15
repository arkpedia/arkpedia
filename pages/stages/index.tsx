import { GetStaticProps } from 'next';
import Head from 'next/head';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { MinistoryMark } from '@/components/ContentCardLink';
import TerminalNav from '@/components/TerminalNav';
import { getTerminalHome, TerminalHome } from '@/lib/stages/terminal';
import { StageModeCard } from '@/lib/stages/stageTypes';

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

/** Rounded down to the minute, so re-reading it is a no-op for React. */
const nowSeconds = () => Math.floor(Date.now() / 60000) * 60;

function daysLeft(end: number, from: number): number {
  return Math.max(0, Math.ceil((end - from) / 86400));
}

export default function TerminalPage({ candidates, latestIs, latestRa, isThemes, raSeasons, now }: Props) {
  const [clock, setClock] = useState(now);
  // `mounted` rides the same re-pick: dates render in en-GB until then
  // (see ended() below for why), the reader's own locale after.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setClock(nowSeconds()); setMounted(true); }, []);

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

  // Each panel's label is painted by CSS out of its data-tab attribute
  // (generated content), which a screen reader may never voice and the
  // document outline definitely never sees -- so every section also
  // carries the same label as a real, visually-hidden heading. This one
  // is computed once because the lead panel's label is dynamic and the
  // data-tab and the heading must never drift apart.
  const leadTab = lead && isLive(lead) ? 'Now Open' : 'Most Recent';

  return (
    <>
      <Head><title>Terminal — Arkpedia</title></Head>

      <TerminalNav current="terminal" />
      <div className="terminal-head">
        <div className="eyebrow">Rhodes Island // Terminal</div>
        <h1>Terminal</h1>
      </div>

      <main className="terminal-scene">
        <div className="terminal-home">
          <section className="terminal-panel wide" data-tab={leadTab}>
            <h2 className="visually-hidden">{leadTab}</h2>
            {lead ? <Lead card={lead} clock={clock} live={isLive(lead)} mounted={mounted} /> : (
              <p className="hint terminal-empty">No event in the dataset carries a run window.</p>
            )}
          </section>

          {rest.length > 0 && (
            <section className="terminal-panel" data-tab="Attention">
              <h2 className="visually-hidden">Attention</h2>
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
                          {card.count} {card.count === 1 ? 'stage' : 'stages'}
                        </span>
                      </span>
                      {card.end && (
                        <span className={`terminal-pill${isLive(card) ? ' live' : ''}`}>
                          {isLive(card) ? `${daysLeft(card.end, clock)}d` : ended(card.end, mounted)}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="terminal-panel" data-tab="Long-Term Exploration">
            <h2 className="visually-hidden">Long-Term Exploration</h2>
            {latestIs && <ModePanel card={latestIs} kind="Integrated Strategies" count={isThemes} noun="themes" />}
            {latestRa && <ModePanel card={latestRa} kind="Reclamation Algorithm" count={raSeasons} noun="seasons" />}
            <Link prefetch={false} href="/stages/exploration" scroll={false} className="terminal-cta">
              All themes and seasons
            </Link>
          </section>
        </div>
      </main>
    </>
  );
}

/**
 * The date an event closed, short -- in the reader's own locale, but only
 * once mounted. The default locale is whatever Intl finds on the machine
 * doing the rendering, and the build server's is not the reader's; letting
 * it float from the first paint would make the server markup and the
 * client's hydration render disagree. So the pre-mount renders (both of
 * them) pin en-GB -- what this page always used -- and the mount effect's
 * re-render swaps in the browser's locale, the same beat the clock
 * re-picks on.
 */
function ended(end: number, mounted: boolean): string {
  return new Date(end * 1000).toLocaleDateString(mounted ? undefined : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** The event the board leads with, the way the game leads with it: its art, big. */
function Lead({ card, clock, live, mounted }: { card: StageModeCard; clock: number; live: boolean; mounted: boolean }) {
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
          {card.count} {card.count === 1 ? 'stage' : 'stages'}
          {card.end
            ? live ? ` · ${daysLeft(card.end, clock)} days left` : ` · ran until ${ended(card.end, mounted)}`
            : ''}
        </span>
      </span>
    </Link>
  );
}

/** One permanent mode: its newest season, and the way into all of them. */
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
        <span className="terminal-mode-meta">{count} {noun} · {card.count} stages</span>
      </span>
    </Link>
  );
}

export const getStaticProps: GetStaticProps<Props> = async () => {
  const now = Math.floor(Date.now() / 1000);
  return { props: { ...getTerminalHome(now), now } };
};
