/**
 * The base skills whose numbers are no shape in the table (lib/base/baseSkillEffects.ts): each is a named
 * handler here with its parameters in the entry's `custom.params`. They run at a stage of the room's
 * evaluation (`CUSTOM_STAGE`), since each reads what the rest of the room or the base provides: a ramp needs
 * the room's Morale window, Waai Fu the others' productivity, Snowsant the others' order efficiency, Gladiia
 * the Abyssal Hunters' placements.
 */
import { averageRampValue, shareAfterHours } from './rampValue';

export type CustomStage = 'base' | 'moraleWindow' | 'factoryAggregate' | 'tradingAggregate' | 'tradingOrders' | 'workshop';

export interface CustomContext {
  operatorName: string;
  /** Working operators in the room. */
  roomNames: readonly string[];
  /** The window ramps average over, and where in a stint it starts. */
  rampWindowHours: number;
  rampStartHours: number;
  /** The operator's own Morale loss per hour (Totter). */
  selfMoraleRate: number;
  /** Factory: what every other operator's skills provide, and each operator's capacity change. */
  othersProductivitySum: number;
  capacityByOperator: Readonly<Record<string, number>>;
  groupHuntingInControlCenter: boolean;
  /** Trading Post: what the other operators' skills provide. */
  othersOrderEfficiencySum: number;
  othersOrderLimitRawSum: number;
  /** Base-wide: Abyssal Hunters at work and at rest (Gladiia), the share of the window the operator spends above
   *  12 Morale (Dusk, Ling), and how many Control Center skills of a buff family are active (Młynar). */
  abyssalHunters: { working: number; resting: number; restingAtFullMorale: number; perFactory: { factoryId: string; count: number }[]; totalInFactories: number };
  fractionAbove12: number;
  ccFamilyCount: (family: string) => number;
  /** Workshop: the recipe's base Morale cost, the craft's cost after the skills, and the reader's counters. */
  workshop?: { recipeMorale: number; moraleCost: number; causality: number; karma: number; thornsFailures: number };
}

export interface CustomResult {
  productivity?: number;
  capacity?: number;
  orderEfficiency?: number;
  droneRate?: number;
  clueSpeed?: number;
  selfMorale?: number;
  resources?: Record<string, number>;
  perFactoryProductivity?: { factoryId: string; amount: number }[];
  /** Młynar: recovery for workers in Power Plants, Office and Reception Room, and in every other building. */
  otherRoomsRecovery?: { ownRooms: number; everyRoom: number };
  /** Workshop: the craft's byproduct is certain (Nine-Colored Deer's counters). */
  guaranteedByproduct?: boolean;
  note?: string;
  formula?: string;
}

type Handler = (params: Record<string, number>, ctx: CustomContext) => CustomResult;

/** A value climbing by the hour from `base` by `perHour` to `cap`, averaged over the room's window. Which room
 *  stat it is comes from the entry's room: productivity in a Factory, clue speed in the Reception Room, drone
 *  charge in a Power Plant; the room reads the `ramp` field it needs. */
const ramp: Handler = (p, ctx) => {
  const value = averageRampValue(p.base, p.perHour, p.cap, ctx.rampWindowHours, ctx.rampStartHours);
  return { productivity: value, clueSpeed: value, droneRate: value, formula: `${p.base * 100}% + ${p.perHour * 100}%/h up to ${p.cap * 100}%, averaged over ${ctx.rampWindowHours.toFixed(1)} h from hour ${ctx.rampStartHours} = ${(value * 100).toFixed(2)}%` };
};

/** Totter: productivity steps down every 4 points of Morale lost, averaged over the window at his own rate. */
function totterAverage(selfMoraleRate: number, windowHours: number, base: number, stepPer4: number, threshold: number | null, bonus: number): number {
  const at = (diff: number) => base - stepPer4 * Math.floor(diff / 4) + (threshold !== null && diff > threshold ? bonus : 0);
  if (windowHours <= 0 || selfMoraleRate <= 0) return at(0);
  const diffs = [0, 4, 8, 12, 16, 20, 24];
  const times = diffs.map((d) => Math.min(windowHours, d / selfMoraleRate));
  let total = 0;
  for (let i = 0; i < times.length - 1; i++) if (times[i + 1] > times[i]) total += at(diffs[i]) * (times[i + 1] - times[i]);
  const last = times[times.length - 1];
  if (windowHours > last) total += at(24) * (windowHours - last);
  return total / windowHours;
}

