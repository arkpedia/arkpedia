/**
 * Base-wide resource system -- TypeScript port of resources.py.
 * See that file's docstring for the full reasoning behind each design
 * decision; this mirrors it exactly, just adapted to TS syntax.
 */

/** The initial two recruitment slots are followed by one per Office upgrade. */
export function recruitSlotCount(officeLevel: number): number {
  return officeLevel > 0 ? Math.min(4, Math.max(2, officeLevel + 1)) : 2;
}

// Territory and Influence are Wang's own terms, and both now depend on the
// layout the player built rather than on a fixed 2-4-3 base.
//
// These used to be constants (2 Trading Posts, 4 Factories, 3 Power Plants),
// with a note reasoning that Influence (5) could never fall below Territory
// (4) and that Wang's "Territory > Influence" branch was therefore
// unreachable. That reasoning held only for the fixed layout. A player who
// builds five Factories and two Power Plants has Territory 5 against
// Influence 4, and the branch fires -- so both branches are live and the
// counts have to be passed in.
export function territoryOf(counts: LayoutCounts): number {
  return counts.factoryCount; // Wang: "Territory is the number of factories"
}
export function influenceOf(counts: LayoutCounts): number {
  return counts.powerPlantCount + counts.tradingPostCount; // Wang: "Influence is power plants + trading posts"
}

/** How many of each production facility the player actually built. Counts
 * only BUILT facilities -- a spot left unbuilt is not a Power Plant. */
export interface LayoutCounts {
  tradingPostCount: number;
  factoryCount: number;
  powerPlantCount: number;
}

export function nonDefaultRecruitSlots(officeLevel: number): number {
  return Math.max(0, recruitSlotCount(officeLevel) - 2);
}

/** "Pure Gold Production Line" = a Factory whose assigned product is
 * Precious Metals. This is a genuine decision variable for the optimizer,
 * not a fixed count -- which product each Factory makes isn't fixed. */
export function pureGoldProductionLineCount(factoryProducts: (string | null)[]): number {
  return factoryProducts.filter((p) => p === 'Precious Metals').length;
}

export interface BaseResourceState extends LayoutCounts {
  officeLevel: number;
  czernyDormitoryLevel: number;
  irisDormitoryLevel: number;
  dormitoryOperatorCount: number;
  suiOperatorsInNonDormFacilities: number; // capped at 5 by Chongyue's own skill text
  suiOperatorFacilityCount: number; // Taraxacum: distinct facilities with >=1 Sui operator, NOT headcount
  teamRainbowOperatorsInCC: number; // Control Center only -- matches Ash's own "Team Rainbow" skill, which is also CC-scoped, not base-wide
  selfMorale: number; // for morale-threshold-gated generators (Dusk, Ling) -- default 24 (full)
  lingFractionAbove12: number; // time-weighted fraction of the facility-wide Morale window Ling spends above 12 Morale, starting from full (24) -- confirmed by the user: operators start full and are left in place until the first one runs out
  duskFractionAbove12: number; // same, for Dusk
  virtuosaRoomOperatorCount: number; // size of the SPECIFIC Dormitory Virtuosa is placed in (0 if not placed) -- her Soundless Resonance generation scales with this, not the base-wide Dormitory total
}

export interface ResourcePools {
  passion: number;
  worldlyPlight: number;
  soundlessResonance: number;
  perceptionInformation: number;
  intelligenceReserve: number;
  memoryFragments: number;
  witchcraftCrystal: number; // Worldly Plight converts into this (Jieyun)
  chainOfThought: number; // Perception Information converts into this (Rosmontis)
  measure: number; // Czerny's Adagio generates this, her own Walking the Keyboard converts it to Perception Information
  dreamland: number; // Iris's Bedtime Story generates this, her own Sleep Talking converts it to Perception Information
}

function emptyPools(): ResourcePools {
  return {
    passion: 0,
    worldlyPlight: 0,
    soundlessResonance: 0,
    perceptionInformation: 0,
    intelligenceReserve: 0,
    memoryFragments: 0,
    witchcraftCrystal: 0,
    chainOfThought: 0,
    measure: 0,
    dreamland: 0,
  };
}

/** present is a set of "OperatorName|SkillName" strings for every base
 * skill actually active in the current placement -- same key format as
 * FACTORY_SPECIAL_SKILLS, so the two share one convention. */
