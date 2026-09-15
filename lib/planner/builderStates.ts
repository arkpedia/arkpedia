import type { PlannerOperatorSummary } from '@/lib/operators/operatorTypes';
import { maxEliteForRarity, maxLevelForElite, maxSkillRankForElite, moduleUnlock } from '@/lib/plannerLogic';
import { boundedInt, isSafeKey } from './untrusted';

/**
 * What a plan asks for, per operator, and the gate every stored copy of it
 * comes through.
 *
 * The page keeps these in localStorage and reads them back from an import, and
 * both are the same untrusted input arriving by different doors. `clampBuilderStates`
 * used to clamp three fields -- elite, level, skill rank -- and pass the other
 * six through, on the reasoning that the cost code would refuse to price an
 * impossible state. It does. What it does not refuse is to COUNT one:
 * `goalsFor` walks `for (m = start + 1; m <= target; m++)` on a mastery target,
 * and a file saying `"masteryTargets": {"0": 1000000000}` had it pushing a
 * billion goals; `computeLevelCost` walks to `startingLevel`, and a starting
 * level of a billion is a billion iterations. Because the page saves what it
 * loads, that is not a slow import -- it is a planner that hangs on every visit
 * until the reader clears site data.
 *
 * So every field is bounded here, by the game's own limits, and every operator
 * name has to be one the page knows. Nothing reachable is touched: a plan that
 * obeyed the rules comes back byte for byte.
 */

export interface BuilderState {
  elite: number;
  level: number;
  skillLevel: number;
  masteryTargets: Record<number, 1 | 2 | 3>; // skill index -> target mastery level
  moduleStageTargets: Record<number, number>; // module index -> target stage index (0-based)
  // The operator's CURRENT, already-owned progress -- defaults to
  // completely unbuilt (E0L1, skill level 1, no mastery). Everything in
  // the target fields above must stay >= this, enforced by the UI's
  // floor constraints, so the "remaining materials" subtraction is
  // always safe.
  startingElite: number;
  startingLevel: number;
  startingSkillLevel: number;
  startingMasteryLevels: Record<number, 0 | 1 | 2 | 3>; // skill index -> current mastery, 0 = none
  /* module index -> the stage index already owned, 0-based. Absent means the module is
     not unlocked, which is why the sentinel is -1 and not 0: index 0 is a stage paid
     for. Modules were the one dimension with no starting point, so their whole cost
     was counted every time however far along you already were. */
  startingModuleStages: Record<number, number>;
}

export type StartingState = Pick<BuilderState, 'startingElite' | 'startingLevel' | 'startingSkillLevel' | 'startingMasteryLevels' | 'startingModuleStages'>;

export function defaultStartingState(): StartingState {
  return { startingElite: 0, startingLevel: 1, startingSkillLevel: 1, startingMasteryLevels: {}, startingModuleStages: {} };
}

/** More skills or modules than any operator has -- three of each is the game's
 *  most. Loose enough not to drop a fourth module some day, tight enough that an
 *  index of a billion is refused. Same figure as the roster's. */
const MAX_SLOT = 7;

/** An index -> small-integer map, with only the entries that make sense. Keys
 *  are slot indices 0..MAX_SLOT, values inside [lo, hi]; anything else is dropped
 *  rather than failing the operator, because the fields around it are still a
 *  plan the reader wrote. */
function slotMap<V extends number>(raw: unknown, lo: number, hi: number): Record<number, V> {
  const out: Record<number, V> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const idx = boundedInt(k, 0, MAX_SLOT);
    const val = boundedInt(v, lo, hi);
    if (idx === null || val === null) continue;
    out[idx] = val as V;
  }
  return out;
}

/**
 * A saved plan, brought back inside the rules.
 *
 * Operators the page does not know are dropped: a name is only a plan if there
 * is somebody to price it for, and each unknown one would otherwise fetch its
 * own (404ing) build data on every load. The rest is the game's own ladder,
 * applied in the order it unlocks -- the starting point first, then the target
 * held at or above it, then the axes each promotion carries with it.
 */
