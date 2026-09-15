/**
 * Which materials you have said you will craft rather than farm.
 *
 * A declaration, not a calculation. The resolver already works out what it can make
 * out of the depot on its own; this is the other half of the question -- "I cannot make
 * it yet, and I would rather make it than go and farm it, so restate the plan in terms
 * of what it is made of". Krooster calls it the crafting toggle and it is the piece of
 * that planner this one was missing.
 *
 * A set of names, in its own localStorage key beside the depot and the roster. It is a
 * preference about how you intend to play rather than a record of what you have, which
 * is why it does not live in either of those.
 */

export const CRAFTING_STORAGE_KEY = 'plannerCrafting';
/** The native `storage` event does not fire in the tab that wrote; same as the others. */
export const CRAFTING_EVENT = 'plannerCraftingChanged';

export function readCrafting(): Set<string> {
  try {
    const raw = window.localStorage?.getItem(CRAFTING_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((n): n is string => typeof n === 'string'));
  } catch {
    return new Set();
  }
}

export function writeCrafting(names: ReadonlySet<string>): void {
  try {
    window.localStorage?.setItem(CRAFTING_STORAGE_KEY, JSON.stringify([...names].sort()));
    window.dispatchEvent(new Event(CRAFTING_EVENT));
  } catch {
    /* Private mode. Not persisted this session, which is no worse than before. */
  }
}
