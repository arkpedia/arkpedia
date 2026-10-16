import { LEVEL_CAPS, maxLevelForElite } from '@/lib/planner/plannerLogic';

/**
 * One upgrade, with what it is -- so it can be priced and BUILT, not only
 * counted. The label is for the "Next:" line; the fields are for
 * lib/planner/build.ts, which prices a goal from the operator's current state
 * and applies it to the roster once the depot has paid for it.
 */
export type Goal =
  | { kind: 'elite'; label: string; elite: number }
  /** A level run inside one promotion tier, to `to`. Where it starts is not
   *  stored: it is wherever the operator is when the run is built. */
  | { kind: 'level'; label: string; elite: number; to: number }
  | { kind: 'skill'; label: string; rank: number }
  | { kind: 'mastery'; label: string; skill: number; mastery: 1 | 2 | 3 }
  | { kind: 'module'; label: string; module: number; stage: number };

export interface GoalFrom {
  elite: number;
  level: number;
  skillLevel: number;
  masteryOf: (skillIndex: number) => number;
  moduleStageOf: (moduleIndex: number) => number;
}

export interface GoalTo extends GoalFrom {}

export function goalsFor(
  rarity: number,
  skillCount: number,
  modules: { name: string; stages: number }[],
  from: GoalFrom,
  to: GoalTo,
): Goal[] {
  const goals: Goal[] = [];

  for (let e = from.elite + 1; e <= to.elite; e += 1) {
    if (LEVEL_CAPS[rarity]?.[e as 0 | 1 | 2] === undefined) continue;
    goals.push({ kind: 'elite', label: `E${e} promotion`, elite: e });
  }

  /**
   * One goal per level RUN, not per level.
   *
   * A run is the stretch inside one promotion tier, because that is how the
   * game makes you do it: the counter resets to 1 on promotion, so getting a
   * 5-star from E0 Lv1 to E2 Lv50 is three separate climbs. A run with nothing
   * in it does not count -- promoting away from a tier you have already maxed
   * adds no work, and a zero-length run would have padded the total for exactly
   * the operators who are furthest along.
   */
  for (let e = from.elite; e <= to.elite; e += 1) {
    if (LEVEL_CAPS[rarity]?.[e as 0 | 1 | 2] === undefined) continue;
    const start = e === from.elite ? from.level : 1;
    const end = e === to.elite ? to.level : maxLevelForElite(rarity, e);
    if (end > start) goals.push({ kind: 'level', label: `E${e} to Lv ${end}`, elite: e, to: end });
  }

  for (let r = from.skillLevel + 1; r <= to.skillLevel; r += 1) {
    goals.push({ kind: 'skill', label: `Skill rank ${r}`, rank: r });
  }

  for (let i = 0; i < skillCount; i += 1) {
    const start = from.masteryOf(i);
    const target = to.masteryOf(i);
    for (let m = start + 1; m <= target; m += 1) {
      goals.push({ kind: 'mastery', label: `S${i + 1} M${m}`, skill: i, mastery: m as 1 | 2 | 3 });
    }
  }

  modules.forEach((mod, i) => {
    const start = from.moduleStageOf(i);
    const target = to.moduleStageOf(i);
    for (let s = start + 1; s <= target; s += 1) {
      goals.push({ kind: 'module', label: `${mod.name} S${s + 1}`, module: i, stage: s });
    }
  });

  return goals;
}