export function computeResourcePools(state: BaseResourceState, present: Set<string>): ResourcePools {
  const pools = emptyPools();

  // --- Generators ---
  if (present.has("Misumi Uika|Idol's Aura")) pools.passion += state.dormitoryOperatorCount;
  if (present.has('Wakaba Mutsumi|Monster of Acting')) pools.passion += 20;
  if (present.has('Yahata Umiri|Reliable Companion')) pools.passion += 10;
  if (present.has('Yūtenji Nyamu|Diligent Worker')) pools.passion += 10;

  if (present.has('Mr. Nothing|"Obvious Deception"')) pools.worldlyPlight += state.dormitoryOperatorCount;
  // "for each Sui Operator assigned to buildings other than Dormitories and
  // Activity Rooms, Worldly Plight +5 (max 5)" -- the cap is on the number of
  // Operators counted, not on the Worldly Plight itself, so five of them is
  // +25 and not +5. He counts HIMSELF too: the user's worked example is
  // Chongyue in the Control Center plus three other Sui Operators outside
  // Dormitories = four counted = +20. This previously added the headcount
  // itself, giving +3 for three Operators, which is neither reading.
  if (present.has('Chongyue|I am I')) pools.worldlyPlight += 5 * Math.min(5, state.suiOperatorsInNonDormFacilities);
  if (present.has('Dusk|"Unstirred by Gain"')) pools.worldlyPlight += 15 * (1 - state.duskFractionAbove12);
  if (present.has('Mulberry|Rescue Team - Post-Catastrophe Census')) pools.worldlyPlight += 10 * nonDefaultRecruitSlots(state.officeLevel);
  if (present.has('Ling|"Vast Mountains and Rivers"')) pools.worldlyPlight += 15 * state.lingFractionAbove12;

  if (present.has('Dusk|"Unmoved by Loss"')) pools.perceptionInformation += 10 * state.duskFractionAbove12;
  if (present.has('Ling|"Vast Mountains and Rivers"')) pools.perceptionInformation += 10 * (1 - state.lingFractionAbove12);
  // Rosmontis's Extrasensory and Ebenholz's Musicianship each GENERATE
  // Perception Information as well as converting it -- "for every 1 Operator in
  // the Dormitories, Perception Information +1, and every 1 Perception
  // Information is converted to ..." is one skill doing both. Their generation
  // belongs here, in the shared pool, so that each one's conversion can see the
  // other's contribution; the conversions themselves run in stage 3.
  if (present.has('Rosmontis|Extrasensory')) pools.perceptionInformation += state.dormitoryOperatorCount;
  if (present.has('Ebenholz|Musicianship')) pools.perceptionInformation += state.dormitoryOperatorCount;

  if (present.has('Ash|Intelligence Reserve')) pools.intelligenceReserve += state.teamRainbowOperatorsInCC;

  if (present.has('Whisperain|Itinerant')) pools.memoryFragments += 10 * nonDefaultRecruitSlots(state.officeLevel);

  if (present.has("Bassline|Drawing the Heart's Voice")) pools.soundlessResonance += 15 * nonDefaultRecruitSlots(state.officeLevel);
  if (present.has('Virtuosa|Soundless Resonance')) pools.soundlessResonance += state.virtuosaRoomOperatorCount;

  if (present.has('Czerny|Adagio')) pools.measure += state.czernyDormitoryLevel;
  if (present.has('Iris|Bedtime Story')) pools.dreamland += state.irisDormitoryLevel;

  // --- Conversions ---------------------------------------------------------
  // A conversion does NOT consume what it reads. PRTS states it outright:
  // "转化并不会消耗原有的中间产物，而是以该产物的当前数量按比例实时计算出转化数"
  // -- the converted amount is computed in real time from the source's CURRENT
  // quantity at a fixed ratio, and the source is left alone. So every reader of
  // a pool sees the same value, and two skills converting the same source both
  // get the full amount rather than racing for a share of it.
  //
  // This is why the ordering below is the only ordering that matters: anything
  // converting INTO Perception Information has to run before anything reading
  // Perception Information, or the readers see a half-built total. Within a
  // stage the order is irrelevant, because nothing is being drained.
  //
  // The previous version subtracted from each source (`pools.measure = 0` and
  // friends) and treated Rosmontis and Ebenholz as self-contained, on the
  // theory that a shared pool would let whichever converted first drain the
  // other. Under the real rule there is nothing to drain, so that whole hazard
  // -- and the workaround for it -- was unnecessary.

  // Stage 1: everything that converts INTO Perception Information.
  if (present.has('Czerny|Walking the Keyboard')) pools.perceptionInformation += pools.measure;
  if (present.has('Iris|Sleep Talking')) pools.perceptionInformation += pools.dreamland;
  if (present.has('Whisperain|Memory Seeker')) pools.perceptionInformation += pools.memoryFragments;

  // Stage 2: everything that converts OUT of Perception Information. Both read
  // the same completed total, and neither reduces it.
  if (present.has('Ebenholz|Musicianship')) pools.soundlessResonance += pools.perceptionInformation;
  if (present.has('Rosmontis|Extrasensory')) pools.chainOfThought += pools.perceptionInformation;

  // Stage 3: Worldly Plight -> Witchcraft Crystal at 5:1. Also non-consuming,
  // which matters here because Shu, Wind Chimes, Chongyue and Ch'en the
  // Dawnstreak all read Worldly Plight too.
  if (present.has('Jieyun|Ancient Witchcraft')) {
    pools.witchcraftCrystal += Math.floor(pools.worldlyPlight / 5);
  }

  return pools;
}

