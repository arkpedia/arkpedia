import { withContentPage } from '@/lib/content/server';
import { GetStaticPaths, GetStaticProps } from 'next';
import Image from '@/components/content/ContentImage';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { getContentPoster } from '@/lib/stages/stageContents';
import { getStageBySlug, getStagePreviewFile, getStageContents } from '@/lib/stages/stages';
import { MODE_LABELS, StageSummary, sceneForContent, variantLabel, variantShortLabel } from '@/lib/stages/stageTypes';
import RaMap, { RaNodeData } from '@/components/stages/RaMap';
import TerminalNav from '@/components/stages/TerminalNav';
import PageHeader from '@/components/ui/PageHeader';
import SearchInput from '@/components/ui/SearchInput';
import StageTitle from '@/components/stages/StageTitle';
import { raMapData } from '@/lib/stages/raMap';
import { isFloor, isNodeCode } from '@/lib/stages/isNodes';
import { compareStageSummaries } from '@/lib/stages/stageSort';
import { matchesSearch } from '@/lib/search/searchNormalize';
import indexData from '@/public/stages-index.json';

/** Cards per press. A season of Integrated Strategies is 179 nodes, each with a
 *  map render behind it, and rendering the lot is 179 requests to the image
 *  optimizer before the page settles. Stage renders are far lighter than event
 *  banners -- 512x286 against 1560x500 -- so this batch is larger than the
 *  landing page's. */
const CARD_PAGE = 48;

/** One stage as a card: the map it is played on, with its number in front. */
interface StageCard {
  slug: string;
  code: string;
  name: string;
  hasBoss: boolean;
  /** Badge for a stage that only exists in one form, e.g. an Adverse Combat
   *  stage with no normal version. */
  badge: string | null;
  /** An Integrated Strategies node's own token -- 3-2 is node 2 of floor 3 -- and
   *  null everywhere else. The game codes 400 of the 525 nodes 'ISW-NO', so this is
   *  the only thing that tells two of them apart besides the name. */
  node: string | null;
  /** File in public/stages-images/, or null when the game has no render. */
  art: string | null;
  /** The other forms of this stage -- Challenge Mode and the like -- which are
   *  toggles on the stage's own page rather than cards here. Named rather than
   *  counted: "+1 form" told you something existed without saying what. */
  forms: string[];
  /** Reclamation Algorithm only: this operation has a node on the map above, so the
   *  list does not repeat it. See the filter in the page. */
  onMap?: boolean;
}

/** The cards under one heading. One unnamed group for content the game does not
 *  divide, floors for Integrated Strategies. */
interface CardGroup {
  title: string;
  hint: string | null;
  cards: StageCard[];
}

interface Props {
  id: string;
  label: string;
  name: string;
  kind: string;
  release: string | null;
  groups: CardGroup[];
  /** The content's own banner, for stages the game gave no render. Null for the
   *  permanent modes, which have no banner in this repo -- see getContentPoster. */
  poster: string | null;
  /** Reclamation Algorithm only: its operations are places, so they get a map. Null
   *  for every other content, which keeps 30kB of node data off their pages. */
  ra: RaNodeData | null;
}

