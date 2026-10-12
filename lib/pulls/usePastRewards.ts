/**
 * The back catalogue as the reader has claimed it, for the Pull Planner's Past events popup and
 * the OP Tracker page alike: the shared ticks (lib/pulls/pastProgress.ts), ticked once per
 * account import from its cleared stages (backlogFromAccount), what each unticked item still
 * pays (unclaimedBacklog), and what all of it adds up to (remainingBacklog).
 */
import { useEffect, useMemo } from 'react';
import { useAccount } from '@/lib/account/accountStore';
import { backlogFromAccount, remainingBacklog, unclaimedBacklog, type BacklogSources } from './pulls';
import { PAST_PROGRESS_UNREAD, usePastProgress, type PastProgress } from './pastProgress';

export function usePastRewards(backlogSources: BacklogSources) {
  const account = useAccount();
  const [progress, setProgress] = usePastProgress();
  const fromAccount = useMemo(
    () => (account ? backlogFromAccount(backlogSources, new Set(account.cleared), account.annihilation ? new Set(account.annihilation) : null) : null),
    [account, backlogSources],
  );
  /* A new import ticks everything it has cleared, once; Annihilation on a record from before it
     was kept stays as the reader ticked it. After that the ticks are the reader's. */
  useEffect(() => {
    if (progress === PAST_PROGRESS_UNREAD || !account || !fromAccount || progress.ticksFrom === account.importedAt) return;
    const kept = !!account.annihilation;
    setProgress({
      doneKeys: [...new Set([...fromAccount.doneKeys, ...progress.doneKeys.filter(key => key.startsWith('free:') || key.startsWith('paradox:')), ...(kept ? [] : progress.doneKeys.filter((key) => key.startsWith('annihilation:')))])],
      doneEvents: [...fromAccount.doneEvents],
      annihilationDone: kept ? false : progress.annihilationDone,
      ticksFrom: account.importedAt,
    });
  }, [progress, account, fromAccount, setProgress]);
  const doneKeys = useMemo(() => new Set(progress.doneKeys), [progress.doneKeys]);
  const doneEvents = useMemo(() => new Set(progress.doneEvents), [progress.doneEvents]);
  const counting = useMemo(() => (fromAccount ? unclaimedBacklog(backlogSources, fromAccount.sources) : backlogSources), [fromAccount, backlogSources]);
  const remaining = useMemo(() => remainingBacklog(counting, doneEvents, doneKeys, progress.annihilationDone), [counting, doneEvents, doneKeys, progress.annihilationDone]);
  const cleared = useMemo(() => (account ? new Set(account.cleared) : null), [account]);
  const update = (patch: Partial<PastProgress>) => setProgress({ ...progress, ...patch });
  return {
    progress, setProgress, counting, remaining, cleared,
    doneKeys, doneEvents, annihilationDone: progress.annihilationDone,
    onKeys: (keys: Set<string>) => update({ doneKeys: [...keys] }),
    onEvents: (events: Set<string>) => update({ doneEvents: [...events] }),
    onAnnihilation: (done: boolean) => update({ annihilationDone: done }),
    imported: account && progress.ticksFrom === account.importedAt ? { at: account.importedAt } : null,
    account,
  };
}
