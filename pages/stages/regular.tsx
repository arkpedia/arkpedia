import { serverCalendarTime, type GameServer } from '@/lib/time/servers.mjs';
import { useRegionalTime } from '@/lib/time/useRegionalTime';
import { withContentPage } from '@/lib/content/server';
import { GetStaticProps } from 'next';
import Image from '@/components/content/ContentImage';
import Link from 'next/link';
import { useMemo } from 'react';
import { useReaderClockSeconds } from '@/lib/time/readerClock';
import Rail from '@/components/ui/Rail';
import ModeMark from '@/components/stages/ModeMark';
import TerminalNav from '@/components/stages/TerminalNav';
import PageHeader from '@/components/ui/PageHeader';
import { getRegularTasks, RegularTasks } from '@/lib/stages/terminal';
import { StageModeCard } from '@/lib/stages/stageTypes';
import { countOf } from '@/lib/stages/stageText';

/**
 * Regular Tasks: Annihilation and Stationary Security Service.
 *
 * Both are always open and neither is always the same -- Annihilation rotates one map
 * at a time, SSS runs numbered seasons of two towers -- so each panel leads with what
 * is running and keeps the back catalogue on a rail under it. That is the game's own
 * composition for this screen, minus its Affair Record: the weekly-mission panel is an
 * account's own state, and this site has no account.
 *
 * What is open is decided against the READER's clock. A build can be weeks old, and
 * "which Annihilation is up" is the entire question here.
 *
 * Each lead is the whole card, not a text block with a button under it: what is
 * running is the one thing on this screen worth a click, so it is the click target.
 * Annihilation leads with its nation's crest, the mark the game itself puts on these.
 */
interface Props extends RegularTasks {
  now: number;
}

const day = (unix: number, server: GameServer) =>
  serverCalendarTime(new Date(unix * 1000), server).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const weeksLeft = (end: number, from: number) => Math.max(0, Math.round((end - from) / (7 * 86400)));