/** Bonuses that read from the resource pools, keyed the same way as
 * FACTORY_SPECIAL_SKILLS ("OperatorName|SkillName|whatBonus"). These are
 * just the resource-dependent piece of each skill -- any flat portion of
 * the same skill is a separate, ordinary factory-skill handler. */
export function consumerBonuses(state: BaseResourceState, pools: ResourcePools): Record<string, number> {
  return {
    'Wakaba Mutsumi|Monster of Acting|trading_post_order_pct': Math.floor(pools.passion / 8) * 1,
    'Wakaba Mutsumi|Monster of Acting|self_morale_per_hour': Math.floor(pools.passion / 8) * 0.01,
    'Togawa Sakiko|Plentiful Work Experience|precious_metal_pct_base': Math.floor(pools.passion / 20) * 0.5,
    'Togawa Sakiko|Plentiful Work Experience|precious_metal_pct_e2': Math.floor(pools.passion / 20) * 1.0,
    'Togawa Sakiko|Indomitable Lady|self_morale_per_hour': pools.passion >= 40 ? 0.05 : 0,

    'Shu|Where Stalks Grow Deep, Autumn Reaps|productivity_pct': Math.floor(pools.worldlyPlight / 3) * 1,
    'Mr. Nothing|"Obvious Deception"|order_efficiency_pct': pools.worldlyPlight * 1,
    'Wind Chimes|Hell and High Water|morale_loss_reduction_base': Math.floor(pools.worldlyPlight / 10) * 0.01,
    'Wind Chimes|Distant Letter|morale_loss_reduction_e2': Math.floor(pools.worldlyPlight / 10) * 0.02,
    'Chongyue|Solitary Light|morale_recovery_bonus': Math.floor(pools.worldlyPlight / 20) * 0.05,
    "Ch'en the Dawnstreak|Chivalrous Hero|clue_search_pct": Math.floor(pools.worldlyPlight / 10) * 1,

    'Ebenholz|Lingering Melody|order_efficiency_pct_base': Math.floor(pools.soundlessResonance / 4) * 1,
    'Ebenholz|Harmony Astray|order_efficiency_pct_e2': Math.floor(pools.soundlessResonance / 2) * 1,

    'Blitz|Linguistics|hr_speed_pct_from_intel': pools.intelligenceReserve * 5,
    'Iana|Intel Expert|clue_search_pct': pools.intelligenceReserve * 5,

    // Both branches are reachable now that the layout is the player's --
    // see territoryOf/influenceOf above.
    'Wang|Expedience|trading_post_order_pct': influenceOf(state) >= territoryOf(state) ? 7.0 : 0,
    'Wang|Expedience|factory_productivity_pct': territoryOf(state) > influenceOf(state) ? 2.0 : 0,

    'Taraxacum|"The Best of Students!"|order_efficiency_pct': Math.min(5, state.suiOperatorFacilityCount) * 4,
  };
}
