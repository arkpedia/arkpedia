/** Types for the stage dataset in data/stages/, adapted from
 * arkpedia-database's stages_by_introduction bundles.
 *
 * This schema resolves things the earlier prototype-derived one left implicit:
 * drops state whether they are farmable or one-time and carry the game's own
 * rarity wording; enemies carry per-rank
 * counts and keep conditional spawns separate; geometry documents its own
 * coordinate system and spawn-timing convention. */

export interface StageZone {
  id: string;
  name: string;
  group: string | null;
  type: string;
}

export interface StageContent {
  kind: string;
  id: string;
  /** Short label, e.g. "EP 05". Absent for content that has no display code,
   * such as Annihilation zones. */
  label: string | null;
  name: string;
  release_date: string | null;
}

export interface StageBattle {
  max_life: number | null;
  unit_limit: number | null;
  initial_dp: number | null;
  /** The counter's ceiling. Usually 99, but 999 on 57 levels and 500 on one. */
  max_dp: number | null;
  dp_per_second: number | null;
  dp_recovery_interval_seconds: number | null;
}

export interface StageDifficulty {
  tier: string | null;
  recommended_level: string | null;
}

export interface StageEnemyEntry {
  slug: string;
  name: string;
  /** The in-stage label the briefing shows, e.g. "33" or "AL1". */
  index: string | null;
  count: number | null;
}

/** Grouped the way the game's briefing groups them. `conditional` holds spawns
 * that only appear under some condition -- which is most of what makes
 * Integrated Strategies runs differ from each other. */
export interface StageEnemies {
  total: number;
  by_rank: Record<string, StageEnemyEntry[]>;
  /** Enemies the handbook gives no rank -- props, summons, stage-local things.
   *  Present on 490 stage blocks and part of `total`, so leaving them out of the
   *  roster prints a count over a list that misses them. */
  unranked?: StageEnemyEntry[];
  conditional?: { total: number; by_rank: Record<string, StageEnemyEntry[]>; unranked?: StageEnemyEntry[] };
}

export interface StageDropItem {
  slug: string;
  id: string;
  name: string;
  is_operator: boolean;
}

export interface StageDrop {
  item: StageDropItem;
  /** "farmable" or "one_time". */
  kind: string;
  /** The game's own wording: Guaranteed, Common, Uncommon, Rare, Very Rare. This is
   *  all a drop says about frequency now. Measured per-run rates from Penguin
   *  Statistics used to sit beside it and were removed: they were the only
   *  non-gamedata input, and the only one that changed without the game changing. */
  rarity: string | null;
  raw?: { type?: string; drop_type?: string[]; occ_percent?: string[] };
}

/** Challenge Mode and the like. It names the stage it is a variant OF, which is
 * how a Challenge stage links back to its Normal form. */
export interface StageVariant {
  kind: string;
  /** Null for all 31 `six_star` variants -- the pipeline has no label for that
   *  kind. Read it through variantLabel(), never directly, or those stages
   *  render an empty badge. */
  label: string | null;
  of_stage_code: string | null;
  of_stage_id: string | null;
  shares_parent_level_file?: boolean;
}

/** Kinds the pipeline leaves unlabelled, named from the kind itself.
 *
 * `six_star` is the game's key for the rune-stacking mode on Episode 15 and 16
 * stages (stage id "main_16-15#s", difficulty SIX_STAR, free of sanity, rewards
 * on first completion only). The game calls it Adverse Combat -- its own mission
 * text reads "Clear Adverse Combat 15-10 once" and its medals "Clear all
 * non-Extreme Mode Adverse Combat stages in Episode 15". That is a different
 * mode from the older Adverse Environment, which is a separate stage per chapter
 * (id "tough_10-09", diffGroup TOUGH) whose description opens "Environmental
 * Conditions:" -- so both names are in use and neither is a rename of the other. */
const VARIANT_LABELS: Record<string, string> = {
  challenge_mode: 'Challenge Mode',
  adverse_environment: 'Adverse Environment',
  story_environment: 'Story',
  six_star: 'Adverse Combat',
  orientation_trial: 'Orientation Trial',
  spectacular_trial: 'Spectacular Trial',
  ultimate_trial: 'Ultimate Trial',
  beginner_mode: 'Beginner Mode',
};

