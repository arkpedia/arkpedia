/**
 * Which materials the reader has said they will BUY rather than farm.
 *
 * The crafting declaration's twin (lib/planner/crafting.ts): "I would rather pay for this at
 * the store than go and get it", which restates the plan in terms of the currency it costs.
 * Today that is the Chip Catalyst, for Purchase Certificates (lib/planner/store.ts); a
 * material the store does not sell for a known price is ignored by the resolver, so a name
 * left here by an older store is harmless.
 *
 * A set of names in its own localStorage key, a preference about how they play rather than a
 * record of what they hold.
 */

export const BUYING_STORAGE_KEY = 'plannerBuying';
/** The native `storage` event does not fire in the tab that wrote; same as the others. */
export const BUYING_EVENT = 'plannerBuyingChanged';

export function readBuying(): Set<string> {
  try {
    const raw = window.localStorage?.getItem(BUYING_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((n): n is string => typeof n === 'string'));
  } catch {
    return new Set();
  }
}

export function writeBuying(names: ReadonlySet<string>): void {
  try {
    window.localStorage?.setItem(BUYING_STORAGE_KEY, JSON.stringify([...names].sort()));
    window.dispatchEvent(new Event(BUYING_EVENT));
  } catch {
    /* Private mode. Not persisted this session, which is no worse than before. */
  }
}
