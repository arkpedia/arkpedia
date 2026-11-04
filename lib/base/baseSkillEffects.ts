/**
 * The base skill parameter table: every operator base skill the game describes, as numbers and shapes
 * rather than sentences, keyed by the game's buff id (building_data.json `buffs`). The calculator and the
 * optimizer read this; nothing reads a skill's description text for a number any more.
 *
 * Written by scripts/build/build-base-skill-effects.ts (`npm run base:skill-effects`) into
 * lib/base/base-skill-effects.json, which is committed: data/ is pulled from arkpedia-data and
 * git-ignored, and the calculator imports the table statically. Regenerate after a game data refresh
 * that adds a buff id, or after changing a rule or an override in the build script; the guard in the
 * script refuses a table with an unclassified buff id or a number it could not read.
 *
 * Shapes (`shape`), the arithmetic form of the skill:
 *   flat       fixed numbers: +30% productivity, +2 order limit.
 *   counted    a base plus an amount per counted thing (`per`): per Rhine Lab operator in the base,
 *              per Dormitory level, per Felvine, with an optional step, count cap and value cap.
 *   threshold  numbers that apply only while a condition holds (`when`): Texas in the same Trading
 *              Post, alone in the Reception Room, Clue Exchange active.
 *   pool       every effect is on a shared quantity rather than a rate: Morale drain or recovery,
 *              order limit, drone charge, or a base-wide resource (Felvine, Passion, Worldly Plight).
 *   custom     a named handler in the calculator (`custom.handler`) with its numbers in `custom.params`:
 *              ramps averaged over a window, Jaye's order queue, Totter's Morale difference, and the
 *              self-referential skills that read what the rest of the room provides.
 *
 * `interaction` carries what a skill does to other skills: overrides the room's other contributions,
 * survives such an override, changes the gold-order distribution, cancels room-wide Morale effects.
 */
import table from './base-skill-effects.json';
import type { BaseSkill } from '@/lib/operators/operatorTypes';

export type SkillRoomType = 'CONTROL' | 'DORMITORY' | 'HIRE' | 'MANUFACTURE' | 'MEETING' | 'POWER' | 'TRADING' | 'TRAINING' | 'WORKSHOP' | 'RECYCLE';
export type SkillShape = 'flat' | 'counted' | 'threshold' | 'pool' | 'custom';
export type FactoryProductName = 'Battle Records' | 'Precious Metals' | 'Originium Shards';

/** What a skill changes. Rates are fractions (0.3 for +30%); Morale and limits are absolute per hour or per item. */
export type SkillEffectKind =
  // Production rooms, the room the operator is in.
  | 'productivity' | 'capacity' | 'orderEfficiency' | 'orderLimit' | 'droneRate' | 'clueSpeed' | 'hrSpeed'
  // Morale consumed per hour while working: positive is more drain. `selfMorale` is the operator's own,
  // `roomMorale` everyone's in the room, `targetMorale` a named co-worker's (`name`).
  | 'selfMorale' | 'roomMorale' | 'targetMorale'
  // Dormitory recovery per hour: self, everyone in the room (strongest only), everyone else, one roommate
  // below full Morale (strongest only), a fixed rate replacing every other source, or a total shared out.
  | 'recoverySelf' | 'recoveryAll' | 'recoveryOthers' | 'recoverySingle' | 'recoveryExclusive' | 'recoveryDistributed'
  // Control Center: recovery for its own occupants (stacks), and effects that land elsewhere. The pools
  // keep only the strongest candidate: factory productivity, order efficiency, clue collection, training
  // speed, Dormitory recovery (all / Elite operators), other buildings' recovery. HR speed, Precious Metal
  // productivity and Reception Room clue speed add up.
  | 'ccMorale'
  | 'ccFactoryProductivity' | 'ccOrderEfficiency' | 'ccClueSpeed' | 'ccTrainingSpeed' | 'ccDormRecovery' | 'ccDormEliteRecovery' | 'ccOtherRoomsRecovery'
  | 'ccHrSpeed' | 'ccPreciousMetalProductivity' | 'ccReceptionClueSpeed'
  // Control Center effects aimed at one room at a time, evaluated per Trading Post or Factory (`per` counts
  // in that room: `tp.roster:X`, `factory.roster:X`).
  | 'perTradingPostOrderEfficiency' | 'perTradingPostOrderLimit' | 'perFactoryProductivity'
  // A Factory bonus for the room a named operator works in (`name`).
  | 'factoryOfOperator'
  // Extra Power Plants for skills that count them (`value` plants).
  | 'powerPlantCount'
  // Base-wide resource generation (`name` is the pool): Felvine, Passion, Monster Meal, Worldly Plight...
  | 'resource'
  // Training Room and Workshop numbers: the dedicated rule modules compute these rooms; the table carries
  // them so every skill is in one place.
  | 'trainingSpeed' | 'trainingMorale' | 'byproductChance' | 'recipeMorale'
  // Recycling Station (CN only so far).
  | 'recycleEfficiency';

