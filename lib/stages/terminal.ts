/**
 * The Terminal's own view of the stage data.
 *
 * The game does not present operations as one list. Its Terminal is five scenes --
 * the home board, Score, Long-Term Exploration, Regular Tasks, Seasonal Challenge --
 * and each shows a different slice in a different shape. This module cuts the data
 * the way those scenes want it, leaving lib/stages/stages.ts to answer the questions
 * the old list asked.
 *
 * Nothing new is derived here. Every field comes from getStageModeCards() (art,
 * counts, run windows) and data/story-groups.json (the game's own ordering), joined.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { publicFileExists, publicFiles } from '@/lib/assets/publicAssets';
import itemIcons from '@/data/item-icons.json';
import nationMarks from '@/data/nation-marks.json';
import gameModesData from '@/data/game-modes.json';
import { challengeLabels, checkGameModes } from './gameModes.mjs';
import { getStageModeCards } from './stageContents';
import { getStageBySlug, getStageGroups, getStageSummaries } from './stages';
import { StageModeCard, WEEKDAYS } from './stageTypes';

export interface ScoreNode {
  id: string;
  /** "EP 07", "DM" -- the game's own short code for the content. */
  label: string;
  name: string;
  /** Poster or key art, already percent-encoded for the optimizer. */
  art: string | null;
  /** Whether `art` is the content's own banner or one of its stage maps standing in. */
  artKind: 'poster' | 'map' | 'crest' | null;
  stages: number;
  /** Unix seconds, when the game ran it. */
  start: number | null;
  end: number | null;
  /** No map in any of its stages -- the card says so instead of linking. */
  mapless: boolean;
  /** A Story Collection event: no new enemies, no new mechanic, and no re-run. */
  ministory: boolean;
}

export interface ScoreLine {
  id: string;
  /** "RL", "UR", "LA" -- the two letters the game prints after "Story Line ·".
   *  Null for the main story, which the game labels by act instead. */
  code: string | null;
  name: string;
  /** True for the four acts of the main story, which the game leads with. */
  mainline: boolean;
  /** Which act it is, from 0, for the four mainline lines and null for the rest.
   *  The game marks act 0 `initium` rather than I -- see scripts/import-act-marks.py. */
  act: number | null;
  /** The game's emblem for the line, or null when we have no screenshot of it. */
  mark: string | null;
  /** The line's own art, for the wash behind it. The game has a real background per
   *  storyline (stage_table.storylines names it) and no mirror we can reach ships
   *  those files, so this is the newest banner ON the line -- its own art, in the
   *  place the real one would go. */
  backdrop: string | null;
  nodes: ScoreNode[];
}

/**
 * The Score scene: the main story's four acts, then the side-story lines.
 *
 * Order is the game's, out of data/story-groups.json, which
 * scripts/build/build-story-groups.mjs reads from the storylines table -- so "Story Line ·
 * RL / The Ark" holds Darknights Memoir, A Walk in the Dust, Vigilo and Babel in
 * that sequence, the same as the game's own timeline.
 *
 * Contents the storylines table does not place -- Annihilation, IS, SSS, Supply and
 * the rest -- are deliberately absent: they belong to the other three scenes.
 */
export function getScoreLines(): ScoreLine[] {
  const byId = new Map(getStageModeCards().map((c) => [c.id, c]));
  const lines: ScoreLine[] = [];
  // The storylines table hands the acts over in chapter order, so counting them as
  // they pass IS the act number.
  let act = 0;
  for (const group of getStageGroups()) {
    // Kind groups ("kind-annihilation") are the other scenes' business.
    if (group.id.startsWith('kind-')) continue;
    const nodes: ScoreNode[] = [];
    for (const entry of group.contents) {
      const card = byId.get(entry.id);
      if (!card) continue;
      nodes.push({
        id: card.id,
        label: card.label || '',
        name: card.name,
        art: card.art,
        artKind: card.artKind,
        stages: card.count,
        start: card.start,
        end: card.end,
        mapless: card.mapless,
        ministory: card.ministory,
      });
    }
    if (!nodes.length) continue;
    lines.push({
      id: group.id,
      // Newest first, and only a real banner: a stage map standing in for one is
      // already dim on its own card and makes a muddy wash.
      backdrop: nodes.find((n) => n.artKind === 'poster' && n.art)?.art
        ?? nodes[nodes.length - 1]?.art ?? null,
      // The label carries "CODE -- Name" for a side story and "Main Story -- Act"
      // for an act; the scene wants those apart.
      ...splitLineLabel(group.label),
      mainline: group.mainline,
      act: group.mainline ? act++ : null,
      mark: storyMarkFor(splitLineLabel(group.label).name),
      nodes,
    });
  }
  return lines;
}

