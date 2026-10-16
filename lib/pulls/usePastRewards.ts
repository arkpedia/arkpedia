/**
 * The back catalogue as the reader has claimed it, for the Pull Planner's Past events popup and
 * the OP Tracker page alike: the shared ticks (lib/pulls/pastProgress.ts), ticked once per
 * account import from its cleared stages (backlogFromAccount), what each unticked item still
 * pays (unclaimedBacklog), and what all of it adds up to (remainingBacklog).
 */
import { useEffect, useMemo } from 'react';
import { mergeImportedProgress } from './importedProgress';
import { useAccount } from '@/lib/account/accountStore';
import { backlogFromAccount, remainingBacklog, unclaimedBacklog, type BacklogSources } from './pulls';
import { PAST_PROGRESS_UNREAD, usePastProgress, type PastProgress } from './pastProgress';
import { freeRewardsForAccount } from './freeRewards';

export function usePastRewards(backlogSources: BacklogSources) {
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
  const counting = useMemo(() => (fromAccount ? unclaimedBacklog(backlog, fromAccount.sources) : backlog), [fromAccount, backlog]);
  const remaining = useMemo(() => remainingBacklog(counting, doneEvents, doneKeys, progress.annihilationDone), [counting, doneEvents, doneKeys, progress.annihilationDone]);
  const cleared = useMemo(() => (account ? new Set(account.rewardCleared ?? account.cleared) : null), [account]);
  const update = (patch: Partial<PastProgress>) => setProgress({ ...progress, ...patch });
  return {
    progress, setProgress, counting, remaining, cleared, backlog,
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
