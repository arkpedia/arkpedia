/**
 * The outfits the reader means to buy: one list, shared by the skins gallery's wishlist star,
 * the Skin Planner and the Pull Planner's skin section, so a change in one shows in the others
 * (the maintainer's request, 2026-10-01). Each outfit by its key, "Operator / Outfit"
 * (skinKey), the id the Pull Planner always used.
 *
 * It replaces two lists that never met: the gallery's wishlist (skinWishlist_v1, outfit names)
 * and the Pull Planner's skinIds inside its saved plan. The first read with no list yet takes
 * both, once (legacySkinPlan); after that only this one is written, and the Pull Planner
 * keeps a copy in its plan so its file export still carries the outfits.
 */
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { PULL_PLAN_KEY } from '@/lib/pulls/plan';

export const SKIN_PLAN_KEY = 'arkpediaSkinPlan';
export const SKIN_PLAN_EVENT = 'arkpediaSkinPlanChanged';
const LEGACY_WISHLIST_KEY = 'skinWishlist_v1';

const strings = (value: unknown): string[] | null => (Array.isArray(value) && value.every((item) => typeof item === 'string' && item.length <= 300) ? [...new Set(value as string[])] : null);

export function parseSkinPlan(raw: string | null): string[] | null {
  if (!raw) return null;
  try {
    return strings(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * What the two old lists held, as keys: the Pull Planner's ids as they are, and the gallery's
 * outfit names through `keyOfName` (the page's catalogue), or as they are when it has none.
 */
export function legacySkinPlan(storage: Pick<Storage, 'getItem'>, keyOfName: (name: string) => string | undefined): string[] {
  const out = new Set<string>();
  try {
    const plan = JSON.parse(storage.getItem(PULL_PLAN_KEY) ?? 'null');
    for (const id of strings(plan?.skinIds) ?? []) out.add(id);
  } catch { /* none */ }
  try {
    for (const name of strings(JSON.parse(storage.getItem(LEGACY_WISHLIST_KEY) ?? 'null')) ?? []) {
      // A name the page's catalogue cannot place (the Pull Planner knows only the OP
      // outfits) is kept as it is, not lost; the Skins page reads either form.
      out.add(keyOfName(name) ?? name);
    }
  } catch { /* none */ }
  return [...out];
}

export function writeSkinPlan(ids: string[]): void {
  try {
    window.localStorage?.setItem(SKIN_PLAN_KEY, JSON.stringify([...new Set(ids)]));
    window.dispatchEvent(new Event(SKIN_PLAN_EVENT));
  } catch {
    /* Private mode: kept for this visit only, by the caller's state. */
  }
}

// useSyncExternalStore wants the same array back while nothing changed.
let cachedRaw: string | null | undefined;
let cached: string[] = [];
const EMPTY: string[] = [];
function snapshot(): string[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage?.getItem(SKIN_PLAN_KEY) ?? null;
  } catch {
    raw = null;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cached = parseSkinPlan(raw) ?? EMPTY;
  }
  return cached;
}
function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener(SKIN_PLAN_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(SKIN_PLAN_EVENT, onChange);
  };
}

/**
 * The plan and its setter. Empty on the server and in the first paint, so the markup
 * matches; the stored plan arrives right after. `keyOfName` turns the old wishlist's names
 * into keys on the first read (legacySkinPlan).
 */
export function useSkinPlan(keyOfName: (name: string) => string | undefined, ownedKeys?: ReadonlySet<string>): [string[], (ids: string[]) => void] {
  const ids = useSyncExternalStore(subscribe, () => {
    try {
      if (window.localStorage && window.localStorage.getItem(SKIN_PLAN_KEY) == null) {
        const legacy = legacySkinPlan(window.localStorage, keyOfName);
        window.localStorage.setItem(SKIN_PLAN_KEY, JSON.stringify(legacy));
      }
    } catch { /* private mode */ }
    return snapshot();
  }, () => EMPTY);
  useEffect(() => {
    if (!ownedKeys?.size) return;
    try {
      const latest = parseSkinPlan(window.localStorage.getItem(SKIN_PLAN_KEY)) ?? ids;
      const unowned = latest.filter(id => !ownedKeys.has(id));
      if (unowned.length !== latest.length) writeSkinPlan(unowned);
    } catch { /* Storage is unavailable. */ }
  }, [ids, ownedKeys]);
  const set = useCallback((next: string[]) => writeSkinPlan(next.filter(id => !ownedKeys?.has(id))), [ownedKeys]);
  const unowned = useMemo(() => ownedKeys?.size ? ids.filter(id => !ownedKeys.has(id)) : ids, [ids, ownedKeys]);
  return [unowned, set];
}
