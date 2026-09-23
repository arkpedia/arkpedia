/**
 * Types for the enemy bundles in data/enemies/ and the appearance index
 * in data/enemy_appearances.json (schema_version 3, first imported from
 * arkpedia-database's build_enemies.py and regenerated from the EN tables by
 * scripts/build/build-enemy-records.mjs).
 *
 * Two things about this data shape are worth knowing up front, because
 * the page design follows from both:
 *
 * 1. The bundles are a PARTITION BY INTRODUCTION -- an enemy's full
 *    record lives in exactly one file, the content that first fielded it
 *    on Global. It is never copied into the later content it also shows
 *    up in. So "which chapter is this enemy from" is answered by the
 *    bundle, but "where can I fight it" is a different question entirely.
 *
 * 2. That second question is what EnemyAppearance answers, from the
 *    opposite direction: content -> the enemies it fields. The same
 *    Sarkaz Greatswordsman turns up in a story episode, several events
 *    and two roguelikes at once, so appearance is a membership test, not
 *    a category the enemy belongs to.
 */

/** Every content kind the bundles are partitioned by. */
export type ContentKind =
  | 'story'
  | 'event'
  | 'annihilation'
  | 'supply'
  | 'sss'
  | 'integrated_strategies'
  | 'reclamation'
  | 'contingency_contract';

export interface EnemyContent {
  kind: ContentKind;
  /** Stable gamedata content id -- `main_4`, `act12side`, `camp_zone_3`. */
  id: string;
  /** Short player-facing code (`EP 04`, `IS6`, `CF`), null for ~34 entries. */
  label: string | null;
  name: string;
  /** First Global release, `YYYY-MM-DD`. */
  release_date: string | null;
}

/** A declared 0 is meaningfully different from null (absent upstream). */
export interface EnemyStats {
  hp: number | null;
  atk: number | null;
  def: number | null;
  res: number | null;
  elemental_res: number | null;
  elemental_damage_res: number | null;
  attack_interval: number | null;
  attack_speed: number | null;
  move_speed: number | null;
  range: string | null;
  weight: number | null;
  taunt: number | null;
  life_cost: number | null;
}

/** Letter grades from the handbook's own banding, E through S. */
export type StatRanks = Partial<
  Record<
    'hp' | 'atk' | 'def' | 'res' | 'elemental_res' | 'elemental_damage_res' | 'move_speed' | 'attack_speed',
    string | null
  >
>;

export interface EnemySkill {
  key: string;
  sp_cost: number | null;
  cooldown: number | null;
  initial_cooldown: number | null;
  priority: number | null;
  parameters: Record<string, number | string | boolean | null>;
}

export interface EnemyTalent {
  key: string;
  parameters: Record<string, number | string | boolean | null>;
}

export interface EnemySp {
  initial: number | null;
  max: number | null;
  recovery: string | null;
  increment: number | null;
}

/** Level 0 is the default combat row; 1 and 2 are database variants. */
export interface EnemyLevel {
  level: number;
  stats: EnemyStats;
  stat_ranks: StatRanks;
  skills: EnemySkill[];
  talents: EnemyTalent[];
  immunities: string[];
  sp: EnemySp | null;
}

export interface EnemyAbility {
  text: string;
  /** `normal`, `title` -- upstream's own emphasis hint. */
  format: string;
}

export interface Enemy {
  /** Unique, stable join key. Names are NOT unique -- 48 records share one. */
  slug: string;
  /** Upstream gamedata id, e.g. `enemy_1010_demon`. */
  id: string;
  name: string;
  /** Handbook code (`B1`, `SFR06`). Player-facing, NOT unique. */
  index: string | null;
  rank: 'Normal' | 'Elite' | 'Boss';
  /** In-game handbook ordering. */
  sort: number;
  /**
   * The in-game handbook doesn't list this one. 45 of 1,585 -- usually the
   * harder copy of an entry that IS listed, sharing its index (`SP08` OpFor:
   * Armor exists at both 600k and 1.2m HP). They trail the very end of `sort`
   * instead of sitting beside what they duplicate, so reproducing the game's
   * order means excluding them: the last row a player sees is `SP18` at 1604,
   * not `SAM` at 1609.
   */
  hidden: boolean;
  /** `/enemies-icons/<name>.webp`, or null for the 11 with no upstream art. */
  icon: string | null;
  flavour_text: string | null;
  race: string | null;
  movement: 'Ground' | 'Flying';
  attack_position: 'Melee' | 'Ranged' | 'Melee and Ranged' | null;
  damage_type: string[];
  abilities: EnemyAbility[];
  /** Always non-empty. */
  levels: EnemyLevel[];
}

export interface EnemyBundle {
  schema_version: number;
  content: EnemyContent;
  enemies: Enemy[];
}

/** One row of data/enemy_appearances.json: a content entry and every enemy it fields. */
/** A stage of some content that fields an enemy. */
export interface EnemyStage {
  /** The in-game code, e.g. 1-7. A placeholder on IS and Reclamation nodes,
   *  where several stages share one and only `name` tells them apart. */
  code: string;
  /** The stage page's slug -- what /stages/<slug> resolves to. */
  slug: string;
  name?: string;
  /** Set only when the enemy is reachable through a re-cut alone, e.g. the
   *  stage's Challenge Mode but not its plain run. */
  variant?: string;
}

/** One content an enemy can be fought in, with the stages inside it. */
export interface EnemyStageAppearance {
  kind: ContentKind;
  id: string;
  label: string | null;
  name: string;
  stages: EnemyStage[];
}

export interface EnemyAppearance {
  kind: ContentKind;
  id: string;
  label: string | null;
  name: string;
  enemy_count: number;
  /** Enemy slugs, sorted. */
  enemies: string[];
}

/**
 * The trimmed record the browse page works with. The full bundles are
 * 4.3MB; almost all of that is per-level skill/talent parameter blocks
 * and flavour text that only the detail page renders. This carries the
 * filterable facets plus the level-0 stats the sort options need, and
 * nothing else.
 */
export interface EnemySummary {
  slug: string;
  name: string;
  index: string | null;
  rank: Enemy['rank'];
  sort: number;
  hidden: boolean;
  icon: string | null;
  race: string | null;
  movement: Enemy['movement'];
  attack_position: Enemy['attack_position'];
  damage_type: string[];
  /** Content id of the bundle that introduced it. */
  introduced_by: string;
  /**
   * Content ids of everything that fields it, introduction included. Distinct from
   * introduced_by: an enemy debuts in one piece of content and can then be fielded
   * by any number of others, up to 26 for the busiest. Every visible enemy has at
   * least one entry, and introduced_by is always among them.
   */
  appears_in: string[];
  /** Level-0 stats, the only ones the sort dropdown reads. */
  hp: number | null;
  atk: number | null;
  def: number | null;
  res: number | null;
  weight: number | null;
}

/** Display names for the eight content kinds, in the order the page groups them. */
export const KIND_ORDER: ContentKind[] = [
  'story',
  'event',
  'integrated_strategies',
  'annihilation',
  'contingency_contract',
  'reclamation',
  'sss',
  'supply',
];

export const KIND_LABELS: Record<ContentKind, string> = {
  story: 'Main Story',
  event: 'Events',
  integrated_strategies: 'Integrated Strategies',
  annihilation: 'Annihilation',
  contingency_contract: 'Contingency Contract',
  reclamation: 'Reclamation Algorithm',
  sss: 'Stationary Security Service',
  supply: 'Supply',
};