export function clampBuilderStates(
  saved: Record<string, unknown>,
  operators: PlannerOperatorSummary[],
): Record<string, BuilderState> {
  const rarityOf = new Map(operators.map((o) => [o.name, o.rarity || 1]));
  const out: Record<string, BuilderState> = {};
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return out;

  for (const [name, raw] of Object.entries(saved)) {
    if (!isSafeKey(name)) continue;
    const rarity = rarityOf.get(name);
    if (rarity === undefined) continue;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const b = raw as Record<string, unknown>;
    const maxElite = maxEliteForRarity(rarity);

    /* Where they are. A field that is not a number inside the game's range
       reads as unbuilt, which is the honest default and what the UI shows. */
    const startingElite = boundedInt(b.startingElite, 0, maxElite) ?? 0;
    const startingLevel = boundedInt(b.startingLevel, 1, maxLevelForElite(rarity, startingElite)) ?? 1;
    const startingSkillLevel = boundedInt(b.startingSkillLevel, 1, maxSkillRankForElite(startingElite)) ?? 1;
    const startingMasteryLevels = startingElite === 2 && startingSkillLevel === 7
      ? slotMap<0 | 1 | 2 | 3>(b.startingMasteryLevels, 0, 3)
      : {};
    const startUnlock = moduleUnlock(rarity);
    const startingModuleStages = startUnlock && startingElite >= startUnlock.elite && startingLevel >= startUnlock.level
      ? slotMap<number>(b.startingModuleStages, 0, 2)
      : {};

    /* Where they are going, never below where they are. */
    const elite = Math.max(startingElite, boundedInt(b.elite, 0, maxElite) ?? startingElite);
    const levelCap = maxLevelForElite(rarity, elite);
    const levelFloor = elite === startingElite ? startingLevel : 1;
    const level = Math.max(levelFloor, boundedInt(b.level, 1, levelCap) ?? levelFloor);
    const skillLevel = Math.max(
      startingSkillLevel,
      boundedInt(b.skillLevel, 1, maxSkillRankForElite(elite)) ?? startingSkillLevel,
    );

    /* The axes each promotion carries. Ranks 5-7 need E1 and a mastery needs
       E2 and rank 7; a module needs E2 and a level that depends on rarity. A
       target left behind at M3 under E0 is a state the game cannot produce, and
       the planner would otherwise have gone on pricing it. */
    const masteryTargets = elite === 2 && skillLevel === 7
      ? slotMap<1 | 2 | 3>(b.masteryTargets, 1, 3)
      : {};
    const unlock = moduleUnlock(rarity);
    const moduleStageTargets = unlock && elite >= unlock.elite && level >= unlock.level
      ? slotMap<number>(b.moduleStageTargets, 0, 2)
      : {};
    /* An absent mastery or module target means "as owned" -- the form reads
       `masteryTargets[i] ?? startingMasteryLevels[i]` -- so the maps are left as
       written rather than floored: writing the floor in would change stored
       bytes for a plan that was already correct. A target below its start
       prices to nothing (the remaining-cost helpers subtract, and negatives are
       dropped) and counts no goals, so it is harmless, and the form's own floors
       stop the reader from making one. */

    out[name] = {
      elite,
      level,
      skillLevel,
      masteryTargets,
      moduleStageTargets,
      startingElite,
      startingLevel,
      startingSkillLevel,
      startingMasteryLevels,
      startingModuleStages,
    };
  }
  return out;
}

/** The names a plan can carry: known operators, once each, and only ones that
 *  have a state to price. A name with no state is a row that can answer nothing;
 *  an unknown name is a fetch for a file that does not exist. */
export function knownPlanNames(
  names: unknown,
  states: Record<string, BuilderState>,
): string[] {
  if (!Array.isArray(names)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of names) {
    if (typeof n !== 'string' || seen.has(n) || !Object.prototype.hasOwnProperty.call(states, n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}
