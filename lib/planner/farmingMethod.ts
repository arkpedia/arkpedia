import type { Incoming, Tranche } from './craft';

/**
 * How the reader means to farm: which events they will play up to a date, and whether they
 * spend the event currency on materials in the shops.
 *
 * "Still needed" is what the plan costs minus the depot. This adds the third term, what the
 * game will hand out before the reader needs it: set a date (an upcoming banner, or any day)
 * and the free materials of every event that is open or opens by then count as already coming.
 * Their shops too, if the reader says so. A reader who does not turn it on sees what they
 * always saw.
 *
 * An assumption, said as one on the page: the events are played to the end, and the shops'
 * currency is there to spend. The table is data/farming-events.json
 * (scripts/build/build-farming-events.ts), read from the release like the planner's other tables.
 *
 * Held in its own localStorage key, a preference rather than a record of what is held, beside
 * the crafting and buying declarations.
 */

export const FARMING_METHOD_KEY = 'plannerFarmingMethod';
/** The native `storage` event does not fire in the tab that wrote; same as the others. */
export const FARMING_METHOD_EVENT = 'plannerFarmingMethodChanged';

export interface FarmingEvent {
  name: string;
  start: string;
  end: string;
  estimated: boolean;
  free: Record<string, number>;
  shop: { limited: Record<string, number>; unlimited: string[] };
}

export interface FarmingEventsTable {
  banners: { name: string; end: string }[];
  events: FarmingEvent[];
}

/** Where the count stops: nowhere (the feature is off), a banner's last day, or a chosen day. */
export type FarmingUntil =
  | { mode: 'off' }
  | { mode: 'banner'; banner: string }
  | { mode: 'date'; date: string };

/** data/permanent-rewards.json (scripts/build/build-permanent-rewards.mjs). */
export interface PermanentRewardsTable {
  modes: { id: string; label: string; kind: string; topic: string; global: boolean; rewards: { id: string; cn?: true; materials: Record<string, number> }[] }[];
}

export interface FarmingMethod {
  until: FarmingUntil;
  /** Permanent modes whose unclaimed rewards count (ids in the permanent-rewards table: 'is-2', 'sss'). */
  permanent: string[];
  /** Buy the event stores' limited-stock materials. */
  shop: boolean;
  /** Buy the materials a store sells without a limit, as far as the plan needs them. */
  unlimitedShop: boolean;
}

export const NO_FARMING_METHOD: FarmingMethod = { until: { mode: 'off' }, permanent: [], shop: false, unlimitedShop: false };

/** One day of the week-day-agnostic date picker, YYYY-MM-DD. */
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const validDay = (value: unknown): value is string => typeof value === 'string' && DAY.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

/** Stored values are untrusted: anything not understood is the feature off, never a throw. */
export function parseFarmingMethod(value: unknown): FarmingMethod {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return NO_FARMING_METHOD;
  const v = value as Record<string, unknown>;
  const until = v.until && typeof v.until === 'object' ? v.until as Record<string, unknown> : {};
  const parsed: FarmingUntil = until.mode === 'date' && validDay(until.date) ? { mode: 'date', date: until.date }
    : until.mode === 'banner' && typeof until.banner === 'string' && until.banner.length > 0 && until.banner.length <= 200 ? { mode: 'banner', banner: until.banner }
      : { mode: 'off' };
  const permanent = Array.isArray(v.permanent) ? [...new Set(v.permanent.filter((id): id is string => typeof id === 'string' && /^[a-z]{2,4}(-\d{1,2})?$/.test(id)))].slice(0, 40) : [];
  return { until: parsed, permanent, shop: v.shop === true, unlimitedShop: v.unlimitedShop === true };
}

export function readFarmingMethod(): FarmingMethod {
  try {
    const raw = window.localStorage?.getItem(FARMING_METHOD_KEY);
    return raw ? parseFarmingMethod(JSON.parse(raw)) : NO_FARMING_METHOD;
  } catch {
    return NO_FARMING_METHOD;
  }
}

