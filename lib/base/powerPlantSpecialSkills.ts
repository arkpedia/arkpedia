import { averageRampValue } from './rampValue';
export interface PowerPlantSkillContext {
  makotoInFactory: boolean;
  otherRobotInPowerPlant: boolean;
  sameFacilityOperatorNames: string[]; // includes self

  // CONFESS-47 "Now Under Maintenance" -- another Laterano Operator
  // assigned to ANY Power Plant (the skill text doesn't say "this same
  // Power Plant"), base-wide, not room-scoped.
  lateranoInAnyOtherPowerPlant: boolean;

  // Friston-3 "Pleasant Conversation".
  kaltsitInControlCenter: boolean;

  // PhonoR-0 "Incantation Resonance" -- specifically as the TRAINER, not
  // just present in the Training Room.
  logosIsTrainerInTrainingRoom: boolean;

  // Greyy the Lightningbearer "Line Patrol Frame" -- this Power Plant's
  // own max Drone capacity. No default assumed here since this is a real
  // base stat this module has no source of truth for; the caller must
  // supply it.
  maxDroneCapacity: number;

  // Muelsyse "Ecological Section Director" -- every OTHER Rhine Lab
  // Operator base-wide, excluding Assistants and Activity Room users,
  // already pre-capped at 5 by the caller (the handler applies the +3%
  // multiplier directly to whatever count it's given, so cap it before
  // passing it in).
  otherRhineLabCountBaseWide: number;

  // Philae "River Resonance" -- sum of every Dormitory's OWN level
  // (e.g. 4 Dormitories at Level 5 each = 20), not a flat count of
  // Dormitories.
  totalDormitoryLevels: number;

  // Spuria "Technology Exchange β" ramping skill -- real time window
  // (until the first operator anywhere in this Power Plant dies from
  // Morale loss, capped at 24h), same ramping convention used for every
  // other ramping skill this whole codebase models.
  rampStartHours?: number;
  rampWindowHours: number;
}

export interface PowerPlantSkillResult {
  droneRate?: number; // decimal, e.g. 0.10 for +10% -- combined charging-speed/recovery-rate metric, matching calcDroneRate's own generic treatment of the two phrasings as one number
  selfMorale?: number; // decimal per hour, positive = more consumption, negative = less -- THIS operator only
  // Justice Knight's "Beep beep, activate!" is a genuine cross-facility-TYPE
  // effect (Power Plant operator boosting a named Factory operator's OWN
  // facility) -- it contributes NOTHING to this Power Plant's own drone
  // rate. pages/base.tsx consumes it, checking that Wild Mane really is in a
  // Factory and Justice Knight really is in some Power Plant, then adds it to
  // that Factory through perFactoryProductivityBonus.
  //
  // This comment used to end "NOT consumed anywhere yet", which stayed behind
  // after the Factory side was written and cost a debugging session: the skill
  // was reported as unimplemented on the strength of the comment alone.
  wildManeFactoryBonus?: number;
  note?: string; // shown in the UI if this result depends on an assumption, or documents a non-numeric/unmodeled effect
}

type Handler = (ctx: PowerPlantSkillContext) => PowerPlantSkillResult;


/** Keyed by "OperatorName|SkillName". Every simple flat drone-rate bonus
 * (the vast majority of Power Plant skills -- e.g. Castle-3's "Backup
 * Energy" +10%, Liskarm's "Pulsed Arc" α/β +15%/+20%) is picked up
 * automatically by calcDroneRate's generic regex parser and deliberately
 * has NO entry here. Only conditional, cross-facility, or scaling skills
 * that the generic parser can't correctly evaluate are listed.
 *
 * CONFESS-47, Friston-3, Justice Knight, PhonoR-0, and THRM-EX each have
 * TWO Power Plant skills -- a flat +10% Base skill (generic, no entry
 * needed) AND the conditional/special Level 30 skill keyed below. These
 * are two SEPARATE, non-replacing skill slots (different names, no
 * "Replaces" relationship between them), so both apply simultaneously
 * whenever the operator is placed -- confirmed by their real skill data,
 * not something this dictionary needs to special-case for "combining". */
export const POWER_PLANT_SPECIAL_SKILLS: Record<string, Handler> = {
  'Gallus²|Poultry Motivation': (ctx) => ({ droneRate: ctx.otherRobotInPowerPlant ? 0.05 : 0 }),
  'Aegis|Mechanical Engineering': (ctx) => ({ droneRate: 0.15 + (ctx.makotoInFactory ? 0.05 : 0) }),
  'CONFESS-47|Now Under Maintenance': (ctx) => ({
    droneRate: ctx.lateranoInAnyOtherPowerPlant ? 0.05 : 0,
  }),

  'Friston-3|"Pleasant Conversation"': (ctx) => ({
    droneRate: ctx.kaltsitInControlCenter ? 0.05 : 0,
  }),

  'Justice Knight|"Beep beep, activate!"': () => ({
    wildManeFactoryBonus: 0.05,
    // Consumed on the Factory side, via perFactoryProductivityBonus in
    // pages/base.tsx -- see the "?" breakdown of whichever Factory Wild Mane
    // is in. Kept out of the note: how it is wired is not the player's problem.
    note: "Boosts the Factory Wild Mane is assigned to, not this Power Plant's own drone rate, so it shows up in that Factory rather than here.",
  }),

  'PhonoR-0|Incantation Resonance': (ctx) => ({
    droneRate: ctx.logosIsTrainerInTrainingRoom ? 0.05 : 0,
  }),

  'THRM-EX|Enthusiasm': () => ({ selfMorale: -0.52 }),

  'Greyy the Lightningbearer|Line Patrol Frame': (ctx) => ({
    droneRate: Math.min(0.25, ctx.maxDroneCapacity / 10 * 0.01),
  }),

  'Greyy the Lightningbearer|Dawnlight': () => ({
    // Applied in base.tsx's effectivePowerPlantCount, same pattern as Eunectes's
    // "I've Got This": every Factory skill that scales off powerPlantCount
    // (Windflit, the Automation family, Passenger, Weedy) needs it before any
    // Factory skill runs, which this handler is too late to do.
    note: "Counts as +1 extra Power Plant, as long as no Operation Platforms are in the other Power Plants. It doesn't change drone rate, so it shows up in whichever Factory skills scale with Power Plant count.",
  }),

  'Muelsyse|Ecological Section Director': (ctx) => ({
    droneRate: 0.1 + 0.03 * ctx.otherRhineLabCountBaseWide,
  }),

  'Philae|River Resonance': (ctx) => ({
    droneRate: 0.005 * ctx.totalDormitoryLevels,
  }),

  'Spuria|Technology Exchange β': (ctx) => ({
    droneRate: averageRampValue(0.15, 0.01, 0.2, ctx.rampWindowHours, ctx.rampStartHours),
  }),

  'Spuria|Take-Away Fruit Tarts': () => ({ selfMorale: -0.3 }),
};
