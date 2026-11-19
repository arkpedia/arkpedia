/**
 * Where the reader's tier list is kept: one localStorage key, read and written only here,
 * so a later account upload has one source (CLAUDE.md, "Arkpedia accounts").
 *
 * Not yet in the backup or cloud-save lists (lib/account/backup.ts BACKUP_STORES): joining
 * them is a change to what the account uploads, to be made with the account work.
 */
import { useCallback, useSyncExternalStore } from 'react';
import { defaultTierList, parseTierList, type TierListState } from './state';

export const TIER_LIST_KEY = 'arkpedia:tier-list:v1';
export const TIER_LIST_EVENT = 'arkpediaTierListChanged';

const DEFAULT = defaultTierList();

// useSyncExternalStore wants the same object back while nothing changed. `memory` holds the
// list for this visit when storage refuses the write (private mode, a full quota).
let cachedRaw: string | null | undefined;
let cached: TierListState = DEFAULT;
let memory: string | null = null;

function snapshot(): TierListState {
  let raw: string | null = memory;
  try { raw = window.localStorage?.getItem(TIER_LIST_KEY) ?? memory; } catch { /* storage unavailable */ }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cached = parseTierList(raw) ?? DEFAULT;
  }
  return cached;
}

export function writeTierList(state: TierListState): void {
  const raw = JSON.stringify(state);
  memory = raw;
  try { window.localStorage?.setItem(TIER_LIST_KEY, raw); memory = null; } catch { /* kept in memory for this visit */ }
  window.dispatchEvent(new Event(TIER_LIST_EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener(TIER_LIST_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(TIER_LIST_EVENT, onChange);
  };
}

/** The saved tier list and a reducer-style setter. The default list on the server and in
 *  the first paint, so the markup matches; the saved one arrives right after. */
export function useTierList(): [TierListState, (change: (state: TierListState) => TierListState) => void] {
  const state = useSyncExternalStore(subscribe, snapshot, () => DEFAULT);
  const update = useCallback((change: (state: TierListState) => TierListState) => {
    const current = snapshot();
    const next = change(current);
    if (next !== current) writeTierList(next);
  }, []);
  return [state, update];
}
