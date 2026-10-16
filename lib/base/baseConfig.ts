import {
  FacilityDef,
  FacilityKind,
  SlotAssignment,
  BaseAssignments,
  BaseLayout,
  FacilityLevels,
  ProductionKind,
  ProductionSpots,
} from './baseTypes';

// Capacities confirmed by you: Trading Post 3, Factory 3, Power Plant 1,
// Control Center 5, Office 1, Reception Room 2, Workshop 1. Dormitory/
// Training Room use the real in-game values (5/1) since those weren't
// specified -- adjust here if you want different numbers. These are the
// per-kind ceilings a facility reaches at its top level.
const MAX_CAPACITY: Record<string, number> = {
  tradingPost: 3,
  factory: 3,
  receptionRoom: 2,
  office: 1,
  dormitory: 5,
  powerPlant: 1,
  controlCenter: 5,
  workshop: 1,
  trainingRoom: 1,
};

/** How high each facility kind can be built. Dormitories and the Control
 * Center reach Level 5; everything else stops at Level 3. Level 0 is
 * "not built" and is available for every kind, including the nine
 * production spots -- an empty spot is a legitimate base. */
export const MAX_LEVEL_BY_KIND: Record<FacilityKind, number> = {
  controlCenter: 5,
  dormitory: 5,
  receptionRoom: 3,
  workshop: 3,
  office: 3,
  trainingRoom: 3,
  tradingPost: 3,
  factory: 3,
  powerPlant: 3,
  elevator: 0,
};

/** The nine spots that can hold a Trading Post, a Factory or a Power
 * Plant, three per floor across floors 1-3. Ids are positional, not
 * kind-based, because what stands in a spot is now a choice: `prod4` is
 * "floor 2, left" whether the player builds a Factory or a Power Plant
 * there. `row`/`column` are 1-based and only used to lay the editor out
 * the same way the base itself reads. */
export const PRODUCTION_SPOTS: { id: string; row: number; column: number }[] = [
  { id: 'prod1', row: 1, column: 1 },
  { id: 'prod2', row: 1, column: 2 },
  { id: 'prod3', row: 1, column: 3 },
  { id: 'prod4', row: 2, column: 1 },
  { id: 'prod5', row: 2, column: 2 },
  { id: 'prod6', row: 2, column: 3 },
  { id: 'prod7', row: 3, column: 1 },
  { id: 'prod8', row: 3, column: 2 },
  { id: 'prod9', row: 3, column: 3 },
];

export const PRODUCTION_SPOT_IDS = PRODUCTION_SPOTS.map((s) => s.id);

/** Construction ceilings from building_data: five TPs/factories, three plants. */
export const MAX_PRODUCTION_BY_KIND: Record<ProductionKind, number> = { tradingPost: 5, factory: 5, powerPlant: 3 };

export const PRODUCTION_KINDS: ProductionKind[] = ['tradingPost', 'factory', 'powerPlant'];

export const FACILITY_KIND_LABELS: Record<FacilityKind, string> = {
  controlCenter: 'Control Center',
  dormitory: 'Dormitory',
  receptionRoom: 'Reception Room',
  workshop: 'Workshop',
  office: 'Office',
  trainingRoom: 'Training Room',
  tradingPost: 'Trading Post',
  factory: 'Factory',
  powerPlant: 'Power Plant',
  elevator: '',
};

/** The facilities whose kind is fixed by the base's architecture -- only
 * their level can be changed. Listed in the order they appear down the
 * central tower and the right-hand column. */
export const FIXED_FACILITIES: { id: string; kind: FacilityKind; gridArea: string }[] = [
  { id: 'controlCenter', kind: 'controlCenter', gridArea: 'cc' },
  { id: 'dormitory1', kind: 'dormitory', gridArea: 'dorm1' },
  { id: 'dormitory2', kind: 'dormitory', gridArea: 'dorm2' },
  { id: 'dormitory3', kind: 'dormitory', gridArea: 'dorm3' },
  { id: 'dormitory4', kind: 'dormitory', gridArea: 'dorm4' },
  { id: 'receptionRoom', kind: 'receptionRoom', gridArea: 'reception' },
  { id: 'workshop', kind: 'workshop', gridArea: 'workshop' },
  { id: 'office', kind: 'office', gridArea: 'office' },
  { id: 'trainingRoom', kind: 'trainingRoom', gridArea: 'training' },
];

