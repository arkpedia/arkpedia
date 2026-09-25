import { withContentPage } from '@/lib/content/server';
import { GetStaticProps } from 'next';
import Image from '@/components/content/ContentImage';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import ModeMark from '@/components/stages/ModeMark';
import TerminalNav from '@/components/stages/TerminalNav';
import { getSupplyCards } from '@/lib/stages/terminal';
import type { SupplyCard } from '@/lib/stages/terminal';
import { WEEKDAYS } from '@/lib/stages/stageTypes';
import { serverWeekday } from '@/lib/time/serverDay';

/**
 * Supplies: the rotating operations, and which of them is open today.
 *
 * The game's screen is a row of portrait cards with the days printed on each and a
 * "Currently Locked" stamp over the ones today is not, plus a schedule strip along
 * the top. This is that, with two differences worth naming: each card shows what its
 * operation is FARMED FOR -- the reward item, or a class emblem for the four chip
 * operations -- because the game's bespoke portrait art for these is in no mirror we
 * can reach and a grey stage map answers nothing; and the strip is every weekday
 * rather than a rolling window, so it doubles as "when is Cargo Escort next open".
 *
 * Today is the GLOBAL SERVER's day, worked out on the client rather than baked into
 * the build: a static build is stale within hours for a page whose whole subject is
 * what day it is.
 *
 * The server's day, not the reader's. The rotation turns over at 04:00 UTC-7, so for
 * eleven hours of every UTC day the game is still on the day before, and a reader east
 * of that can be well into Sunday while the operation open in game is Saturday's. It
 * used to read the reader's own clock and named the wrong operation for exactly that
 * window. See lib/time/serverDay.ts.
 */
interface Props {
  cards: SupplyCard[];
  /** The server's weekday at build time, so the first client render agrees with the
   *  markup and does not flash a different day before the effect below runs. */
  buildDay: string;
}

export default function SuppliesPage({ cards, buildDay }: Props) {
  const [today, setToday] = useState(buildDay);
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => {
    setToday(serverWeekday());
  }, []);
  const day = picked ?? today;

  return (
    <>
      <TerminalNav current="supplies" />
      <div className="terminal-head">
        <div className="eyebrow">Rhodes Island // Terminal</div>
        <h1><ModeMark name="supplies.svg" className="head-mark" />Supplies</h1>
        <p className="sub">
          The rotating operations. Pick a day to see what it opens -- it starts on{' '}
          {today.toLowerCase()}, which is today on the Global server. The day turns over
          at 04:00 UTC-7, so it can still be yesterday in game while your own clock has
          moved on.
        </p>
      </div>

      <main className="terminal-scene">
        {/* The schedule strip. The game shows a rolling week; every weekday is more
            use on a site, where the question is as often "when next" as "what now". */}
        <div className="supply-schedule" role="group" aria-label="Weekday">
          {WEEKDAYS.map((d) => (
            <button
              key={d}
              type="button"
              className={`supply-day${d === day ? ' current' : ''}${d === today ? ' today' : ''}`}
              aria-pressed={d === day}
              onClick={() => setPicked(d === today ? null : d)}
            >
              <span className="supply-day-abbr">{d.slice(0, 3)}</span>
              {d === today && <span className="supply-day-mark">Today</span>}
            </button>
          ))}
        </div>

        <div className="supply-grid">
          {cards.map((card) => {
            const always = card.days.length === WEEKDAYS.length;
            const open = always || card.days.includes(day);
            return (
              <Link prefetch={false}
                key={card.id}
                href={`/stages/content/${card.id}`}
                scroll={false}
                className={`supply-card${open ? '' : ' shut'}`}
              >
                <span className="supply-card-art">
                  {card.mark
                    ? <Image src={card.mark} alt="" width={96} height={96} className="supply-card-mark" />
                    : <span className="terminal-row-art-none" />}
                  {!open && <span className="supply-card-shut">Currently locked</span>}
                </span>
                <span className="supply-card-body">
                  <span className="supply-card-code">{card.label}</span>
                  <span className="supply-card-name">{card.name}</span>
                  <span className="supply-card-days">
                    {always ? 'Always open.' : `Open on ${card.days.map((d) => d.slice(0, 3)).join('/')}`}
                  </span>
                  {/* One pip per stage, as the game marks how deep the operation runs. */}
                  <span className="supply-pips" aria-hidden="true">
                    {Array.from({ length: card.stages }, (_, i) => <span key={i} className="supply-pip" />)}
                  </span>
                  <span className="supply-card-meta">
                    {card.stages} stages
                    {card.sanity ? ` · ${card.sanity[0]}-${card.sanity[1]} sanity` : ''}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      </main>
    </>
  );
}

export const getStaticProps: GetStaticProps<Props> = withContentPage<Props>("/stages/supplies", async () => ({
  props: {
    cards: getSupplyCards(),
    // `buildDay` is the request's server day, from contentPageClock (lib/content/pageClock.ts).
  },
}));
