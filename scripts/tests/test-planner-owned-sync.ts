import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clampOwned, liftToOwned, syncPlansToRoster } from '../../lib/planner/ownedSync';
import type { BuilderState } from '../../lib/planner/builderStates';

const planned = (over: Partial<BuilderState> = {}): BuilderState => ({
  elite: 2, level: 90, skillLevel: 7, masteryTargets: {}, moduleStageTargets: {},
  startingElite: 0, startingLevel: 1, startingSkillLevel: 1, startingMasteryLevels: {}, startingModuleStages: {}, ...over,
});

test('a plan made before the roster changed starts where the roster now says', () => {
  // The bug of 2026-10-01: planned from E0 L1, then a game import recorded E2 L60.
  const states = { Surtr: planned(), Ifrit: planned() };
  const synced = syncPlansToRoster(states, { Surtr: { elite: 2, level: 60, skillLevel: 7, masteries: { 2: 3 } } }, () => 6);
  assert.deepEqual([synced.Surtr.startingElite, synced.Surtr.startingLevel, synced.Surtr.startingSkillLevel, synced.Surtr.startingMasteryLevels], [2, 60, 7, { 2: 3 }]);
  // The goal is kept, and a mastery already owned becomes at least the target.
  assert.deepEqual([synced.Surtr.elite, synced.Surtr.level, synced.Surtr.masteryTargets], [2, 90, { 2: 3 }]);
  // Not in the roster: its plan's own start stands.
  assert.equal(synced.Ifrit, states.Ifrit);
  // Already in step: the same object back, so nothing re-renders.
  assert.equal(syncPlansToRoster(synced, { Surtr: { elite: 2, level: 60, skillLevel: 7, masteries: { 2: 3 } } }, () => 6), synced);
});

test('a target below the new start is carried up to it, within the game\'s rules', () => {
  const lifted = liftToOwned(planned({ elite: 1, level: 50, skillLevel: 4 }), clampOwned({ elite: 2, level: 30, skillLevel: 7, masteries: {} }, 6), 6);
  assert.deepEqual([lifted.elite, lifted.level, lifted.skillLevel], [2, 30, 7]);
  // A 3-star cannot be E2; its roster entry is clamped to what it can be.
  assert.deepEqual(clampOwned({ elite: 2, level: 80, skillLevel: 7, masteries: { 0: 3 } }, 3), { elite: 1, level: 55, skillLevel: 7, masteries: {} });
});
