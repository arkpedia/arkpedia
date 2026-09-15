/**
 * What you already own.
 *
 * The planner has always answered "what does this build cost", which is never the
 * number you act on -- you act on what you still have to go and get. The depot is the
 * other half: a count per material, subtracted from the plan.
 *
 * localStorage, because this site is static and has no accounts. That is also why
 * export/import exists: a browser's storage is the only copy, and a reader who
 * clears it or moves machine has no other way to carry a depot across.
 *
 * Kept deliberately separate from `plannerState`, which holds the goals. They change
 * on completely different rhythms -- a goal a few times a run, a depot every time you
 * clear a stage -- and lib/plannerStorage.ts already reads and writes plannerState
 * from the operator pages. One key each means neither can corrupt the other, and
 * nothing existing needed a migration.
 */

import { MAX_COUNT, isSafeKey } from './untrusted';

export const DEPOT_STORAGE_KEY = 'plannerDepot';

/** Material name -> how many you have. Absent means zero; zeroes are not stored. */
export type Depot = Record<string, number>;

/** Same pattern as PLANNER_STATE_EVENT: the native `storage` event only fires in
 *  OTHER tabs, so a same-tab listener needs one of its own. */
export const DEPOT_EVENT = 'plannerDepotChanged';

/**
 * When the depot was last touched.
 *
 * Its own key, not a field inside the depot object: the depot is a
 * name -> count map that gets exported as-is, and a timestamp in there would
 * either ride along into somebody's export or get silently dropped by the
 * importer's number check. Kept because the summary says "edited 2 hours ago",
 * and a screen that claims a time has to have one -- the alternative was
 * making the phrase up.
 */
export const DEPOT_TOUCHED_KEY = 'plannerDepotTouched';

/** Epoch millis, or null if this browser has never written a depot. */
export function readDepotTouched(): number | null {
  try {
    const raw = window.localStorage?.getItem(DEPOT_TOUCHED_KEY);
    const n = Number(raw);
    return raw && Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function readDepot(): Depot {
  try {
    const raw = window.localStorage?.getItem(DEPOT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Depot = {};
    for (const [name, value] of Object.entries(parsed as Record<string, unknown>)) {
      /* Anything that is not a non-negative finite number is dropped rather than
         coerced. A NaN in here propagates silently through every subtraction and
         turns a whole shortfall column into blanks. */
      if (!isSafeKey(name)) continue;
      const n = Math.floor(Number(value));
      if (Number.isFinite(n) && n > 0 && n <= MAX_COUNT) out[name] = n;
    }
    return out;
  } catch {
    return {};
  }
}

export function writeDepot(depot: Depot): void {
  try {
    /* Zeroes are dropped on the way out, so the stored object stays the size of what
       you actually own rather than of the catalogue you scrolled past. */
    const trimmed: Depot = {};
    for (const [name, n] of Object.entries(depot)) if (n > 0) trimmed[name] = n;
    window.localStorage?.setItem(DEPOT_STORAGE_KEY, JSON.stringify(trimmed));
    window.localStorage?.setItem(DEPOT_TOUCHED_KEY, String(Date.now()));
    window.dispatchEvent(new Event(DEPOT_EVENT));
  } catch {
    /* Private mode. Not persisted this session, which is no worse than before. */
  }
}

/**
 * Reads an exported depot back.
 *
 * Returns null rather than throwing or half-applying: an import that silently kept
 * the six lines it could parse and dropped the rest would be worse than one that
 * refuses, because the reader would believe the whole file had landed.
 */
export function parseDepotExport(text: string): Depot | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const out: Depot = {};
  for (const [name, value] of Object.entries(parsed as Record<string, unknown>)) {
    /* A prototype key is not a material; it is dropped rather than failing the
       file, the way an unknown material would be. A count past MAX_COUNT is not
       a count, and fails it. */
    if (!isSafeKey(name)) continue;
    const n = Math.floor(Number(value));
    if (!Number.isFinite(n) || n < 0 || n > MAX_COUNT) return null;
    if (n > 0) out[name] = n;
  }
  return out;
}

export function formatDepotExport(depot: Depot): string {
  const sorted = Object.keys(depot).sort();
  return JSON.stringify(Object.fromEntries(sorted.map((k) => [k, depot[k]])), null, 2);
}