export default function RegularTasksPage({ rotations: globalRotations, zones, seasons: globalSeasons, towers, now }: Props) {
  const { server, schedule } = useRegionalTime();
  const rotations = useMemo(() => server === 'en' ? globalRotations : schedule?.annihilation ?? [], [server, globalRotations, schedule]);
  const seasons = useMemo(() => server === 'en' ? globalSeasons : schedule?.sss ?? [], [server, globalSeasons, schedule]);
  // The request's clock first, the reader's (to the minute) after mount.
  const clock = useReaderClockSeconds(now, { tickMs: 1000, onFocus: true });

  const byId = useMemo(() => new Map(zones.concat(towers).map((c) => [c.id, c])), [zones, towers]);
  const live = useMemo(
    () => rotations.find((r) => r.start <= clock && clock < r.end) ?? rotations[rotations.length - 1],
    [rotations, clock]
  );
  const season = useMemo(
    () => seasons.find((s) => s.start <= clock && clock < s.end) ?? seasons[seasons.length - 1],
    [seasons, clock]
  );
  const running = !!live && live.start <= clock && clock < live.end;
  const seasonRunning = !!season && season.start <= clock && clock < season.end;

  const liveZone = live?.contentId ? byId.get(live.contentId) : undefined;
  // A season pairs a NEW tower with a re-run of an older one, and climb_tower_table
  // lists them in its own order -- which put the re-run first for every season the
  // game has run. The new one is the news, so it leads.
  const seasonTowers = useMemo(() => {
    const rerun = new Set(season?.replicated ?? []);
    return (season?.contentIds ?? [])
      .map((id) => byId.get(id))
      .filter((c): c is StageModeCard => !!c)
      .map((card) => ({ card, rerun: rerun.has(card.id) }))
      .sort((a, b) => Number(a.rerun) - Number(b.rerun));
  }, [season, byId]);

  return (
    <>
      <TerminalNav current="regular" />
      <PageHeader
        slim
        eyebrow={<><ModeMark name="regular-tasks.svg" className="head-mark" />Terminal // Always open</>}
        title="Regular Tasks"
        sub={<>
          The two modes that never close and never stay the same: Annihilation rotates its
          map, Stationary Security Service runs seasons.
        </>}
      />

      <main className="terminal-scene">
        <section className="terminal-panel op-section">
          <h2>Annihilation Operation</h2>
          <ModeMark name="annihilation.webp" className="panel-mark" />
          {live && (
            <Link prefetch={false}
              href={`/stages/browse?s=${encodeURIComponent(live.slug)}`}
              scroll={false}
              className={`regular-now${running ? ' live' : ''}`}
            >
              <span className="regular-now-crest">
                {liveZone?.art
                  ? <Image src={liveZone.art} alt="" width={132} height={132} className="regular-crest" />
                  : <span className="terminal-row-art-none" />}
              </span>
              <span className="regular-now-text">
                <span className="regular-now-kind">{running ? 'Rotating now' : 'Last rotation'}</span>
                <span className="regular-now-name">{liveZone?.name ?? live.slug}</span>
                <span className="regular-now-meta">
                  {running
                    ? `until ${day(live.end, server)} · ${countOf(weeksLeft(live.end, clock), 'week')} left`
                    : `ran until ${day(live.end, server)}`}
                </span>
                <span className="regular-now-go btn btn-sm ghost">Open the map</span>
              </span>
            </Link>
          )}
          <h3>Every zone</h3>
          <ModeRail cards={zones} />
        </section>

        <section className="terminal-panel op-section">
          <h2>Stationary Security Service</h2>
          <ModeMark name="stationary-security-service.webp" className="panel-mark" />
          {season && (
            <div className={`regular-now season${seasonRunning ? ' live' : ''}`}>
              <span className="regular-now-text">
                <span className="regular-now-kind">
                  {seasonRunning ? 'Season now' : 'Last season'} · #{season.number}
                </span>
                <span className="regular-now-name">{season.name}</span>
                <span className="regular-now-meta">
                  {seasonRunning
                    ? `until ${day(season.end, server)} · ${countOf(weeksLeft(season.end, clock), 'week')} left`
                    : `ran until ${day(season.end, server)}`}
                </span>
              </span>
              {/* The season's own two towers, as cards rather than a line of text: they
                  are what a reader came to this panel to open. */}
              {seasonTowers.length > 0 && (
                <span className="regular-towers">
                  {seasonTowers.map(({ card, rerun }) => (
                    <Link prefetch={false} key={card.id} href={`/stages/content/${card.id}`} scroll={false} className="regular-tower">
                      <span className="regular-tower-art">
                        {card.art
                          ? <Image src={card.art} alt="" fill sizes="(max-width: 700px) 45vw, 220px" />
                          : <span className="terminal-row-art-none" />}
                      </span>
                      <span className="regular-tower-text">
                        <span className={`regular-tower-tag${rerun ? ' rerun' : ''}`}>
                          {rerun ? 'Re-run' : 'New'}
                        </span>
                        <span className="regular-tower-name">{card.name}</span>
                        <span className="regular-tower-meta">
                          {countOf(card.count, 'stage')}
                        </span>
                      </span>
                    </Link>
                  ))}
                </span>
              )}
            </div>
          )}
          <h3>Every tower</h3>
          <ModeRail cards={towers} />
        </section>
      </main>
    </>
  );
}

/** A map is cropped to fill; a crest is an emblem and has to be shown whole. */
const ART_CLASS: Record<string, string | undefined> = {
  poster: undefined,
  map: 'score-node-map',
  crest: 'score-node-crest',
};

/** The back catalogue, at the size the other scenes use for a rail. Crests get a
 *  squarer frame than banner art: an emblem in a 3.12 strip is a sliver. */
function ModeRail({ cards }: { cards: StageModeCard[] }) {
  if (!cards.length) return null;
  const crests = cards.some((c) => c.artKind === 'crest');
  return (
    <Rail className={`score-rail explore-rail${crests ? ' crest-rail' : ''}`}>
      {cards.map((card) => (
        <Link prefetch={false} key={card.id} href={`/stages/content/${card.id}`} scroll={false} className="score-node">
          <span className="score-node-pin" aria-hidden="true" />
          <span className="score-node-art">
            {card.art
              ? <Image src={card.art} alt="" fill sizes="(max-width: 700px) 55vw, 240px" className={ART_CLASS[card.artKind ?? 'poster']} />
              : <span className="score-node-art-none">{card.label || '--'}</span>}
          </span>
          <span className="score-node-foot">
            <span className="score-node-name">{card.name}</span>
          </span>
          <span className="score-node-meta">{countOf(card.count, 'stage')}</span>
        </Link>
      ))}
    </Rail>
  );
}

export const getStaticProps: GetStaticProps<Props> = withContentPage<Props>("/stages/regular", async () => ({
  // `now` is the request's, from contentPageClock (lib/content/pageClock.ts).
  props: getRegularTasks(),
}));