/**
 * What a counted skill counts. `room` is the operator's own room, `base` every placed operator or built
 * facility, `cc` the Control Center, `tp`/`factory` the room a per-room Control Center effect is being
 * evaluated for. `<ROSTER>` is a group roster name (lib/base/baseGroupRosters.ts), `<FACTION>` an operator
 * faction, `<CATEGORY>` a Factory skill category (lib/base/factorySkillCategories.ts), `<POOL>` a resource.
 */
export type SkillCountSource =
  | 'room.operators' | 'room.others' | 'room.belowFullMorale' | `room.roster:${string}` | `room.rosterOthers:${string}` | `room.faction:${string}` | `room.skillCategory:${string}`
  | 'base.tradingPosts' | 'base.factories' | 'base.powerPlants' | 'base.dormitories' | 'base.dormLevels' | 'base.facilityLevels' | 'base.robotsInPowerPlants'
  | 'base.distinctFactoryProducts' | 'base.goldFactories' | 'base.goldLines' | 'base.maxDroneCapacity' | 'base.dormOperators'
  | `base.roster:${string}` | `base.rosterOthers:${string}` | `base.faction:${string}` | `base.facilitiesWithRoster:${string}` | `base.workFacilitiesWithRoster:${string}` | `base.workersOfRoster:${string}`
  | `cc.roster:${string}` | `cc.rosterOthers:${string}` | `cc.faction:${string}`
  | `otherPowerPlants.roster:${string}` | `powerPlants.rosterOthers:${string}` | `tradingPosts.roster:${string}` | `reception.roster:${string}`
  | `tp.roster:${string}` | `tp.faction:${string}` | `factory.roster:${string}`
  | 'level.room' | 'level.receptionRoom' | 'level.trainingRoom' | 'office.extraSlots'
  | `resource:${string}`;

export type SkillCondition =
  | { type: 'roomHas'; name: string }                       // the named operator shares the room
  | { type: 'roomHasRoster'; roster: string }                // another operator of the roster shares the room
  | { type: 'alone' }                                        // nobody else works in the room
  | { type: 'baseHas'; name: string }                        // the named operator is placed in any work area
  | { type: 'ccHas'; name: string }
  | { type: 'inTradingPost'; name: string }
  | { type: 'inFactory'; name: string }
  | { type: 'inPowerPlant'; name: string }
  | { type: 'inDormitory'; name: string }
  | { type: 'inReceptionRoom'; name: string }
  | { type: 'trainerIs'; name: string }
  | { type: 'clueExchange' }
  | { type: 'officeHrBelow'; value: number }                 // the Office's own HR speed, in percent
  | { type: 'influenceAtLeastTerritory' } | { type: 'territoryAboveInfluence' }
  | { type: 'countAtLeast'; count: SkillCountSource; value: number }
  | { type: 'countAtMost'; count: SkillCountSource; value: number }
  | { type: 'targetIs'; name: string }                       // a single-target recovery's chosen roommate
  | { type: 'targetInRoster'; roster: string }
  | { type: 'recipientMoraleBelow'; value: number }          // a group recovery's recipient
  | { type: 'product'; product: FactoryProductName }
  // Training Room (the training module reads these): the mastery level being trained, the trainee's branch.
  | { type: 'masteryLevel'; value: number }
  | { type: 'traineeBranch'; name: string };

export interface SkillEffect {
  kind: SkillEffectKind;
  /** The amount: the whole of a flat effect, the base of a counted one. */
  value: number;
  /** Factory: only while this product is made. */
  product?: FactoryProductName;
  /** Counted: `value + amount * floor(min(count, maxCount) / step)`, then `cap`. */
  per?: { count: SkillCountSource; amount: number; step?: number; maxCount?: number };
  /** The highest the whole effect reaches. */
  cap?: number;
  /** Threshold: the effect applies only while this holds. */
  when?: SkillCondition;
  /** A named operator, roster or resource pool the effect concerns (`targetMorale`, `factoryOfOperator`, `resource`);
   *  `targetMorale` with '*others' is every other operator in the room. */
  name?: string;
  /** Nothing while another skill (by buff id) is active in the same room, under its own condition if any. */
  suppressedBy?: { buffId: string; when?: SkillCondition };
  /** Training: the classes or branch this applies to; Workshop: the recipe type. */
  targets?: string[];
}