export function writeFarmingMethod(method: FarmingMethod): void {
  try {
    window.localStorage?.setItem(FARMING_METHOD_KEY, JSON.stringify(method));
    window.dispatchEvent(new Event(FARMING_METHOD_EVENT));
  } catch {
    /* Private mode. Not persisted this session, which is no worse than before. */
  }
}

const DAY_MS = 86_400_000;
/** The instant a calendar day ends (UTC; every date here is a Global calendar date). */
const dayEnd = (day: string) => Date.parse(`${day}T00:00:00Z`) + DAY_MS;

/** When the count stops, as an instant, or null while it is off or its banner has left the table. */
export function farmingUntil(method: FarmingMethod, table: FarmingEventsTable): number | null {
  if (method.until.mode === 'date') return dayEnd(method.until.date);
  if (method.until.mode === 'banner') {
    const { banner } = method.until;
    const found = table.banners.find((b) => b.name === banner);
    return found ? dayEnd(found.end) : null;
  }
  return null;
}

export interface FarmingIncoming {
  incoming: Incoming;
  /** The events counted, soonest first, with what each adds. */
  events: { name: string; start: string; end: string; estimated: boolean; materials: number }[];
  /** The permanent modes counted, with the unclaimed rewards and materials each adds. */
  permanent: { id: string; label: string; rewards: number; materials: number; cn: number }[];
  /** The instant the event count stops; null while only permanent rewards are counted. */
  until: number | null;
}

/** What the reader's account says is claimed, with the table it is claimed against. */
export interface PermanentSource { table: PermanentRewardsTable; claimed: ReadonlySet<string> }

/**
 * What is coming up to the chosen date: every event that has not ended and starts by it. A
 * material is counted once per event, and the same material in two events adds up. Null while
 * the feature is off or its end cannot be told.
 */
export function incomingFor(method: FarmingMethod, table: FarmingEventsTable, now: number, permanent: PermanentSource): FarmingIncoming | null {
  const until = farmingUntil(method, table);
  if (until === null && !method.permanent.length) return null;
  const arrivals: Record<string, Tranche[]> = {};
  const give = (name: string, count: number, date: string) => { (arrivals[name] ??= []).push({ date, count }); };
  const unlimited = new Map<string, string | null>();
  const counted: FarmingIncoming['events'] = [];
  for (const event of table.events) {
    if (until === null || dayEnd(event.end) <= now || Date.parse(`${event.start}T00:00:00Z`) >= until) continue;
    let materials = 0;
    /* Dated by the day the event ends: its milestones and missions are done by then and its store has had
       the whole run to spend currency in. The same material from two events is two tranches. */
    for (const [name, count] of Object.entries(event.free)) { give(name, count, event.end); materials += count; }
    if (method.shop) for (const [name, count] of Object.entries(event.shop.limited)) { give(name, count, event.end); materials += count; }
    if (method.unlimitedShop) for (const name of event.shop.unlimited) { const had = unlimited.get(name); if (had === undefined || (had !== null && event.end < had)) unlimited.set(name, event.end); }
    counted.push({ name: event.name, start: event.start, end: event.end, estimated: event.estimated, materials });
  }
  counted.sort((a, b) => a.start.localeCompare(b.start) || a.name.localeCompare(b.name));

  /* The permanent modes the reader turned on: every reward of the mode the save does not say is claimed,
     available now (no date). A mode's own claim ids are `${mode}:${reward}`. */
  const modes: FarmingIncoming['permanent'] = [];
  for (const mode of permanent.table.modes) {
    if (!method.permanent.includes(mode.id)) continue;
    let rewards = 0, materials = 0, cn = 0;
    for (const reward of mode.rewards) {
      if (permanent.claimed.has(`${mode.id}:${reward.id}`)) continue;
      rewards += 1;
      if (reward.cn) cn += 1;
      for (const [name, count] of Object.entries(reward.materials)) { (arrivals[name] ??= []).push({ date: null, count }); materials += count; }
    }
    modes.push({ id: mode.id, label: mode.label, rewards, materials, cn });
  }
  return { incoming: { arrivals, unlimited }, events: counted, permanent: modes, until };
}