export default function StageContentPage({ label, name, kind, release, groups, poster, ra }: Props) {
  const scene = sceneForContent(kind, label);
  const cards = groups.flatMap((g) => g.cards);
  const withArt = cards.filter((c) => c.art).length;
  const onMapCount = cards.filter((c) => c.onMap).length;
  const listed = cards.length - onMapCount;

  const [limit, setLimit] = useState(CARD_PAGE);
  const [search, setSearch] = useState('');
  const query = search.trim();

  // Filtered inside each group rather than flattened into one relevance-ranked
  // list: the headings are the answer to half the searches here -- typing a boss's
  // name and being told it is on Floor 4 is the useful part -- and an event's own
  // order is what a reader is looking along. Empty groups drop out.
  const found = useMemo(() => {
    // Nothing on the map is repeated in the list below it -- but a search is a
    // question, and answering "no such stage" when the stage is right there on the
    // map would be a worse lie than a little duplication.
    if (!query) {
      return groups
        .map((g) => ({ ...g, cards: g.cards.filter((c) => !c.onMap) }))
        .filter((g) => g.cards.length > 0);
    }
    return groups
      .map((g) => ({
        ...g,
        // Code, name and -- for Integrated Strategies -- the node's own token, which
        // is what a reader has in mind for a node the game codes ISW-NO like the 400
        // others. It is printed on the card, under the name.
        cards: g.cards.filter((c) => matchesSearch(c.code || '', query)
          || matchesSearch(c.name || '', query)
          || matchesSearch(c.node || '', query)),
      }))
      .filter((g) => g.cards.length > 0);
  }, [groups, query]);
  const matched = found.reduce((n, g) => n + g.cards.length, 0);

  // Back to one batch whenever the query changes: pressing "Show 48 more" three
  // times and then typing would otherwise leave a 192-card window over 3 results.
  useEffect(() => { setLimit(CARD_PAGE); }, [query]);

  // The cap spans the groups rather than applying per group: the floors of an
  // Integrated Strategies season are one list with headings in it, so filling
  // floor 1 before starting floor 2 is the order a run reads in anyway.
  const shownGroups = useMemo(() => {
    let left = limit;
    const out: CardGroup[] = [];
    for (const group of found) {
      if (left <= 0) break;
      const take = group.cards.slice(0, left);
      left -= take.length;
      out.push({ ...group, cards: take });
    }
    return out;
  }, [found, limit]);
  const shownCount = shownGroups.reduce((n, g) => n + g.cards.length, 0);
  /* The stage list: how many, the search over them, and the cards themselves. A
     variable rather than markup in place, because Reclamation Algorithm shows exactly
     this behind the map's second tab while every other content shows it as the page. */
  const body = (
    <>
      <div className="stage-section-head op-section">
        {/* Counts what is actually below, not what the content holds: with the map
            taking 84 of Reclamation Algorithm's 102, a heading reading 102 over 18
            cards is just wrong. */}
        <h2>
          {listed} {listed === 1 ? 'stage' : 'stages'}
        </h2>
        {onMapCount > 0 && (
          <span className="stage-count">
            {onMapCount} of {listed + onMapCount} are on the map
          </span>
        )}
        {onMapCount === 0 && withArt < cards.length && (
          <span className="stage-count">
            {cards.length - withArt} without an in-game render
            {poster && ', showing this event\u2019s art instead'}
          </span>
        )}
      </div>

      {/* A search of THIS content, not of the site: the rail on a stage page and
          the box on the landing page both search all 3,786 rows, and neither is
          any use for "which floor is Stasis on" while you are looking at the
          season. Shown from four cards up -- below that the grid IS the answer. */}
      {listed > 4 && (
        <div className="stage-mode-searchrow">
          <SearchInput
            className="stage-mode-search"
            label="Search these stages"
            placeholder="Search this event by stage code or name..."
            value={search}
            onChange={setSearch}
          />
          {query && (
            <span className="stage-count">
              {matched} of {cards.length}
            </span>
          )}
        </div>
      )}

      {/**
        * Reclamation Algorithm's operations are places, and the map is the way to
        * them -- but 18 of its 102 are on no map, so they get the ordinary card grid
        * beside it, on the map's own second tab. They are real operations with real
        * drops and a real fight, and leaving them off the page entirely would be the
        * page quietly lying about what the mode contains.
        *
        * Three are the tutorial's Lessons -- Hunting, Gathering and Equipment,
        * level_sandbox1_tr01..03 -- which the game teaches you in and puts nowhere on
        * the overworld. The other fifteen are what the mode's Strange Territory trips
        * draw from: ten (sandbox_1_97 to _106) are a contiguous block appended after
        * the last overworld operation, and the rest sit in the ordinary numbering with
        * no node of the overworld's 127 naming them. Beside the five fixed
        * expeditions the season ships 54 GENERATED maps, and every node on every one
        * of them carries a single field, minDistance -- the game fills a trip's nodes
        * at run time, so no table says which stage lands where. enemyReplaceData
        * shows the mechanism, swapping an ordinary stage's roster for a themed one
        * (rift_seaborn turns enemy_1001_bigbo into a Seaborn). So: trip stages, and
        * no data anywhere places them.
        */}
      {shownGroups.map((group) => (
        <div key={group.title || 'all'} className="stage-card-group">
          {group.title && (
            <h3 className="stage-drop-group-title">
              {group.title}
              {group.hint && <span className="hint"> -- {group.hint}</span>}
            </h3>
          )}
          <div className="stage-card-grid">
            {group.cards.map((card) => (
          <Link prefetch={false} key={card.slug} href={`/stages/browse?s=${encodeURIComponent(card.slug)}`} className="stage-card">
            <span className="stage-card-art">
              {card.art ? (
                <Image
                  src={`/stages-images/${encodeURIComponent(card.art)}`}
                  alt=""
                  fill
                  sizes="(max-width: 700px) 50vw, 240px"
                />
              ) : poster ? (
                /* No render for this stage, so the content's own banner stands in.
                   Dimmed and marked, because it is the EVENT's art rather than this
                   stage's map -- every card in such a content shows the same
                   picture, and a grid of identical maps would be a lie. */
                <Image
                  className="stage-card-art-poster"
                  src={poster}
                  alt=""
                  fill
                  sizes="(max-width: 700px) 50vw, 240px"
                />
              ) : (
                <span className="stage-card-art-none" />
              )}
            </span>
            {/* The number in front of the map, the way the game's own stage
                select reads it. */}
            <span className="stage-card-code">
              {card.code || card.slug}
              {card.node && card.node !== card.code && (
                <span className="stage-card-node">{card.node}</span>
              )}
              {card.hasBoss && <span className="stage-boss-badge">Boss</span>}
              {card.badge && <span className="stage-variant-badge">{card.badge}</span>}
            </span>
            <span className="stage-card-foot">
              <span className="stage-card-name">{card.name}</span>
              {card.forms.length > 0 && (
                <span className="stage-card-forms">{card.forms.join(' \u00b7 ')} available</span>
              )}
            </span>
              </Link>
            ))}
          </div>
        </div>
      ))}

      {query && matched === 0 && (
        <p className="hint">No stage in this one matches that.</p>
      )}

      {shownCount < matched && (
        <div className="stage-mode-more">
          <button type="button" className="ghost" onClick={() => setLimit((n) => n + CARD_PAGE)}>
            Show {Math.min(CARD_PAGE, matched - shownCount)} more
          </button>
          <span className="stage-count">
            {shownCount} of {matched}
          </span>
        </div>
      )}
    </>
  );

  return (
    <>
      {/* The section bar rather than a back link. It does the link's whole job -- one
          press to the scene this content was listed on -- and answers "where am I"
          at the same time, which a lone "< Regular Tasks" only implied. Its own scene
          is marked current, so the bar reads the same here as it does on the scene. */}
      <TerminalNav current={scene.key} />
      <PageHeader
        slim
        eyebrow={<>{MODE_LABELS[kind] || kind}{release && ` // ${release.slice(0, 4)}`}</>}
        title={<StageTitle code={label} name={name} fallback={name} lead="name" />}
      />

      <main>
        {/* Before the list, because on this one mode the map IS the way in and the
            list is the fallback for anyone who wants to read the names. On RA the two
            are tabs of one panel; everywhere else there is no map and the list is the
            page. */}
        {ra ? <RaMap nodes={ra} listLabel="Other operations" list={body} /> : body}
      </main>
    </>
  );
}