export interface SkillInteraction {
  /** Zeroes every other operator's own contribution of the room's main rate (Shamare, Snegurochka, Automation). */
  overridesOthers?: boolean;
  /** Keeps its contribution under such an override: granted by facility count (Purestream, Thorns, Alanna, Narantuya). */
  exemptFromOverride?: boolean;
  /** The documented "only the strongest effect of this type takes place". */
  highestOnly?: boolean;
  /** Ignores room-wide Morale effects from other operators (Waai Fu's Team Spirit). */
  immuneToRoomMorale?: boolean;
  /** Rhine Lab and Pinus Sylvestris skills in the room count as Standardization skills too (Highmore). */
  reclassifiesSkills?: boolean;
  /** Clears the self Morale loss of Sui operators in the Control Center (Ling). */
  cancelsSuiSelfDrain?: boolean;
  /** Shifts the Trading Post's gold-order distribution (Tailoring α/β and kin). */
  goldOrderTier?: 'lower' | 'higher';
  /** Trading rules outside efficiency: gold per defaulted trade, LMD per large trade, fixed orders. */
  trade?: { defaultedGoldBonus?: number; lmdBonusAbove3?: number; fixedGold?: number; order?: 'pepe' | 'closure' };
  /** Single-target recovery prefers this roommate when present (Schwarz → Ceylon, Tomimi → Gavial). */
  preferredTarget?: string;
  /** Extra group recovery for recipients of a roster (Senshi → Laios's Party). */
  recipientBonus?: { roster: string; amount: number };
  /** While present, another provider's group recovery grows for a roster (Morgan: Siege +0.3 to Glasgow). */
  providerBonus?: { provider: string; roster: string; amount: number };
  /** The relief grows with another Control Center skill (Banner of Babel with Civilight Eterna). */
  doublesWith?: string;
  /** Suppressed while another skill is active in the same room (Nyamu's Sakiko drain under Misumi's). */
  suppressedBy?: string;
}

export interface BaseSkillEffectEntry {
  buffId: string;
  /** The buff id without its index: "power_rec_spd[010]" → "power_rec_spd". */
  family: string;
  roomType: SkillRoomType;
  buffCategory: 'OUTPUT' | 'FUNCTION' | 'RECOVERY';
  /** building_data `targets`: F_EXP / F_GOLD / F_DIAMOND for Factory products, classes for training, recipe kinds for the Workshop. */
  targets: string[];
  /** building_data `efficiency`, the headline percent, or null where the game gives none. */
  efficiency: number | null;
  shape: SkillShape;
  effects: SkillEffect[];
  custom?: { handler: string; params?: Record<string, number> };
  interaction?: SkillInteraction;
  /** The earliest promotion phase and level any operator unlocks it at; `unlocks` lists every distinct one when they differ. */
  unlock: { phase: number; level: number } | null;
  unlocks?: { phase: number; level: number }[];
  /** 'en' from the Global tables; 'cn' when only the CN tables describe it (the English text is then the app's record).
   *  The description text itself stays in the operator records: the table ships to the browser. */
  source: 'en' | 'cn';
  /** True for skills whose effect the game states without a number (clue likelihoods): nothing to compute. */
  nonNumeric?: boolean;
  /** For the reader: what the numbers leave out. */
  note?: string;
}

export interface BaseSkillEffectsTable {
  generatedFrom: { en: string; cn: string; records: number };
  entries: Record<string, BaseSkillEffectEntry>;
}

const TABLE = table as unknown as BaseSkillEffectsTable;

/** A skill's table entry, by its buff id, or the entry a synthetic skill carries itself; undefined for a skill
 *  without either (a record the refresh has not rebuilt). */
export function skillEffectEntry(skill: Pick<BaseSkill, 'buffId' | 'tableEntry'>): BaseSkillEffectEntry | undefined {
  return skill.tableEntry ?? (skill.buffId ? TABLE.entries[skill.buffId] : undefined);
}

/** A table entry for a synthetic skill: the effects stated, the rest filled in. */
export function syntheticSkillEntry(roomType: SkillRoomType, effects: SkillEffect[], interaction?: SkillInteraction): BaseSkillEffectEntry {
  const shape: SkillShape = effects.some((e) => e.per) ? 'counted' : effects.some((e) => e.when) ? 'threshold' : 'flat';
  return { buffId: 'synthetic', family: 'synthetic', roomType, buffCategory: 'OUTPUT', targets: [], efficiency: null, shape, effects, ...(interaction ? { interaction } : {}), unlock: null, source: 'en' };
}

/** The counted part of an effect, given the count: `value + amount * floor(min(count, maxCount) / step)`, capped. */
export function countedValue(effect: SkillEffect, count: number): number {
  const per = effect.per;
  if (!per) return effect.cap !== undefined ? Math.min(effect.cap, effect.value) : effect.value;
  const counted = per.maxCount !== undefined ? Math.min(per.maxCount, count) : count;
  const steps = Math.floor((Math.max(0, counted) + 1e-9) / (per.step ?? 1));
  const total = effect.value + per.amount * steps;
  return effect.cap !== undefined ? Math.min(effect.cap, total) : total;
}