export type BasePresetId = '2-4-3' | '2-5-2-left' | '2-5-2-right';

/** Levels used by the presets. Production is per SPOT and Dormitories are
 * per room, because the 2-5-2 presets build the same nine spots to different
 * levels -- which side of the base is "maxed" is the whole difference between
 * them. */
interface PresetLevels {
  production: number[]; // one per spot, in PRODUCTION_SPOTS order
  dormitories: number[]; // one per Dormitory, in FIXED_FACILITIES order
  receptionRoom: number;
  workshop: number;
  office: number;
  trainingRoom: number;
}

/** The three layouts worth starting from, each a complete base -- spots AND
 * levels -- rather than just an arrangement.
 *
 * All three sit exactly on their power budget, drawing precisely what their
 * Power Plants supply. That is not a coincidence to be tidied away: the base
 * is designed so a full one has no spare power, and it is why "max
 * everything" is only possible for 2-4-3.
 *
 *   2-4-3        810 / 810   three Power Plants pay for everything at max
 *   2-5-2 left   540 / 540   the fifth Factory costs a Power Plant, so 270
 *   2-5-2 right  540 / 540   supply goes and something has to give
 *
 * The two 2-5-2 presets build the SAME nine spots -- 2 Trading Posts, 5
 * Factories, 2 Power Plants -- and differ only in which side of the base
 * spends the remaining power:
 *
 *   max left   the production side is maxed. Every Factory and Trading Post
 *              at Level 3, so the Reception Room, Office and Training Room
 *              drop to Level 1 and the Dormitories to Level 2.
 *   max right  the right-hand column is maxed instead. Reception Room,
 *              Office and Training Room at Level 3, paid for by holding
 *              production down: two Factories and one Trading Post at Level
 *              3, the other three Factories and Trading Post at Level 2, one
 *              Dormitory at Level 2 and the rest at Level 1.
 *
 * The Workshop sits at Level 3 in every preset because its draw is a flat 10
 * at every level -- lowering it would save nothing. */
export const BASE_PRESETS: Record<BasePresetId, { label: string; summary: string; kinds: ProductionKind[]; levels: PresetLevels }> = {
  '2-4-3': {
    label: '2-4-3',
    summary: '2 Trading Posts, 4 Factories, 3 Power Plants, all at max level.',
    kinds: ['tradingPost', 'factory', 'powerPlant', 'tradingPost', 'factory', 'powerPlant', 'factory', 'factory', 'powerPlant'],
    levels: {
      production: [3, 3, 3, 3, 3, 3, 3, 3, 3],
      dormitories: [5, 5, 5, 5],
      receptionRoom: 3,
      workshop: 3,
      office: 3,
      trainingRoom: 3,
    },
  },
  '2-5-2-left': {
    label: '2-5-2 max left',
    summary: 'Production maxed: every Factory and Trading Post at Level 3, paid for by the right-hand rooms.',
    kinds: ['tradingPost', 'factory', 'powerPlant', 'tradingPost', 'factory', 'powerPlant', 'factory', 'factory', 'factory'],
    levels: {
      production: [3, 3, 3, 3, 3, 3, 3, 3, 3],
      dormitories: [2, 2, 2, 2],
      receptionRoom: 1,
      workshop: 3,
      office: 1,
      trainingRoom: 1,
    },
  },
  '2-5-2-right': {
    label: '2-5-2 max right',
    summary: 'Reception Room, Office and Training Room maxed instead, paid for by holding production down.',
    kinds: ['tradingPost', 'factory', 'powerPlant', 'tradingPost', 'factory', 'powerPlant', 'factory', 'factory', 'factory'],
    // Spot order is TP, Factory, Power Plant / TP, Factory, Power Plant /
    // Factory, Factory, Factory -- so this is one Trading Post at 3 and one
    // at 2, two Factories at 3 and three at 2, both Power Plants at 3.
    levels: {
      production: [3, 3, 3, 2, 3, 3, 2, 2, 2],
      dormitories: [2, 1, 1, 1],
      receptionRoom: 3,
      workshop: 3,
      office: 3,
      trainingRoom: 3,
    },
  },
};