export const CUSTOM_HANDLERS: Record<string, Handler> = {
  ramp,
  afterHours: (p, ctx) => ({ productivity: p.value * shareAfterHours(p.afterHours, ctx.rampWindowHours, ctx.rampStartHours) }),
  totterBlurryVision: (p, ctx) => ({ productivity: totterAverage(ctx.selfMoraleRate, ctx.rampWindowHours, p.base, p.stepPer4, null, 0) }),
  totterBlizzardOutside: (p, ctx) => {
    const productivity = totterAverage(ctx.selfMoraleRate, ctx.rampWindowHours, 0, 0, p.threshold, p.productivity);
    // Capacity is averaged the same fractional way, since the bonus is on while his Morale difference is past the threshold.
    return { productivity, capacity: p.capacity * (productivity / p.productivity) };
  },
  // Bubble: productivity per point of every operator's capacity increase, 1% up to 15 and 3% beyond.
  bubble: (p, ctx) => ({ productivity: Object.values(ctx.capacityByOperator).reduce((sum, cap) => sum + (cap <= 15 ? p.perPointUpTo15 * cap : p.perPointAbove * cap), 0) }),
  // Vermeil: per point of the Factory's whole capacity increase; nothing while Bubble shares the room.
  vermeil: (p, ctx) => ({ productivity: ctx.roomNames.includes('Bubble') ? 0 : p.perPoint * Object.values(ctx.capacityByOperator).reduce((s, c) => s + c, 0) }),
  waaiFu: (p, ctx) => ctx.groupHuntingInControlCenter
    ? { productivity: 0, note: "Overridden by Gladiia's Group Hunting in the Control Center." }
    : { productivity: Math.min(p.cap, p.perStep * Math.floor((ctx.othersProductivitySum + 1e-9) / p.step)), note: `${p.perStep * 100}% for every ${p.step * 100}% the others provide, up to ${p.cap * 100}%.` },
  snowsant: (p, ctx) => ({ orderEfficiency: Math.min(p.cap, p.perStep * Math.floor((ctx.othersOrderEfficiencySum + 1e-9) / p.step)) }),
  perOthersOrderLimit: (p, ctx) => ({ orderEfficiency: Math.max(0, Math.min(p.cap ?? Infinity, p.perStep * Math.floor(ctx.othersOrderLimitRawSum / p.step))) }),
  // Jaye's pair is resolved together by the Trading Post (lib/base/jaye.ts); these only mark the skills.
  jayeStreetEconomics: () => ({}),
  jayeBasicNeeds: () => ({}),
  // Gladiia: +0.5 drain per Abyssal Hunter at work, -0.5 per one resting, -0.5 more per one resting at full Morale.
  tideObservation: (p, ctx) => ({ selfMorale: p.drainPerWorker * ctx.abyssalHunters.working - p.recoveryPerResting * ctx.abyssalHunters.resting - p.recoveryPerFull * ctx.abyssalHunters.restingAtFullMorale }),
  // Each Factory with Abyssal Hunters gains per Hunter there times every Hunter in a Factory, capped.
  abyssalGroupHunting: (p, ctx) => ({ perFactoryProductivity: ctx.abyssalHunters.perFactory.map((f) => ({ factoryId: f.factoryId, amount: Math.min(p.cap, p.amount * f.count * ctx.abyssalHunters.totalInFactories) })) }),
  mlynar: (p, ctx) => ({ otherRoomsRecovery: { ownRooms: p.ownRooms, everyRoom: p.perControlCenterSkill * ctx.ccFamilyCount('control_mp_cost') } }),
  // Dusk and Ling: Worldly Plight above 12 Morale, Perception Information below (or the reverse), by the share of
  // the window spent on each side, which the page sets as a manual choice.
  moraleGated: (p, ctx) => ({ resources: {
    ...(p.above12WorldlyPlight ? { worldlyPlight: p.above12WorldlyPlight * ctx.fractionAbove12 } : {}),
    ...(p.below12WorldlyPlight ? { worldlyPlight: p.below12WorldlyPlight * (1 - ctx.fractionAbove12) } : {}),
    ...(p.above12PerceptionInformation ? { perceptionInformation: p.above12PerceptionInformation * ctx.fractionAbove12 } : {}),
    ...(p.below12PerceptionInformation ? { perceptionInformation: p.below12PerceptionInformation * (1 - ctx.fractionAbove12) } : {}),
  } }),
  // Nine-Colored Deer: failed crafts of a recipe costing at most `maxCost` (Causality) or exactly `cost` (Karma) add
  // their cost to a counter; the craft that carries it to `threshold` is a certain byproduct.
  causality: (p, ctx) => ctx.workshop ? {
    guaranteedByproduct: ctx.workshop.recipeMorale <= p.maxCost && ctx.workshop.causality + ctx.workshop.recipeMorale >= p.threshold,
    note: `Causality: failed crafts costing at most ${p.maxCost} Morale add their cost; a craft crossing ${p.threshold} guarantees a byproduct and spends ${p.threshold} points (ordinary byproducts keep the counter).`,
  } : {},
  karma: (p, ctx) => ctx.workshop ? {
    guaranteedByproduct: ctx.workshop.recipeMorale === p.cost && ctx.workshop.karma + ctx.workshop.recipeMorale >= p.threshold,
    note: `Karma: failed crafts costing ${p.cost} Morale accumulate their cost; a craft crossing ${p.threshold} guarantees a byproduct and spends ${p.threshold} points.`,
  } : {},
  // Thorns: every two crafts without a byproduct refund one craft's Morale after processing.
  explosionArts: (p, ctx) => ctx.workshop ? { note: ctx.workshop.thornsFailures >= p.perFailures
    ? `After processing, restore ${ctx.workshop.moraleCost} Morale per pair of failed crafts (${Math.floor(ctx.workshop.thornsFailures / p.perFailures)} pairs entered).`
    : 'Every two failed crafts restore one craft’s Morale after processing; enter the failure count.' } : {},
};

export const CUSTOM_STAGE: Record<string, CustomStage> = {
  ramp: 'moraleWindow', afterHours: 'moraleWindow', totterBlurryVision: 'moraleWindow', totterBlizzardOutside: 'moraleWindow',
  bubble: 'factoryAggregate', vermeil: 'factoryAggregate', waaiFu: 'factoryAggregate',
  snowsant: 'tradingAggregate', perOthersOrderLimit: 'tradingAggregate', jayeStreetEconomics: 'tradingOrders', jayeBasicNeeds: 'tradingOrders',
  tideObservation: 'base', abyssalGroupHunting: 'base', mlynar: 'base', moraleGated: 'base',
  causality: 'workshop', karma: 'workshop', explosionArts: 'workshop',
};
