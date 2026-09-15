/**
 * The rules for anything that arrives as text.
 *
 * A paste, an opened file and localStorage are the same door: bytes the
 * reader did not necessarily write, going into objects the page then walks.
 * Nothing here can run code -- every string ends up as a React text node, the
 * page has no HTML sink and the site sets no cookies -- so the threat is not
 * injection but EXHAUSTION and CONFUSION: a count of 1e300, a mastery target
 * of a billion that `goalsFor` would dutifully count up to, a key named
 * `__proto__` that re-parents the object it lands in, a hundred thousand
 * operator names each fetching its own JSON. And because the planner saves what
 * it loads, a file that hangs the page hangs it on every visit after, until the
 * reader clears site data. That is the failure these limits exist to prevent.
 *
 * Shared by the parsers (lib/planner/*.ts), the builder-state gate
 * (lib/planner/builderStates.ts) and the page, so one number is the limit.
 */

/** A full bundle for a maxed account is well under 200 KB; Krooster's CSV is
 *  about 6 KB. Four megabytes is not a planner file. Checked before JSON.parse,
 *  which would otherwise spend the time on it anyway. */
export const MAX_IMPORT_BYTES = 4 * 1024 * 1024;

/** Larger than anything the game lets you hold, and small enough that summing
 *  ninety-three of them stays inside Number's exact-integer range. A count past
 *  it is not a count, and fails the file like any other malformed one. */
export const MAX_COUNT = 99_999_999_999;

/** Keys that, assigned on a plain object, do something other than store a
 *  value: `out['__proto__'] = obj` re-parents `out`. None of them is a material
 *  or an operator, so a file carrying one is either confused or hostile, and
 *  either way the key is dropped. */
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
export function isSafeKey(key: string): boolean {
  return !UNSAFE_KEYS.has(key);
}

/** A lookup that only sees the map's OWN entries. `map['constructor']` on a
 *  plain object is `Object`, which is truthy, which is how an itemId of
 *  "constructor" came out as a material named "function Object() {...}". */
export function ownString(map: Record<string, string>, key: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;
}

/** A finite integer inside [min, max], or null. Floors rather than rounds, and
 *  refuses rather than clamps: a value outside the range is a malformed one,
 *  not an enthusiastic one. Accepts numeric strings, because CSV. */
export function boundedInt(raw: unknown, min: number, max: number): number | null {
  if (typeof raw !== 'number' && typeof raw !== 'string') return null;
  if (typeof raw === 'string' && raw.trim() === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const i = Math.floor(n);
  if (i < min || i > max) return null;
  return i;
}

/** A label from a file, short enough to put in a sentence. */
export function shortLabel(s: string, max = 40): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
