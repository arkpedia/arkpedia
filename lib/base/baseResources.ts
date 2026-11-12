/**
 * The base-wide quantities skills count: recruit slots, the layout's Territory and Influence, the Pure Gold
 * Production Lines, and the resource pools (Felvine, Passion, Worldly Plight, ...) that skills generate and
 * convert. What generates and converts them is the skill table (lib/base/baseSkillEffects.ts): a `resource`
 * effect names the pool it adds to, or one of the conversions below; the calculator sums the generation and
 * runs the conversions here, in their stages.
 */

/** The initial two recruitment slots are followed by one per Office upgrade. */
export function recruitSlotCount(officeLevel: number): number {
  return officeLevel > 0 ? Math.min(4, Math.max(2, officeLevel + 1)) : 2;
}
export function nonDefaultRecruitSlots(officeLevel: number): number {
  return Math.max(0, recruitSlotCount(officeLevel) - 2);
}

/** How many of each production facility the player actually built. Counts only BUILT facilities. */
export interface LayoutCounts {
  tradingPostCount: number;
  factoryCount: number;
  powerPlantCount: number;
}
// Territory and Influence are Wang's own terms, both depending on the layout the player built: a player with five
// Factories and two Power Plants has Territory 5 against Influence 4, so both branches of Expedience are live.
export function territoryOf(counts: LayoutCounts): number {
  return counts.factoryCount; // Wang: "Territory is the number of factories"
}
export function influenceOf(counts: LayoutCounts): number {
  return counts.powerPlantCount + counts.tradingPostCount; // Wang: "Influence is power plants + trading posts"
}

/** "Pure Gold Production Line" = a Factory whose assigned product is Precious Metals: a decision variable for the
 * optimizer, not a fixed count. */
export function pureGoldProductionLineCount(factoryProducts: (string | null)[]): number {
  return factoryProducts.filter((p) => p === 'Precious Metals').length;
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

/**
 * The pools from what the active skills generate (by pool name) and which conversions they perform.
 *
 * A conversion does NOT consume what it reads. PRTS states it outright: the converted amount is computed in real
 * time from the source's CURRENT quantity at a fixed ratio, and the source is left alone. So every reader of a pool
 * sees the same value, and two skills converting the same source both get the full amount. The only ordering that
 * matters is the stages: everything converting INTO Perception Information runs before anything reading it, or the
 * readers see a half-built total.
 */
export function computeResourcePools(generated: Readonly<Record<string, number>>, conversions: ReadonlySet<string>): ResourcePools {
  const pools: ResourcePools = {
    passion: generated.passion ?? 0, worldlyPlight: generated.worldlyPlight ?? 0, soundlessResonance: generated.soundlessResonance ?? 0,
    perceptionInformation: generated.perceptionInformation ?? 0, intelligenceReserve: generated.intelligenceReserve ?? 0,
    memoryFragments: generated.memoryFragments ?? 0, witchcraftCrystal: generated.witchcraftCrystal ?? 0, chainOfThought: generated.chainOfThought ?? 0,
    measure: generated.measure ?? 0, dreamland: generated.dreamland ?? 0,
  };
  // Stage 1: everything that converts INTO Perception Information.
  if (conversions.has('perceptionFromMeasure')) pools.perceptionInformation += pools.measure;
  if (conversions.has('perceptionFromDreamland')) pools.perceptionInformation += pools.dreamland;
  if (conversions.has('perceptionFromMemoryFragments')) pools.perceptionInformation += pools.memoryFragments;
  // Stage 2: everything that converts OUT of Perception Information; both read the same completed total.
  if (conversions.has('soundlessResonanceFromPerception')) pools.soundlessResonance += pools.perceptionInformation;
  if (conversions.has('chainOfThoughtFromPerception')) pools.chainOfThought += pools.perceptionInformation;
  // Stage 3: Worldly Plight -> Witchcraft Crystal at 5:1, also non-consuming (Shu, Wind Chimes, Chongyue and Ch'en the
  // Dawnstreak all read Worldly Plight too).
  if (conversions.has('witchcraftCrystalFromWorldlyPlight')) pools.witchcraftCrystal += Math.floor(pools.worldlyPlight / 5);
  return pools;
}