export const BASE_PRESET_IDS = Object.keys(BASE_PRESETS) as BasePresetId[];

export function presetSpots(preset: BasePresetId): ProductionSpots {
  const kinds = BASE_PRESETS[preset].kinds;
  const spots: ProductionSpots = {};
  PRODUCTION_SPOTS.forEach((spot, i) => {
    spots[spot.id] = kinds[i];
  });
  return spots;
}

export function presetLevels(preset: BasePresetId): FacilityLevels {
  const { production, dormitories, ...rooms } = BASE_PRESETS[preset].levels;
  const levels: FacilityLevels = {};
  PRODUCTION_SPOTS.forEach((spot, i) => {
    levels[spot.id] = production[i];
  });
  let dormIndex = 0;
  FIXED_FACILITIES.forEach((f) => {
    if (f.kind === 'dormitory') {
      levels[f.id] = dormitories[dormIndex++] ?? MAX_LEVEL_BY_KIND.dormitory;
      return;
    }
    // The Control Center draws nothing, so there is never a reason to hold it back.
    levels[f.id] =
      f.kind === 'controlCenter'
        ? MAX_LEVEL_BY_KIND.controlCenter
        : rooms[f.kind as keyof typeof rooms] ?? MAX_LEVEL_BY_KIND[f.kind];
  });
  return levels;
}

export function defaultProductionSpots(): ProductionSpots {
  return presetSpots('2-4-3');
}

/** Counts a kind for the max-five rule, which is about what is BUILT in the
 * spots rather than what each one is set to -- so this ignores levels and
 * counts every spot assigned to the kind. */
export function assignedKindCount(spots: ProductionSpots, kind: ProductionKind): number {
  return PRODUCTION_SPOT_IDS.filter((id) => spots[id] === kind).length;
}

/** Whether a spot may be switched to a kind: only if that would not push
 * the kind past five. Switching a spot to the kind it already holds is
 * always allowed. */
export function canSetSpotKind(spots: ProductionSpots, spotId: string, kind: ProductionKind): boolean {
  if (spots[spotId] === kind) return true;
  return assignedKindCount(spots, kind) < MAX_PRODUCTION_BY_KIND[kind];
}

function levelFor(id: string, kind: FacilityKind, levels: FacilityLevels): number {
  const chosen = levels[id];
  if (chosen === undefined) return MAX_LEVEL_BY_KIND[kind];
  return Math.max(0, Math.min(chosen, MAX_LEVEL_BY_KIND[kind]));
}

/** Trading Post/Factory/Reception Room/Office capacity scales directly
 * with the player-chosen level, capped at that facility kind's real
 * maximum (e.g. a level-3 Reception Room still only holds 2, since 2 is
 * its actual ceiling regardless of level). Everything else (Control
 * Center, Power Plant, Dormitory, Workshop, Training Room) has a fixed
 * capacity that doesn't change with level.
 *
 * Level 0 means the facility isn't built, so it holds nobody at all --
 * without that check a "not built" Power Plant would still report its
 * fixed capacity of 1 and quietly accept an operator. */
export function capacityForLevel(kind: FacilityDef['kind'], level: number): number {
  if (level <= 0) return 0;
  const max = MAX_CAPACITY[kind] ?? 0;
  if (kind === 'tradingPost' || kind === 'factory' || kind === 'controlCenter') {
    return Math.max(0, Math.min(level, max));
  }
  return max;
}

