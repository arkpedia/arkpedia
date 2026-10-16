/**
 * What of the back catalogue the reader has claimed: the Past events ticks, shared by the Pull
 * Planner's popup and the OP Tracker page, as the skin plan is shared by the Skin Planner
 * and the Skins page. Kept in this browser (localStorage), and in the backup
 * (lib/account/backup.ts).
 *
 *   doneKeys          chapter ids, resource stages and Annihilation maps claimed
 *                     ('daily' on an old save: every resource stage)
 *   doneEvents        event ids claimed
 *   annihilationDone  an old save's all-or-nothing Annihilation tick
 *   ticksFrom         the account import (its importedAt) the ticks were last set from: a
 *                     newer import ticks them again, and until then they are the reader's
 *
 * They used to live in the pull plan (lib/pulls/plan.ts), which still mirrors them for older
 * builds; the first read here takes them from it.
 */
import { useCallback, useSyncExternalStore } from 'react';
import { PULL_PLAN_KEY } from './plan';

export const PAST_PROGRESS_KEY = 'arkpedia.past-rewards.v1';
export const PAST_PROGRESS_EVENT = 'arkpediaPastRewardsChanged';

export interface PastProgress {
  doneKeys: string[];
  doneEvents: string[];
  annihilationDone: boolean;
  ticksFrom: string;
  /** Provenance lets imports replace their own marks without erasing manual progress. */
  importedDoneKeys?: string[];
  importedDoneEvents?: string[];
  importedAccount?: { server: string; uid: string | null };
}

const strings = (value: unknown) => Array.isArray(value) && value.length <= 5000 && value.every((item) => typeof item === 'string' && item.length <= 200);

/** A stored record, or null for anything that is not one. */
export function parsePastProgress(raw: string | null): PastProgress | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (!value || typeof value !== 'object' || !strings(value.doneKeys) || !strings(value.doneEvents)) return null;
    return {
      doneKeys: [...new Set(value.doneKeys as string[])],
      doneEvents: [...new Set(value.doneEvents as string[])],
      annihilationDone: value.annihilationDone === true,
      ticksFrom: typeof value.ticksFrom === 'string' && value.ticksFrom.length <= 40 ? value.ticksFrom : '',
      ...(strings(value.importedDoneKeys) ? { importedDoneKeys: [...new Set(value.importedDoneKeys as string[])] } : {}),
      ...(strings(value.importedDoneEvents) ? { importedDoneEvents: [...new Set(value.importedDoneEvents as string[])] } : {}),
      ...(() => {
        const account = value.importedAccount as { server?: unknown; uid?: unknown } | undefined;
        return account && typeof account.server === 'string' && /^[a-z]{2,8}$/.test(account.server)
          && (account.uid === null || typeof account.uid === 'string' && account.uid.length <= 200)
          ? { importedAccount: { server: account.server, uid: account.uid as string | null } } : {};
      })(),
    };
  } catch {
    return null;
  }
}

export function writePastProgress(progress: PastProgress): void {
  try {
    window.localStorage?.setItem(PAST_PROGRESS_KEY, JSON.stringify(progress));
    window.dispatchEvent(new Event(PAST_PROGRESS_EVENT));
  } catch {
    /* Private mode: not kept past this visit. */
  }
}

const NONE: PastProgress = { doneKeys: [], doneEvents: [], annihilationDone: false, ticksFrom: '' };
/** The server's (and the first paint's): distinct from NONE, so a caller can tell "not read yet". */
export const PAST_PROGRESS_UNREAD: PastProgress = { ...NONE };

let cachedRaw: string | null | undefined;
let cached: PastProgress = NONE;
function snapshot(): PastProgress {
  let raw: string | null = null;
  try {
    raw = window.localStorage?.getItem(PAST_PROGRESS_KEY) ?? null;
    // The first read: the ticks the pull plan held.
    if (raw == null) {
      const plan = parsePastProgress(window.localStorage?.getItem(PULL_PLAN_KEY) ?? null);
      if (plan) { raw = JSON.stringify(plan); window.localStorage.setItem(PAST_PROGRESS_KEY, raw); }
    }
  } catch {
    raw = null;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cached = parsePastProgress(raw) ?? NONE;
  }
  return cached;
}
function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener(PAST_PROGRESS_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(PAST_PROGRESS_EVENT, onChange);
  };
}

/** The ticks and their setter; PAST_PROGRESS_UNREAD on the server and in the first paint. */
export function usePastProgress(): [PastProgress, (next: PastProgress) => void] {
  const progress = useSyncExternalStore(subscribe, snapshot, () => PAST_PROGRESS_UNREAD);
  const set = useCallback((next: PastProgress) => writePastProgress(next), []);
  return [progress, set];
}
