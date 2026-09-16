import path from 'path';
import indexData from '@/public/stages-index.json';
import contentData from '@/data/stages-content.json';
import isNodeData from '@/data/is-nodes.json';
import ccStageData from '@/data/cc-stages.json';
import contentWindowData from '@/data/content-windows.json';
import contentTraits from '@/data/content-traits.json';
import { loadAllEventYears } from '@/lib/events/loadEventsData';
import { getEventPoster } from '@/lib/schedule/eventPosterMatch';
import { ScheduleEvent } from '@/lib/schedule/scheduleTypes';
import { StageContent, StageModeCard, StageSummary } from './stageTypes';
import { compareStageSummaries } from './stageSort';
import { publicFiles } from '@/lib/assets/publicAssets';

/**
 * The stages landing page's rows: one per chapter, event or mode the game runs,
 * with the art to show it by.
 *
 * Grouped by CONTENT KIND rather than by stage type, because the kind is what
 * the game's own Terminal tabs by -- Integrated Strategies is a mode you enter,
 * not a type of stage. The two vocabularies differ (a Stationary Security
 * Service content has kind `sss` while its stages have type `climb_tower`), so
 * this module works in kinds throughout and never in types.
 */

const POSTER_DIR = path.join(process.cwd(), 'public', 'event-poster');
const RENDER_DIR = path.join(process.cwd(), 'public', 'stages-images');
const CONTENT_ART_DIR = path.join(process.cwd(), 'public', 'content-art');

let dirCache: Map<string, Set<string>> | null = null;
/** One listing per directory, because this is asked ~150 times per build. */
function listing(dir: string): Set<string> {
  if (!dirCache) dirCache = new Map();
  let set = dirCache.get(dir);
  if (!set) {
    set = new Set(publicFiles(path.basename(dir)));
    dirCache.set(dir, set);
  }
  return set;
}

/** Percent-encodes the filename while leaving the path separators alone -- the
 *  optimizer answers 400 for a raw non-ASCII letter and 200 for the same letter
 *  encoded, which is the only reason this is not just the path. */
function encodePath(p: string): string {
  return p
    .split('/')
    .map((seg) => (seg ? encodeURIComponent(seg) : seg))
    .join('/');
}

/** The kinds the game gives an event banner to. Everything else -- Annihilation,
 *  Integrated Strategies, Stationary Security Service, Supply, Contingency
 *  Contract -- is a permanent mode with its own art in game and none in this
 *  repo, and matching those against the event list by name is how Annihilation
 *  Bolívar ended up showing the poster for the event "Bolívar Diagnosed" and
 *  Annihilation Ursus the one for "Children of Ursus". A country's name is not
 *  a content id, so those fall back to one of their own maps instead. */
const POSTERED_KINDS = new Set(['event', 'story']);

/**
 * A content's own art, keyed by ID rather than matched by name.
 *
 * Written out per content by scripts/imports/import_content_art.py: the in-game art for every
 * main-story episode, and the banner for Reclamation Algorithm. This is checked FIRST,
 * so an episode shows the art the game puts on it instead of whichever of its stages
 * happened to have a render, and RA gets art at all -- POSTERED_KINDS keeps the
 * name-matched path away from permanent modes on purpose.
 *
 * Keying by id is what makes it safe for those modes: there is no fuzzy match to send
 * Annihilation Bolívar the poster for "Bolívar Diagnosed".
 */
function contentArtFor(id: string): string | null {
  return listing(CONTENT_ART_DIR).has(`${id}.webp`) ? `/content-art/${id}.webp` : null;
}

/**
 * The event banner for a content, or null.
 *
 * Only local files count. Three of the events' poster fields hold a remote wiki URL
 * and one names a file that is not in the repo, and a card pointing at any of those is
 * a blank card on a site that is supposed to stand on its own.
 */
function posterFor(kind: string, name: string, events: ScheduleEvent[]): string | null {
  if (!POSTERED_KINDS.has(kind)) return null;
  for (const candidate of posterNames(name)) {
    const hit = getEventPoster(candidate, events);
    if (!hit || !hit.startsWith('/event-poster/')) continue;
    const file = decodeURIComponent(hit.slice('/event-poster/'.length));
    if (listing(POSTER_DIR).has(file)) return `/event-poster/${file}`;
  }
  // Last resort: match the folder directly.
  //
  // The lookup above goes through the SCHEDULE's event list, so a content the
  // schedule does not carry finds nothing even when its poster is sitting in the
  // folder -- 30 of them were, First of A Thousand Autumns and Trials for Navigator
  // among them, each showing one of its own stage maps instead of the art shipped for
  // it. The schedule is a list of runs, not a list of art, so it was never going to
  // be complete; the folder is.
  for (const candidate of posterNames(name)) {
    const file = posterByName().get(normalisePosterName(candidate));
    if (file) return `/event-poster/${file}`;
  }
  return null;
}

/**
 * Poster filenames are close to content names but not equal to them: most carry a
 * bracketed category ("[Side Story – Festival] ..."), a few end in "Rerun", and
 * punctuation and case wander. Compared on letters and digits alone, with those two
 * decorations removed.
 */
function normalisePosterName(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/^\s*\[[^\]]*\]\s*/, '')
    .replace(/\brerun\b/gi, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
}

let postersByName: Map<string, string> | null = null;
/** normalised name -> filename, built once from the folder. */
function posterByName(): Map<string, string> {
  if (!postersByName) {
    postersByName = new Map();
    for (const file of listing(POSTER_DIR)) {
      const stem = file.replace(/\.[a-z0-9]+$/i, '');
      const key = normalisePosterName(stem);
      // First writer wins, so a plain name is never displaced by a Rerun that
      // normalises to the same key.
      if (key && !postersByName.has(key)) postersByName.set(key, file);
    }
  }
  return postersByName;
}