/** Builds the actual facility list for a chosen arrangement. The nine
 * production spots take their kind from `spots` and their level from
 * `levels`; every other facility's kind is fixed and only its level is
 * read. Anything at level 0 comes back with capacity 0, which is how the
 * page knows to draw it as an unbuilt plot and keep it out of the
 * simulation. */
export function getFacilities(spots: ProductionSpots = defaultProductionSpots(), levels: FacilityLevels = {}): FacilityDef[] {
  const production: FacilityDef[] = PRODUCTION_SPOTS.map((spot) => {
    const kind = spots[spot.id] ?? 'factory';
    const level = levelFor(spot.id, kind, levels);
    return {
      id: spot.id,
      kind,
      label: FACILITY_KIND_LABELS[kind],
      capacity: capacityForLevel(kind, level),
      gridArea: spot.id,
      level,
    };
  });

  const fixed: FacilityDef[] = FIXED_FACILITIES.map((f) => {
    const level = levelFor(f.id, f.kind, levels);
    return {
      id: f.id,
      kind: f.kind,
      label: FACILITY_KIND_LABELS[f.kind],
      capacity: capacityForLevel(f.kind, level),
      gridArea: f.gridArea,
      level,
    };
  });

  return [
    ...production,
    ...fixed,
    // --- Elevators: decorative shafts running the full height of the tower ---
    { id: 'elevator1', kind: 'elevator', label: '', capacity: 0, gridArea: 'elevA', level: 0 },
    { id: 'elevator2', kind: 'elevator', label: '', capacity: 0, gridArea: 'elevC', level: 0 },
  ];
}

/** Every facility whose level the player can set, with the ceiling for
 * each -- drives the editor's level pickers. Derived from the current
 * arrangement rather than hard-coded, since which production spots exist
 * as which kind is now a choice. Production spots are numbered per kind in
 * spot order ("Factory 1", "Factory 2", ...) so the labels read the way the
 * base does rather than exposing the positional ids. */
export function levelEditableFacilities(
  spots: ProductionSpots,
): { id: string; kind: FacilityKind; label: string; maxLevel: number }[] {
  const perKindSeen: Partial<Record<FacilityKind, number>> = {};
  const numbered = (kind: FacilityKind, total: number) => {
    const n = (perKindSeen[kind] ?? 0) + 1;
    perKindSeen[kind] = n;
    return total > 1 ? `${FACILITY_KIND_LABELS[kind]} ${n}` : FACILITY_KIND_LABELS[kind];
  };

  const counts = PRODUCTION_SPOT_IDS.reduce<Record<string, number>>((acc, id) => {
    const kind = spots[id];
    if (kind) acc[kind] = (acc[kind] ?? 0) + 1;
    return acc;
  }, {});

  const production = PRODUCTION_SPOTS.map((spot) => {
    const kind = spots[spot.id] ?? 'factory';
    return { id: spot.id, kind, label: numbered(kind, counts[kind] ?? 1), maxLevel: MAX_LEVEL_BY_KIND[kind] };
  });

  const dormitoryTotal = FIXED_FACILITIES.filter((f) => f.kind === 'dormitory').length;
  const fixed = FIXED_FACILITIES.map((f) => ({
    id: f.id,
    kind: f.kind,
    label: f.kind === 'dormitory' ? numbered(f.kind, dormitoryTotal) : FACILITY_KIND_LABELS[f.kind],
    maxLevel: MAX_LEVEL_BY_KIND[f.kind],
  }));

  return [...production, ...fixed];
}

export function createEmptyAssignments(facilities: FacilityDef[]): BaseAssignments {
  const assignments: BaseAssignments = {};
  facilities.forEach((f) => {
    if (f.capacity > 0) assignments[f.id] = Array(f.capacity).fill(null);
  });
  return assignments;
}

/** Carries existing placements across a layout change.
 *
 * A spot keeps its operators only while it is still the same KIND of
 * facility: base skills are matched by facility label, so the operators in
 * a Factory that became a Power Plant are holding skills that no longer do
 * anything there, and silently keeping them would report bonuses the game
 * would not give. Capacity changes are handled by trimming from the end
 * (demoting a Level 3 Factory to Level 1 drops the last two operators) or
 * padding with empty slots when a facility is upgraded. */
