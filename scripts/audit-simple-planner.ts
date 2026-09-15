import assert from "node:assert/strict";
import fs from "node:fs";
import { upgradeCostGroups } from "../lib/planner/upgradeCostGroups";
import {
  defaultStartingState,
  type BuilderState,
} from "../lib/planner/builderStates";
import {
  getSkillList,
  type PlannerOperator,
} from "../lib/operators/operatorTypes";
import { plannerModules } from "../lib/planner/build";
import {
  computeLevelCostRemaining,
  promotionCostsNeeded,
  skillLevelCostRemaining,
  skillMasteryCostRemaining,
  moduleStageCostRemaining,
} from "../lib/plannerLogic";

const op = JSON.parse(
  fs.readFileSync("public/planner-data/M%C5%82ynar.json", "utf8"),
) as PlannerOperator;
const initial: BuilderState = {
  ...defaultStartingState(),
  elite: 0,
  level: 1,
  skillLevel: 1,
  masteryTargets: {},
  moduleStageTargets: {},
};
const positive = (cost: { name: string; quantity: number | string }[]) =>
  cost.filter((c) => Number(c.quantity) > 0);
const sum = (cost: { name: string; quantity: number | string }[]) => {
  const totals: Record<string, number> = {};
  for (const c of positive(cost))
    totals[c.name] = (totals[c.name] || 0) + Number(c.quantity);
  return totals;
};
assert.deepEqual(
  upgradeCostGroups(op, initial).flatMap((g) => positive(g.cost)),
  [],
  "Unchanged operator costs nothing",
);
const leveling = {
  ...initial,
  startingElite: 2,
  startingLevel: 70,
  elite: 2,
  level: 80,
};
assert.deepEqual(
  sum(upgradeCostGroups(op, leveling)[0].cost),
  { EXP: 161200, LMD: 171616 },
  "E2 70 to 80 excludes already paid promotions and levels",
);
const skills = getSkillList(op);
assert.ok(skills.length > 0);
const mastery: BuilderState = {
  ...leveling,
  level: 70,
  startingSkillLevel: 7,
  skillLevel: 7,
  startingMasteryLevels: { 0: 1 },
  masteryTargets: { 0: 3 },
};
assert.deepEqual(
  sum(upgradeCostGroups(op, mastery)[1].cost),
  sum(skillMasteryCostRemaining(0, op, 1, 3)),
  "Only unpaid mastery stages are counted",
);
const modules = plannerModules(op);
assert.ok(modules.length > 0);
const mod: BuilderState = {
  ...mastery,
  masteryTargets: {},
  startingModuleStages: { 0: 0 },
  moduleStageTargets: { 0: 2 },
};
assert.deepEqual(
  sum(upgradeCostGroups(op, mod)[2].cost),
  sum(moduleStageCostRemaining(modules[0], 0, 2)),
  "Owned module unlock is subtracted",
);

// Compare grouped bills with the previous planner calculation across every operator.
let checked = 0;
for (const file of fs
  .readdirSync("public/planner-data")
  .filter((f) => f.endsWith(".json"))) {
  const operator = JSON.parse(
    fs.readFileSync(`public/planner-data/${file}`, "utf8"),
  ) as PlannerOperator;
  const rarity = operator.rarity || 1;
  const elite = rarity >= 4 ? 2 : rarity === 3 ? 1 : 0;
  const target: BuilderState = {
    ...initial,
    elite,
    level: 30,
    skillLevel: elite ? 7 : 4,
    masteryTargets: elite === 2 ? { 0: 3 } : {},
    moduleStageTargets: plannerModules(operator).length ? { 0: 2 } : {},
  };
  const lc = computeLevelCostRemaining(rarity, 0, 1, elite, 30);
  const previous = [
    { name: "EXP", quantity: lc.exp },
    { name: "LMD", quantity: lc.lmd },
    ...promotionCostsNeeded(operator, elite, 0).flatMap((p) => p.cost),
    ...skillLevelCostRemaining(operator, 1, target.skillLevel),
  ];
  if (elite === 2)
    previous.push(...skillMasteryCostRemaining(0, operator, 0, 3));
  const module = plannerModules(operator)[0];
  if (module) previous.push(...moduleStageCostRemaining(module, -1, 2));
  assert.deepEqual(
    sum(upgradeCostGroups(operator, target).flatMap((g) => g.cost)),
    sum(previous),
    `${operator.name}: grouped costs match original bill`,
  );
  checked++;
}
console.log(
  `Simple planner checks passed: unchanged builds, leveling, mastery, modules, and ${checked} operator bills.`,
);

// Choosing an upgrade adds only its prerequisites, never current progress.
import { withMasteryPrerequisites, withModulePrerequisites } from '../lib/planner/goalPrerequisites';
const low = { ...initial, elite: 1, level: 80, skillLevel: 4 };
const promoted = withMasteryPrerequisites(low);
assert.equal(promoted.elite, 2);
assert.equal(promoted.level, 1);
assert.equal(promoted.skillLevel, 7);
assert.equal(promoted.startingElite, low.startingElite);
assert.equal(promoted.startingSkillLevel, low.startingSkillLevel);
assert.equal(withMasteryPrerequisites(leveling).level, 80);
for (const [rarity, level] of [[4, 40], [5, 50], [6, 60]]) {
  const target = withModulePrerequisites(low, rarity);
  assert.equal(target.elite, 2);
  assert.equal(target.level, level);
  assert.equal(target.skillLevel, 4);
  assert.equal(target.startingLevel, low.startingLevel);
  assert.equal(withModulePrerequisites(leveling, rarity).level, 80);
}
assert.ok(upgradeCostGroups(op, promoted)[0].cost.some(c => c.name === 'Guard Dualchip'), 'Automatic mastery promotion is priced');
console.log('Automatic mastery and module prerequisite checks passed.');

import { withSkillRankPrerequisites } from '../lib/planner/goalPrerequisites';
const owned = { elite: 0, level: 50, skillLevel: 1, masteries: {}, modules: {} };
assert.deepEqual(withMasteryPrerequisites(owned), { ...owned, elite: 2, level: 1, skillLevel: 7 });
assert.deepEqual(withSkillRankPrerequisites(owned, 7), { ...owned, elite: 1, level: 1, skillLevel: 7 });
assert.equal(withSkillRankPrerequisites({ ...owned, elite: 2, level: 80 }, 7).level, 80);
for (const [rarity, level] of [[4, 40], [5, 50], [6, 60]]) {
  assert.deepEqual(withModulePrerequisites(owned, rarity), { ...owned, elite: 2, level });
}
assert.equal(owned.elite, 0, 'Prerequisite helpers do not mutate the previous state');
console.log('Current-level prerequisite checks passed.');