/**
 * The names to look a content's banner up under, best first.
 *
 * A Retrospection content is a side story running again in Records Restoration, and
 * the game gives the re-run no art of its own -- "Il Siracusano - Retrospection" is
 * the same story, and the same picture, as "Il Siracusano". Six contents and 32
 * stages showed a blank card for want of dropping four words. The suffix is stripped
 * as a SECOND attempt, never a first, so a re-run that does get its own poster keeps
 * it.
 */
function posterNames(name: string): string[] {
  const base = name.replace(/\s*[-–—]\s*Retrospection\s*$/i, '');
  return base === name ? [name] : [name, base];
}

/** The render of one stage, named the way its own kind names renders. */
function renderFor(slug: string): string | null {
  const own =
    (isNodeData as Record<string, { render?: string }>)[slug]?.render ||
    (ccStageData as Record<string, { render?: string }>)[slug]?.render;
  if (own && listing(RENDER_DIR).has(own)) return `/stages-images/${own}`;
  return listing(RENDER_DIR).has(`${slug}.webp`) ? `/stages-images/${slug}.webp` : null;
}

/**
 * One content's banner, for a caller that already knows which content it wants --
 * the content page, whose stage cards fall back to it where the game gave the stage
 * itself no render.
 *
 * Same order as the landing page's cards: the content's own art first, which is keyed
 * by id and so applies to permanent modes too, then the name-matched event banner,
 * which is restricted to event and story kinds for the reason POSTERED_KINDS gives.
 */
export function getContentPoster(id: string, kind: string, name: string): string | null {
  const own = contentArtFor(id);
  if (own) return encodePath(own);
  const hit = posterFor(kind, name, loadAllEventYears() as ScheduleEvent[]);
  // Encoded here, like the landing page's cards: the optimizer answers 400 for a raw
  // non-ASCII letter in a filename and 200 for the same letter encoded, and 30 of
  // these posters carry an en-dash. `next dev` optimizes differently, so an
  // unencoded path serves fine locally and is a blank card in production only.
  return hit ? encodePath(hit) : null;
}

/**
 * Every playable chapter, event and mode, newest first.
 *
 * Contents with no stage row at all are left out: the game's minigame events
 * (April Fools', the Duel Channels, the two autochess events), the tutorial and
 * Reclamation Algorithm's first season are all in the content table but have no
 * stages in the dataset, and a card for one is a link to an empty page.
 */
export function getStageModeCards(): StageModeCard[] {
  const contents = contentData as Record<string, StageContent>;
  // Facts about a content that only the whole record set answers; see
  // scripts/build/enrich-stage-index.mjs for what each one means.
  const traits = contentTraits as Record<string, { mapless?: boolean; ministory?: boolean }>;
  const events = loadAllEventYears() as ScheduleEvent[];
  const windows = contentWindowData as Record<string, number[]>;

  const stagesByContent = new Map<string, StageSummary[]>();
  for (const row of (indexData as StageSummary[]).slice().sort(compareStageSummaries)) {
    if (!row.contentId || row.variantOf) continue;
    const list = stagesByContent.get(row.contentId);
    if (list) list.push(row);
    else stagesByContent.set(row.contentId, [row]);
  }

  const cards: StageModeCard[] = [];
  for (const [id, content] of Object.entries(contents)) {
    const stages = stagesByContent.get(id);
    if (!stages?.length) continue;

    const poster = contentArtFor(id) || posterFor(content.kind, content.name, events);
    // A mode the game never postered falls back to one of its own maps, which
    // is the same art its stage cards use -- 57 of these have no banner, and
    // Annihilation, SSS and Supply have none at all.
    let art = poster;
    let artKind: 'poster' | 'map' | null = poster ? 'poster' : null;
    if (!art) {
      for (const stage of stages) {
        const render = renderFor(stage.slug);
        if (render) {
          art = render;
          artKind = 'map';
          break;
        }
      }
    }

    const window = windows[id];
    cards.push({
      id,
      kind: content.kind,
      label: content.label || '',
      name: content.name,
      release: content.release_date,
      count: stages.length,
      art: art ? encodePath(art) : null,
      artKind,
      artRaw: !!art && art.includes("'"),
      start: window ? window[0] : null,
      end: window ? window[1] : null,
      mapless: !!traits[id]?.mapless,
      ministory: !!traits[id]?.ministory,
    });
  }

  // Newest first: what a reader is looking for is far more often this month's
  // event than Chapter 0, and the game's own Terminal leads with what is running.
  return cards.sort((a, b) => {
    const da = a.release || '';
    const db = b.release || '';
    if (da !== db) return db.localeCompare(da);
    // Same day: order by the game's own code, still newest-first. Episodes 00
    // through 04 all released on 2020-01-16, and falling straight through to the
    // name interleaved them alphabetically -- EP 04, EP 00, EP 01, EP 02, EP 03 --
    // which reads as no order at all. Numeric collation, so EP 10 sorts above
    // EP 09 rather than beside EP 01.
    if (a.label && b.label && a.label !== b.label) {
      return b.label.localeCompare(a.label, undefined, { numeric: true });
    }
    return a.name.localeCompare(b.name, undefined, { numeric: true });
  });
}

/** Cards per mode, so the tabs can carry their counts. */
export function getModeCounts(cards: StageModeCard[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const card of cards) counts[card.kind] = (counts[card.kind] || 0) + 1;
  return counts;
}