export function reconcileAssignments(
  previous: BaseAssignments,
  previousFacilities: FacilityDef[],
  nextFacilities: FacilityDef[],
): BaseAssignments {
  const previousKindById = new Map(previousFacilities.map((f) => [f.id, f.kind]));
  const next: BaseAssignments = {};

  nextFacilities.forEach((f) => {
    if (f.capacity <= 0) return;
    const kept = previousKindById.get(f.id) === f.kind ? previous[f.id] ?? [] : [];
    const slots: (SlotAssignment | null)[] = Array(f.capacity).fill(null);
    for (let i = 0; i < Math.min(kept.length, f.capacity); i++) slots[i] = kept[i] ?? null;
    next[f.id] = slots;
  });

  return next;
}

/** The old setup blob stored a 2-4-3/2-5-2 choice plus levels keyed by
 * kind-based facility ids (tradingPost1, factory3, powerPlant3...). Those
 * ids are gone now that spots are positional, so translate them by
 * position: the old layouts listed their facilities in exactly
 * PRODUCTION_SPOTS order, which is what makes this a straight zip. Returns
 * both the spot arrangement and the level map under the new ids, plus the
 * old-to-new id mapping so saved assignments and Factory products can be
 * moved over rather than thrown away. */
export function migrateLegacySetup(
  layout: BaseLayout,
  legacyLevels: FacilityLevels,
): { spots: ProductionSpots; levels: FacilityLevels; idMap: Record<string, string> } {
  const legacyIdsInSpotOrder =
    layout === '2-5-2'
      ? ['tradingPost1', 'factory1', 'powerPlant1', 'tradingPost2', 'factory2', 'powerPlant2', 'factory3', 'factory4', 'factory5']
      : ['tradingPost1', 'factory1', 'powerPlant1', 'tradingPost2', 'factory2', 'powerPlant2', 'factory3', 'factory4', 'powerPlant3'];

  const spots = presetSpots(layout === '2-5-2' ? '2-5-2-left' : '2-4-3');
  const levels: FacilityLevels = {};
  const idMap: Record<string, string> = {};

  legacyIdsInSpotOrder.forEach((legacyId, i) => {
    const spotId = PRODUCTION_SPOTS[i].id;
    idMap[legacyId] = spotId;
    const level = legacyLevels[legacyId];
    if (level !== undefined) levels[spotId] = level;
  });

  // The fixed facilities kept their ids, so their levels carry over as-is.
  FIXED_FACILITIES.forEach((f) => {
    idMap[f.id] = f.id;
    const level = legacyLevels[f.id];
    if (level !== undefined) levels[f.id] = level;
  });

  return { spots, levels, idMap };
}

// --- Power ---------------------------------------------------------------
// Every facility except the Power Plant draws power; Power Plants supply it.
// A layout drawing more than it supplies isn't buildable in game, so the
// editor has to be able to say so before an arrangement is committed.
//
// Values confirmed by you. Two are worth knowing about rather than reading
// as typos: Power Plants jump to +270 at Level 3 (not an even step up from
// +130), and the Workshop draws a flat -10 at every level while every other
// room's draw climbs 10/30/60.
//
// Self-check on the table: a 2-4-3 base with everything at max level draws
// exactly what it supplies, 810 against 810 --
//   supply  3 Power Plants Lv3                         = 810
//   draw    4 Factories Lv3 240 + 2 Trading Posts 120
//           + 4 Dormitories Lv5 260 + Reception 60
//           + Workshop 10 + Office 60 + Training 60     = 810
// The standard base balancing to precisely zero spare is a strong sign these
// figures are right, and it is why the check treats equal supply and draw as
// fine rather than requiring headroom.
const POWER_SUPPLY_BY_LEVEL: Record<number, number> = { 1: 60, 2: 130, 3: 270 };