/**
 * Which Terminal scene a content sits in -- where "back" goes from its page.
 *
 * One level up, not all the way out: from an Annihilation country the way back is
 * Regular Tasks, which is the screen that country was listed on, and All Operations is
 * two steps away rather than one. The game's Terminal works the same way.
 *
 * Kind decides it for everything except a plain event, and there the game's own
 * two-letter code does: it files Vector Breakthrough and Trials for Navigator as
 * events, but shows them under Seasonal Challenge, which is why they carry VEC and TN
 * while the side stories on Score carry their own.
 *
 * `key` is the TerminalNav section id as well as the last segment of the href -- the
 * content page shows the section bar with its own scene marked current, rather than a
 * back link that says the same thing in fewer places.
 */
export function sceneForContent(kind: string, label?: string): { key: string; href: string; label: string } {
  const scene = (key: string, name: string) => ({ key, href: `/stages/${key}`, label: name });
  if (label === 'VEC' || label === 'TN') return scene('seasonal', 'Seasonal Challenge');
  switch (kind) {
    case 'annihilation':
    case 'sss':
      return scene('regular', 'Regular Tasks');
    case 'integrated_strategies':
    case 'reclamation':
      return scene('exploration', 'Long-Term Exploration');
    case 'contingency_contract':
      return scene('seasonal', 'Seasonal Challenge');
    case 'supply':
      return scene('supplies', 'Supplies');
    case 'story':
    case 'event':
      return scene('score', 'Score');
    default:
      // A kind no scene claims -- the tutorial, and whatever the game adds next.
      return scene('all', 'All operations');
  }
}

/** Where the handbook gives no rank. Its own group, printed last. */
export const UNRANKED = 'Unranked';
export const RANK_ORDER = ['Normal', 'Elite', 'Boss', UNRANKED];
export const rosterRank = (rank: string) => {
  const i = RANK_ORDER.indexOf(rank);
  return i === -1 ? RANK_ORDER.length : i;
};

/** Monday first, as the game's own supply schedule runs. Here rather than in
 *  lib/stages/terminal.ts because a page renders it: terminal.ts reaches stages.ts,
 *  which reads the disk, and importing a runtime value from it pulled `fs` into the
 *  browser bundle. Types cross that line freely; values do not. */
export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** The order the forms of one stage read in, base first. The three trials run
 *  hardest last, as the game unlocks them. `variation` is last of all and carries no
 *  entry in VARIANT_LABELS: each one is numbered by the pipeline ("Variation 2"),
 *  because the game names an alternate cut of an Integrated Strategies node nothing
 *  at all. */
export const VARIANT_ORDER = [
  'challenge_mode', 'adverse_environment', 'story_environment', 'six_star',
  'orientation_trial', 'spectacular_trial', 'ultimate_trial', 'beginner_mode',
  'variation',
];

/**
 * What the BASE form of a family is called, which is not always "Normal".
 *
 * Two families name their own first form. An Integrated Strategies node has no normal
 * cut -- the game picks between equals -- so it reads Variation 1. A Trials for
 * Navigator trial does have one, and the game calls it the Basic Trial, beside the
 * Orientation, Spectacular and Ultimate tiers.
 */
const TRIAL_KINDS = new Set(['orientation_trial', 'spectacular_trial', 'ultimate_trial']);

export function baseFormLabel(kinds: (string | null | undefined)[]): string {
  if (kinds.some((k) => k === 'variation')) return 'Variation 1';
  if (kinds.some((k) => k && TRIAL_KINDS.has(k))) return 'Basic Trial';
  return 'Normal';
}

/** What to print on a variant's badge, or null when there is nothing to print. */
export function variantLabel(variant: StageVariant | null | undefined): string | null {
  if (!variant) return null;
  return variant.label || VARIANT_LABELS[variant.kind] || variant.kind.replace(/_/g, ' ') || null;
}

/**
 * The same vocabulary, shortened for a card front.
 *
 * Challenge Mode is CM to everyone who plays the game, and SSS's hard levels are EX
 * to them -- the table calls the set hardLevels and the records follow it, but the
 * stage ids are _ex and that is the word. The rest fit as they are.
 *
 * Beside VARIANT_LABELS rather than in the page that prints them, which is where this
 * lived: two tables of the same words in two files means adding a form (the
 * Integrated Strategies variations were the last one) is two edits, and the second
 * one gets forgotten.
 */
