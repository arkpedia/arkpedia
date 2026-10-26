import { useRegionalTime } from '@/lib/time/useRegionalTime';
import { supplyDays, supplyOpen } from '@/lib/time/regional';
import { withContentPage } from '@/lib/content/server';
import { GetStaticProps } from 'next';
import Image from '@/components/content/ContentImage';
import Link from 'next/link';
import { useState } from 'react';
import { useReaderClock } from '@/lib/time/readerClock';
import ModeMark from '@/components/stages/ModeMark';
import TerminalNav from '@/components/stages/TerminalNav';
import PageHeader from '@/components/ui/PageHeader';
import SegmentedControl from '@/components/ui/SegmentedControl';
import { getSupplyCards } from '@/lib/stages/terminal';
import type { SupplyCard } from '@/lib/stages/terminal';
import { WEEKDAYS } from '@/lib/stages/stageTypes';
import { countOf } from '@/lib/stages/stageText';
import { serverWeekday, serverOffsetLabel, SERVER_TIME } from '@/lib/time/servers.mjs';

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
 * Today follows the selected account's server and its daily reset. The request's
 * Global weekday remains the hydration fallback before the client account loads.
 * See lib/time/servers.mjs for the shared fixed-offset policy.
 */
interface Props {
  cards: SupplyCard[];
  /** The server's weekday at build time, so the first client render agrees with the
   *  markup and does not flash a different day before the effect below runs. */
  buildDay: string;
  now: number;
}

export default function SuppliesPage({ cards: globalCards, buildDay, now = 0 }: Props) {
  // The request's server weekday first, the reader's after mount.
  const { server, schedule } = useRegionalTime();
  const cards = globalCards.map(card => ({ ...card, days: supplyDays(card.id, schedule, card.days) }));
  const clock = useReaderClock(now, { tickMs: 60_000, onFocus: true });
  const today = clock ? serverWeekday(new Date(clock), server) : buildDay;
  const [picked, setPicked] = useState<string | null>(null);
  const day = picked ?? today;

  return (
    <>
      <TerminalNav current="supplies" />
      <PageHeader
        slim
        eyebrow={<><ModeMark name="supplies.svg" className="head-mark" />Terminal // Daily rotation</>}
        title="Supplies"
        sub={<>
          The rotating operations. Pick a day to see what it opens -- it starts on{' '}
          {today.toLowerCase()}, which is today on the {server.toUpperCase()} server. The day turns over
          at {String(SERVER_TIME[server].resetHour).padStart(2, '0')}:00 {serverOffsetLabel(server)}, so it can still be yesterday in game while your own clock has
          moved on.
        </>}
      />

      <main className="terminal-scene">
        {/* The schedule strip. The game shows a rolling week; every weekday is more
            use on a site, where the question is as often "when next" as "what now". */}
        {/* The site's pick-one control (the pinned .filter-chip). Picking today
            goes back to following the clock. */}
        <SegmentedControl
          className="supply-schedule"
          label="Weekday"
          value={day}
          onChange={(d) => setPicked(d === today ? null : d)}
          options={WEEKDAYS.map((d) => ({
            value: d,
            ariaLabel: d === today ? `${d}, today` : d,
            label: (
              <>
                <span>{d.slice(0, 3)}</span>
                {d === today && <span className="supply-day-mark">Today</span>}
              </>
            ),
          }))}
        />

        <div className="supply-grid">
          {cards.map((card) => {
            const always = card.days.length === WEEKDAYS.length;
            const open = schedule ? supplyOpen(card.id, clock, schedule, server, day) : always || card.days.includes(day);
            return (
              <Link prefetch={false}
                key={card.id}
                href={`/stages/content/${card.id}`}
                scroll={false}
                className={`supply-card${open ? ' open' : ' shut'}`}
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
                    {countOf(card.stages, 'stage')}
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