export const getStaticPaths: GetStaticPaths = async () => {
  const contents = getStageContents();
  const withStages = new Set(
    (indexData as StageSummary[]).filter((s) => s.contentId && !s.variantOf).map((s) => s.contentId as string)
  );
  return {
    // Only content that has stages: the 18 entries with none -- the minigame
    // events, the tutorial, Reclamation Algorithm's first season -- would build
    // an empty page, and the landing page does not link to them.
    paths: Object.keys(contents)
      .filter((id) => withStages.has(id))
      .map((id) => ({ params: { id } })),
    fallback: 'blocking',
  };
};

export const getStaticProps: GetStaticProps<Props> = withContentPage<Props>("/stages/content/[id]", async ({ params }) => {
  const id = String(params?.id || '');
  const content = getStageContents()[id];
  if (!content) return { notFound: true };

  const rows = (indexData as StageSummary[]).filter((s) => s.contentId === id);
  // A stage's other forms are a toggle on its own page, so they are counted here
  // rather than given cards of their own.
  const formsOf = new Map<string, string[]>();
  // Counted, not listed: an Integrated Strategies node with two alternates would
  // otherwise read "Variation 2 - Variation 3 available", which says the same thing
  // three times. "3 setups" is the fact -- how many fights sit behind this card.
  const setupsOf = new Map<string, number>();
  for (const row of rows) {
    if (!row.variantOf) continue;
    if (row.variant?.kind === 'variation') {
      setupsOf.set(row.variantOf, (setupsOf.get(row.variantOf) || 0) + 1);
      continue;
    }
    const label = variantShortLabel(row.variant);
    if (!label) continue;
    const seen = formsOf.get(row.variantOf);
    if (seen) seen.push(label);
    else formsOf.set(row.variantOf, [label]);
  }

  // Integrated Strategies is sorted by the source's own order rather than by code,
  // because its code is a node TYPE and not a position: ISW-NO, ISW-DF, ISW-SP and
  // ISW-DU are what kind of node this is, and the usual sort bands by that first --
  // which split one run of boss nodes into an ISW-DF half (b-4..b-10) and an ISW-NO
  // half (b-1..b-3) and opened the group at b-4. The level paths run b-1, b-1-b, b-2
  // ... b-10 straight through them, and that is the only sequence these have.
  const cards: StageCard[] = rows
    .filter((s) => !s.variantOf)
    .sort(content.kind === 'integrated_strategies'
      ? (a, b) => (a.order ?? 0) - (b.order ?? 0)
      : compareStageSummaries)
    .map((s) => {
      // Resolved through the stage's own record, the same way its page does it,
      // so a stage whose render is named after its gamedata id -- every
      // Integrated Strategies node and Contingency Contract stage -- gets the
      // right file rather than a guess from the slug.
      const stage = getStageBySlug(s.slug);
      const isNode = content.kind === 'integrated_strategies' ? isNodeCode(s.slug) : null;
      return {
        slug: s.slug,
        // The game's code first. The node token is the fallback for the one IS node
        // the table gives no code at all (level_rogue4_b-9), where a blank front
        // would just look broken.
        code: s.code || isNode || '',
        node: isNode,
        name: s.name || '',
        hasBoss: !!s.hasBoss,
        badge: s.variantOf == null ? variantLabel(s.variant) : null,
        art: stage ? getStagePreviewFile(stage) : null,
        // Setups lead: they are alternate cuts of THIS fight, where a form is a
        // different mode of it.
        forms: [
          ...(setupsOf.has(s.slug) ? [`${(setupsOf.get(s.slug) || 0) + 1} setups`] : []),
          ...(formsOf.get(s.slug) || []),
        ],
      };
    });

  /**
   * Reclamation Algorithm's five maps show 86 of its 106 operations between them, and a
   * card for one of those is the same operation twice on one page. So they are marked
   * here and the list leaves them out -- until someone searches, when a hit that exists
   * is worth more than a tidy list (see the page).
   */
  const ra = content.kind === 'reclamation' ? raMapData() : null;
  if (ra) {
    // Any of the five maps counts: an operation shown on the Annihilation rift is on a
    // map even if it is not on the overworld.
    const onMap = new Set(ra.maps.flatMap((m) => m.nodes.map((n) => n.slug)).filter(Boolean));
    for (const card of cards) card.onMap = onMap.has(card.slug);
  }

  // Integrated Strategies is the one mode whose stages are not a sequence: a run
  // climbs floors, and 179 nodes in one flat grid says nothing about which are
  // reachable together. Every other content stays one group, which is the order
  // its stages are played in.
  let groups: CardGroup[] = [{ title: '', hint: null, cards }];
  if (content.kind === 'integrated_strategies') {
    const byFloor = new Map<number, StageCard[]>();
    const rest: StageCard[] = [];
    for (const card of cards) {
      const floor = isFloor(card.slug);
      if (floor == null) {
        rest.push(card);
        continue;
      }
      const list = byFloor.get(floor);
      if (list) list.push(card);
      else byFloor.set(floor, [card]);
    }
    groups = [...byFloor.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([floor, list]) => ({ title: `Floor ${floor}`, hint: null, cards: list }));
    if (rest.length) {
      groups.push({
        title: 'Nodes with no floor',
        hint: "the level path names a category rather than a floor, and the dataset does not translate it",
        cards: rest,
      });
    }
    if (!groups.length) groups = [{ title: '', hint: null, cards }];
  }

  return {
    props: {
      id,
      label: content.label || '',
      name: content.name,
      kind: content.kind,
      release: content.release_date,
      groups,
      poster: getContentPoster(id, content.kind, content.name),
      ra,
    },
  };
});
