import type { AccountRecord } from '../account/accountStore';
import { mergeRewardClaims } from '../account/rewardClaims';
import type { PastProgress } from './pastProgress';

const unique = (values: Iterable<string>) => [...new Set(values)].sort();

/** A new import is the account's word wherever it can judge a row: a manual tick on something
 *  the save shows as not done goes (owner, 2026-10-21: "it should uncheck it if it's actually
 *  still not completed"), and what it shows done is ticked. A manual tick it cannot judge (the
 *  welcome mail, an announcement's gift, an item whose stages it does not know) stays. Ticks
 *  made after an import hold until the next one. */
export function mergeImportedProgress(progress: PastProgress, account: AccountRecord,
  completed: { doneKeys: ReadonlySet<string>; doneEvents: ReadonlySet<string>; knownKeys?: ReadonlySet<string>; knownEvents?: ReadonlySet<string> }): PastProgress {
  const previousKeys = new Set(progress.importedDoneKeys);
  const previousEvents = new Set(progress.importedDoneEvents);
  const claimsKnown = new Set(account.rewardClaims?.known);
  const claimed = new Set(account.rewardClaims?.claimed);
  // Stage items only when the save carried its stages: an import without them (an older
  // record, a field the server left out) knows nothing of what is cleared.
  const stages = !!(account.rewardCleared?.length || account.cleared?.length);
  const judged = (key: string) => key.startsWith('free:') ? claimsKnown.has(key) && !claimed.has(key) : stages && !!completed.knownKeys?.has(key) && !completed.doneKeys.has(key);
  const manualKeys = new Set(progress.doneKeys.filter(key => !previousKeys.has(key) && !judged(key)));
  const manualEvents = new Set(progress.doneEvents.filter(key => !previousEvents.has(key) && !(stages && completed.knownEvents?.has(key) && !completed.doneEvents.has(key))));
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
