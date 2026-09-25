import type { PlannerOperator, CostGroup } from "@/lib/operators/operatorTypes";
import type { BuilderState } from "./builderStates";
import { plannerModules } from "./build";
import {
  addCostGroup,
  totalsToCostGroup,
  computeLevelCostRemaining,
  promotionCostsNeeded,
  skillLevelCostRemaining,
  skillMasteryCostRemaining,
  moduleStageCostRemaining,
  type LevelTable,
} from "@/lib/planner/plannerLogic";

/** One cost calculation shared by the overview, wizard, and depot bill. */
export function upgradeCostGroups(
  op: PlannerOperator,
  b: BuilderState,
  levels: LevelTable,
): { name: string; cost: CostGroup }[] {
  const leveling = new Map<string, number>();
  const level = computeLevelCostRemaining(
    levels,
    op.rarity || 1,
    b.startingElite,
    b.startingLevel,
    b.elite,
    b.level,
  );
  addCostGroup(leveling, [
    { name: "EXP", quantity: level.exp },
    { name: "LMD", quantity: level.lmd },
  ]);
  for (const p of promotionCostsNeeded(op, b.elite, b.startingElite))
    addCostGroup(leveling, p.cost);
  const skills = new Map<string, number>();
  addCostGroup(
    skills,
    skillLevelCostRemaining(op, b.startingSkillLevel, b.skillLevel),
  );
  if (b.skillLevel === 7 && b.elite === 2) {
    for (const [index, target] of Object.entries(b.masteryTargets))
      addCostGroup(
        skills,
        skillMasteryCostRemaining(
          Number(index),
          op,
          b.startingMasteryLevels[Number(index)] || 0,
          target,
        ),
      );
  }
  const modules = new Map<string, number>();
  const list = plannerModules(op);
  for (const [index, target] of Object.entries(b.moduleStageTargets)) {
    const mod = list[Number(index)];
    if (mod)
      addCostGroup(
        modules,
        moduleStageCostRemaining(
          mod,
          b.startingModuleStages?.[Number(index)] ?? -1,
          target,
        ),
      );
  }
  return [
    { name: "Level & promotion", cost: totalsToCostGroup(leveling) },
    { name: "Skills", cost: totalsToCostGroup(skills) },
    { name: "Modules", cost: totalsToCostGroup(modules) },
  ];
}