/** A story line's emblem in public/story-marks/, or null.
 *
 *  Keyed by the line's own name, which is what scripts/imports/import-story-marks.py names
 *  the files after -- the gamedata's storylineIconId would be the better key and the
 *  files it points at are in no mirror we can reach, so these are screenshots and the
 *  name is the only thing tying the two together. */
export function storyMarkFor(name: string): string | null {
  const file = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.webp`;
  return STORY_MARKS.has(file) ? `/story-marks/${file}` : null;
}

/** Read once from the folder: the same listing trick stageContents.ts uses, so a mark
 *  that is not there is a missing emblem rather than a broken image. */
let storyMarkFiles: Set<string> | null = null;
const STORY_MARKS = {
  has(file: string): boolean {
    if (!storyMarkFiles) {
      storyMarkFiles = new Set(publicFiles('story-marks'));
    }
    return storyMarkFiles.has(file);
  },
};

/** "RL -- The Ark" -> code RL, name The Ark. "Main Story -- Hour of an Awakening"
 *  -> no code, name Hour of an Awakening. */
function splitLineLabel(label: string): { code: string | null; name: string } {
  const at = label.indexOf(' -- ');
  if (at === -1) return { code: null, name: label };
  const head = label.slice(0, at);
  const tail = label.slice(at + 4);
  return head === 'Main Story' ? { code: null, name: tail } : { code: head, name: tail };
}

/** Cards for one kind, newest first -- what the mode scenes are built out of. */
export function getModeCardsOfKind(kind: string): StageModeCard[] {
  return getStageModeCards().filter((c) => c.kind === kind);
}

export interface TerminalHome {
  /** Timed contents. The reader filters by the current clock, so snapshots stay
   *  correct across event boundaries without a data-only republish. */
  candidates: StageModeCard[];
  /** Newest season of each long-term mode, for the two panels the home leads with. */
  latestIs: StageModeCard | null;
  latestRa: StageModeCard | null;
  isThemes: number;
  raSeasons: number;
}

export function getTerminalHome(): TerminalHome {
  const cards = getStageModeCards();
  const is = cards.filter((c) => c.kind === 'integrated_strategies');
  const ra = cards.filter((c) => c.kind === 'reclamation');
  return {
    candidates: cards.filter((c) => c.start && c.end),
    latestIs: is[0] ?? null,
    latestRa: ra[0] ?? null,
    isThemes: is.length,
    raSeasons: ra.length,
  };
}

export interface SupplyCard {
  id: string;
  /** AP, SK, CE, LS, PR -- the code its stages carry. */
  label: string;
  name: string;
  /** Weekdays it opens on. All seven means always, which the game words differently. */
  days: string[];
  stages: number;
  /** Sanity of the cheapest and dearest stage in it. */
  sanity: [number, number] | null;
  /** What this operation is FOR: the item it is farmed for, or its own emblem. */
  mark: string | null;
}

/**
 * The rotating supply operations, in the order the game's Supplies screen puts them.
 *
 * The days come from each stage's own `available_on`, which the pipeline reads out of
 * zone_table's weeklyAdditionInfo -- so "Open on Mon/Thu/Sat/Sun" is the game's own
 * schedule and not a table typed out by hand. Checked against a screenshot of the
 * live game: all seven agree, and Tactical Drill's seven days are why the game says
 * "Always Open" for that one alone.
 */
const SUPPLY_ORDER = ['SK', 'AP', 'CE', 'LS', 'PR'];

/**
 * What each operation is farmed FOR, by the code its stages carry.
 *
 * These cards used to show the operation's deepest map, for want of the portrait art
 * the game draws on them, and one grey map looks much like another -- which is no help
 * at all on the one screen whose question is "which of these do I need today". The
 * game's own answer is a picture of the reward, so these are the item ids, taken from
 * what the deepest stage of each actually drops rather than assigned by hand:
 *
 *   AP-5  Purchase Certificate      CA-5  Skill Summary - 3
 *   CE-6  LMD                       SK-5  Carbon Pack, the top building material
 *   LS-6  Strategic Battle Record, the gold one
 *
 * PR is the exception and has four operations rather than one, split by which classes'
 * chips they hand out -- so each takes its own class emblem, under its own name, from
 * public/mode-marks/.
 */
const SUPPLY_ITEM: Record<string, string> = {
  AP: '4006', CA: '3303', CE: '4001', LS: '2004', SK: '3114',
};

/** The emblem for one of the four chip operations, or null if it is not one. */
function supplyEmblem(name: string): string | null {
  const file = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.webp`;
  return publicFileExists(`/mode-marks/${file}`)
    ? `/mode-marks/${file}` : null;
}