const VARIANT_SHORT_LABELS: Record<string, string> = {
  challenge_mode: 'CM',
  adverse_environment: 'Adverse Env.',
  story_environment: 'Story',
  six_star: 'Adverse Combat',
  hard_mode: 'EX',
  // "Trial" is the noun every one of these shares, so it is the word a card front
  // can spare: three tiers of TN-1 reading Orientation / Spectacular / Ultimate.
  orientation_trial: 'Orientation',
  spectacular_trial: 'Spectacular',
  ultimate_trial: 'Ultimate',
  // The word the game uses for it, minus the "mode" a card front can spare.
  beginner_mode: 'Beginner',
};

export function variantShortLabel(variant: StageVariant | null | undefined): string | null {
  if (!variant) return null;
  return VARIANT_SHORT_LABELS[variant.kind] || variantLabel(variant);
}

export interface Stage {
  slug: string;
  id: string;
  code: string;
  name: string;
  description: string | null;
  stage_type: string;
  chapter: number | null;
  variant: StageVariant | null;
  order: number | null;
  zone: StageZone | null;
  act: { id: string; name: string; index: number } | null;
  event: unknown | null;
  available_on: unknown | null;
  content: StageContent | null;
  battle: StageBattle | null;
  difficulty: StageDifficulty | null;
  enemies: StageEnemies | null;
  drops: StageDrop[];
  sanity_cost: number | null;
  exp: number | null;
  exp_3star: number | null;
  lmd: number | null;
  lmd_3star: number | null;
  preview: string | null;
  /** Key into data/stage-geometry/, or null when the stage has no map data.
   * One geometry serves every variant that shares the map. */
  geometryKey: string | null;
}

/** The list page's row. Separate from Stage so the index does not carry every
 * stage's drops and enemy tables. */
export interface StageSummary {
  slug: string;
  code: string;
  name: string;
  stageType: string;
  variant: StageVariant | null;
  zoneName: string | null;
  contentId: string | null;
  contentLabel: string | null;
  contentName: string | null;
  hasBoss: boolean;
  order: number | null;
  /** The stage this one is a Challenge Mode / Adverse Environment / Story /
   *  6-star form OF, or null. Written into the index by
   *  scripts/build/enrich-stage-index.mjs, since the source states the link as the
   *  base stage's gamedata id and resolving it needs every stage record. */
  variantOf?: string | null;
}

/** A unit the stage starts with already on the field: a device (the towers, stun
 *  pillars, freezing towers and crates the map is built around) or an operator
 *  the stage supplies and places for you. Read from the level file's
 *  `predefines` -- see scripts/import_stage_devices.py. */
export interface StageDevice {
  kind: 'device' | 'operator';
  key: string;
  name: string;
  description: string | null;
  row: number;
  col: number;
  /** Placed but not visible until the stage reveals it. */
  hidden: boolean;
}

/** One chapter or event in the filter, with how many stages it holds of each
 *  stage type -- a chapter carries story stages, interludes and vignettes at
 *  once, so the count depends on which type is filtered for. */
export interface StageContentEntry {
  id: string;
  /** Display code, e.g. "EP 05". Empty for content the game gives none. */
  label: string;
  name: string;
  count: number;
  byType: Record<string, number>;
  /** When the game runs this, in unix seconds -- null for permanent content.
   *  The list opens on whatever is running now. */
  start: number | null;
  end: number | null;
}

/** A heading in the chapter filter: an act of the main story, one of the game's
 *  13 side-story lines, or a category that has no storyline. */
export interface StageGroup {
  id: string;
  label: string;
  /** One of the main story's acts. The list falls back to the latest chapter of
   *  the last of these when no event is running. */
  mainline: boolean;
  contents: StageContentEntry[];
}

/** The shape tileStyle() reads. Kept separate from GeometryTile because the
 * styling only depends on these five properties, whatever the source schema
 * happens to call them. */
export interface StageTileKind {
  k: string;
  high: boolean;
  build: string;
  walk: boolean;
  fly: boolean;
}

/** Tiles carry their own properties, so an unfamiliar tile key still renders. */
export interface GeometryTile {
  key: string;
  height: string;
  walkable: boolean;
  deployable: string;
  flyable: boolean;
}

export interface GeometryRoute {
  motion: string | null;
  placeholder?: boolean;
  start: { row: number; col: number } | null;
  end: { row: number; col: number } | null;
  checkpoints: { row: number; col: number; type?: string }[];
  waits: unknown[];
}

