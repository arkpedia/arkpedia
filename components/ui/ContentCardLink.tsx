import Link from 'next/link';
import { ReactNode } from 'react';
import ModeMark from '@/components/stages/ModeMark';

/**
 * A card for one content, which is a link unless there is nothing behind it.
 *
 * Fifteen contents have no map in any of their stages -- events from 2020 to 2024, and
 * the first four Trials for Navigator. The game keeps a stage's level file only while
 * there is some way to play it, so for these there is no interactive map, no render,
 * and no enemy list either; the code, the name, the sanity and the drops are what
 * survive. Someone clicking a stage card wants the map, so these say so on the card
 * rather than spending a click to disappoint.
 *
 * The set is data/content-traits.json, written by scripts/build/enrich-stage-index.mjs (see
 * there for why it is computed at that step). It is a fact about the data, so it
 * arrives on the card rather than being re-derived per page.
 */
export default function ContentCardLink({
  id,
  mapless,
  className,
  children,
}: {
  id: string;
  mapless?: boolean;
  className: string;
  children: ReactNode;
}) {
  if (!mapless) {
    return (
      <Link prefetch={false} href={`/stages/content/${id}`} scroll={false} className={className}>
        {children}
      </Link>
    );
  }
  return (
    /* A span rather than a disabled link: there is no destination, so there is nothing
       for a keyboard or a screen reader to be offered and then refused. */
    <span className={`${className} mapless`} title="No map data for this content">
      {children}
    </span>
  );
}

/** The corner note, placed inside a card's art. Bottom right. */
export function NoMapNote() {
  return <span className="card-nomap">no map data</span>;
}

/**
 * The Story Collection mark, bottom left of a card's art.
 *
 * The game files twenty of its events under MINISTORY -- the small ones that brought
 * no new enemies and no new mechanic, and that never come back; their posters carry
 * "[Story Collection]". That is a different question from whether the maps survive:
 * Crossing and A Kazdelian Rescue are Story Collections with every map intact, and
 * Ancient Forge is one with none, so the two marks are independent and a card can
 * wear both. Nothing is hidden either way -- every stage the dataset has is still
 * listed on the content's own page.
 */
export function MinistoryMark() {
  return (
    <span
      className="card-ministory"
      title="Story Collection: a small event with no new enemies or mechanics, and no re-run"
    >
      <ModeMark name="public-affairs.webp" />
    </span>
  );
}