export function getSupplyCards(): SupplyCard[] {
  const cards = new Map<string, SupplyCard>();
  for (const row of getStageSummaries()) {
    if (row.variantOf || !row.contentId) continue;
    const stage = getStageBySlug(row.slug);
    if (!stage || stage.content?.kind !== 'supply') continue;
    let card = cards.get(row.contentId);
    if (!card) {
      card = {
        id: row.contentId,
        label: (row.code || '').split('-')[0] || '',
        name: stage.content?.name || row.contentId,
        days: [],
        stages: 0,
        sanity: null,
        mark: null,
      };
      cards.set(row.contentId, card);
    }
    card.stages += 1;
    for (const day of stage.available_on as string[] | null ?? []) {
      if (!card.days.includes(day)) card.days.push(day);
    }
    if (stage.sanity_cost != null) {
      card.sanity = card.sanity
        ? [Math.min(card.sanity[0], stage.sanity_cost), Math.max(card.sanity[1], stage.sanity_cost)]
        : [stage.sanity_cost, stage.sanity_cost];
    }
    if (!card.mark) {
      const item = SUPPLY_ITEM[card.label];
      const icon = item ? (itemIcons as Record<string, string>)[item] : null;
      card.mark = icon ? `/item-icons/${icon}` : supplyEmblem(card.name);
    }
  }
  const out = [...cards.values()];
  for (const card of out) card.days.sort((a, b) => WEEKDAYS.indexOf(a) - WEEKDAYS.indexOf(b));
  return out.sort((a, b) => {
    const ga = SUPPLY_ORDER.indexOf(a.label);
    const gb = SUPPLY_ORDER.indexOf(b.label);
    if (ga !== gb) return (ga < 0 ? 99 : ga) - (gb < 0 ? 99 : gb);
    return a.id.localeCompare(b.id, undefined, { numeric: true });
  });
}

/** One window of the Annihilation rotation, from data/mode-rotations.json. */
export interface ModeRotation {
  stageId: string;
  slug: string;
  contentId: string | null;
  start: number;
  end: number;
}

/** One numbered season of Stationary Security Service. */
export interface SssSeason {
  id: string;
  number: number;
  name: string;
  start: number;
  end: number;
  /** The towers it runs -- content ids, one of them usually a re-run. */
  contentIds: string[];
  replicated: string[];
}

export interface RegularTasks {
  /** Every rotation window and every zone: the page picks what is live against the
   *  reader's clock, as the home board does. 31 windows and 15 zones is nothing. */
  rotations: ModeRotation[];
  zones: StageModeCard[];
  seasons: SssSeason[];
  towers: StageModeCard[];
}

let rotationData: { annihilation: ModeRotation[]; sss: SssSeason[] } | null = null;
function rotations() {
  if (!rotationData) {
    try {
      rotationData = JSON.parse(readFileSync(join(process.cwd(), 'data', 'mode-rotations.json'), 'utf8'));
    } catch {
      // The file is built by scripts/build-mode-rotations.mjs. Without it the scene
      // still lists every zone and tower; it just cannot say which is open.
      rotationData = { annihilation: [], sss: [] };
    }
  }
  return rotationData!;
}

/**
 * Regular Tasks: the two modes that are always open but never the same.
 *
 * Annihilation rotates one map at a time and SSS runs numbered seasons of two towers,
 * and the game leads this screen with both. The windows come from
 * data/mode-rotations.json, which the pipeline joins out of campaign_table and
 * climb_tower_table.
 */
export function getRegularTasks(): RegularTasks {
  const cards = getStageModeCards();
  const data = rotations();
  return {
    rotations: data.annihilation,
    zones: cards.filter((c) => c.kind === 'annihilation').map(withCrest),
    seasons: data.sss,
    towers: cards.filter((c) => c.kind === 'sss'),
  };
}

