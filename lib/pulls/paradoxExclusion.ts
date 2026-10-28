/**
 * The Reward Tracker's Paradox Simulation exclusion: which of the back catalogue's Paradox
 * Simulations (BacklogSources.paradox, 200 Orundum each) the reader leaves out of what is still to
 * claim. Off unless the reader turns it on (lib/pulls/rewardTrackerFilters.ts keeps the choice):
 *
 *   all       every Paradox Simulation.
 *   unowned   the ones whose operator the account does not have.
 *   below-e2  the ones whose operator the account does not have at Elite 2 (not owned counts as
 *             below). Literally Elite 2, as asked: the few that unlock earlier (12F's at E0 Lv.30)
 *             are left out too while their operator is below it.
 *
 * The two that read the roster need an import that kept one (AccountRecord.operatorBuilds, the
 * planner's roster, keyed by operator name): without it nothing can be judged, so nothing is left
 * out, and the page says so.
 */
import type { FirstClear } from './pulls';
import type { Roster } from '@/lib/planner/roster';

export const PARADOX_EXCLUSIONS = ['all', 'unowned', 'below-e2'] as const;
export type ParadoxExclusion = typeof PARADOX_EXCLUSIONS[number];

/** The operator a Paradox Simulation belongs to, as the roster files it: by name ("Aak · …"), else id. */
const ownedBuild = (stage: FirstClear, roster: Roster) => roster[stage.name.split(' · ')[0].trim()] ?? (stage.operatorId ? roster[stage.operatorId] : undefined);

/** Whether `mode` can be answered at all: the roster modes need an imported roster. */
export const paradoxExclusionKnown = (mode: ParadoxExclusion | null, roster: Roster | undefined) => mode === null || mode === 'all' || !!roster;

/** The ids (`paradox:…`) of the Paradox Simulations `mode` leaves out. */
export function excludedParadox(stages: readonly FirstClear[] | undefined, mode: ParadoxExclusion | null, roster: Roster | undefined): Set<string> {
  if (!stages || mode === null || !paradoxExclusionKnown(mode, roster)) return new Set();
  return new Set(stages.filter((stage) => {
    if (mode === 'all') return true;
    const build = ownedBuild(stage, roster!);
    return mode === 'unowned' ? !build : !build || build.elite < 2;
  }).map((stage) => stage.id));
}
