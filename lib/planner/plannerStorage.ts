// lib/planner/plannerStorage.ts
//
// Shared localStorage helpers for the "added to planner" toggle, used
// by both the individual operator page (the circular button next to
// the branch icon) and /planner itself. Both read/write the exact
// same 'plannerState' key/shape planner.tsx already persists
// (selectedNames + builderStates), so adding an operator from their
// own page shows up on /planner immediately, and vice versa.

import { defaultTarget } from './plannerLogic';

const PLANNER_STORAGE_KEY = 'plannerState';

// Fired whenever this tab changes plannerState. The native 'storage'
// event only fires in OTHER tabs, so this covers same-tab listeners
// (e.g. staying on the same operator page while planner state changes
// some other way).
export const PLANNER_STATE_EVENT = 'plannerStateChanged';

interface StoredBuilderState {
  elite: number;
  level: number;
  skillLevel: number;
  masteryTargets: Record<number, 1 | 2 | 3>;
  moduleStageTargets: Record<number, number>;
  startingElite: number;
  startingLevel: number;
  startingSkillLevel: number;
  startingMasteryLevels: Record<number, 0 | 1 | 2 | 3>;
}

interface StoredPlannerState {
  selectedNames: string[];
  builderStates: Record<string, StoredBuilderState>;
}

function readPlannerState(): StoredPlannerState {
  try {
    const saved = localStorage.getItem(PLANNER_STORAGE_KEY);
    if (!saved) return { selectedNames: [], builderStates: {} };
    const parsed = JSON.parse(saved);
    return {
      selectedNames: Array.isArray(parsed.selectedNames) ? parsed.selectedNames : [],
      builderStates: parsed.builderStates && typeof parsed.builderStates === 'object' ? parsed.builderStates : {},
    };
  } catch {
    return { selectedNames: [], builderStates: {} };
  }
}

function writePlannerState(state: StoredPlannerState) {
  try {
    localStorage.setItem(PLANNER_STORAGE_KEY, JSON.stringify(state));
    window.dispatchEvent(new Event(PLANNER_STATE_EVENT));
  } catch {
    // Not persisted this session -- not worth failing over.
  }
}

export function isOperatorInPlanner(name: string): boolean {
  return readPlannerState().selectedNames.includes(name);
}

/** Adds or removes `name` from the persisted planner selection,
 * mirroring exactly what planner.tsx's own addOperator/removeOperator
 * do to selectedNames/builderStates -- so an operator added from their
 * own page opens on /planner with the same sensible default build
 * (max elite, 30 below cap, skill rank 7) instead of blank.
 * Returns the new "is added" state. */
export function togglePlannerOperator(name: string, rarity: number | null): boolean {
  const state = readPlannerState();
  const isAdded = state.selectedNames.includes(name);

  if (isAdded) {
    state.selectedNames = state.selectedNames.filter((n) => n !== name);
  } else {
    state.selectedNames = [...state.selectedNames, name];
    if (!state.builderStates[name]) {
      const target = defaultTarget(rarity || 1);
      state.builderStates[name] = {
        elite: target.elite,
        level: target.level,
        skillLevel: 7,
        masteryTargets: {},
        moduleStageTargets: {},
        startingElite: 0,
        startingLevel: 1,
        startingSkillLevel: 1,
        startingMasteryLevels: {},
      };
    }
  }

  writePlannerState(state);
  return !isAdded;
}