export interface GeometryWaveSpawn {
  enemy: string;
  route?: number | null;
  time?: number | null;
  count?: number | null;
  interval?: number | null;
}

export interface GeometryWave {
  index: number;
  duration: number | null;
  pre_delay: number | null;
  post_delay: number | null;
  max_wait_for_next_wave: number | null;
  spawns: GeometryWaveSpawn[];
}

/** One tile kind as it appears on a specific map. Held per map rather than
 * globally because 34 of the 103 tile keys genuinely differ between stages --
 * tile_road, tile_wall and tile_forbidden among them -- so a single global
 * key->properties table would quietly misreport those. */
export type TileKindEntry = GeometryTile;

/** Prose the pipeline writes about the game's own tile types, keyed by tile
 * key. One shared file: there are 77 distinct keys game-wide, and carrying them
 * in every geometry cost 2.1MB to say the same thing 2,804 times. */
export type TileLegend = Record<string, { name?: string; description?: string }>;

/** The map, routes and spawn schedule for one stage.
 *
 * Re-encoded from the pipeline's own geometry, losslessly and with the rebuild
 * asserted against the source: tiles are a grid of indices into `tileLegend`
 * rather than 373,927 five-key objects, and routes are deduplicated -- 56,532
 * of 101,932 entries were exact duplicates of another route in the same stage.
 * Every reference into `routes` (waves, spawn and objective tiles) was remapped
 * and checked to still resolve to an identical route body. */
export interface StageGeometry {
  slug: string;
  rows: number;
  cols: number;
  tileLegend: TileKindEntry[];
  /** rows x cols of indices into tileLegend. Row 0 is the BOTTOM row as drawn
   * in game -- the pipeline states this, and the map flips it when drawing. */
  tileGrid: number[][];
  routes: GeometryRoute[];
  waves: GeometryWave[];
  spawnTiles: { key: string; row: number; col: number; routes: number[] }[];
  objectiveTiles: { key: string; row: number; col: number; routes: number[] }[];
  enemyConfigurations: {
    enemy_id: string;
    slug: string;
    name: string;
    database_level: number;
    /** Attributes this ONE stage changes, on top of the level it fields -- the
     * level file's overwrittenData, already under canonical stat names. A Dual
     * Swordsman with 2,000 HP in the enemy table stands up with 65,000 here. */
    overrides?: Record<string, number | null> | null;
  }[];
  suppliedUnits: {
    fixed_squad: unknown[];
    /** One entry per KIND of device, carrying how many copies it hands you --
     * ten Roadblocks are one entry with count 10, not ten entries. */
    deployable_tokens: { count?: number | null }[];
  };
  /** Whether data/stage-conditional/<slug>.json exists. Split out because it is
   * 7.5MB that only matters when the conditional enemies are being shown. */
  hasConditionalSpawns: boolean;
}

/** An enemy in a stage, resolved against the enemy dataset -- icon, stats
 * (including the elemental figures) and the flavour text and abilities the
 * expanded row shows. */
export interface StageEnemyDetail {
  slug: string;
  name: string;
  icon: string | null;
  rank: string | null;
  race: string | null;
  movement: string | null;
  attackPosition: string | null;
  damageType: string[];
  flavourText: string | null;
  abilities: string[];
  /** How many level variants the enemy has. */
  levelCount: number;
  /** The one this stage fields, 0-based, or null when the enemy has no levels. */
  level: number | null;
  /** True when the stage stated no level and the strongest was assumed. */
  levelAssumed: boolean;
  /** True when this stage overrides some of the level's attributes. */
  statsOverridden: boolean;
  /** Tiles per second, for the playback timeline. */
  moveSpeed: number | null;
  stats: {
    hp: number | null;
    atk: number | null;
    def: number | null;
    res: number | null;
    elementalRes: number | null;
    elementalDamageRes: number | null;
    attackInterval: number | null;
  } | null;
}

/** Display names for stage_type, in reading order. */
export const TYPE_LABELS: Record<string, string> = {
  main: 'Main Theme',
  sub: 'Main Theme (Interlude)',
  activity: 'Event',
  event: 'Event (Legacy)',
  special_story: 'Vignette',
  campaign: 'Annihilation',
  daily: 'Supply',
  integrated_strategies: 'Integrated Strategies',
  climb_tower: 'Stationary Security Service',
  reclamation: 'Reclamation Algorithm',
  contingency_contract: 'Contingency Contract Battleplan',
  guide: 'Tutorial',
};

