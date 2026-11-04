export type FacilityKind =
  | 'controlCenter'
  | 'dormitory'
  | 'receptionRoom'
  | 'workshop'
  | 'office'
  | 'trainingRoom'
  | 'tradingPost'
  | 'factory'
  | 'powerPlant'
  | 'elevator';

export interface FacilityDef {
  id: string;
  kind: FacilityKind;
  label: string;
  capacity: number; // 0 for elevators (decorative) and for anything not built
  gridArea: string; // matches a name in the CSS grid-template-areas
  level: number; // 0 = not built. Dormitories and the Control Center go to 5, every other facility to 3 -- see MAX_LEVEL_BY_KIND in baseConfig.ts
}

// The three facility kinds the player can choose between in the nine
// production spots. Every other facility's kind is fixed by the base's
// own architecture and can only have its level changed.
export type ProductionKind = 'tradingPost' | 'factory' | 'powerPlant';

// What the player has built in each of the nine production spots, keyed by
// spot id (prod1..prod9, laid out three per floor across floors 1-3).
// Deliberately keyed by POSITION rather than by kind: a spot's identity is
// where it is in the base, and what stands there is a choice on top of that.
export type ProductionSpots = Record<string, ProductionKind>;

// The two common production splits, kept as one-click starting points for
// the layout editor rather than as the only two possibilities: any mix of
// Trading Posts, Factories and Power Plants is buildable now, up to five of
// any one kind. Named for their (Trading Posts)-(Factories)-(Power Plants)
// counts.
export type BaseLayout = '2-4-3' | '2-5-2';

// Maps each facility's id to its player-chosen level, where 0 means "not
// built" -- a spot the player has left empty, or a facility they have not
// unlocked. Anything missing from this map falls back to that facility
// kind's maximum, so a partially-filled map never yields a facility that
// silently has no capacity.
export type FacilityLevels = Record<string, number>;

export type FactoryProduct = 'Battle Records' | 'Precious Metals' | 'Originium Shards';

// Maps each Factory facility's id to its chosen product (null = not chosen yet).
export type FactoryProducts = Record<string, FactoryProduct | null>;

// Maps each Dormitory facility's id to its player-set ambience value.
// Missing from this map (rather than an explicit 0) means "not yet set"
// -- falls back to that Dormitory's own level cap, i.e. fully furnished
// by default. See defaultDormitoryAmbience in baseProductivity.ts.
export type DormitoryAmbience = Record<string, number>;

export interface MoraleResult {
  grey: number; // base 1.00/hr, -0.05 per operator after the first
  selfYellow: Record<string, number>; // per-operator "morale consumed per hour" adjustment, keyed by operator name -- the vast majority of skills only affect the operator who has them
  allOperatorsYellow: number; // sum of adjustments from skills that explicitly say "all Operators" -- applies to every operator in the facility, including the one with the skill
}

export interface SlotAssignment {
  operatorName: string;
  eliteLevel: string | null;
  /** Exact account-import level; manual Elite picks assume unlock levels. */
  level?: number;
  // For skills that scale off something the simulator can't know on its
  // own (item counts like Witchcraft Crystal, Engineering Robots, etc.,
  // or hours since placement for ramp-up skills) -- a manual value the
  // player enters themselves. Meaning depends on which operator/skill
  // this slot holds; see factorySpecialSkills.ts.
  manualValue?: number;
  /** Dormitory snapshot; defaults to exhausted (0), range 0–24. */
  morale?: number;
}

// Maps each facility's id to the operator+skill currently assigned to
// its slots (null = empty slot). Persisted to localStorage.
export type BaseAssignments = Record<string, (SlotAssignment | null)[]>;
