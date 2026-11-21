import { withContentPage } from '@/lib/content/server';
import { loadRelease } from '@/lib/content/release';
import { contentRoute, type ContentManifest } from '@/lib/content/types';
import PageMeta from '@/components/layout/PageMeta';
import type { GetStaticProps } from 'next';
import Image from '@/components/content/ContentImage';
import Link from 'next/link';
import Rail from '@/components/ui/Rail';
import ModeMark from '@/components/stages/ModeMark';
import TerminalNav from '@/components/stages/TerminalNav';
import PageHeader from '@/components/ui/PageHeader';
import { publishedArt } from '@/lib/art/publishedArt';
import { loadAllEventYears } from '@/lib/events/loadEventsData';
import { modeDetails, permanentEventListing } from '@/lib/events/modeDetails';
import type { ScheduleEvent } from '@/lib/schedule/scheduleTypes';
import { getModeCardsOfKind } from '@/lib/stages/terminal';
import type { StageModeCard } from '@/lib/stages/stageTypes';

/**
 * Long-Term Exploration: the two modes that never close.
 *
 * The game gives this section two enormous art cards and a way into every theme
 * behind them. Every theme IS here rather than behind a second press, because unlike
 * the game we are not showing a live account -- a reader looking for IS2 wants to
 * see that it exists.
 */
type ModeGuide = Pick<StageModeCard, 'id' | 'label' | 'name' | 'art'> & { href: string };
type ExplorationCard = StageModeCard | ModeGuide;

interface Props {
  is: StageModeCard[];
  ra: ExplorationCard[];
}

export default function ExplorationPage({ is, ra }: Props) {
  return (
    <>
      <PageMeta title="Long-Term Exploration" description="The Arknights long-term exploration modes and their current seasons." path="/stages/exploration" />
      <TerminalNav current="exploration" />
      <PageHeader
        slim
        eyebrow={<><ModeMark name="integrated-strategies.svg" className="head-mark" />Rhodes Island // Permanent modes</>}
        title="Long-Term Exploration"
        sub={<>
          The two modes that are always open: every Integrated Strategies theme, and every
          season of Reclamation Algorithm.
        </>}
      />

      <main className="terminal-scene">
        <Mode label="Integrated Strategies" cards={is} />
        <Mode label="Reclamation Algorithm" cards={ra} />
      </main>
    </>
  );
}

const cardHref = (card: ExplorationCard) => 'href' in card ? card.href : `/stages/content/${card.id}`;
const cardDetails = (card: ExplorationCard) => 'count' in card ? `${card.count} stages` : 'Mode guide';

function Mode({ label, cards }: { label: string; cards: ExplorationCard[] }) {
  if (!cards.length) return null;
  const [latest, ...rest] = cards;
  return (
    <section className="explore-mode op-section">
      <h2 className="score-block-title">{label}</h2>

      {/* The newest theme at the size the game gives it, the rest as a rail under it.
          Which is what the game's own "View all Themes" leads to. */}
      <Link prefetch={false} href={cardHref(latest)} scroll={'href' in latest} className="explore-hero">
        <span className="explore-hero-art">
          {latest.art
            ? <Image src={latest.art} alt="" fill sizes="(max-width: 900px) 100vw, 1000px" />
            : <span className="terminal-row-art-none" />}
        </span>
        <span className="explore-hero-text">
          <span className="explore-hero-kind">{latest.label || 'Current'}</span>
          <span className="explore-hero-name">{latest.name}</span>
          <span className="explore-hero-meta">{cardDetails(latest)}</span>
        </span>
      </Link>

      {rest.length > 0 && (
        <Rail className="score-rail explore-rail">
          {rest.map((card) => (
            <Link prefetch={false} key={card.id} href={cardHref(card)} scroll={'href' in card} className="score-node">
              <span className="score-node-pin" aria-hidden="true" />
              <span className="score-node-art">
                {card.art
                  ? <Image src={card.art} alt="" fill sizes="(max-width: 700px) 55vw, 240px" />
                  : <span className="score-node-art-none">{card.label || '--'}</span>}
              </span>
              <span className="score-node-foot">
                {card.label && <span className="score-node-code">{card.label}</span>}
                <span className="score-node-name">{card.name}</span>
              </span>
              <span className="score-node-meta">{cardDetails(card)}</span>
            </Link>
          ))}
        </Rail>
      )}
    </section>
  );
}

const RELAUNCH_ANCHOR = 'sandbox_2';

/** Use the published guide until the stage catalogue includes this theme. */
function withRelaunchAnchor(cards: ExplorationCard[], pages?: ContentManifest['pages']): ExplorationCard[] {
  const existing = cards.find(card => card.id === RELAUNCH_ANCHOR);
  if (existing) {
    return pages && 'href' in existing && !Object.hasOwn(pages, existing.href)
      ? cards.filter(card => card !== existing) : cards;
  }
  const event = (loadAllEventYears() as ScheduleEvent[]).find(entry => entry.modeId === RELAUNCH_ANCHOR);
  if (!event || !permanentEventListing(event)) return cards;
  const href = contentRoute('/events/[slug]', { slug: event.name });
  if (pages && !Object.hasOwn(pages, href)) return cards;
  return [{
    id: RELAUNCH_ANCHOR,
    label: 'RA',
    name: event.name.replace(/^\[Reclamation Algorithm\]\s*/, ''),
    art: modeDetails(event.name)?.poster ?? publishedArt(event.poster),
    href,
  }, ...cards];
}

export const getStaticProps: GetStaticProps<Props> = withContentPage<Props>('/stages/exploration', async () => ({
  props: {
    is: getModeCardsOfKind('integrated_strategies'),
    ra: withRelaunchAnchor(getModeCardsOfKind('reclamation')),
  },
}), {
  // The existing content release predates the Exploration card.
  finalize: async props => ({ ...props, ra: withRelaunchAnchor(props.ra, (await loadRelease())?.manifest.pages) }),
});