/** Stage types the filter merges into another.
 *
 * `sub` is the main story's interludes, which live in the same chapters as its
 * ordinary stages -- Episode 5 holds both -- so offering them as a separate
 * "Main Theme (Interlude)" filter split one chapter across two entries with no
 * useful distinction. TYPE_LABELS keeps the name for the badge on a stage's own
 * page, where saying which kind of stage you are reading is worth a word. */
const TYPE_FOLD: Record<string, string> = { sub: 'main' };

/** The type a stage filters under, which is not always the type it is. */
export function filterType(stageType: string): string {
  return TYPE_FOLD[stageType] || stageType;
}

export const TYPE_ORDER = [
  // 'special_story' -- the Vignettes -- is not here: those 10 stages carry no map,
  // no roster and no drops, and scripts/build/enrich-stage-index.mjs drops them from the
  // roster entirely.
  'main', 'activity', 'event', 'daily', 'campaign',
  'integrated_strategies', 'climb_tower', 'reclamation', 'contingency_contract', 'guide',
];

/** Most to least frequent, in the game's own wording. */
export const RARITY_ORDER = ['Guaranteed', 'Common', 'Uncommon', 'Rare', 'Very Rare'];

/* --- Modes, as the stages landing page tabs them ---------------------------
   Keyed by CONTENT KIND, not by stage type: the kind is what the game's own
   Terminal tabs by, and the two vocabularies differ -- a Stationary Security
   Service content has kind `sss` while its stages have type `climb_tower`. Kept
   here beside TYPE_LABELS so the browser can read them without pulling in
   lib/stages/stageContents.ts, which reads the filesystem. */
/** The tabs, in the order the game's Terminal offers these modes. */
export const MODE_ORDER = [
  'integrated_strategies',
  'reclamation',
  'sss',
  'story',
  'event',
  'supply',
  'annihilation',
  'contingency_contract',
];

/** Full names, matching the wording lib/stages/stages.ts already uses for the
 *  same kinds. `event` is the exception: that table calls it "Events outside a
 *  storyline", which is what it means inside the chapter filter specifically,
 *  whereas here the tab holds every event the game files under Side Story. */
export const MODE_LABELS: Record<string, string> = {
  integrated_strategies: 'Integrated Strategies',
  reclamation: 'Reclamation Algorithm',
  sss: 'Stationary Security Service',
  story: 'Main Story',
  event: 'Side Story',
  supply: 'Supply',
  annihilation: 'Annihilation',
  contingency_contract: 'Contingency Contract Battleplan',
  guide: 'Tutorial',
};

/** What the tab itself says. Three modes are known by their initials and by
 *  almost nothing else -- nobody calls IS "Integrated Strategies" out loud --
 *  and spelling all eight out in full does not fit one row. The full name stays
 *  on the tab's tooltip. */
export const MODE_SHORT: Record<string, string> = {
  integrated_strategies: 'IS',
  reclamation: 'RA',
  sss: 'SSS',
  contingency_contract: 'CCB',
};

export interface StageModeCard {
  id: string;
  kind: string;
  /** Display code, e.g. "EP 05". Empty for the 42 contents the game gives none. */
  label: string;
  name: string;
  /** ISO date, or null for content the dataset dates from nothing. */
  release: string | null;
  /** Non-variant stages, which is what the content's own page lists. */
  count: number;
  /** Ready to hand to next/image, already percent-encoded. */
  art: string | null;
  /** A poster is the event's own banner and fills the card; a map is one of its
   *  stages' renders, standing in for a mode the game never made a banner for; a
   *  crest is a nation's mark, which is what Annihilation operations are. */
  artKind: 'poster' | 'map' | 'crest' | null;
  /** True when the image optimizer would 400 on this filename, so the card has
   *  to serve it unoptimized. See the apostrophe case in
   *  lib/operators/operatorIconPaths.ts' neighbours: /_next/image rejects them
   *  outright at this version, encoded or not. */
  artRaw: boolean;
  /** When the game runs this, in unix seconds, or null for permanent content. */
  start: number | null;
  end: number | null;
  /** True when not one of its stages has a map -- see components/ContentCardLink. */
  mapless: boolean;
  /** The game's MINISTORY classification: a small event that brought no new enemies
   *  and no new mechanic, and that never comes back. */
  ministory: boolean;
}
