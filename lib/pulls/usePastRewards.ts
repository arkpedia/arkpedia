/**
 * The back catalogue as the reader has claimed it, for the Pull Planner's Past events popup and
 * the OP Tracker page alike: the shared ticks (lib/pulls/pastProgress.ts), ticked once per
 * account import from its cleared stages (backlogFromAccount), what each unticked item still
 * pays (unclaimedBacklog), and what all of it adds up to (remainingBacklog).
 *
 * `excluded` is the kinds of hard stage the reader leaves out (the Reward Tracker's toggles,
 * lib/pulls/rewardTrackerFilters.ts): taken out of what is counted, never out of what an import
 * ticks, so turning one on can never tick a chapter whose only stages left are excluded.
 * Required, so a page has to say whether it honours them (NO_STAGE_EXCLUSIONS when not).
 * `paradox` is which Paradox Simulations the reader leaves out (lib/pulls/paradoxExclusion.ts),
 * required too (null when none): taken out of what is counted, judged against the imported roster.
 */
import { useEffect, useMemo } from 'react';
import { mergeImportedProgress } from './importedProgress';
import { useAccount } from '@/lib/account/accountStore';
import { backlogFromAccount, remainingBacklog, unclaimedBacklog, type BacklogSources } from './pulls';
import { PAST_PROGRESS_UNREAD, usePastProgress, type PastProgress } from './pastProgress';
import { freeRewardsForAccount } from './freeRewards';
import { excludeStageKinds, type StageKind } from './stageKinds';
import { excludedParadox, paradoxExclusionKnown, type ParadoxExclusion } from './paradoxExclusion';

export function usePastRewards(backlogSources: BacklogSources, excluded: ReadonlySet<StageKind>, paradox: ParadoxExclusion | null) {
  const account = useAccount();
  const [progress, setProgress] = usePastProgress();
  const backlog = useMemo(() => ({ ...backlogSources, freeRewards: freeRewardsForAccount([
    ...(backlogSources.freeRewards ?? []), ...(backlogSources.beginnerRewards ?? []),
  ], account) }), [backlogSources, account]);
  const fromAccount = useMemo(
    () => (account ? backlogFromAccount(backlog, new Set(account.rewardCleared ?? account.cleared), account.annihilation ? new Set(account.annihilation) : null) : null),
    [account, backlog],
  );
  /* A new import adds verified claims once. Manual marks and unknown claims survive. */
  useEffect(() => {
    if (progress === PAST_PROGRESS_UNREAD || !account || !fromAccount || progress.ticksFrom === account.importedAt && progress.importedDoneKeys !== undefined) return;
    setProgress(mergeImportedProgress(progress, account, fromAccount));
  }, [progress, account, fromAccount, setProgress]);
  const doneKeys = useMemo(() => new Set(progress.doneKeys), [progress.doneKeys]);
  const doneEvents = useMemo(() => new Set(progress.doneEvents), [progress.doneEvents]);
  const cleared = useMemo(() => (account ? new Set(account.rewardCleared ?? account.cleared) : null), [account]);
  const { backlog: staged, dropped } = useMemo(
    () => excludeStageKinds(fromAccount ? unclaimedBacklog(backlog, fromAccount.sources) : backlog, excluded, cleared),
    [fromAccount, backlog, excluded, cleared],
  );
  const paradoxOut = useMemo(() => excludedParadox(staged.paradox, paradox, account?.operatorBuilds), [staged.paradox, paradox, account]);
  const counting = useMemo(() => (paradoxOut.size ? { ...staged, paradox: staged.paradox?.filter((stage) => !paradoxOut.has(stage.id)) } : staged), [staged, paradoxOut]);
  const remaining = useMemo(() => remainingBacklog(counting, doneEvents, doneKeys, progress.annihilationDone), [counting, doneEvents, doneKeys, progress.annihilationDone]);
  /* What the toggles took out of the total: the stages of every chapter and event not ticked. */
  const leftOut = useMemo(() => [...backlog.chapters.filter((chapter) => !doneKeys.has(chapter.id)), ...backlog.playable.filter((event) => !doneEvents.has(event.id))]
    .reduce((sum, item) => sum + (dropped[item.id] ?? 0), 0), [backlog, dropped, doneKeys, doneEvents]);
  /* What the Paradox choice took out: the simulations not already claimed, and their Orundum. */
  const paradoxLeftOut = useMemo(() => {
    const out = (staged.paradox ?? []).filter((stage) => paradoxOut.has(stage.id) && !doneKeys.has(stage.id));
    return { count: out.length, orundum: out.reduce((sum, stage) => sum + stage.amount, 0), known: paradoxExclusionKnown(paradox, account?.operatorBuilds) };
  }, [staged.paradox, paradoxOut, doneKeys, paradox, account]);
  const update = (patch: Partial<PastProgress>) => setProgress({ ...progress, ...patch });
  return {
    progress, setProgress, counting, remaining, cleared, backlog, dropped, leftOut, paradoxLeftOut,
    doneKeys, doneEvents, annihilationDone: progress.annihilationDone,
    onKeys: (keys: Set<string>) => update({ doneKeys: [...keys], ...(progress.importedDoneKeys ? {
      importedDoneKeys: progress.importedDoneKeys.filter(key => doneKeys.has(key) === keys.has(key)),
    } : {}) }),
    onEvents: (events: Set<string>) => update({ doneEvents: [...events], ...(progress.importedDoneEvents ? {
      importedDoneEvents: progress.importedDoneEvents.filter(key => doneEvents.has(key) === events.has(key)),
    } : {}) }),
    onAnnihilation: (done: boolean) => update({ annihilationDone: done }),
    imported: account && progress.ticksFrom === account.importedAt ? { at: account.importedAt } : null,
    account,
  };
}
