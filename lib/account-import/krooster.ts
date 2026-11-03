import { isServerId, type ServerId } from '@/lib/account-import/yostar';
import type { AccountRecord } from '@/lib/account/accountStore';
import type { GameAccountMap } from '@/lib/planner/gameAccount';
import type { Owned, Roster } from '@/lib/planner/roster';
import { isSafeKey } from '@/lib/planner/untrusted';

/**
 * A Krooster profile (krooster.com/network/lookup/<user>) as a testing account. Krooster is where many
 * players keep their collection; a public profile page carries the whole roster in its embedded page data
 * (elite, level, potential, skill level, masteries and module stages by the game's character ids), so a
 * tester can hand the base optimizer an account without a game sign-in. Preview only (next.config.js
 * ARKPEDIA_KROOSTER_IMPORT): the page is fetched by the site's own route (the browser cannot read it across
 * origins) and only the roster and a few profile fields are passed on.
 */
export const KROOSTER_USER = /^[A-Za-z0-9_.-]{1,32}$/;
export const KROOSTER_LOOKUP = 'https://www.krooster.com/network/lookup/';

export interface KroosterOperator {
  elite: number; level: number; potential?: number; skillLevel?: number;
  /** Mastery per skill, 0 to 3. */
  masteries?: number[];
  /** Module stage by the game's uniequip id: 0 is not unlocked, 1 to 3 a stage. */
  modules?: Record<string, number>;
}
export interface KroosterProfile {
  username: string; displayName: string;
  server: string | null; level: number | null;
  /** The assistant, by the game's character id. */
  assistant: string | null;
  roster: Record<string, KroosterOperator>;
}

const CHAR_ID = /^char_\w{1,100}$/;
const EQUIP_ID = /^uniequip_\w{1,100}$/;
const whole = (value: unknown, low: number, high: number, fallback: number) => {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) ? Math.min(high, Math.max(low, number)) : fallback;
};
const text = (value: unknown, max: number) => (typeof value === 'string' && value.length <= max ? value : null);

/** The profile a Krooster lookup page carries, or null when it has none (no such user, or a private one). */
export function parseKroosterPage(html: string): KroosterProfile | null {
  const match = /<script id="__NEXT_DATA__" type="application\/json"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!match) return null;
  let data: any;
  try { data = JSON.parse(match[1])?.props?.pageProps?.data; } catch { return null; }
  return profileFromData(data);
}

/** The page data's `data` object (roster and account) as a profile; null when it is not one. */
export function profileFromData(data: unknown): KroosterProfile | null {
  const d = data as { roster?: unknown; account?: Record<string, unknown> } | null;
  if (!d || typeof d !== 'object' || !d.roster || typeof d.roster !== 'object' || !d.account || typeof d.account !== 'object') return null;
  if (d.account.private === true) return null;
  const username = text(d.account.username, 64);
  if (!username) return null;
  const roster: Record<string, KroosterOperator> = {};
  for (const [id, raw] of Object.entries(d.roster as Record<string, any>)) {
    if (!CHAR_ID.test(id) || !raw || typeof raw !== 'object') continue;
    const op: KroosterOperator = { elite: whole(raw.elite, 0, 2, 0), level: whole(raw.level, 1, 90, 1) };
    if (typeof raw.potential === 'number') op.potential = whole(raw.potential, 1, 6, 1);
    if (typeof raw.skill_level === 'number') op.skillLevel = whole(raw.skill_level, 1, 7, 1);
    if (Array.isArray(raw.masteries)) op.masteries = raw.masteries.slice(0, 3).map((m: unknown) => whole(m, 0, 3, 0));
    if (raw.modules && typeof raw.modules === 'object') {
      const modules = Object.fromEntries(Object.entries(raw.modules as Record<string, unknown>).filter(([equip]) => EQUIP_ID.test(equip)).map(([equip, stage]) => [equip, whole(stage, 0, 3, 0)]));
      if (Object.keys(modules).length) op.modules = modules;
    }
    roster[id] = op;
  }
  const assistant = text(d.account.assistant, 100);
  return {
    username, displayName: text(d.account.display_name, 64) || username,
    server: text(d.account.server, 8), level: typeof d.account.level === 'number' ? whole(d.account.level, 1, 200, 1) : null,
    assistant: assistant && CHAR_ID.test(assistant) ? assistant : null, roster,
  };
}

export interface KroosterImport { record: AccountRecord; roster: Roster; unknown: string[] }

/** The profile as the site's account record and planner roster, by the game-account map's names. */
export function accountFromKrooster(profile: KroosterProfile, map: GameAccountMap, now = new Date()): KroosterImport {
  const roster: Roster = {};
  const unknown: string[] = [];
  const operators = new Set<string>();
  const operatorIds: string[] = [];
  for (const [id, op] of Object.entries(profile.roster)) {
    operatorIds.push(id);
    const entry = map.chars[id];
    if (!entry || !isSafeKey(entry.name)) { unknown.push(id); continue; }
    operators.add(entry.name);
    const masteries: Owned['masteries'] = {};
    (op.masteries ?? []).forEach((m, index) => { if (m > 0) masteries[index] = m as 1 | 2 | 3; });
    const stages: Record<number, number> = {};
    for (const [equip, stage] of Object.entries(op.modules ?? {})) {
      // 0 is a module not unlocked; the Original module (uniequip_001) is not in the map.
      if (stage < 1 || !(equip in entry.modules)) continue;
      stages[entry.modules[equip]] = stage - 1;
    }
    roster[entry.name] = {
      elite: op.elite, level: op.level, skillLevel: op.skillLevel ?? 1, masteries,
      ...(op.potential ? { potential: op.potential } : {}),
      ...(Object.keys(stages).length ? { modules: stages } : {}),
    };
  }
  const server: ServerId = isServerId(profile.server?.toLowerCase()) ? profile.server!.toLowerCase() as ServerId : 'en';
  const record: AccountRecord = {
    version: 1, server, importedAt: now.toISOString(),
    doctor: `${profile.displayName} (Krooster)`,
    operators: [...operators].sort(), operatorIds: operatorIds.sort(),
    skins: [], cleared: [], annihilation: [], outfits: {},
    profile: { level: profile.level, registeredAt: null, secretary: profile.assistant ? map.chars[profile.assistant]?.name ?? null : null, bio: null },
    operatorBuilds: roster,
  };
  return { record, roster, unknown: unknown.sort() };
}
