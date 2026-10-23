// Planner-goal import and its same-tab change event. Existing storage shape is preserved.

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

function writePlannerState(state: StoredPlannerState) {
  try {
    localStorage.setItem(PLANNER_STORAGE_KEY, JSON.stringify(state));
    window.dispatchEvent(new Event(PLANNER_STATE_EVENT));
  } catch {
    // Not persisted this session -- not worth failing over.
  }
}

/**
 * A planner file's goals, written from another page (the Import / export dialog off /operator-planner).
 * Stored as they came: /operator-planner clamps every goal to its operator's rules when it reads them
 * (clampBuilderStates), the same gate a hand-edited localStorage goes through.
 */
export function replacePlannerGoals(selectedNames: string[], builderStates: Record<string, unknown>): void {
  writePlannerState({ selectedNames, builderStates: builderStates as Record<string, StoredBuilderState> });
}
