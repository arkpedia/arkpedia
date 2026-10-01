/**
 * A plan's starting point follows the roster.
 *
 * Each plan entry carries its own copy of where the operator starts (BuilderState's
 * starting* fields), which every bill and the simple planner's "Current Level" read. The
 * roster is the record of that, so whenever it changes the copies have to follow, and a
 * target left below the new start is carried up to it.
 *
 * recordOwned did this for one operator, as the reader edited them; nothing did it for a
 * roster that arrived whole. After a game import, an operator planned beforehand from E0 L1
 * still showed "Current Level Lv. 1", and priced the plan from there, until a nudge of its
 * level slider wrote the roster's value back (2026-10-01). So the import, the file import
 * and the page's load all go through syncPlansToRoster now, and recordOwned through liftToOwned.
 */
import type { BuilderState } from './builderStates';
import { maxEliteForRarity, maxLevelForElite, maxSkillRankForElite, moduleUnlock } from './plannerLogic';
import type { Owned, Roster } from './roster';

/** The game's own rules for an operator of this rarity: what readRoster cannot check, as it
 *  has no rarity to go on. */
export function clampOwned(next: Owned, rarity: number): Owned {
  const elite = Math.min(Math.max(0, next.elite), maxEliteForRarity(rarity));
  const level = Math.min(Math.max(1, next.level), maxLevelForElite(rarity, elite));
  const skillLevel = Math.min(Math.max(1, next.skillLevel), maxSkillRankForElite(elite));
  const unlock = moduleUnlock(rarity);
  const masteries = elite === 2 && skillLevel === 7 ? next.masteries : {};
  const modules = unlock && elite >= unlock.elite && level >= unlock.level ? (next.modules ?? {}) : {};
  return { elite, level, skillLevel, masteries, ...(Object.keys(modules).length ? { modules } : {}) };
}

/** A plan entry starting where `owned` is, its targets carried up to it where they fell
 *  below. `owned` is taken as already clamped (clampOwned). */
export function liftToOwned(b: BuilderState, owned: Owned, rarity: number): BuilderState {
  const { elite, level, skillLevel, masteries } = owned;
  const modules = owned.modules ?? {};
  let nextElite = b.elite;
  let nextLevel = b.level;
  if (elite > nextElite) {
    nextElite = elite;
    nextLevel = Math.min(level, maxLevelForElite(rarity, nextElite));
  } else if (elite === nextElite && level > nextLevel) {
    nextLevel = Math.min(level, maxLevelForElite(rarity, nextElite));
  }
  const nextSkillLevel = Math.min(Math.max(b.skillLevel, skillLevel), maxSkillRankForElite(nextElite));
  const nextMasteryTargets = { ...b.masteryTargets };
  for (const [idxStr, m] of Object.entries(masteries)) {
    const idx = Number(idxStr);
    if (m > 0 && (!nextMasteryTargets[idx] || nextMasteryTargets[idx] < m)) nextMasteryTargets[idx] = m as 1 | 2 | 3;
  }
  const nextModuleTargets = { ...b.moduleStageTargets };
  for (const [idxStr, stage] of Object.entries(modules)) {
    const idx = Number(idxStr);
    if (nextModuleTargets[idx] === undefined || nextModuleTargets[idx] < stage) nextModuleTargets[idx] = stage;
  }
  return {
    ...b,
    startingElite: elite,
    startingLevel: level,
    startingSkillLevel: skillLevel,
    startingMasteryLevels: masteries,
    startingModuleStages: modules,
    elite: nextElite,
    level: nextLevel,
    skillLevel: nextSkillLevel,
    masteryTargets: nextElite === 2 && nextSkillLevel === 7 ? nextMasteryTargets : {},
    moduleStageTargets: nextModuleTargets,
  };
}

const sameStart = (b: BuilderState, owned: Owned) => b.startingElite === owned.elite && b.startingLevel === owned.level
  && b.startingSkillLevel === owned.skillLevel
  && JSON.stringify(b.startingMasteryLevels ?? {}) === JSON.stringify(owned.masteries ?? {})
  && JSON.stringify(b.startingModuleStages ?? {}) === JSON.stringify(owned.modules ?? {});

/** Every plan entry the roster records, starting where the roster says. The same object
 *  back when nothing differs, so a state setter given it renders nothing new. An operator
 *  the roster does not record keeps the start its plan states. */
export function syncPlansToRoster(states: Record<string, BuilderState>, roster: Roster, rarityOf: (name: string) => number | null): Record<string, BuilderState> {
  let next: Record<string, BuilderState> | null = null;
  for (const [name, b] of Object.entries(states)) {
    const recorded = roster[name];
    const rarity = rarityOf(name);
    if (!recorded || rarity == null) continue;
    const owned = clampOwned(recorded, rarity);
    if (sameStart(b, owned)) continue;
    next ??= { ...states };
    next[name] = liftToOwned(b, owned, rarity);
  }
  return next ?? states;
}
