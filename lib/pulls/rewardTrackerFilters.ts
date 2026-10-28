/**
 * The Reward Tracker's stage toggles: the kinds of hard stage (lib/pulls/stageKinds.ts) the
 * reader has left out of what is still to claim, and which Paradox Simulations
 * (lib/pulls/paradoxExclusion.ts). Every one off unless the reader turns it on.
 * Kept in this browser (localStorage), and in the backup (lib/account/backup.ts), as the
 * claimed rewards are (lib/pulls/pastProgress.ts).
 */
import { useCallback, useSyncExternalStore } from 'react';
import { STAGE_KINDS, type StageKind } from './stageKinds';
import { PARADOX_EXCLUSIONS, type ParadoxExclusion } from './paradoxExclusion';

export const REWARD_FILTERS_KEY = 'arkpedia.reward-tracker-filters.v1';
export const REWARD_FILTERS_EVENT = 'arkpediaRewardFiltersChanged';

/** `paradox`: absent when every Paradox Simulation counts. */
export interface RewardFilters { exclude: StageKind[]; paradox?: ParadoxExclusion }

/** A stored record, or null for anything that is not one. Unknown kinds and modes are dropped. */
export function parseRewardFilters(raw: string | null): RewardFilters | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { exclude?: unknown; paradox?: unknown };
    if (!value || typeof value !== 'object' || !Array.isArray(value.exclude) || value.exclude.length > 20) return null;
    const paradox = PARADOX_EXCLUSIONS.find((mode) => mode === value.paradox);
    return { exclude: STAGE_KINDS.filter((kind) => (value.exclude as unknown[]).includes(kind)), ...(paradox ? { paradox } : {}) };
  } catch {
    return null;
  }
}

interface Filters { kinds: ReadonlySet<StageKind>; paradox: ParadoxExclusion | null }
const NONE: Filters = { kinds: new Set(), paradox: null };
let cachedRaw: string | null | undefined;
let cached: Filters = NONE;
function snapshot(): Filters {
  let raw: string | null = null;
  try {
    raw = window.localStorage?.getItem(REWARD_FILTERS_KEY) ?? null;
  } catch {
    raw = null;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    const parsed = parseRewardFilters(raw);
    cached = { kinds: new Set(parsed?.exclude ?? []), paradox: parsed?.paradox ?? null };
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
function write(next: Filters) {
  const record: RewardFilters = { exclude: STAGE_KINDS.filter((k) => next.kinds.has(k)), ...(next.paradox ? { paradox: next.paradox } : {}) };
  try {
    window.localStorage?.setItem(REWARD_FILTERS_KEY, JSON.stringify(record));
  } catch {
    /* Private mode: not kept. */
  }
  window.dispatchEvent(new Event(REWARD_FILTERS_EVENT));
}

/** The kinds left out, which Paradox Simulations are, and their setters; nothing left out on the
 *  server and in the first paint. */
export function useRewardFilters(): [ReadonlySet<StageKind>, (kind: StageKind, excluded: boolean) => void, ParadoxExclusion | null, (mode: ParadoxExclusion | null) => void] {
  const filters = useSyncExternalStore(subscribe, snapshot, () => NONE);
  const setKind = useCallback((kind: StageKind, on: boolean) => {
    const current = snapshot();
    const kinds = new Set(current.kinds);
    if (on) kinds.add(kind); else kinds.delete(kind);
    write({ ...current, kinds });
  }, []);
  const setParadox = useCallback((paradox: ParadoxExclusion | null) => write({ ...snapshot(), paradox }), []);
  return [filters.kinds, setKind, filters.paradox, setParadox];
}