/**
 * An Annihilation operation wearing its nation's crest instead of a stage map.
 *
 * These are the one mode whose operations are PLACES -- Chernobog, Lungmen, the
 * Scorching Workshop -- and the game marks each with the crest of the country it is
 * in. Fifteen cropped stage maps, on the other hand, are fifteen grey grids that
 * look alike and say nothing about where a reader is being sent.
 *
 * The crest is only substituted where there IS one: data/nation-marks.json is written
 * by scripts/imports/import-nation-marks.py from the wiki, and a nation it could not find
 * keeps the map rather than showing an empty frame.
 */
function withCrest(card: StageModeCard): StageModeCard {
  const file = (nationMarks as Record<string, string>)[card.id];
  if (!file) return card;
  return { ...card, art: `/nation-marks/${file}`, artKind: 'crest', artRaw: false };
}

/** One challenge mode of data/game-modes.json with its seasons, newest first. */
export interface SeasonalChallengeMode {
  label: string;
  name: string;
  /** Its emblem in public/mode-marks/, or null. */
  mark: string | null;
  cards: StageModeCard[];
}

export interface SeasonalChallenge {
  ccb: StageModeCard[];
  /** Vector Breakthrough, Trials for Navigator and whatever data/game-modes.json adds. */
  challenges: SeasonalChallengeMode[];
}

/** data/game-modes.json, checked (lib/stages/gameModes.mjs). */
export function getGameModes() {
  return checkGameModes(gameModesData);
}

/** The display codes the Seasonal Challenge scene claims, for sceneForContent. */
export function getChallengeLabels(): string[] {
  return challengeLabels(getGameModes());
}

/**
 * Seasonal Challenge: the challenge modes the game files under it, newest first.
 *
 * Contingency Contract is its own content kind. The others -- Vector Breakthrough and
 * Trials for Navigator today -- are not: the game files them as events, which is why they
 * were sitting in Score with the side stories. So each is picked out by the display code
 * the game gives its contents (VEC, TN), and which codes those are is data/game-modes.json,
 * not this file: a new challenge mode is a data edit. build-mode-exclusions.mjs holds any
 * content of a challenge's activity type whose code is not the record's, so a season never
 * goes missing from here quietly.
 */
export function getSeasonalChallenge(): SeasonalChallenge {
  const cards = getStageModeCards();
  return {
    ccb: cards.filter((c) => c.kind === 'contingency_contract'),
    challenges: challengeModes((label) => cards.filter((c) => c.label === label)),
  };
}

/** data/game-modes.json's challenge modes, each with the seasons `cardsFor` gives it. */
function challengeModes(cardsFor: (label: string) => StageModeCard[]): SeasonalChallengeMode[] {
  return getGameModes().seasonalChallenges.map(({ label, name, mark }) => ({
    label,
    name,
    // A mask of a file the release does not have paints nothing, silently; a mark the
    // asset index lacks is no mark (the test holds the committed record to the index).
    mark: mark && publicFileExists(`mode-marks/${mark}`) ? mark : null,
    cards: cardsFor(label),
  }));
}

/** Where a release compiled before data/game-modes.json kept each challenge mode. */
const PREVIOUS_RELEASE_KEYS: Record<string, string> = { VEC: 'vector', TN: 'trials' };

/**
 * /stages/seasonal's props as this page reads them, from whichever release they came from.
 *
 * A release compiled before the challenge modes were data carries them as `vector` and
 * `trials`, not `challenges`. Production renders the live release, and after a deploy the
 * live release is still the one the previous code compiled: the release gate
 * (scripts/content/deploy-gate.mjs) holds the next one until production runs this code.
 * Reading only the new shape, Deploy's build failed prerendering this page against it, so
 * production stayed on the old code and the gate then held every release after it
 * (2026-09-26 verification). A release this code compiled passes through unchanged.
 * scripts/tests/test-previous-release-props.ts renders the page from the live release's copy.
 */
export function seasonalFromRelease<P extends SeasonalChallenge>(props: P): P {
  if (Array.isArray(props.challenges)) return props;
  const previous = props as unknown as Record<string, unknown>;
  const cardsFor = (label: string) => {
    const cards = previous[PREVIOUS_RELEASE_KEYS[label] ?? ''];
    return Array.isArray(cards) ? (cards as StageModeCard[]) : [];
  };
  const upgraded: Record<string, unknown> = { ...previous, challenges: challengeModes(cardsFor) };
  for (const key of Object.values(PREVIOUS_RELEASE_KEYS)) delete upgraded[key];
  return upgraded as unknown as P;
}