const POWER_DRAW_BY_KIND: Partial<Record<FacilityKind, Record<number, number>>> = {
  // The Control Center runs the base and draws nothing at any level.
  controlCenter: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  dormitory: { 1: 10, 2: 20, 3: 30, 4: 45, 5: 65 },
  tradingPost: { 1: 10, 2: 30, 3: 60 },
  factory: { 1: 10, 2: 30, 3: 60 },
  receptionRoom: { 1: 10, 2: 30, 3: 60 },
  // Flat at every level, unlike everything else here.
  workshop: { 1: 10, 2: 10, 3: 10 },
  office: { 1: 10, 2: 30, 3: 60 },
  trainingRoom: { 1: 10, 2: 30, 3: 60 },
  // The Activity Room draws 0 at every level. This simulator has no facility
  // kind for it, so there is nothing to list -- noted only so its absence
  // reads as "costs nothing anyway" rather than as an oversight.
};

export interface PowerBalance {
  supplied: number;
  drawn: number;
  /** Negative when the base draws more than it supplies. */
  spare: number;
  ok: boolean;
}

/** Supply minus draw across every BUILT facility. Anything at level 0 is
 * not built, so it neither draws nor supplies. */
export function powerBalance(facilities: FacilityDef[]): PowerBalance {
  let supplied = 0;
  let drawn = 0;
  facilities.forEach((f) => {
    if (f.level <= 0 || f.kind === 'elevator') return;
    if (f.kind === 'powerPlant') {
      supplied += POWER_SUPPLY_BY_LEVEL[f.level] ?? 0;
      return;
    }
    drawn += POWER_DRAW_BY_KIND[f.kind]?.[f.level] ?? 0;
  });
  return { supplied, drawn, spare: supplied - drawn, ok: supplied >= drawn };
}

/** Everything about an arrangement that would stop the game accepting it.
 * Returned as a list so the editor can show all the problems at once rather
 * than one at a time. */
export function layoutProblems(spots: ProductionSpots, levels: FacilityLevels): string[] {
  const problems: string[] = [];

  PRODUCTION_KINDS.forEach((kind) => {
    const count = assignedKindCount(spots, kind);
    if (count > MAX_PRODUCTION_BY_KIND[kind]) {
      problems.push(`${count} ${FACILITY_KIND_LABELS[kind]}s -- at most ${MAX_PRODUCTION_BY_KIND[kind]} of this kind can be built.`);
    }
  });

  const facilities = getFacilities(spots, levels);
  const power = powerBalance(facilities);
  if (!power.ok) {
    problems.push(
      `Power draw ${power.drawn} exceeds supply ${power.supplied} -- ${Math.abs(power.spare)} short. Build or upgrade a Power Plant, or lower another facility's level.`,
    );
  }

  const controlCenter = facilities.find((f) => f.kind === 'controlCenter');
  if (controlCenter && controlCenter.level <= 0) {
    problems.push('The Control Center runs the base and cannot be left unbuilt.');
  }

  return problems;
}

/** Which preset an arrangement is, if any -- so reopening the editor on a
 * base that came from a preset shows it selected, and one that was built by
 * hand opens straight into the custom controls. */
export function matchingPreset(spots: ProductionSpots, levels: FacilityLevels): BasePresetId | null {
  return (
    BASE_PRESET_IDS.find((preset) => {
      const presetSpotMap = presetSpots(preset);
      if (PRODUCTION_SPOT_IDS.some((id) => spots[id] !== presetSpotMap[id])) return false;
      const wanted = presetLevels(preset);
      return Object.keys(wanted).every((id) => {
        const kind = [...PRODUCTION_SPOTS.map((sp) => ({ id: sp.id, kind: spots[sp.id] })), ...FIXED_FACILITIES].find((f) => f.id === id)?.kind;
        const actual = levels[id] ?? (kind ? MAX_LEVEL_BY_KIND[kind] : undefined);
        return actual === wanted[id];
      });
    }) ?? null
  );
}
