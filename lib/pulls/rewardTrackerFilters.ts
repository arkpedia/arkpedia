/**
 * The Reward Tracker's stage toggles: the kinds of hard stage (lib/pulls/stageKinds.ts) the
 * reader has left out of what is still to claim. Every one off unless the reader turns it on.
 * Kept in this browser (localStorage), and in the backup (lib/account/backup.ts), as the
 * claimed rewards are (lib/pulls/pastProgress.ts).
 */
import { useCallback, useSyncExternalStore } from 'react';
import { STAGE_KINDS, type StageKind } from './stageKinds';

export const REWARD_FILTERS_KEY = 'arkpedia.reward-tracker-filters.v1';
export const REWARD_FILTERS_EVENT = 'arkpediaRewardFiltersChanged';

export interface RewardFilters { exclude: StageKind[] }

/** A stored record, or null for anything that is not one. Unknown kinds are dropped. */
export function parseRewardFilters(raw: string | null): RewardFilters | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { exclude?: unknown };
    if (!value || typeof value !== 'object' || !Array.isArray(value.exclude) || value.exclude.length > 20) return null;
    return { exclude: STAGE_KINDS.filter((kind) => (value.exclude as unknown[]).includes(kind)) };
  } catch {
    return null;
  }
}

const NONE: ReadonlySet<StageKind> = new Set();
let cachedRaw: string | null | undefined;
let cached: ReadonlySet<StageKind> = NONE;
function snapshot(): ReadonlySet<StageKind> {
  let raw: string | null = null;
  try {
    raw = window.localStorage?.getItem(REWARD_FILTERS_KEY) ?? null;
  } catch {
    raw = null;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cached = new Set(parseRewardFilters(raw)?.exclude ?? []);
  }
  return cached;
}
function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener(REWARD_FILTERS_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(REWARD_FILTERS_EVENT, onChange);
  };
}

/** The kinds left out and their setter; nothing left out on the server and in the first paint. */
export function useRewardFilters(): [ReadonlySet<StageKind>, (kind: StageKind, excluded: boolean) => void] {
  const excluded = useSyncExternalStore(subscribe, snapshot, () => NONE);
  const set = useCallback((kind: StageKind, on: boolean) => {
    const next = new Set(snapshot());
    if (on) next.add(kind); else next.delete(kind);
    try {
      window.localStorage?.setItem(REWARD_FILTERS_KEY, JSON.stringify({ exclude: STAGE_KINDS.filter((k) => next.has(k)) }));
    } catch {
      /* Private mode: not kept. */
    }
    window.dispatchEvent(new Event(REWARD_FILTERS_EVENT));
  }, []);
  return [excluded, set];
}
