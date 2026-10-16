import type { AccountRecord } from '../account/accountStore';
import { mergeRewardClaims } from '../account/rewardClaims';
import type { PastProgress } from './pastProgress';

const unique = (values: Iterable<string>) => [...new Set(values)].sort();

/** Imported claims are evidence; manual marks remain the reader's decisions. */
export function mergeImportedProgress(progress: PastProgress, account: AccountRecord,
  completed: { doneKeys: ReadonlySet<string>; doneEvents: ReadonlySet<string> }): PastProgress {
  const previousKeys = new Set(progress.importedDoneKeys);
  const previousEvents = new Set(progress.importedDoneEvents);
  const manualKeys = new Set(progress.doneKeys.filter(key => !previousKeys.has(key)));
  const manualEvents = new Set(progress.doneEvents.filter(key => !previousEvents.has(key)));
  const identity = { server: account.server, uid: account.profile?.uid ?? null };
  const previous = progress.importedAccount;
  const same = !previous || previous.server === identity.server && (!previous.uid || !identity.uid || previous.uid === identity.uid);
  const carried = same ? progress.doneKeys.filter(key => previousKeys.has(key)) : [];
  const importedKeys = unique([...completed.doneKeys, ...carried.filter(key => !key.startsWith('free:')),
    ...mergeRewardClaims(carried.filter(key => key.startsWith('free:')), account.rewardClaims)]);
  const importedEvents = unique([...completed.doneEvents, ...(same ? progress.doneEvents.filter(key => previousEvents.has(key)) : [])]);
  return { ...progress,
    doneKeys: unique([...manualKeys, ...importedKeys]), doneEvents: unique([...manualEvents, ...importedEvents]),
    importedDoneKeys: importedKeys.filter(key => !manualKeys.has(key)),
    importedDoneEvents: importedEvents.filter(key => !manualEvents.has(key)),
    importedAccount: identity, ticksFrom: account.importedAt,
  };
}
